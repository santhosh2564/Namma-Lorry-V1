/**
 * The trip state machine (M8, docs/03-TRD.md §4.1, docs/06 §1).
 *
 * ```
 * IDLE ──(Start, fresh fix, start_trip ok)──▶ TRACKING
 * TRACKING ──(End)──▶ ENDING ──(flush + end_trip ok)──▶ ENDED
 * ENDING ──(offline)──▶ ENDED_PENDING_SYNC ──(online, flush + end_trip)──▶ ENDED
 * TRACKING ──(killed / reboot)──▶ next launch resumes TRACKING
 * ```
 *
 * `reduce` is a pure function of `(state, event)` — no I/O, no clock, no
 * database — so every transition and every ignored event is a unit test. The
 * side effects live in `createTrackingService`, which takes its dependencies
 * (the store, the RPCs, the location task, the flush) as arguments so a test can
 * drive a whole trip, including the offline paths, without a device.
 *
 * The two hard rules this file enforces:
 * - **Never start the location task if `start_trip` failed** (docs/06 §1). A
 *   rejected start must not leave a phone quietly recording.
 * - **End works offline.** The `ENDING` row is written *before* the network is
 *   touched, so a phone that dies mid-end still knows the trip ended and when.
 */
import { parseTrackingError, type TrackingError } from "@/tracking/errors";
import { IDLE_STATE, isActiveState, type TrackingStore, type TripStateRow } from "@/tracking/queue";
import { EMPTY_FLUSH, type FlushResult } from "@/tracking/uploader";

export type TrackingEvent =
  | { type: "STARTED"; tripId: string; startedAt: string }
  | {
      type: "END_REQUESTED";
      endedAt: string;
      lat: number | null;
      lng: number | null;
      accuracyM: number | null;
    }
  | { type: "END_CONFIRMED" }
  | { type: "END_OFFLINE" }
  | { type: "RESET" };

/**
 * Apply one event. Returns the *same object* when the event does not apply, so a
 * caller can tell "nothing changed" with `next === current` — and so a stray
 * event can never move a trip into a state the TRD does not draw.
 */
export function reduce(state: TripStateRow, event: TrackingEvent): TripStateRow {
  switch (event.type) {
    case "STARTED": {
      if (state.state !== "IDLE") {
        return state;
      }
      return {
        tripId: event.tripId,
        state: "TRACKING",
        nextSeq: 0,
        startedAt: event.startedAt,
        endedAt: null,
        endLat: null,
        endLng: null,
        endAccuracy: null,
      };
    }
    case "END_REQUESTED": {
      if (state.state !== "TRACKING") {
        return state;
      }
      return {
        ...state,
        state: "ENDING",
        endedAt: event.endedAt,
        endLat: event.lat,
        endLng: event.lng,
        endAccuracy: event.accuracyM,
      };
    }
    case "END_CONFIRMED": {
      if (state.state !== "ENDING" && state.state !== "ENDED_PENDING_SYNC") {
        return state;
      }
      return { ...state, state: "ENDED" };
    }
    case "END_OFFLINE": {
      if (state.state !== "ENDING") {
        return state;
      }
      return { ...state, state: "ENDED_PENDING_SYNC" };
    }
    case "RESET": {
      if (state.state !== "ENDED") {
        return state;
      }
      return { ...IDLE_STATE };
    }
  }
}

export type FreshFix = { lat: number; lng: number; accuracyM: number | null };

export type StartTripRpcArgs = {
  tripId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  deviceInfo: unknown;
};

export type StartTripRpcOutcome =
  { ok: true; startedAt: string | null } | { ok: false; error: unknown };

export type EndTripRpcArgs = {
  tripId: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  endedAt: string;
  expectedPoints: number;
};

export type EndTripRpcOutcome = { ok: true; status: string | null } | { ok: false; error: unknown };

export type TrackingDeps = {
  store: TrackingStore;
  now: () => number;
  /** A fresh high-accuracy fix, or null when the phone cannot provide one. */
  getFreshFix: () => Promise<FreshFix | null>;
  startTripRpc: (args: StartTripRpcArgs) => Promise<StartTripRpcOutcome>;
  endTripRpc: (args: EndTripRpcArgs) => Promise<EndTripRpcOutcome>;
  startLocationUpdates: () => Promise<void>;
  stopLocationUpdates: () => Promise<void>;
  flush: () => Promise<FlushResult>;
  deviceInfo?: () => unknown;
  log?: (message: string, detail?: unknown) => void;
};

