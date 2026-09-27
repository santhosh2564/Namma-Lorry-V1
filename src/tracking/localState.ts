/**
 * Local tracking state (stub for M5, real implementation in M8).
 *
 * S1 asks this module whether the phone was recording a trip when the app was
 * last closed, because an unfinished trip has to be resumed before the session
 * and role gate runs (docs/04 §2). M8 replaces the body of
 * `readLocalTrackingState` with the SQLite state machine; the flag is persisted
 * through the same secure-store / localStorage adapter the Supabase session
 * uses, so nothing sensitive is written and M8 only has to swap the reader.
 */
import { sessionStorage } from "@/lib/supabase";

const ACTIVE_TRIP_KEY = "namma-lorry:local-active-trip";

export type LocalTrackingState = {
  /** The trip that was in progress when the app was last closed, if any. */
  activeTripId: string | null;
  /** Points still waiting in the local queue. Always 0 until M8. */
  pendingPoints: number;
};

/**
 * Read the persisted stub flag. Never throws: a storage failure must not stop
 * the app from opening, it just means "no trip to resume".
 */
export async function readLocalTrackingState(): Promise<LocalTrackingState> {
  try {
    const raw = await sessionStorage.getItem(ACTIVE_TRIP_KEY);
    return parseLocalTrackingState(raw);
  } catch {
    return { activeTripId: null, pendingPoints: 0 };
  }
}

/** Pure parser, split out so it can be tested without a storage adapter. */
export function parseLocalTrackingState(raw: string | null): LocalTrackingState {
  if (raw === null) {
    return { activeTripId: null, pendingPoints: 0 };
  }
  const tripId = raw.trim();
  return tripId
    ? { activeTripId: tripId, pendingPoints: 0 }
    : { activeTripId: null, pendingPoints: 0 };
}

/**
 * Stub writer for the resume flag. M8 replaces this with the real state
 * machine transitions; until then it only exists so the "active trip" branch
 * of the gate and the sign-out block can be exercised (tests, and the M8
 * dev screen).
 */
export async function writeLocalActiveTripId(tripId: string | null): Promise<void> {
  try {
    if (tripId === null) {
      await sessionStorage.removeItem(ACTIVE_TRIP_KEY);
    } else {
      await sessionStorage.setItem(ACTIVE_TRIP_KEY, tripId);
    }
  } catch {
    // A storage failure only costs us the ability to resume the trip.
  }
}
