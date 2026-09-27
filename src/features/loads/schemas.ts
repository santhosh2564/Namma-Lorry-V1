/**
 * Load form and list schemas (M7, doc 12 C2–C4).
 *
 * One file for the whole milestone so C3 (create) and C4 (assign) cannot drift
 * apart, and so the rules the form enforces are the same ones written in a
 * test. Every message is an i18n key: the screens call `t(issue.message)` and
 * never show raw validation prose.
 *
 * Two shapes live here on purpose:
 *  - `createLoadSchema` validates **form input** (what the inputs hold: strings,
 *    optional fields, coordinates that may not have been resolved yet);
 *  - `toLoadInsert` converts that input into the `loads` row.
 *
 * Keeping the conversion a separate pure function is what makes the column
 * mapping testable without a renderer or a database.
 */
import { z } from "zod";

import type { TablesInsert } from "@/lib/database.types";
import type { TripStatus } from "@/theme/status";

// ---------------------------------------------------------------------------
// Geofence radius (doc 12 C3)
// ---------------------------------------------------------------------------

/** Slider bounds from doc 12 C3. The database allows 50–5000; the UI is stricter. */
export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 2000;
export const DEFAULT_RADIUS_M = 500;
export const RADIUS_STEP_M = 50;

export const radiusSchema = z
  .number({ message: "console.load.radiusRequired" })
  .int("console.load.radiusInvalid")
  .min(MIN_RADIUS_M, "console.load.radiusTooSmall")
  .max(MAX_RADIUS_M, "console.load.radiusTooLarge");

/** Rounds a slider value to the nearest step and clamps it into range. */
export function clampRadius(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_RADIUS_M;
  }
  const stepped = Math.round(value / RADIUS_STEP_M) * RADIUS_STEP_M;
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, stepped));
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** A lat/lng pair that is not the null island. */
const coordinatesSchema = z
  .object({
    lat: z.number({ message: "console.load.locationRequired" }).min(-90).max(90),
    lng: z.number({ message: "console.load.locationRequired" }).min(-180).max(180),
  })
  .refine((point) => !(point.lat === 0 && point.lng === 0), {
    message: "console.load.locationUnresolved",
  });

/**
 * One end of the load.
 *
 * `address` and the coordinates are validated separately on purpose: a typed
 * address that was never geocoded has no coordinates, and the rule is that
 * such a form is *not* submittable. Defaulting the point to (0, 0) would pass
 * every range check and quietly put a geofence in the Gulf of Guinea.
 *
 * The point is optional in the *input* (the form genuinely has none until the
 * admin picks a suggestion or taps the map) and required in the *output*, so
 * `toLoadInsert` never has to check for a missing coordinate.
 */
export const endpointSchema = z
  .object({
    address: z
      .string()
      .trim()
      .min(1, "console.load.addressRequired")
      .max(300, "console.load.addressTooLong")
      .transform((value) => value.replace(/\s+/g, " ")),
    point: coordinatesSchema.optional(),
    radiusM: radiusSchema,
  })
  .refine((value) => value.point !== undefined, {
    message: "console.load.locationRequired",
    path: ["point"],
  })
  .transform((value) => {
    // Unreachable after the refine above; throwing rather than asserting keeps
    // the output type honest if the two ever drift apart.
    if (value.point === undefined) {
      throw new Error("console.load.locationRequired");
    }
    return { address: value.address, point: value.point, radiusM: value.radiusM };
  });

export type EndpointValues = z.infer<typeof endpointSchema>;
/** What the form holds: an end that has not been located yet. */
export type EndpointInput = z.input<typeof endpointSchema>;

// ---------------------------------------------------------------------------
// Create load (C3)
// ---------------------------------------------------------------------------

/** Optional free text, normalised to `null` so the column stays nullable. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .optional()
    .transform((value) => {
      const trimmed = (value ?? "").trim().replace(/\s+/g, " ");
      return trimmed === "" ? null : trimmed;
    });

/**
 * Weight in **tonnes**, as doc 12 C3 shows it; the column is `weight_kg`.
 *
 * The field arrives from a text input, so it is a string: absent or empty means
 * "not given" (not zero — a zero-weight load is not a thing).
 */
const optionalTonnesSchema = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === "" ? undefined : Number(value)))
  .pipe(
    z
      .number()
      .positive("console.load.weightPositive")
      .max(1_000, "console.load.weightTooLarge")
      .optional(),
  );

/**
 * `shipperId` is accepted but never rendered: ND-19 keeps the shipper select
 * hidden until an admin can create a shipper profile at all. The column stays
 * nullable and the schema keeps the door open.
 */
export const createLoadSchema = z.object({
  pickup: endpointSchema,
  drop: endpointSchema,
  material: optionalText(80, "console.load.materialTooLong"),
  weightTonnes: optionalTonnesSchema,
  shipperId: z.uuid("console.load.shipperInvalid").nullable().optional(),
  notes: optionalText(500, "console.load.notesTooLong"),
});

export type CreateLoadValues = z.infer<typeof createLoadSchema>;

/** Columns of the `loads` insert this milestone writes. */
export type LoadInsert = TablesInsert<"loads">;

/**
 * Form values → the `loads` row.
 *
 * `plannedDistanceM` comes from the Mappls proxy at save time and is passed in
 * rather than fetched here: this function stays pure and synchronous, so the
 * "what row does this form produce" question has a real unit test.
 *
 * `load_code` is deliberately absent — the database generates it
 * (`NL-<year>-<6 digits>`) and a client-supplied code would break the format
 * check in docs/08.
 */
