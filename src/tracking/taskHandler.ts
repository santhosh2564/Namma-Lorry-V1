// What the background task does with a batch of locations: map and queue. SQLite only,
// no network (TRD §4.2), returns fast, never throws (a throwing task can be unregistered).
import { START_TOLERANCE_MS } from './config';
import type { SqlDb } from './db';
import { mapLocations, type LocationLike } from './mapping';
import { appendPoints, getActiveTrip } from './queue';

export async function handleLocationUpdate(
  getDb: () => Promise<SqlDb>,
  locations: LocationLike[] | undefined,
  now: () => number,
  log: (msg: string, e?: unknown) => void = () => {},
): Promise<number> {
  try {
    if (!locations?.length) return 0;
    const db = await getDb();
    const trip = await getActiveTrip(db);
    if (trip?.state !== 'TRACKING') return 0;
    const points = mapLocations(locations, trip.started_at, START_TOLERANCE_MS);
    const r = await appendPoints(db, points, new Date(now()).toISOString());
    return r.inserted;
  } catch (e) {
    log('location task failed', e);
    return 0;
  }
}
