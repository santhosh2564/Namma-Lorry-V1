// D5 Active Trip rules (docs/12 D5), pure so every sync / GPS state is unit-tested.
// Everything here is computed from the phone's own queue, never the server (M10 prompt):
// the driver must see their trip even with no network.
import { haversineM, type LatLng } from '@/lib/geo';

import { MAX_START_ACCURACY_M } from './startState';

/** No new point for this long is a tracking problem (unless the truck is standing still). */
export const STALE_POINT_MS = 2 * 60_000;
/** A fresh foreground fix within this distance of the last recorded point = not moving. */
export const STOPPED_RADIUS_M = 50;
/** Foreground fixes older than this are ignored. */
export const FRESH_FIX_MS = 30_000;

export interface TrackPoint extends LatLng {
  recordedAt: number;
  accuracy: number | null;
  heading?: number | null;
}

/**
 * Approximate km: haversine along the recorded points, skipping fixes worse than the server's
 * max_point_accuracy_m. The official figure comes from verify_trip (docs/08 §2), so D5
 * labels this "approx.".
 */
export function approxDistanceM(points: TrackPoint[]): number {
  let total = 0;
  let prev: TrackPoint | null = null;
  for (const p of points) {
    if (p.accuracy !== null && p.accuracy > MAX_START_ACCURACY_M) continue;
    if (prev) total += haversineM(prev, p);
    prev = p;
  }
  return total;
}

export type SyncStatus =
  { kind: 'synced' } | { kind: 'waiting'; pending: number } | { kind: 'offline'; pending: number };

export function syncStatus(pending: number, online: boolean): SyncStatus {
  if (!online) return { kind: 'offline', pending };
  return pending > 0 ? { kind: 'waiting', pending } : { kind: 'synced' };
}

export type GpsStatus =
  | { kind: 'good'; accuracyM: number | null }
  | { kind: 'weak'; accuracyM: number }
  | { kind: 'waiting' }
  | { kind: 'stopped' }
  // tracking problems (banner):
  | { kind: 'permission' }
  | { kind: 'gps-off' }
  | { kind: 'not-running' }
  | { kind: 'no-points'; sinceMs: number };

export interface GpsInput {
  now: number;
  startedAt: number | null;
  lastPoint: TrackPoint | null;
  /** Precise + "all the time" location. */
  permissionOk: boolean;
  servicesEnabled: boolean;
  /** Background location task registered and running; null = unknown. */
  taskRunning: boolean | null;
  /** Latest foreground fix while D5 is open. */
  currentFix: TrackPoint | null;
}

export function gpsStatus(i: GpsInput): GpsStatus {
  if (!i.permissionOk) return { kind: 'permission' };
  if (!i.servicesEnabled) return { kind: 'gps-off' };
  if (i.taskRunning === false) return { kind: 'not-running' };

  const ref = i.lastPoint?.recordedAt ?? i.startedAt;
  const since = ref === null ? 0 : i.now - ref;
  if (since > STALE_POINT_MS) {
    // Updates need 25 m of movement (TRACKING_OPTIONS), so a parked truck records nothing.
    // A fresh fix next to the last point means "standing still", not "tracking broke".
    const fix = i.currentFix;
    if (
      fix &&
      i.lastPoint &&
      i.now - fix.recordedAt <= FRESH_FIX_MS &&
      haversineM(fix, i.lastPoint) <= Math.max(STOPPED_RADIUS_M, fix.accuracy ?? 0)
    ) {
      return { kind: 'stopped' };
    }
    return { kind: 'no-points', sinceMs: since };
  }
  if (!i.lastPoint) return { kind: 'waiting' };
  const acc = i.lastPoint.accuracy;
  if (acc !== null && acc > MAX_START_ACCURACY_M) return { kind: 'weak', accuracyM: Math.round(acc) };
  return { kind: 'good', accuracyM: acc === null ? null : Math.round(acc) };
}

const PROBLEMS = new Set<GpsStatus['kind']>(['permission', 'gps-off', 'not-running', 'no-points']);
export const isTrackingProblem = (g: GpsStatus): boolean => PROBLEMS.has(g.kind);

/** The best idea of where the truck is: the newer of the last recorded point and a fresh foreground fix. */
export function currentPosition(
  lastPoint: TrackPoint | null,
  fix: TrackPoint | null,
  now: number,
): TrackPoint | null {
  const freshFix = fix && now - fix.recordedAt <= FRESH_FIX_MS ? fix : null;
  if (!lastPoint) return freshFix;
  if (!freshFix) return lastPoint;
  return freshFix.recordedAt >= lastPoint.recordedAt ? freshFix : lastPoint;
}

export interface DropInfo {
  distanceM: number;
  /** Inside drop radius + accuracy, the same test verify_trip uses for END_OUTSIDE_DROP. */
  inside: boolean;
}

export function dropInfo(pos: TrackPoint | null, drop: LatLng, dropRadiusM: number): DropInfo | null {
  if (!pos) return null;
  const distanceM = haversineM(pos, drop);
  return { distanceM, inside: distanceM <= dropRadiusM + (pos.accuracy ?? 0) };
}
