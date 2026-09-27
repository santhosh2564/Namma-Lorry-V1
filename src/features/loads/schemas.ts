// Shared form schemas for loads and assignment (C3 Create Load, C4 Assign).
import { z } from 'zod';

export const RADIUS_MIN_M = 100;
export const RADIUS_MAX_M = 2000;
export const RADIUS_DEFAULT_M = 500;

const lat = z.number({ message: 'location_required' }).min(-90).max(90);
const lng = z.number({ message: 'location_required' }).min(-180).max(180);

export const placeSchema = z.object({
  address: z.string().trim().min(3, 'address_required').max(300, 'address_too_long'),
  /** From autosuggest when Mappls returns coordinates, or from the map pin / coordinate fields (ND-26). */
  lat,
  lng,
  eLoc: z.string().nullable().optional(),
  radiusM: z.number().int().min(RADIUS_MIN_M, 'radius_range').max(RADIUS_MAX_M, 'radius_range'),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'too_long')
    .transform((v) => (v === '' ? null : v));

export const createLoadSchema = z
  .object({
    pickup: placeSchema,
    drop: placeSchema,
    material: optionalText(120),
    /** Tonnes in the form (design C3); stored as loads.weight_kg. */
    weightTonnes: z
      .string()
      .trim()
      .transform((v, ctx) => {
        if (v === '') return null;
        const n = Number(v.replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0 || n > 100) {
          ctx.addIssue({ code: 'custom', message: 'weight_range' });
          return z.NEVER;
        }
        return n;
      }),
    shipperId: z.string().uuid().nullable(),
    notes: optionalText(1000),
  })
  .refine((v) => v.pickup.lat !== v.drop.lat || v.pickup.lng !== v.drop.lng, {
    path: ['drop', 'address'],
    message: 'same_as_pickup',
  });

export type CreateLoadInput = z.input<typeof createLoadSchema>;
export type CreateLoadValues = z.output<typeof createLoadSchema>;

/** Row for `loads.insert` (load_code, created_by and geography columns are filled by the DB). */
export function toLoadInsert(v: CreateLoadValues, plannedDistanceM: number | null) {
  return {
    pickup_address: v.pickup.address,
    pickup_lat: v.pickup.lat,
    pickup_lng: v.pickup.lng,
    pickup_radius_m: v.pickup.radiusM,
    drop_address: v.drop.address,
    drop_lat: v.drop.lat,
    drop_lng: v.drop.lng,
    drop_radius_m: v.drop.radiusM,
    planned_distance_m: plannedDistanceM,
    material: v.material,
    weight_kg: v.weightTonnes === null ? null : Math.round(v.weightTonnes * 1000),
    shipper_id: v.shipperId,
    notes: v.notes,
  };
}

export const assignSchema = z.object({
  driverId: z.string({ message: 'driver_required' }).uuid('driver_required'),
  vehicleId: z.string({ message: 'vehicle_required' }).uuid('vehicle_required'),
});
export type AssignInput = z.input<typeof assignSchema>;
export type AssignValues = z.output<typeof assignSchema>;

// ---- List filters (C2 / C5), kept in the URL ----

export const LOAD_STATUSES = ['unassigned', 'assigned', 'in_trip', 'done'] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const TRIP_STATUSES = [
  'assigned',
  'in_progress',
  'completed',
  'verified',
  'needs_review',
  'rejected',
  'cancelled',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const DATE_RANGES = ['all', 'today', '7d', '30d'] as const;
export type DateRange = (typeof DATE_RANGES)[number];

/** Start of the range in UTC ISO, in IST calendar terms ("today" = since 00:00 IST). */
export function rangeStart(range: DateRange, now = new Date()): string | null {
  if (range === 'all') return null;
  const IST = 330 * 60_000;
  const istMidnight = new Date(Math.floor((now.getTime() + IST) / 86_400_000) * 86_400_000 - IST);
  const days = range === 'today' ? 0 : range === '7d' ? 6 : 29;
  return new Date(istMidnight.getTime() - days * 86_400_000).toISOString();
}

/** Escapes a user search term for PostgREST `ilike` inside an `or=(…)` filter. */
export function ilikeTerm(q: string): string {
  return `%${q
    .trim()
    .replace(/[%_\\]/g, (c) => `\\${c}`)
    .replace(/[,()]/g, ' ')}%`;
}

export const PAGE_SIZE = 20;
