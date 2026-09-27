/**
 * Add-Driver form (M6, doc 12 C8).
 *
 * The rules here are the same ones the S2 sign-in screen and the Edge Function
 * enforce, so the drawer refuses what the server would refuse anyway: a driver
 * who cannot receive an OTP is a broken registration, not a saved row.
 */
import { z } from "zod";

/** 10-digit national number. The drawer shows +91 itself. */
export const driverPhoneSchema = z.string().regex(/^[6-9]\d{9}$/, "console.driver.invalidPhone");

export const driverNameSchema = z
  .string()
  .trim()
  .min(1, "console.driver.nameRequired")
  .max(80, "console.driver.nameTooLong")
  // Same squeeze the Edge Function applies, so a pasted name is stored once.
  .transform((value) => value.replace(/\s+/g, " "));

export const addDriverSchema = z.object({
  fullName: driverNameSchema,
  phone: driverPhoneSchema,
});

export type AddDriverValues = z.infer<typeof addDriverSchema>;

/**
 * Accepts what a dispatcher might paste ("+91 90000 00011", "919000000011") and
 * returns the 10 digits, or null. Mirrors the Edge Function so the two never
 * disagree about the same string.
 */
export function normalisePhoneInput(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
