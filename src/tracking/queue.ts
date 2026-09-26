// Repository over the tracking SQLite tables. All writes are transactional.
import type { PointRow, SqlDb, SqlExec, TripStateRow } from './db';
import { UPLOAD } from './db';

/** A point ready to queue (already mapped from expo-location, see mapping.ts). */
export interface NewPoint {
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading: number | null;
  altitude_m: number | null;
  is_mocked: boolean;
}

/** Row shape for `trip_points` upserts (docs/06 §2 TripPointRow). */
export interface UploadRow {
  trip_id: string;
  seq: number;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading: number | null;
  altitude_m: number | null;
  is_mocked: boolean;
}

const ACTIVE = `('TRACKING','ENDING','ENDED_PENDING_SYNC')`;

export async function getTripState(db: SqlExec, tripId: string): Promise<TripStateRow | null> {
  return db.getFirstAsync<TripStateRow>('select * from trip_state where trip_id = ?', tripId);
}

/** The trip that is tracking or still ending (at most one: start_trip allows one in_progress trip). */
export async function getActiveTrip(db: SqlExec): Promise<TripStateRow | null> {
  return db.getFirstAsync<TripStateRow>(
    `select * from trip_state where state in ${ACTIVE} order by updated_at desc limit 1`,
  );
}

export async function listTripStates(db: SqlExec): Promise<TripStateRow[]> {
  return db.getAllAsync<TripStateRow>('select * from trip_state order by updated_at');
}

/** Creates the TRACKING row for a trip the server has just started. */
export async function insertTracking(
  db: SqlDb,
  tripId: string,
  startedAt: string,
  now: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.getFirstAsync<TripStateRow>(
      'select * from trip_state where trip_id = ?',
      tripId,
    );
    if (existing) {
      // Same trip started again (e.g. retry after the RPC succeeded but the app died): keep its seq.
      await tx.runAsync(
        `update trip_state set state = 'TRACKING', started_at = ?, updated_at = ?, last_error = null where trip_id = ?`,
        startedAt,
        now,
        tripId,
      );
      return;
    }
    await tx.runAsync(
      `insert into trip_state(trip_id, state, next_seq, started_at, updated_at) values (?, 'TRACKING', 1, ?, ?)`,
      tripId,
      startedAt,
      now,
    );
  });
}

export interface AppendResult {
  tripId: string | null;
  inserted: number;
  /** First and last seq allocated in this call. */
  firstSeq: number | null;
  lastSeq: number | null;
}

/**
 * Appends points to the TRACKING trip. Seq allocation and the inserts happen in
 * ONE transaction, so a crash either persists both or neither: a seq is never
 * reused and never skipped. Points are dropped when no trip is TRACKING.
 */
