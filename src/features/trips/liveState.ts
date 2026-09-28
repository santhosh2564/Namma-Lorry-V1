/**
 * The D5 Active Trip derivations (M10, docs/12 D5).
 *
 * Everything the driver reads at a glance is derived here, as pure functions of
 * (local queue, clock, network, permissions) — so the "is something wrong?"
 * rules are unit-testable instead of buried in a render:
 *
 * - **Sync** — offline / N points waiting / all synced, from the local queue
 *   counts and NetInfo. The queue is the truth: points are saved locally first
 *   (CLAUDE.md hard rule 5), so "pending" means "safe on the phone, not yet on
 *   the server".
 * - **GPS** — from the accuracy of the newest point, using the same 50 m
 *   threshold the verifier applies (docs/08 §2 step 2 / `max_point_accuracy_m`),
 *   so "GPS good" here means "this point will count".
 * - **Tracking problem** — no point for more than `STALE_POINT_MS`, or a
 *   permission that was revoked while driving. Both are surfaced as a banner
 *   rather than as a silent gap in the driver's record.
 *
 * Distances are labelled "approx." in the UI on purpose (CLAUDE.md hard rule 1):
 * the official kilometres are computed by Postgres `verify_trip`, and to-drop is
 * a straight line, not a road distance.
 */
import { haversineMetres } from "@/lib/geo";

/** How long without a point before D5 says tracking has a problem (docs/12 D5). */
export const STALE_POINT_MS = 2 * 60_000;

/** Accuracy at or below this counts as a good fix (the verifier's threshold). */
export const GOOD_ACCURACY_M = 50;

/** A stored row, as far as this module cares. */
export type LivePoint = {
  lat: number;
  lng: number;
  /** Device time, ISO 8601. */
  recordedAt: string;
  accuracyM: number | null;
  uploaded: boolean;
};

export type LiveSyncState = "synced" | "pending" | "offline";
export type LiveGpsState = "good" | "weak" | "lost";
export type TrackingProblem = "stale" | "permission";

/** Pure: offline wins over "pending" — a driver with no signal has one story. */
export function liveSyncState(input: { offline: boolean; pendingPoints: number }): LiveSyncState {
  if (input.offline) {
    return "offline";
  }
  return input.pendingPoints > 0 ? "pending" : "synced";
}

/**
 * Pure: how good the newest fix is.
 *
 * No point at all is "lost"; the accuracy of the last one decides between
 * "good" and "weak". A row without an accuracy reading is treated as good: the
 * OS gave us a usable fix, and calling every such point weak would cry wolf.
 */
export function liveGpsState(last: LivePoint | null): LiveGpsState {
  if (last === null) {
    return "lost";
  }
  if (last.accuracyM === null) {
    return "good";
  }
  return last.accuracyM <= GOOD_ACCURACY_M ? "good" : "weak";
}

/**
 * Pure: is tracking in trouble?
 *
 * `stale` when the newest point is older than two minutes — measured from the
 * trip's start when no point has arrived at all, so a trip that never began
 * recording is flagged instead of looking calm. `permission` outranks it: a
 * revoked grant explains the staleness and is the thing the driver can fix.
 */
export function trackingProblem(input: {
  lastPointAt: string | null;
  startedAt: string | null;
  now: number;
  permissionsOk: boolean;
}): TrackingProblem | null {
  if (!input.permissionsOk) {
    return "permission";
  }
  const reference = input.lastPointAt ?? input.startedAt;
  if (reference === null) {
    return null;
  }
  const at = Date.parse(reference);
  if (!Number.isFinite(at)) {
    return null;
  }
  return input.now - at > STALE_POINT_MS ? "stale" : null;
}

/**
 * Pure: approximate distance along the recorded trace, metres.
 *
 * Points the verifier would drop (accuracy worse than 50 m, docs/08 §2 step 2)
 * are left out of the sum, so the number on screen moves for the same reasons
 * the official one does. A missing accuracy is kept.
 */
export function approxDistanceM(points: readonly LivePoint[]): number {
  const usable = points.filter(
    (point) => point.accuracyM === null || point.accuracyM <= GOOD_ACCURACY_M,
  );
  let total = 0;
  for (let i = 1; i < usable.length; i += 1) {
    total += haversineMetres(usable[i - 1]!, usable[i]!);
  }
  return total;
}

/** Pure: `epoch ms → "3h 05m" | "42m"`. Null/NaN reads as "0m". */
export function formatElapsed(startedAt: string | null, now: number): string {
  if (startedAt === null) {
    return "0m";
  }
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) {
    return "0m";
  }
  const minutes = Math.max(0, Math.floor((now - started) / 60_000));
  const hours = Math.floor(minutes / 60);
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Pure: straight-line distance to the drop, rounded metres, or null. */
export function distanceToDropM(
  last: { lat: number; lng: number } | null,
  drop: { lat: number; lng: number },
): number | null {
  if (last === null) {
    return null;
  }
  return Math.round(haversineMetres(last, drop));
}

/** Pure: inside the drop geofence → D5 highlights END (docs/12 D5). */
export function isNearDrop(input: {
  last: { lat: number; lng: number } | null;
  drop: { lat: number; lng: number };
  dropRadiusM: number;
}): boolean {
  const distance = distanceToDropM(input.last, input.drop);
  return distance !== null && distance <= input.dropRadiusM;
}

export type LiveStats = {
  elapsed: string;
  approxKm: number;
  kmToDrop: number | null;
  nearDrop: boolean;
  last: LivePoint | null;
};

/** Everything the three D5 stat blocks and the near-drop banner need. */
export function liveStats(input: {
  points: readonly LivePoint[];
  startedAt: string | null;
  /** Null while the load is unknown (e.g. the trip read has not landed yet). */
  drop: { lat: number; lng: number } | null;
  dropRadiusM: number;
  now: number;
}): LiveStats {
  const last = input.points.length === 0 ? null : (input.points[input.points.length - 1] ?? null);
  const distance = input.drop === null ? null : distanceToDropM(last, input.drop);
  return {
    elapsed: formatElapsed(input.startedAt, input.now),
    approxKm: Math.round(approxDistanceM(input.points) / 1000),
    kmToDrop: distance === null ? null : Math.round(distance / 1000),
    nearDrop:
      input.drop !== null && isNearDrop({ last, drop: input.drop, dropRadiusM: input.dropRadiusM }),
    last,
  };
}

/** The recorded time of the newest row that has reached the server, or null. */
export function lastUploadedAt(points: readonly LivePoint[]): string | null {
  let newest: string | null = null;
  let newestMs = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!point.uploaded) {
      continue;
    }
    const at = Date.parse(point.recordedAt);
    if (Number.isFinite(at) && at > newestMs) {
      newestMs = at;
      newest = point.recordedAt;
    }
  }
  return newest;
}

export type AgoUnit = "seconds" | "minutes" | "hours";

/**
 * Pure: the "20 s ago" half of the sync row, as a unit + count so the screen
 * can translate it (i18next keys per unit) instead of concatenating English.
 */
export function agoParts(iso: string, now: number): { unit: AgoUnit; count: number } | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return null;
  }
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) {
    return { unit: "seconds", count: seconds };
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return { unit: "minutes", count: minutes };
  }
  return { unit: "hours", count: Math.round(minutes / 60) };
}
