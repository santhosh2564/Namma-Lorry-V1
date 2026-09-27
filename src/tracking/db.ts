/**
 * Durable tracking storage (M8, docs/03-TRD.md §4.3).
 *
 * `expo-sqlite` for the app, with the schema from the TRD plus two ND-8 columns
 * (`quarantined`, `quarantine_reason`) that let the uploader park a row the
 * server refused instead of retrying it forever. `trip_state` is a single row
 * (`id = 1`) so `next_seq` survives a crash, a reboot or a task re-entry.
 *
 * Web never runs a trip (TRD §4.4), and `expo-sqlite` needs a worker/wasm setup
 * the browser build does not have, so `getTrackingStore()` hands web the
 * in-memory store instead. The dev screen and the launch resume both work there.
 */
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

import {
  createMemoryTrackingStore,
  IDLE_STATE,
  type PointCounts,
  type PointQueueRow,
  type TrackingStore,
  type TripStateName,
  type TripStateRow,
} from "@/tracking/queue";

const DATABASE_NAME = "namma-lorry-tracking.db";

const SCHEMA = `
create table if not exists trip_state (
  id integer primary key check (id = 1),
  trip_id text,
  state text not null default 'IDLE',
  next_seq integer not null default 0,
  started_at text,
  ended_at text,
  end_lat real,
  end_lng real,
  end_accuracy real
);
insert or ignore into trip_state (id, trip_id, state, next_seq) values (1, null, 'IDLE', 0);

create table if not exists point_queue (
  trip_id text not null,
  seq integer not null,
  recorded_at text not null,
  lat real not null,
  lng real not null,
  accuracy_m real,
  speed_mps real,
  heading real,
  altitude_m real,
  is_mocked integer not null default 0,
  uploaded integer not null default 0,
  quarantined integer not null default 0,
  quarantine_reason text,
  primary key (trip_id, seq)
);
create index if not exists point_queue_pending_idx
  on point_queue (trip_id, uploaded, quarantined, seq);
`;

export type TrackingDatabase = Pick<
  SQLite.SQLiteDatabase,
  | "execAsync"
  | "runAsync"
  | "getAllAsync"
  | "getFirstAsync"
  | "withTransactionAsync"
  | "withExclusiveTransactionAsync"
>;

type StateDbRow = {
  trip_id: string | null;
  state: string;
  next_seq: number;
  started_at: string | null;
  ended_at: string | null;
  end_lat: number | null;
  end_lng: number | null;
  end_accuracy: number | null;
};

type PointDbRow = {
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
  quarantined: number;
  quarantine_reason: string | null;
};

const STATE_NAMES: readonly TripStateName[] = [
  "IDLE",
  "TRACKING",
  "ENDING",
  "ENDED",
  "ENDED_PENDING_SYNC",
];

function toStateName(value: string): TripStateName {
  return STATE_NAMES.find((name) => name === value) ?? "IDLE";
}

function stateFromRow(row: StateDbRow | null): TripStateRow {
  if (row === null) {
    return { ...IDLE_STATE };
  }
  return {
    tripId: row.trip_id,
    state: toStateName(row.state),
    nextSeq: row.next_seq,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endLat: row.end_lat,
    endLng: row.end_lng,
    endAccuracy: row.end_accuracy,
  };
}

function pointFromRow(row: PointDbRow): PointQueueRow {
  return {
    tripId: row.trip_id,
    seq: row.seq,
    recordedAt: row.recorded_at,
    lat: row.lat,
    lng: row.lng,
    accuracyM: row.accuracy_m,
    speedMps: row.speed_mps,
    heading: row.heading,
    altitudeM: row.altitude_m,
    isMocked: row.is_mocked === 1,
    uploaded: row.uploaded === 1,
    quarantined: row.quarantined === 1,
    quarantineReason: row.quarantine_reason,
  };
}

/** Run the schema (idempotent) so it can be called on every open. */
export async function migrate(db: TrackingDatabase): Promise<void> {
  await db.execAsync(SCHEMA);
}

/**
 * The real store, over `expo-sqlite`.
 *
 * `seq` allocation runs inside `withExclusiveTransactionAsync`, which opens a
 * dedicated connection: the background task and the dev screen can both call
 * `insertPoints`, and a plain transaction would let a second writer slip between
 * the counter update and the rows that use it. Exclusive serialises them. A
 * rolled-back batch rolls the counter back with it, and a batch that fails after
 * incrementing only wastes numbers — `seq` never repeats.
 */
