/**
 * Local tracking state for the launch gate (M8, replaces the M5 stub).
 *
 * S1 asks this module whether the phone was recording a trip when the app was
 * last closed, because an unfinished trip is resumed before the session and role
 * gate runs (docs/04 §2). The answer now comes from the real persisted
 * `trip_state` row rather than a flag in session storage.
 *
 * "Active" is TRACKING, ENDING or ENDED_PENDING_SYNC: all three still owe the
 * driver a screen (end a running trip, or finish syncing one). ENDED is done and
 * lets the gate move on.
 *
 * Never throws. A storage failure only costs the ability to resume, which is a
 * far better outcome than a splash that cannot navigate.
 */
import { getTrackingStore } from "@/tracking/db";
import { isActiveState, type TripStateRow } from "@/tracking/queue";

export type LocalTrackingState = {
  /** The trip to resume, or null when there is nothing in flight. */
  activeTripId: string | null;
  /** Points still waiting to reach the server, for the D3 sync badge. */
  pendingPoints: number;
};

/** Pure: which persisted state counts as "the driver still has a job here". */
export function activeTripIdFrom(state: TripStateRow): string | null {
  return isActiveState(state.state) ? state.tripId : null;
}

export async function readLocalTrackingState(): Promise<LocalTrackingState> {
  try {
    const store = await getTrackingStore();
    const state = await store.readState();
    const activeTripId = activeTripIdFrom(state);
    const pendingPoints =
      state.tripId === null ? 0 : (await store.countPoints(state.tripId)).pending;
    return { activeTripId, pendingPoints };
  } catch {
    return { activeTripId: null, pendingPoints: 0 };
  }
}
