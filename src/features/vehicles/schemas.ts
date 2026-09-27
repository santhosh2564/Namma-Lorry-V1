/**
 * Vehicle registration (M6, doc 12 C9).
 *
 * The rule is the Indian vehicle registration format the database already
 * stores as free text: `SS DD SSS NNNN` — two letters for the state, one or
 * two digits for the RTO, up to three letters for the series, and four digits.
 * `TN 23 BK 4521` (the sample in DESIGN.md) and `KA01AB1234` both satisfy it.
 *
 * Getting this wrong at the form is expensive: `vehicles.registration_no` is
 * UNIQUE, so a typo creates a second "same" truck rather than an error.
 */
import { z } from "zod";

/** Vehicle types from doc 12 C9 / the schema comment on `vehicles.vehicle_type`. */
export const VEHICLE_TYPES = [
  "407",
  "14ft",
  "17ft",
  "19ft",
  "20ft",
  "22ft",
  "24ft",
  "multi-axle",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** `SS DD SSS NNNN`, separators ignored. */
export const REGISTRATION_PATTERN = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

/**
 * Upper-cases and drops separators, so `tn 23 bk 4521` and `TN-23-BK-4521` are
 * both accepted and stored in one canonical shape.
 */
export function normaliseRegistration(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The display form stored in `vehicles.registration_no`: `TN 23 BK 4521`. */
export function formatRegistration(raw: string): string {
  const compact = normaliseRegistration(raw);
  const match = /^([A-Z]{2})(\d{1,2})([A-Z]*)([\d]{4})$/.exec(compact);
  if (match === null) {
    return raw.toUpperCase().trim();
  }
  return [match[1], match[2], match[3], match[4]].filter((part) => part !== "").join(" ");
}

export const registrationSchema = z
  .string()
  .transform(normaliseRegistration)
  .refine((value) => REGISTRATION_PATTERN.test(value), {
    message: "console.vehicle.invalidRegistration",
  })
  // The DB stores the display form, so the transform ends here.
  .transform(formatRegistration);

export const vehicleTypeSchema = z.enum(VEHICLE_TYPES, {
  message: "console.vehicle.invalidType",
});

export const addVehicleSchema = z.object({
  registrationNo: registrationSchema,
  vehicleType: vehicleTypeSchema,
});

export type AddVehicleValues = z.infer<typeof addVehicleSchema>;