export function createSqliteTrackingStore(db: TrackingDatabase): TrackingStore {
  return {
    readState: async () =>
      stateFromRow(await db.getFirstAsync<StateDbRow>("select * from trip_state where id = 1")),

    writeState: async (state) => {
      await db.runAsync(
        `update trip_state set trip_id = ?, state = ?, next_seq = ?, started_at = ?,
           ended_at = ?, end_lat = ?, end_lng = ?, end_accuracy = ? where id = 1`,
        [
          state.tripId,
          state.state,
          state.nextSeq,
          state.startedAt,
          state.endedAt,
          state.endLat,
          state.endLng,
          state.endAccuracy,
        ],
      );
    },

    insertPoints: async (tripId, points) => {
      if (tripId === "" || points.length === 0) {
        return 0;
      }

      let written = 0;
      await db.withExclusiveTransactionAsync(async (txn) => {
        // The active-trip check, the counter advance and the batch all commit or
        // roll back together, so a crash cannot leave rows carrying numbers the
        // counter has not reached (or vice versa).
        const current = await txn.getFirstAsync<{ trip_id: string | null }>(
          "select trip_id from trip_state where id = 1",
        );
        if (current?.trip_id !== tripId) {
          return;
        }

        await txn.runAsync("update trip_state set next_seq = next_seq + ? where id = 1", [
          points.length,
        ]);
        const counter = await txn.getFirstAsync<{ next_seq: number }>(
          "select next_seq from trip_state where id = 1",
        );
        const highest = counter?.next_seq ?? 0;
        let seq = highest - points.length;
        for (const point of points) {
          seq += 1;
          await txn.runAsync(
            `insert or ignore into point_queue
               (trip_id, seq, recorded_at, lat, lng, accuracy_m, speed_mps, heading, altitude_m,
                is_mocked, uploaded, quarantined, quarantine_reason)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, null)`,
            [
              tripId,
              seq,
              point.recordedAt,
              point.lat,
              point.lng,
              point.accuracyM,
              point.speedMps,
              point.heading,
              point.altitudeM,
              point.isMocked ? 1 : 0,
            ],
          );
          written += 1;
        }
      });
      return written;
    },

    pendingPoints: async (tripId, limit) => {
      const rows = await db.getAllAsync<PointDbRow>(
        `select * from point_queue
           where trip_id = ? and uploaded = 0 and quarantined = 0
           order by seq asc limit ?`,
        [tripId, Math.max(0, limit)],
      );
      return rows.map(pointFromRow);
    },

    markUploaded: async (tripId, seqs) => {
      if (seqs.length === 0) {
        return 0;
      }
      const result = await db.runAsync(
        `update point_queue set uploaded = 1
           where trip_id = ? and uploaded = 0 and seq in (${placeholders(seqs.length)})`,
        [tripId, ...seqs],
      );
      return result.changes;
    },

    quarantine: async (tripId, seqs, reason) => {
      if (seqs.length === 0) {
        return 0;
      }
      const result = await db.runAsync(
        `update point_queue set quarantined = 1, quarantine_reason = ?
           where trip_id = ? and quarantined = 0 and seq in (${placeholders(seqs.length)})`,
        [reason, tripId, ...seqs],
      );
      return result.changes;
    },

    deleteUploaded: async (tripId) => {
      const result = await db.runAsync(
        "delete from point_queue where trip_id = ? and uploaded = 1",
        [tripId],
      );
      return result.changes;
    },

    countPoints: async (tripId) => {
      const row = await db.getFirstAsync<{ total: number; uploaded: number; quarantined: number }>(
        `select count(*) as total,
                coalesce(sum(uploaded), 0) as uploaded,
                coalesce(sum(quarantined), 0) as quarantined
           from point_queue where trip_id = ?`,
        [tripId],
      );
      const counts: PointCounts = {
        total: row?.total ?? 0,
        uploaded: row?.uploaded ?? 0,
        quarantined: row?.quarantined ?? 0,
        pending: 0,
      };
      counts.pending = counts.total - counts.uploaded - counts.quarantined;
      return counts;
    },

    maxSeq: async (tripId) => {
      const row = await db.getFirstAsync<{ highest: number | null }>(
        "select max(seq) as highest from point_queue where trip_id = ?",
        [tripId],
      );
      return row?.highest ?? 0;
    },

    lastPoint: async (tripId) => {
      const row = await db.getFirstAsync<PointDbRow>(
        "select * from point_queue where trip_id = ? order by seq desc limit 1",
        [tripId],
      );
      return row === null ? null : pointFromRow(row);
    },

    clearTrip: async (tripId) => {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync("delete from point_queue where trip_id = ?", [tripId]);
        const current = await txn.getFirstAsync<{ trip_id: string | null }>(
          "select trip_id from trip_state where id = 1",
        );
        if (current?.trip_id === tripId) {
          await txn.runAsync(
            `update trip_state set trip_id = null, state = 'IDLE', next_seq = 0, started_at = null,
               ended_at = null, end_lat = null, end_lng = null, end_accuracy = null where id = 1`,
          );
        }
      });
    },
  };
}

function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ");
}

let cachedStore: Promise<TrackingStore> | null = null;
let memoryStore: TrackingStore | null = null;

/**
 * The store for this process.
 *
 * Native opens SQLite once and reuses the handle (the background task and the
 * UI must see the same queue). Web gets the in-memory store, because a browser
 * cannot run a trip and has no SQLite worker.
 */
export function getTrackingStore(): Promise<TrackingStore> {
  if (Platform.OS === "web") {
    return Promise.resolve(getMemoryStore());
  }
  if (cachedStore === null) {
    cachedStore = openSqliteStore().catch((error: unknown) => {
      // A broken DB handle must not take the app down; the uploader and the
      // state machine treat an empty in-memory store as "nothing to sync".
      console.warn("Could not open the tracking database, using memory:", error);
      cachedStore = null;
      return getMemoryStore();
    });
  }
  return cachedStore;
}

async function openSqliteStore(): Promise<TrackingStore> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  return createSqliteTrackingStore(db);
}

/** The in-memory store, shared so the dev screen and the resume check agree. */
export function getMemoryStore(): TrackingStore {
  if (memoryStore === null) {
    memoryStore = createMemoryTrackingStore();
  }
  return memoryStore;
}

/** Reset the cached handles. Used by the dev screen's "clear queue" button. */
export function resetTrackingStore(): void {
  cachedStore = null;
  memoryStore = null;
}
