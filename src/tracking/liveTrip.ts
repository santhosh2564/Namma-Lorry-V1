// What D5 Active Trip and D6 Trip Summary read from this phone: the trip's local state,
// its recorded route and what is still waiting to upload. Local only, so it works offline.
import { Platform } from 'react-native';

import { devDriverWeb } from '@/lib/devDriverWeb';

import type { TripStateRow } from './db';
import { counts, getTripState, routePoints, type RoutePoint } from './queue';
import { getTracking, isTripTaskRunning, syncTick } from './runtime';

export interface LiveSnapshot {
  state: TripStateRow | null;
  route: RoutePoint[];
  pending: number;
  /** Background location task running; null when unknown. */
  taskRunning: boolean | null;
}

const EMPTY: LiveSnapshot = { state: null, route: [], pending: 0, taskRunning: null };

export const liveTripKey = (tripId: string) => ['tracking', 'live', tripId] as const;

export async function getLiveSnapshot(tripId: string): Promise<LiveSnapshot> {
  if (Platform.OS === 'web' && !devDriverWeb) return EMPTY;
  const { db } = await getTracking();
  const [state, route, c, taskRunning] = await Promise.all([
    getTripState(db, tripId),
    routePoints(db, tripId),
    counts(db, tripId),
    isTripTaskRunning().catch(() => null),
  ]);
  return { state, route, pending: c.pending, taskRunning };
}

/** D5 "Fix": restart location updates for the TRACKING trip (after permission/GPS is back). */
export async function restartTracking(): Promise<void> {
  const { engine } = await getTracking();
  await engine.resumeOnLaunch();
}

/** D6 "Try uploading now". */
export async function syncNow(): Promise<void> {
  await syncTick(true);
}