export type StartTripResult =
  | { kind: "started"; state: TripStateRow; locationUpdatesStarted: boolean }
  | { kind: "already_tracking"; state: TripStateRow }
  | { kind: "failed"; error: TrackingError };

export type EndTripResult =
  | { kind: "ended"; state: TripStateRow; tripStatus: string | null }
  | { kind: "pending"; state: TripStateRow; message?: string }
  | { kind: "failed"; error: TrackingError };

export type ResumeResult =
  | { kind: "idle"; state: TripStateRow }
  | { kind: "resumed"; state: TripStateRow; message?: string }
  | { kind: "synced"; state: TripStateRow }
  | { kind: "pending"; state: TripStateRow; message?: string }
  | { kind: "failed"; state: TripStateRow; error: TrackingError };

export type TrackingService = {
  startTrip: (tripId: string) => Promise<StartTripResult>;
  endTrip: () => Promise<EndTripResult>;
  resumeOnLaunch: () => Promise<ResumeResult>;
  getState: () => Promise<TripStateRow>;
};

function clientError(code: TrackingError["code"], message: string): TrackingError {
  return { code, message };
}

export function createTrackingService(deps: TrackingDeps): TrackingService {
  const { store } = deps;

  const log = (message: string, detail?: unknown) => deps.log?.(message, detail);

  async function safeStopUpdates(): Promise<void> {
    try {
      await deps.stopLocationUpdates();
    } catch (error) {
      log("Could not stop location updates", error);
    }
  }

  async function safeDeleteUploaded(tripId: string): Promise<void> {
    try {
      await store.deleteUploaded(tripId);
    } catch (error) {
      log("Could not delete uploaded points", error);
    }
  }

  /**
   * Finish an `ENDING` / `ENDED_PENDING_SYNC` trip: call `end_trip`, then clear
   * the uploaded tail. `TRIP_NOT_ACTIVE` counts as success — another attempt (or
   * another device) already ended the trip, which is exactly the outcome we
   * wanted, so retrying it forever would be the bug.
   */
  async function finishEnd(state: TripStateRow, expectedPoints: number): Promise<EndTripResult> {
    const tripId = state.tripId;
    if (tripId === null) {
      return { kind: "failed", error: clientError("TRIP_NOT_FOUND", "No trip to end") };
    }

    const rpc = await deps.endTripRpc({
      tripId,
      lat: state.endLat,
      lng: state.endLng,
      accuracyM: state.endAccuracy,
      endedAt: state.endedAt ?? new Date(deps.now()).toISOString(),
      expectedPoints,
    });

    if (!rpc.ok) {
      const error = parseTrackingError(rpc.error);
      if (error.code === "TRIP_NOT_ACTIVE") {
        const done = reduce(state, { type: "END_CONFIRMED" });
        if (done !== state) {
          await store.writeState(done);
        }
        await safeDeleteUploaded(tripId);
        return { kind: "ended", state: done, tripStatus: null };
      }
      if (error.code === "NETWORK" || error.code === "NOT_CONFIGURED") {
        const pending = reduce(state, { type: "END_OFFLINE" });
        if (pending !== state) {
          await store.writeState(pending);
        }
        return { kind: "pending", state: pending, message: error.message };
      }
      return { kind: "failed", error };
    }

    const done = reduce(state, { type: "END_CONFIRMED" });
    if (done !== state) {
      await store.writeState(done);
    }
    await safeDeleteUploaded(tripId);
    return { kind: "ended", state: done, tripStatus: rpc.status };
  }

  async function startTrip(tripId: string): Promise<StartTripResult> {
    const current = await store.readState();

    if (current.state === "TRACKING" && current.tripId === tripId) {
      return { kind: "already_tracking", state: current };
    }
    if (isActiveState(current.state)) {
      return {
        kind: "failed",
        error: clientError(
          "ANOTHER_TRIP_ACTIVE",
          "This phone is already recording a trip. End it first.",
        ),
      };
    }

    // Fresh fix first, then the RPC — the RPC is what judges the accuracy and
    // the pickup geofence, so we must not pre-filter the fix here.
    const fix = await deps.getFreshFix();
    if (fix === null) {
      return {
        kind: "failed",
        error: clientError("GPS_UNAVAILABLE", "No usable GPS fix yet — try again in a moment."),
      };
    }

    const rpc = await deps.startTripRpc({
      tripId,
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
      deviceInfo: deps.deviceInfo?.() ?? null,
    });
    if (!rpc.ok) {
      // Hard rule: a rejected start must never leave the location task running.
      return { kind: "failed", error: parseTrackingError(rpc.error) };
    }

    const base = current.state === "ENDED" ? reduce(current, { type: "RESET" }) : current;
    const next = reduce(base, {
      type: "STARTED",
      tripId,
      startedAt: rpc.startedAt ?? new Date(deps.now()).toISOString(),
    });
    if (next === base) {
      return {
        kind: "failed",
        error: clientError("UNKNOWN", "The trip could not be started from this state"),
      };
    }

    // Persist before starting the task: the task reads the state row to find the
    // active trip, so the row must exist before the first point can arrive.
    await store.writeState(next);

    let locationUpdatesStarted = true;
    try {
      await deps.startLocationUpdates();
    } catch (error) {
      locationUpdatesStarted = false;
      log("Location updates did not start after a successful start_trip", error);
    }

    return { kind: "started", state: next, locationUpdatesStarted };
  }

  async function endTrip(): Promise<EndTripResult> {
    const current = await store.readState();
    if (current.tripId === null) {
      return { kind: "failed", error: clientError("TRIP_NOT_FOUND", "No trip is being recorded") };
    }
    if (current.state === "ENDED") {
      return { kind: "ended", state: current, tripStatus: null };
    }
    if (
      current.state !== "TRACKING" &&
      current.state !== "ENDING" &&
      current.state !== "ENDED_PENDING_SYNC"
    ) {
      return {
        kind: "failed",
        error: clientError("TRIP_NOT_ACTIVE", "This trip is not being recorded"),
      };
    }

    let state = current;
    if (current.state === "TRACKING") {
      await safeStopUpdates();
      // Best effort: a phone with no fix must still be able to end (docs/06 §1).
      const fix = await deps.getFreshFix().catch(() => null);
      state = reduce(current, {
        type: "END_REQUESTED",
        endedAt: new Date(deps.now()).toISOString(),
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        accuracyM: fix?.accuracyM ?? null,
      });
      await store.writeState(state);
    }

    const flushResult = await deps.flush().catch(() => EMPTY_FLUSH);
    if (flushResult.network) {
      const pending = reduce(state, { type: "END_OFFLINE" });
      if (pending !== state) {
        await store.writeState(pending);
      }
      return { kind: "pending", state: pending, message: flushResult.message };
    }

    const expectedPoints = await store.maxSeq(current.tripId);
    return finishEnd(state, expectedPoints);
  }

  async function resumeOnLaunch(): Promise<ResumeResult> {
    const state = await store.readState();

    switch (state.state) {
      case "IDLE":
        return { kind: "idle", state };

      case "TRACKING": {
        // The app died or the phone rebooted mid-trip: put the task back and
        // drain whatever is queued. Idempotent — starting an already-running
        // task is a no-op in `startLocationUpdates`.
        try {
          await deps.startLocationUpdates();
        } catch (error) {
          log("Could not restart location updates on resume", error);
        }
        const flushResult = await deps.flush().catch(() => EMPTY_FLUSH);
        return { kind: "resumed", state, message: flushResult.message };
      }

      case "ENDING":
      case "ENDED_PENDING_SYNC": {
        const flushResult = await deps.flush().catch(() => EMPTY_FLUSH);
        if (flushResult.network) {
          const pending = reduce(state, { type: "END_OFFLINE" });
          if (pending !== state) {
            await store.writeState(pending);
          }
          return { kind: "pending", state: pending, message: flushResult.message };
        }
        const expectedPoints = state.tripId === null ? 0 : await store.maxSeq(state.tripId);
        const result = await finishEnd(state, expectedPoints);
        if (result.kind === "ended") {
          return { kind: "synced", state: result.state };
        }
        if (result.kind === "pending") {
          return { kind: "pending", state: result.state, message: result.message };
        }
        return { kind: "failed", state, error: result.error };
      }

      case "ENDED": {
        if (state.tripId !== null) {
          await safeDeleteUploaded(state.tripId);
        }
        return { kind: "idle", state };
      }
    }
  }

  return { startTrip, endTrip, resumeOnLaunch, getState: () => store.readState() };
}
