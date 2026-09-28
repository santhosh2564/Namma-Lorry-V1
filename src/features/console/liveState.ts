/**
 * C1 Live Dashboard derivations (M11, docs/12 C1, docs/06 §2).
 *
 * The board is one rule-heavy screen: which trucks are live, which of them have
 * gone quiet, what the KPI strip says, and what the map draws. All of it is
 * derived here as pure functions of (rows, clock) so the rules are testable
 * rather than smeared through a render:
 *
 * - **Stale** — a truck whose newest point is more than 15 minutes old is the
 *   thing the morning ops check is looking for (docs/12 C1: "stale (>15 min)
 *   highlighted"). It is called out in the list *and* ringed on the map rather
 *   than being quietly dropped, because a truck that stopped reporting is the
 *   one thing worse than a truck that is simply far away.
 * - **Route tail** — the line from the pickup to where the truck is now. It is
 *   a straight line on purpose: `trip_live` holds one position, so there is no
 *   history to draw, and inventing a road route from two points would be a
 *   picture the database does not support (same decision as C4's planned route).
 * - **KPI strip** — "live / stale / assigned today / need review". Stale is
 *   derived here from the same rows the list shows, so the strip can never
 *   disagree with the list.
 */
import type { LatLng, MapMarker, MapPolyline } from "@/components/map";

/** No point for this long and the truck is stale (docs/12 C1: ">15 min"). */
export const STALE_AFTER_MS = 15 * 60_000;

/** One row of the C1 board: a trip that is on the road right now. */
export type LiveTrip = {
  tripId: string;
  driverId: string;
  driverName: string;
  vehicleNo: string;
  loadCode: string;
  pickupAddress: string;
  dropAddress: string;
  /** Where the truck was when it last reported. */
  position: LatLng;
  /** Degrees clockwise from true north, or null when the device had no fix. */
  heading: number | null;
  speedMps: number | null;
  accuracyM: number | null;
  /** Device time of that position — what the "last update" column shows. */
  recordedAt: string;
  pickup: LatLng;
  drop: LatLng;
  dropRadiusM: number;
};

export type AgeUnit = "seconds" | "minutes" | "hours";

/** A "40 s ago" broken into unit + count so the copy can be translated. */
export type AgeParts = { unit: AgeUnit; count: number };

/**
 * Pure: how long ago a row was recorded, or null when it cannot be read.
 *
 * Rounded rather than floored so "45 s" does not linger as "44 s" while an
 * operator watches it, and clamped at zero so a clock skew between the phone and
 * the console cannot render "in 3 s".
 */
export function ageParts(iso: string | null, nowMs: number): AgeParts | null {
  if (iso === null) {
    return null;
  }
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return null;
  }
  const seconds = Math.max(0, Math.round((nowMs - at) / 1000));
  if (seconds < 60) {
    return { unit: "seconds", count: seconds };
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return { unit: "minutes", count: minutes };
  }
  return { unit: "hours", count: Math.round(minutes / 60) };
}

/**
 * Pure: has this truck gone quiet?
 *
 * The comparison is done in milliseconds, not in whichever unit `ageParts`
 * rounded into: "40 seconds ago" is fresh even though 40 > 15, and "14 min"
 * is fresh even though 14 is close to the limit.
 *
 * A row with no usable timestamp counts as stale: a live row that cannot say
 * when it last spoke is not evidence of a working link.
 */
export function isStale(iso: string | null, nowMs: number): boolean {
  if (iso === null) {
    return true;
  }
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return true;
  }
  return Math.max(0, nowMs - at) > STALE_AFTER_MS;
}

export type LiveKpiKey = "live" | "stale" | "assignedToday" | "needsReview";

export type LiveKpi = { key: LiveKpiKey; value: number };

/**
 * Pure: the KPI strip above the map (docs/12 C1).
 *
 * `live` and `stale` are derived from the rows already on screen; the other two
 * are counted in Postgres, because neither is derivable from `trip_live`.
 */
export function kpiStrip(input: {
  trips: readonly LiveTrip[];
  nowMs: number;
  assignedToday: number;
  needsReview: number;
}): LiveKpi[] {
  return [
    { key: "live", value: input.trips.length },
    {
      key: "stale",
      value: input.trips.filter((trip) => isStale(trip.recordedAt, input.nowMs)).length,
    },
    { key: "assignedToday", value: input.assignedToday },
    { key: "needsReview", value: input.needsReview },
  ];
}

/**
 * Freshest first, with stale trucks pushed to the bottom of the list.
 *
 * A stale truck still has to be visible — it just must not be the first thing
 * an operator reads as if nothing were wrong.
 */
export function sortLiveTrips(trips: readonly LiveTrip[], nowMs: number): LiveTrip[] {
  return [...trips].sort((a, b) => {
    const staleA = isStale(a.recordedAt, nowMs);
    const staleB = isStale(b.recordedAt, nowMs);
    if (staleA !== staleB) {
      return staleA ? 1 : -1;
    }
    const atA = Date.parse(a.recordedAt);
    const atB = Date.parse(b.recordedAt);
    if (Number.isFinite(atA) && Number.isFinite(atB) && atA !== atB) {
      return atB - atA;
    }
    return a.vehicleNo.localeCompare(b.vehicleNo);
  });
}

/** Pure: the truck marker, rotated by heading when the device reported one. */
export function liveMarker(trip: LiveTrip): MapMarker {
  return {
    id: trip.tripId,
    kind: "truck",
    position: trip.position,
    heading: trip.heading ?? undefined,
  };
}

/** Pure: the straight line from the pickup to the truck's current position. */
export function liveTail(trip: LiveTrip): MapPolyline | null {
  if (trip.pickup.lat === trip.position.lat && trip.pickup.lng === trip.position.lng) {
    return null;
  }
  return {
    id: `tail-${trip.tripId}`,
    kind: "actual",
    path: [trip.pickup, trip.position],
  };
}

export function liveMarkers(trips: readonly LiveTrip[]): MapMarker[] {
  return trips.map(liveMarker);
}

export function livePolylines(trips: readonly LiveTrip[]): MapPolyline[] {
  return trips.map(liveTail).filter((line): line is MapPolyline => line !== null);
}

/** Pure: m/s → whole km/h, or null. The map's speed readout. */
export function kmPerHour(speedMps: number | null): number | null {
  if (speedMps === null || !Number.isFinite(speedMps) || speedMps < 0) {
    return null;
  }
  return Math.round(speedMps * 3.6);
}

/**
 * Pure: the map's view of the whole fleet.
 *
 * Stale trucks keep their marker — the map contract has no "stale" marker kind,
 * so the red ring that makes one obvious on the C1 map is drawn by the screen's
 * overlay; this returns the geometry only.
 */
export function liveMapView(trips: readonly LiveTrip[]): {
  markers: MapMarker[];
  polylines: MapPolyline[];
  center: LatLng | undefined;
} {
  const markers = liveMarkers(trips);
  const position = trips[0]?.position;
  return { markers, polylines: livePolylines(trips), center: position };
}
