// Local SQLite for the tracking engine (TRD §4.1, §4.3).
// The database outlives app kills and reboots; it is the source of truth for
// the trip state and every GPS point until the server has it.

export type SqlParam = string | number | null;

/** The subset of expo-sqlite's async API the engine uses (also implemented over node:sqlite in tests). */
export interface SqlExec {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlParam[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlParam[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
}

export interface SqlDb extends SqlExec {
  /**
   * Runs `fn` in one write transaction: all or nothing. Implementations must be
   * exclusive (no other writer interleaves), which seq allocation relies on.
   */
  transaction<T>(fn: (tx: SqlExec) => Promise<T>): Promise<T>;
}

export type TripStateName = 'IDLE' | 'TRACKING' | 'ENDING' | 'ENDED' | 'ENDED_PENDING_SYNC';

/** Row of trip_state. One row per trip that still has local work (state IDLE = no row). */
export interface TripStateRow {
  trip_id: string;
  state: Exclude<TripStateName, 'IDLE'>;
  next_seq: number;
  started_at: string | null;
  ended_at: string | null;
  end_lat: number | null;
  end_lng: number | null;
  end_accuracy: number | null;
  /** Last seq recorded when End was tapped → end_trip p_expected_points. */
  last_seq: number | null;
  /** Server status after end_trip ('completed', 'verified', …). */
  server_status: string | null;
  last_error: string | null;
  updated_at: string;
}

/** point_queue.uploaded values. */
export const UPLOAD = { PENDING: 0, UPLOADED: 1, REJECTED: 2 } as const;

export interface PointRow {
  trip_id: string;
  seq: number;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading: number | null;
  altitude_m: number | null;
  is_mocked: number;
  uploaded: number;
  reject_reason: string | null;
}

// Schema migrations, applied in order and tracked with PRAGMA user_version.
// point_queue is the TRD §4.3 table plus reject_reason (ND-8 quarantine).
const MIGRATIONS: string[] = [
  `
  create table if not exists trip_state(
    trip_id text primary key,
    state text not null check (state in ('TRACKING','ENDING','ENDED','ENDED_PENDING_SYNC')),
    next_seq integer not null default 1 check (next_seq >= 1),
    started_at text,
    ended_at text,
    end_lat real,
    end_lng real,
    end_accuracy real,
    last_seq integer,
    server_status text,
    last_error text,
    updated_at text not null
  );
  create table if not exists point_queue(
    trip_id text, seq integer, recorded_at text, lat real, lng real,
    accuracy_m real, speed_mps real, heading real, altitude_m real, is_mocked integer,
    uploaded integer default 0,
    reject_reason text,
    primary key(trip_id, seq));
  create index if not exists point_queue_pending on point_queue(uploaded, trip_id, seq);
  create index if not exists point_queue_time on point_queue(trip_id, recorded_at);
  `,
];

export async function migrate(db: SqlDb): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('pragma user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]!;
    const next = version + 1;
    await db.transaction(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`pragma user_version = ${next}`);
    });
    version = next;
  }
  // Belt and braces for "seq is never reused": next_seq can never be at or below a queued seq.
  await db.transaction((tx) =>
    tx.runAsync(
      `update trip_state set next_seq = (select max(seq) + 1 from point_queue q where q.trip_id = trip_state.trip_id)
       where next_seq <= (select coalesce(max(seq), 0) from point_queue q where q.trip_id = trip_state.trip_id)`,
    ),
  );
}

/** In-process lock so writers from the background task and the UI never interleave. */
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    tail = result.catch(() => undefined);
    return result;
  };
}

// ---------- expo-sqlite adapter ----------

interface ExpoLikeDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlParam[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlParam[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  withExclusiveTransactionAsync?(task: (txn: ExpoLikeDb) => Promise<void>): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** Wraps an expo-sqlite database: exclusive transactions on native, serialised ones on web. */
export function fromExpoSqlite(db: ExpoLikeDb, exclusive: boolean): SqlDb {
  const lock = createMutex();
  const exec: SqlExec = {
    execAsync: (sql) => lock(() => db.execAsync(sql)),
    runAsync: (sql, ...p) => lock(() => db.runAsync(sql, ...p)),
    getFirstAsync: (sql, ...p) => db.getFirstAsync(sql, ...p),
    getAllAsync: (sql, ...p) => db.getAllAsync(sql, ...p),
  };
  return {
    ...exec,
    transaction: (fn) =>
      lock(async () => {
        let out: Awaited<ReturnType<typeof fn>> | undefined;
        if (exclusive && db.withExclusiveTransactionAsync) {
          await db.withExclusiveTransactionAsync(async (txn) => {
            out = await fn(txn);
          });
        } else {
          await db.withTransactionAsync(async () => {
            out = await fn(db);
          });
        }
        return out as Awaited<ReturnType<typeof fn>>;
      }),
  };
}
