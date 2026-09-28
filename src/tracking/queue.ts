/**
 * The local point queue (M8, docs/03-TRD.md §4.3).
 *
 * Points go to local storage first and are uploaded later, so a dead network
 * never costs a point (CLAUDE.md hard rule 5). This module owns the durable
 * shape — the persisted `trip_state` row and the `point_queue` rows — plus the
 * pure rules that decide *which* fixes become rows.
 *
 * The store is an interface with two implementations: `db.ts` speaks the real
 * `expo-sqlite` schema, and `createMemoryTrackingStore` below is the in-memory
 * one used by unit tests and by web (a browser never runs a trip, TRD §4.4 —
 * but the dev screen still needs a working store). Keeping the interface on
 * domain methods rather than SQL strings is what lets the queue rules be tested
 * without a native SQLite handle.
 *
 * **`seq` is per trip, monotonic and persisted** (`next_seq` in `trip_state`),
 * so a crash, a task re-entry or a reboot can never reuse a number. The uploader
 * relies on that: `(trip_id, seq)` is the idempotency key.
 */
import type { LocationObject } from "expo-location";

import { haversineMetres } from "@/lib/geo";

export type TripStateName = "IDLE" | "TRACKING" | "ENDING" | "ENDED" | "ENDED_PENDING_SYNC";

/** The single persisted state row (TRD §4.1). */
export type TripStateRow = {
  tripId: string | null;
  state: TripStateName;
  /** Next `seq` to hand out for `tripId`. Never decreases while a trip is open. */
  nextSeq: number;
  startedAt: string | null;
  endedAt: string | null;
  endLat: number | null;
  endLng: number | null;
  endAccuracy: number | null;
};

export const IDLE_STATE: TripStateRow = {
  tripId: null,
  state: "IDLE",
  nextSeq: 0,
  startedAt: null,
  endedAt: null,
  endLat: null,
  endLng: null,
  endAccuracy: null,
};

/** A mapped GPS fix, before it is given a `seq`. */
export type PointInput = {
  /** Device time, ISO 8601. */
  recordedAt: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  heading: number | null;
  altitudeM: number | null;
  /** Android only; always false elsewhere (docs/06 §2). */
  isMocked: boolean;
};

/** A row in `point_queue`. */
export type PointQueueRow = PointInput & {
  tripId: string;
  seq: number;
  uploaded: boolean;
  /**
   * ND-8: a row the server refused. Quarantined rows are never retried, so a
   * single bad point can never wedge the whole batch.
   */
  quarantined: boolean;
  quarantineReason: string | null;
};

export type PointCounts = {
  total: number;
  /** Not uploaded and not quarantined — what the uploader still owes the server. */
  pending: number;
  uploaded: number;
  quarantined: number;
};

export type TrackingStore = {
  readState(): Promise<TripStateRow>;
  writeState(state: TripStateRow): Promise<void>;
  /** Allocates `seq` from the persisted counter and returns how many were written. */
  insertPoints(tripId: string, points: readonly PointInput[]): Promise<number>;
  /** Oldest not-yet-uploaded, non-quarantined rows, up to `limit`. */
  pendingPoints(tripId: string, limit: number): Promise<PointQueueRow[]>;
  markUploaded(tripId: string, seqs: readonly number[]): Promise<number>;
  quarantine(tripId: string, seqs: readonly number[], reason: string): Promise<number>;
  /**
   * Every stored row for the trip, oldest `seq` first, uploaded rows included.
   *
   * This is the **D5 route line** (M10): the screen draws the trip from the
   * local queue rather than asking the server, so the map keeps up even while
   * the phone is offline — which is the whole point of queueing locally first
   * (CLAUDE.md hard rule 5). Rows are only deleted once the trip is final
   * (`deleteUploaded`), so during a trip this returns the full trace.
   */
  routePoints(tripId: string, limit: number): Promise<PointQueueRow[]>;
  /** Deletes rows already uploaded — called once a trip is final (TRD §4.3). */
  deleteUploaded(tripId: string): Promise<number>;
  countPoints(tripId: string): Promise<PointCounts>;
  /** Highest `seq` handed out for the trip, or 0. This is `expected_points`. */
  maxSeq(tripId: string): Promise<number>;
  lastPoint(tripId: string): Promise<PointQueueRow | null>;
  clearTrip(tripId: string): Promise<void>;
};

/** States in which the phone still owes the server work. */
export function isActiveState(state: TripStateName): boolean {
  return state === "TRACKING" || state === "ENDING" || state === "ENDED_PENDING_SYNC";
}

/**
 * Map an `expo-location` fix to a queue row (docs/06 §2).
 *
 * Returns null when the fix cannot be trusted: a non-finite or out-of-range
 * coordinate, or a missing timestamp. Fabricating a timestamp would put the row
 * outside the verifier's window and manufacture an ND-8 rejection, so a bad fix
 * is dropped rather than guessed.
 */
export function toPointInput(location: LocationObject): PointInput | null {
  const { latitude, longitude, accuracy, speed, heading, altitude } = location.coords;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return null;
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return null;
  }
  if (!Number.isFinite(location.timestamp)) {
    return null;
  }

  return {
    recordedAt: new Date(location.timestamp).toISOString(),
    lat: latitude,
    lng: longitude,
    accuracyM: numberOrNull(accuracy),
    speedMps: numberOrNull(speed),
    heading: numberOrNull(heading),
    altitudeM: numberOrNull(altitude),
    isMocked: location.mocked === true,
  };
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type RecordCandidate = { lat: number; lng: number; recordedAt: string };

