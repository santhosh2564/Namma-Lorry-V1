// D4 Trip Detail & Start: what the status row and START button show (docs/12 D4).
// Pure, and mirrors the server's start_trip checks (0001: accuracy ≤ max_point_accuracy_m,
// distance ≤ pickup_radius_m + accuracy) so the button is only enabled when the RPC
// would accept the same fix. The server still decides.
import { haversineM, type LatLng } from '@/lib/geo';

/** Mirrors app_settings.max_point_accuracy_m (0001). */
export const MAX_START_ACCURACY_M = 50;
/** A fix older than this no longer says where the driver is. */
export const FIX_MAX_AGE_MS = 30_000;

export interface Fix {
  lat: number;
  lng: number;
  /** metres; null when the OS doesn't say */
  accuracy: number | null;
  timestamp: number;
}

export interface StartInput {
  tripStatus: string;
  pickup: LatLng;
  pickupRadiusM: number;
  fix: Fix | null;
  /** Precise + "all the time" location granted. */
  permissionsOk: boolean;
  starting: boolean;
  now: number;
}

export type StartState =
  | { kind: 'in-progress' }
  | { kind: 'not-startable' }
  | { kind: 'permission' }
  | { kind: 'starting' }
  | { kind: 'waiting-gps' }
  | { kind: 'weak-gps'; accuracyM: number }
  | { kind: 'outside'; distanceM: number; accuracyM: number }
  | { kind: 'ready'; distanceM: number; accuracyM: number };

export function startState(i: StartInput): StartState {
  if (i.tripStatus === 'in_progress') return { kind: 'in-progress' };
  if (i.tripStatus !== 'assigned') return { kind: 'not-startable' };
  if (i.starting) return { kind: 'starting' };
  if (!i.permissionsOk) return { kind: 'permission' };
  if (!i.fix || i.now - i.fix.timestamp > FIX_MAX_AGE_MS) return { kind: 'waiting-gps' };
  const accuracyM = i.fix.accuracy;
  if (accuracyM === null || accuracyM > MAX_START_ACCURACY_M) {
    return { kind: 'weak-gps', accuracyM: Math.round(accuracyM ?? 999) };
  }
  const distanceM = haversineM({ lat: i.fix.lat, lng: i.fix.lng }, i.pickup);
  const rounded = Math.round(accuracyM);
  if (distanceM > i.pickupRadiusM + accuracyM) return { kind: 'outside', distanceM, accuracyM: rounded };
  return { kind: 'ready', distanceM, accuracyM: rounded };
}

export const canStart = (s: StartState): boolean => s.kind === 'ready';

/** 648 → "650 m", 999 → "1.0 km", 3240 → "3.2 km", 41000 → "41 km". */
export function formatShortDistance(m: number): string {
  const tens = Math.max(10, Math.round(m / 10) * 10);
  if (tens < 1000) return `${tens} m`;
  const km = m / 1000;
  return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`;
}
