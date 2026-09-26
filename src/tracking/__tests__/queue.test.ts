import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrate } from '../db';
import { mapLocations, toNewPoint, type LocationLike } from '../mapping';
import * as q from '../queue';
import { openNodeSqlite } from '../testing/nodeSqlite';

const T0 = Date.parse('2026-09-26T06:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = iso(T0);

function loc(i: number, over: Partial<LocationLike['coords']> = {}, mocked?: boolean): LocationLike {
  return {
    timestamp: T0 + i * 10_000,
    mocked,
    coords: {
      latitude: 12.95 + i * 0.001,
      longitude: 79.94,
      accuracy: 8,
      speed: 12,
      heading: 90,
      altitude: 40,
      ...over,
    },
  };
}
const pts = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => toNewPoint(loc(from + k))!);

async function fresh(path?: string) {
  const db = openNodeSqlite(path);
  await migrate(db);
  return db;
}

describe('schema', () => {
  it('matches TRD §4.3 point_queue and the trip_state columns', async () => {
    const db = await fresh();
    const cols = (t: string) =>
      db.raw
        .prepare(`pragma table_info(${t})`)
        .all()
        .map((c: any) => c.name);
    expect(cols('point_queue')).toEqual(
      expect.arrayContaining([
        'trip_id',
        'seq',
        'recorded_at',
        'lat',
        'lng',
        'accuracy_m',
        'speed_mps',
        'heading',
        'altitude_m',
        'is_mocked',
        'uploaded',
      ]),
    );
    expect(cols('trip_state')).toEqual(
      expect.arrayContaining([
        'trip_id',
        'state',
        'next_seq',
        'started_at',
        'ended_at',
        'end_lat',
        'end_lng',
        'end_accuracy',
      ]),
    );
    // primary key(trip_id, seq)
    await q.insertTracking(db, 't1', NOW, NOW);
    await db.raw.exec(
      "insert into point_queue(trip_id, seq, recorded_at, lat, lng) values ('t1', 1, 'x', 1, 1)",
    );
    expect(() =>
      db.raw.exec("insert into point_queue(trip_id, seq, recorded_at, lat, lng) values ('t1', 1, 'y', 1, 1)"),
    ).toThrow(/UNIQUE/);
  });

  it('migrations are idempotent', async () => {
    const db = await fresh();
    await migrate(db);
    expect(db.raw.prepare('pragma user_version').get()).toEqual({ user_version: 1 });
  });
});

describe('seq allocation', () => {
  it('numbers points 1,2,3… per trip in time order', async () => {
    const db = await fresh();
    await q.insertTracking(db, 't1', NOW, NOW);
    const r1 = await q.appendPoints(db, pts(1, 3).reverse(), NOW);
    const r2 = await q.appendPoints(db, pts(4, 5), NOW);
    expect([r1.firstSeq, r1.lastSeq, r2.firstSeq, r2.lastSeq]).toEqual([1, 3, 4, 5]);
    const rows = db.raw.prepare('select seq, recorded_at from point_queue order by seq').all() as any[];
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.map((r) => r.recorded_at)).toEqual(pts(1, 5).map((p) => p.recorded_at));
    expect((await q.getTripState(db, 't1'))!.next_seq).toBe(6);
  });

  it('drops exact duplicate fixes but keeps out-of-order ones', async () => {
    const db = await fresh();
    await q.insertTracking(db, 't1', NOW, NOW);
    await q.appendPoints(db, pts(1, 3), NOW);
    const r = await q.appendPoints(db, [...pts(2, 2), ...pts(4, 4), ...pts(4, 4), toNewPoint(loc(0))!], NOW);
    expect(r.inserted).toBe(2); // seq 4 = point 0 (older clock), seq 5 = point 4
    expect((await q.counts(db)).pending).toBe(5);
  });

  it('drops points when no trip is TRACKING', async () => {
    const db = await fresh();
    expect((await q.appendPoints(db, pts(1, 2), NOW)).inserted).toBe(0);
    await q.insertTracking(db, 't1', NOW, NOW);
    await q.markEnding(db, 't1', NOW, null, NOW);
    expect((await q.appendPoints(db, pts(1, 2), NOW)).inserted).toBe(0);
  });

  it('concurrent appends (task + UI) never share a seq', async () => {
    const db = await fresh();
    await q.insertTracking(db, 't1', NOW, NOW);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => q.appendPoints(db, pts(i * 5 + 1, i * 5 + 5), NOW)),
    );
    const seqs = (db.raw.prepare('select seq from point_queue order by seq').all() as any[]).map(
      (r) => r.seq,
    );
    expect(seqs).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });
});

