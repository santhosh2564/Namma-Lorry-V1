// STUB until M8. The real implementation reads `trip_state` from the SQLite queue
// (TRD §4.3) and restarts the background location task when a trip is TRACKING.
// S1 Splash calls this before anything else (docs/04 §2), and sign-out is blocked
// while it reports an active trip.

export interface LocalTripState {
  activeTripId: string | null;
}

let devActiveTripId: string | null = null;

export async function getLocalTripState(): Promise<LocalTripState> {
  return { activeTripId: devActiveTripId };
}

/** Test/dev hook only; M8 replaces this module. */
export function __setStubActiveTrip(tripId: string | null) {
  devActiveTripId = tripId;
}

/** STUB until M8: restart the location task for a trip found in local state. */
export async function resumeTracking(_tripId: string): Promise<void> {}