export async function appendPoints(db: SqlDb, points: NewPoint[], now: string): Promise<AppendResult> {
  if (!points.length) return { tripId: null, inserted: 0, firstSeq: null, lastSeq: null };
  return db.transaction(async (tx) => {
    const trip = await tx.getFirstAsync<TripStateRow>(
      `select * from trip_state where state = 'TRACKING' order by updated_at desc limit 1`,
    );
    if (!trip) return { tripId: null, inserted: 0, firstSeq: null, lastSeq: null };
    // Drop exact duplicates only (the OS can deliver the same fix twice). Out-of-order
    // timestamps are kept: the phone clock can step backwards, and every real fix matters.
    const seen = new Set<string>();
    const fresh: NewPoint[] = [];
    for (const p of [...points].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))) {
      if (seen.has(p.recorded_at)) continue;
      seen.add(p.recorded_at);
      const dup = await tx.getFirstAsync<{ one: number }>(
        'select 1 as one from point_queue where trip_id = ? and recorded_at = ?',
        trip.trip_id,
        p.recorded_at,
      );
      if (!dup) fresh.push(p);
    }
    if (!fresh.length) return { tripId: trip.trip_id, inserted: 0, firstSeq: null, lastSeq: null };

    let seq = trip.next_seq;
    for (const p of fresh) {
      await tx.runAsync(
        `insert into point_queue(trip_id, seq, recorded_at, lat, lng, accuracy_m, speed_mps, heading, altitude_m, is_mocked, uploaded)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        trip.trip_id,
        seq,
        p.recorded_at,
        p.lat,
        p.lng,
        p.accuracy_m,
        p.speed_mps,
        p.heading,
        p.altitude_m,
        p.is_mocked ? 1 : 0,
      );
      seq += 1;
    }
    await tx.runAsync(
      'update trip_state set next_seq = ?, updated_at = ? where trip_id = ?',
      seq,
      now,
      trip.trip_id,
    );
    return { tripId: trip.trip_id, inserted: fresh.length, firstSeq: trip.next_seq, lastSeq: seq - 1 };
  });
}

/**
 * Moves TRACKING → ENDING atomically, recording when End was tapped, the end
 * position and the last seq (end_trip p_expected_points). Points arriving after
 * this are dropped because the trip is no longer TRACKING.
 */
export async function markEnding(
  db: SqlDb,
  tripId: string,
  endedAt: string,
  end: { lat: number; lng: number; accuracy: number | null } | null,
  now: string,
): Promise<TripStateRow> {
  return db.transaction(async (tx) => {
    await tx.runAsync(
      `update trip_state set state = 'ENDING', ended_at = ?, end_lat = ?, end_lng = ?, end_accuracy = ?,
         last_seq = next_seq - 1, updated_at = ?
       where trip_id = ? and state = 'TRACKING'`,
      endedAt,
      end?.lat ?? null,
      end?.lng ?? null,
      end?.accuracy ?? null,
      now,
      tripId,
    );
    const row = await tx.getFirstAsync<TripStateRow>('select * from trip_state where trip_id = ?', tripId);
    if (!row) throw new Error(`trip_state missing for ${tripId}`);
    return row;
  });
}

export async function setState(
  db: SqlDb,
  tripId: string,
  state: TripStateRow['state'],
  now: string,
  extra: { server_status?: string | null; last_error?: string | null } = {},
): Promise<void> {
  await db.transaction((tx) =>
    tx.runAsync(
      `update trip_state set state = ?, updated_at = ?,
         server_status = coalesce(?, server_status), last_error = ?
       where trip_id = ?`,
      state,
      now,
      extra.server_status ?? null,
      extra.last_error ?? null,
      tripId,
    ),
  );
}

export async function lastPoint(db: SqlExec, tripId: string): Promise<PointRow | null> {
  return db.getFirstAsync<PointRow>(
    'select * from point_queue where trip_id = ? order by seq desc limit 1',
    tripId,
  );
}

export async function pendingBatch(db: SqlExec, limit: number): Promise<PointRow[]> {
  return db.getAllAsync<PointRow>(
    'select * from point_queue where uploaded = 0 order by trip_id, seq limit ?',
    limit,
  );
}

export async function markUploaded(db: SqlDb, rows: { trip_id: string; seq: number }[]): Promise<void> {
  if (!rows.length) return;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.runAsync(
        'update point_queue set uploaded = ? where trip_id = ? and seq = ?',
        UPLOAD.UPLOADED,
        r.trip_id,
        r.seq,
      );
    }
  });
}

/** ND-8: a row the server permanently refuses is set aside (kept for audit) so it can't block the queue. */
export async function markRejected(
  db: SqlDb,
  row: { trip_id: string; seq: number },
  reason: string,
): Promise<void> {
  await db.transaction((tx) =>
    tx.runAsync(
      'update point_queue set uploaded = ?, reject_reason = ? where trip_id = ? and seq = ?',
      UPLOAD.REJECTED,
      reason.slice(0, 200),
      row.trip_id,
      row.seq,
    ),
  );
}

/** D5: the trip's route as recorded on this phone (uploaded or not), oldest first. */
export type RoutePoint = Pick<PointRow, 'seq' | 'recorded_at' | 'lat' | 'lng' | 'accuracy_m' | 'heading'>;

export async function routePoints(db: SqlExec, tripId: string): Promise<RoutePoint[]> {
  return db.getAllAsync<RoutePoint>(
    'select seq, recorded_at, lat, lng, accuracy_m, heading from point_queue where trip_id = ? order by seq',
    tripId,
  );
}

export interface QueueCounts {
  pending: number;
  uploaded: number;
  rejected: number;
}

export async function counts(db: SqlExec, tripId?: string): Promise<QueueCounts> {
  const where = tripId ? 'where trip_id = ?' : '';
  const params = tripId ? [tripId] : [];
  const row = await db.getFirstAsync<{
    pending: number | null;
    uploaded: number | null;
    rejected: number | null;
  }>(
    `select sum(uploaded = 0) as pending, sum(uploaded = 1) as uploaded, sum(uploaded = 2) as rejected
     from point_queue ${where}`,
    ...params,
  );
  return { pending: row?.pending ?? 0, uploaded: row?.uploaded ?? 0, rejected: row?.rejected ?? 0 };
}

/** TRD §4.3: once the trip is final on the server, its local rows and state go. */
export async function deleteTrip(db: SqlDb, tripId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.runAsync('delete from point_queue where trip_id = ?', tripId);
    await tx.runAsync('delete from trip_state where trip_id = ?', tripId);
  });
}

export function toUploadRow(p: PointRow): UploadRow {
  return {
    trip_id: p.trip_id,
    seq: p.seq,
    recorded_at: p.recorded_at,
    lat: p.lat,
    lng: p.lng,
    accuracy_m: p.accuracy_m,
    speed_mps: p.speed_mps,
    heading: p.heading,
    altitude_m: p.altitude_m,
    is_mocked: p.is_mocked === 1,
  };
}