describe('crash safety ("kill" = drop the connection and reopen the file)', () => {
  const file = () => join(mkdtempSync(join(tmpdir(), 'nl-')), 'tracking.db');

  it('seq and points survive a kill; numbering continues, never reused', async () => {
    const path = file();
    let db = await fresh(path);
    await q.insertTracking(db, 't1', NOW, NOW);
    await q.appendPoints(db, pts(1, 7), NOW);
    db.close(); // app killed

    db = await fresh(path); // next launch
    expect(await q.getTripState(db, 't1')).toMatchObject({ state: 'TRACKING', next_seq: 8 });
    const r = await q.appendPoints(db, pts(8, 9), NOW);
    expect([r.firstSeq, r.lastSeq]).toEqual([8, 9]);
  });

  it('a kill in the middle of an append leaves neither the points nor the seq bump', async () => {
    const path = file();
    let db = await fresh(path);
    await q.insertTracking(db, 't1', NOW, NOW);
    await q.appendPoints(db, pts(1, 3), NOW);
    // Simulate a crash mid-transaction: rows written, next_seq not yet bumped, no commit.
    db.raw.exec('begin immediate');
    db.raw.exec(
      "insert into point_queue(trip_id, seq, recorded_at, lat, lng, uploaded) values ('t1', 4, 'z', 1, 1, 0)",
    );
    db.close();

    db = await fresh(path);
    expect((await q.counts(db, 't1')).pending).toBe(3);
    expect((await q.getTripState(db, 't1'))!.next_seq).toBe(4);
    const r = await q.appendPoints(db, pts(4, 4), NOW);
    expect(r.firstSeq).toBe(4);
  });

  it('repairs a next_seq that fell behind the queue (defence in depth)', async () => {
    const path = file();
    let db = await fresh(path);
    await q.insertTracking(db, 't1', NOW, NOW);
    await q.appendPoints(db, pts(1, 5), NOW);
    db.raw.exec("update trip_state set next_seq = 2 where trip_id = 't1'"); // corrupted
    db.close();
    db = await fresh(path);
    expect((await q.getTripState(db, 't1'))!.next_seq).toBe(6);
  });

  it('a failed insert rolls back the whole batch (no gap in seq)', async () => {
    const db = await fresh();
    await q.insertTracking(db, 't1', NOW, NOW);
    const bad = { ...pts(2, 2)[0]!, lat: undefined as unknown as number }; // bind error mid-batch
    await expect(q.appendPoints(db, [...pts(1, 1), bad as any, ...pts(3, 3)], NOW)).rejects.toThrow();
    expect((await q.counts(db)).pending).toBe(0);
    expect((await q.getTripState(db, 't1'))!.next_seq).toBe(1);
  });
});

describe('ending and cleanup', () => {
  it('markEnding records ended_at, end position and last seq', async () => {
    const db = await fresh();
    await q.insertTracking(db, 't1', NOW, NOW);
    await q.appendPoints(db, pts(1, 4), NOW);
    const row = await q.markEnding(db, 't1', iso(T0 + 999), { lat: 13, lng: 77, accuracy: 6 }, NOW);
    expect(row).toMatchObject({
      state: 'ENDING',
      ended_at: iso(T0 + 999),
      end_lat: 13,
      end_lng: 77,
      end_accuracy: 6,
      last_seq: 4,
    });
  });

  it('upload bookkeeping and delete', async () => {
    const db = await fresh();
    await q.insertTracking(db, 't1', NOW, NOW);
    await q.appendPoints(db, pts(1, 4), NOW);
    await q.markUploaded(db, [
      { trip_id: 't1', seq: 1 },
      { trip_id: 't1', seq: 2 },
    ]);
    await q.markRejected(db, { trip_id: 't1', seq: 3 }, '42501 rls');
    expect(await q.counts(db, 't1')).toEqual({ pending: 1, uploaded: 2, rejected: 1 });
    expect((await q.pendingBatch(db, 200)).map((r) => r.seq)).toEqual([4]);
    await q.deleteTrip(db, 't1');
    expect(await q.counts(db)).toEqual({ pending: 0, uploaded: 0, rejected: 0 });
    expect(await q.getTripState(db, 't1')).toBeNull();
  });
});

describe('mapping (LocationObject → row)', () => {
  it('maps coords, time and the mocked flag', () => {
    const p = toNewPoint(loc(1, {}, true))!;
    expect(p.lat).toBeCloseTo(12.951, 9);
    expect({ ...p, lat: 0 }).toEqual({
      recorded_at: iso(T0 + 10_000),
      lat: 0,
      lng: 79.94,
      accuracy_m: 8,
      speed_mps: 12,
      heading: 90,
      altitude_m: 40,
      is_mocked: true,
    });
    expect(toNewPoint(loc(1))!.is_mocked).toBe(false);
  });

  it('nulls iOS -1 sentinels and rejects bad coordinates', () => {
    expect(toNewPoint(loc(1, { speed: -1, heading: -1, accuracy: null, altitude: null }))).toMatchObject({
      speed_mps: null,
      heading: null,
      accuracy_m: null,
      altitude_m: null,
    });
    expect(toNewPoint(loc(1, { latitude: NaN }))).toBeNull();
    expect(toNewPoint(loc(1, { latitude: 95 }))).toBeNull();
    expect(toNewPoint({ ...loc(1), timestamp: 0 })).toBeNull();
  });

  it('drops fixes older than started_at − tolerance (RLS would refuse them)', () => {
    const startedAt = iso(T0 + 100_000);
    const mapped = mapLocations([loc(1), loc(4), loc(5), loc(20)], startedAt, 60_000);
    expect(mapped.map((p) => p.recorded_at)).toEqual([iso(T0 + 40_000), iso(T0 + 50_000), iso(T0 + 200_000)]);
  });
});