export function toLoadInsert(
  values: CreateLoadValues,
  plannedDistanceM: number | null = null,
): LoadInsert {
  return {
    pickup_address: values.pickup.address,
    pickup_lat: values.pickup.point.lat,
    pickup_lng: values.pickup.point.lng,
    pickup_radius_m: values.pickup.radiusM,
    drop_address: values.drop.address,
    drop_lat: values.drop.point.lat,
    drop_lng: values.drop.point.lng,
    drop_radius_m: values.drop.radiusM,
    planned_distance_m: plannedDistanceM,
    material: values.material,
    weight_kg: values.weightTonnes === undefined ? null : Math.round(values.weightTonnes * 1000),
    notes: values.notes,
    shipper_id: values.shipperId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Assignment (C4)
// ---------------------------------------------------------------------------

export const assignTripSchema = z.object({
  loadId: z.uuid("console.load.invalidId"),
  driverId: z.uuid("console.load.invalidDriver"),
  vehicleId: z.uuid("console.load.invalidVehicle"),
});

export type AssignTripValues = z.infer<typeof assignTripSchema>;

// ---------------------------------------------------------------------------
// Load status (ND-20)
// ---------------------------------------------------------------------------

/**
 * `loads` has no status column, so the C2 tabs are derived from the load's
 * latest trip (ND-20). `cancelled` and `rejected` count as *unassigned*
 * deliberately: `trips_one_open_per_load` does not cover them, so the load is
 * dispatchable again and showing it under "Done" would hide that.
 */
export type LoadStatus = "unassigned" | "assigned" | "in_trip" | "done";

export const LOAD_STATUS_TABS = ["all", "unassigned", "assigned", "in_trip", "done"] as const;
export type LoadStatusTab = (typeof LOAD_STATUS_TABS)[number];

export function loadStatusFrom(tripStatus: TripStatus | null | undefined): LoadStatus {
  switch (tripStatus) {
    case "assigned":
      return "assigned";
    case "in_progress":
      return "in_trip";
    case "completed":
    case "verified":
    case "needs_review":
      return "done";
    default:
      // null (no trip), "rejected" and "cancelled" all mean "needs dispatching".
      return "unassigned";
  }
}

/**
 * Which trip statuses a tab selects, so the list can be filtered in the
 * database rather than by loading every row. "unassigned" is the complement of
 * the open set, which the query expresses as an exclusion.
 */
export const TAB_TRIP_STATUSES: Record<Exclude<LoadStatusTab, "all">, TripStatus[]> = {
  unassigned: [],
  assigned: ["assigned"],
  in_trip: ["in_progress"],
  done: ["completed", "verified", "needs_review"],
};

/** The statuses that hold a load open, per `trips_one_open_per_load`. */
export const OPEN_TRIP_STATUSES: TripStatus[] = [
  "assigned",
  "in_progress",
  "completed",
  "verified",
  "needs_review",
];

/**
 * Trip statuses a tab selects, or `null` for "all" (no filter).
 *
 * An empty array is meaningful: "unassigned" is the complement of the open
 * statuses, which the list query expresses as an exclusion rather than an
 * `.in()` list.
 */
export function tripStatusForTab(tab: LoadStatusTab): TripStatus[] | null {
  if (tab === "all") {
    return null;
  }
  return TAB_TRIP_STATUSES[tab];
}

// ---------------------------------------------------------------------------
// List paging and filtering (C2 / C5)
// ---------------------------------------------------------------------------

export const PAGE_SIZE = 20;

export const pageSchema = z.coerce
  .number({ message: "console.load.pageInvalid" })
  .int("console.load.pageInvalid")
  .min(1, "console.load.pageInvalid");

export type PageRequest = { page: number; pageSize: number };

/** PostgREST `range()` is inclusive on both ends. */
export function toRange({ page, pageSize }: PageRequest): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  if (pageSize <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(total / pageSize));
}

/** A day range filter from the two date inputs; either end may be empty. */
export const dateRangeSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "console.load.dateInvalid")
    .optional()
    .or(z.literal("")),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "console.load.dateInvalid")
    .optional()
    .or(z.literal("")),
});

export type DateRangeValues = z.infer<typeof dateRangeSchema>;

/** `{ from, to }` for Supabase's `.gte()`/`.lte()`, skipping empty ends. */
export function toDateBounds(range: DateRangeValues): { gte?: string; lte?: string } {
  return {
    ...(range.from === "" ? {} : { gte: `${range.from}T00:00:00.000Z` }),
    ...(range.to === "" ? {} : { lte: `${range.to}T23:59:59.999Z` }),
  };
}

/**
 * PostgREST `or=` text search. The caller's term is interpolated into a
 * PostgREST filter string, so anything that could close the group or start an
 * operator has to go: quoting inside `like.*` would otherwise let a search
 * term change the filter's meaning.
 */
export function sanitiseSearchTerm(term: string): string {
  return term.replace(/[,()%*"\\]/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** `planned_distance_m` is metres; the console speaks km (doc 12 C2). */
export function formatKm(metres: number | null | undefined, digits = 0): string {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) {
    return "—";
  }
  return `${(metres / 1000).toFixed(digits)} km`;
}

/** Drive time from the proxy, rendered as the rough "512 km · ~10 h" strip. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const hours = seconds / 3600;
  if (hours < 1) {
    return `~${Math.max(1, Math.round(seconds / 60))} min`;
  }
  return hours < 24 ? `~${Math.round(hours)} h` : `~${Math.round(hours / 24)} d`;
}