export type RecordOptions = { minMoveM: number; heartbeatMs: number };

/**
 * ND-6: should this fix become a row?
 *
 * Yes when it is the first point, when the truck has moved `minMoveM`, or when
 * `heartbeatMs` has passed since the previous row — the heartbeat that keeps a
 * parked truck from looking like a tracking gap. An unparseable timestamp is
 * kept rather than dropped: losing a real fix is worse than an extra row.
 */
export function shouldRecord(
  previous: RecordCandidate | null,
  next: RecordCandidate,
  options: RecordOptions,
): boolean {
  if (previous === null) {
    return true;
  }
  if (haversineMetres(previous, next) >= options.minMoveM) {
    return true;
  }
  const elapsed = Date.parse(next.recordedAt) - Date.parse(previous.recordedAt);
  if (!Number.isFinite(elapsed)) {
    return true;
  }
  return elapsed >= options.heartbeatMs;
}

/**
 * Apply `shouldRecord` across a batch of fixes, carrying the accepted point
 * forward as the next comparison base. A batch can therefore be thinned as a
 * whole rather than each point being tested against the last *stored* row.
 *
 * The background task and the dev screen's simulator share this, so what the
 * simulator shows is the same rule the phone applies.
 */
export function selectPoints(
  previous: RecordCandidate | null,
  points: readonly PointInput[],
  options: RecordOptions,
): PointInput[] {
  const accepted: PointInput[] = [];
  let cursor = previous;
  for (const point of points) {
    if (shouldRecord(cursor, point, options)) {
      accepted.push(point);
      cursor = point;
    }
  }
  return accepted;
}

/**
 * In-memory `TrackingStore`. Used by unit tests and by web (where a trip never
 * runs but the dev screen and the launch resume still need a store).
 */
export function createMemoryTrackingStore(initial?: Partial<TripStateRow>): TrackingStore {
  let state: TripStateRow = { ...IDLE_STATE, ...initial };
  let points: PointQueueRow[] = [];

  const matching = (tripId: string) => points.filter((row) => row.tripId === tripId);

  return {
    readState: async () => ({ ...state }),

    writeState: async (next) => {
      state = { ...next };
      // A new trip starts with an empty queue and a fresh seq counter.
      if (next.state === "TRACKING" && next.nextSeq === 0) {
        points = points.filter((row) => row.tripId === next.tripId);
      }
    },

    insertPoints: async (tripId, incoming) => {
      if (tripId === "" || state.tripId !== tripId || incoming.length === 0) {
        return 0;
      }
      let seq = state.nextSeq;
      const rows: PointQueueRow[] = [];
      for (const point of incoming) {
        seq += 1;
        rows.push({
          ...point,
          tripId,
          seq,
          uploaded: false,
          quarantined: false,
          quarantineReason: null,
        });
      }
      points = [...points, ...rows];
      state = { ...state, nextSeq: seq };
      return rows.length;
    },

    pendingPoints: async (tripId, limit) =>
      matching(tripId)
        .filter((row) => !row.uploaded && !row.quarantined)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, Math.max(0, limit))
        .map((row) => ({ ...row })),

    routePoints: async (tripId, limit) =>
      matching(tripId)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, Math.max(0, limit))
        .map((row) => ({ ...row })),

    markUploaded: async (tripId, seqs) => {
      const wanted = new Set(seqs);
      let changed = 0;
      points = points.map((row) => {
        if (row.tripId === tripId && wanted.has(row.seq) && !row.uploaded) {
          changed += 1;
          return { ...row, uploaded: true };
        }
        return row;
      });
      return changed;
    },

    quarantine: async (tripId, seqs, reason) => {
      const wanted = new Set(seqs);
      let changed = 0;
      points = points.map((row) => {
        if (row.tripId === tripId && wanted.has(row.seq) && !row.quarantined) {
          changed += 1;
          return { ...row, quarantined: true, quarantineReason: reason };
        }
        return row;
      });
      return changed;
    },

    deleteUploaded: async (tripId) => {
      const before = points.length;
      points = points.filter((row) => !(row.tripId === tripId && row.uploaded));
      return before - points.length;
    },

    countPoints: async (tripId) => {
      const rows = matching(tripId);
      const uploaded = rows.filter((row) => row.uploaded).length;
      const quarantined = rows.filter((row) => row.quarantined).length;
      return {
        total: rows.length,
        uploaded,
        quarantined,
        pending: rows.length - uploaded - quarantined,
      };
    },

    maxSeq: async (tripId) => matching(tripId).reduce((max, row) => Math.max(max, row.seq), 0),

    lastPoint: async (tripId) =>
      matching(tripId).reduce<PointQueueRow | null>(
        (last, row) => (last === null || row.seq > last.seq ? row : last),
        null,
      ),

    clearTrip: async (tripId) => {
      points = points.filter((row) => row.tripId !== tripId);
      if (state.tripId === tripId) {
        state = { ...IDLE_STATE };
      }
    },
  };
}
