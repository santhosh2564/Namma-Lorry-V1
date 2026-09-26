// Local trip state for routing (S1 Splash, docs/04 §2) and sign-out blocking.
import { Platform } from 'react-native';

import { devDriverWeb } from '@/lib/devDriverWeb';

import { getTracking, unsyncedSummary } from './runtime';

export interface LocalTripState {
  /** Trip that is TRACKING on this device → Splash resumes Active Trip. */
  activeTripId: string | null;
  /** Trip ended on this device but not yet confirmed by the server. */
  unsyncedTripId: string | null;
  /** Points not yet uploaded. */
  pendingPoints: number;
}

export async function getLocalTripState(): Promise<LocalTripState> {
  // Web never runs trips (TRD §4.4) and must not open the device database.
  // (The dev browser preview uses the web SQLite queue like /dev/tracking.)
  if (Platform.OS === 'web' && !devDriverWeb)
    return { activeTripId: null, unsyncedTripId: null, pendingPoints: 0 };
  const s = await unsyncedSummary();
  return { activeTripId: s.activeTripId, unsyncedTripId: s.unsyncedTripId, pendingPoints: s.pending };
}

/** Restarts the location task for a persisted TRACKING trip and retries any pending end. */
export async function resumeTracking(_tripId?: string): Promise<void> {
  if (Platform.OS === 'web' && !devDriverWeb) return;
  const { engine } = await getTracking();
  await engine.resumeOnLaunch();
}
