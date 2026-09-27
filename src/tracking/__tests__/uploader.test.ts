import { migrate } from '../db';
import * as q from '../queue';
import { Clock, FakeServer } from '../testing/fakes';
import { openNodeSqlite } from '../testing/nodeSqlite';
import { backoffDelay, createUploader } from '../uploader';

const TRIP = 't-1';

async function setup(opts: { session?: boolean; points?: number; batchSize?: number } = {}) {
  const clock = new Clock();
  const server = new FakeServer(clock);
  server.addTrip(TRIP, 'in_progress');
  server.trips.get(TRIP)!.started_at = new Date(clock.now()).toISOString();
  const db = openNodeSqlite();
  await migrate(db);
  const nowIso = new Date(clock.now()).toISOString();
  await q.insertTracking(db, TRIP, nowIso, nowIso);
  const n = opts.points ?? 5;
  await q.appendPoints(
    db,
    Array.from({ length: n }, (_, i) => ({
      recorded_at: new Date(clock.now() + (i + 1) * 1000).toISOString(),
      lat: 12 + i / 1000,
      lng: 77,
      accuracy_m: 5,
      speed_mps: 10,
      heading: 0,
      altitude_m: null,
      is_mocked: false,
    })),
    nowIso,
  );
  let random = 0.5;
  const session = { ok: opts.session ?? true };
  const uploader = createUploader({
    db,
    upsertPoints: (rows) => server.upsert(rows),
    hasSession: async () => session.ok,
    now: clock.now,
    random: () => random,
    batchSize: opts.batchSize,
  });
  clock.advance(10_000);
  return { clock, server, db, uploader, session, setRandom: (r: number) => (random = r) };
}

const seqs = (server: FakeServer) => [...server.points.values()].map((p) => p.seq).sort((a, b) => a - b);

describe('backoffDelay', () => {
  it('doubles per failure with equal jitter and caps', () => {
    expect(backoffDelay(1, 0, 5000, 300000)).toBe(2500);
    expect(backoffDelay(1, 1, 5000, 300000)).toBe(5000);
    expect(backoffDelay(3, 0.5, 5000, 300000)).toBe(15000); // 20 s → [10 s, 20 s]
    expect(backoffDelay(20, 1, 5000, 300000)).toBe(300000);
    expect(backoffDelay(20, 0, 5000, 300000)).toBe(150000);
    for (let f = 1; f < 12; f++) {
      for (const r of [0, 0.3, 0.99]) {
        const d = backoffDelay(f, r, 5000, 300000);
        const cap = Math.min(300000, 5000 * 2 ** (f - 1));
        expect(d).toBeGreaterThanOrEqual(cap / 2);
        expect(d).toBeLessThanOrEqual(cap);
      }
    }
  });
});

describe('uploader', () => {
  it('uploads pending rows with onConflict semantics and marks them uploaded', async () => {
    const { uploader, server, db } = await setup();
    expect(await uploader.flush()).toMatchObject({ status: 'uploaded', uploaded: 5 });
    expect(seqs(server)).toEqual([1, 2, 3, 4, 5]);
    expect(server.upsertCalls[0]![0]).toEqual(
      expect.objectContaining({ trip_id: TRIP, seq: 1, is_mocked: false, accuracy_m: 5, lat: 12 }),
    );
    expect(await q.counts(db)).toEqual({ pending: 0, uploaded: 5, rejected: 0 });
    expect(await uploader.flush()).toMatchObject({ status: 'idle' });
  });

  it('never sends more than 200 rows per call', async () => {
    const { uploader, server, clock } = await setup({ points: 450 });
    clock.advance(450_000); // all points are in the past (RLS refuses points > 2 min ahead)
    expect(await uploader.flushAll()).toMatchObject({ status: 'uploaded', uploaded: 450 });
    expect(server.upsertCalls.map((c) => c.length)).toEqual([200, 200, 50]);
  });

  it('is idempotent: a crash after the upsert but before "mark uploaded" re-sends without duplicates', async () => {
    const { uploader, server, db } = await setup();
    // Server stores the rows but the app dies before marking them.
    await server.upsert((await q.pendingBatch(db, 200)).map(q.toUploadRow));
    expect(server.points.size).toBe(5);
    expect(await uploader.flush()).toMatchObject({ status: 'uploaded', uploaded: 5 });
    expect(server.points.size).toBe(5);
    expect(await q.counts(db)).toMatchObject({ pending: 0, uploaded: 5 });
  });

  it('single flight: concurrent triggers share one upload', async () => {
    const { uploader, server } = await setup();
    const [a, b, c] = await Promise.all([
      uploader.flush(),
      uploader.flush({ force: true }),
      uploader.flush(),
    ]);
    expect(server.upsertCalls).toHaveLength(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('backs off after failures; force (reconnect/foreground) bypasses the window; success resets', async () => {
    const { uploader, server, clock, db } = await setup();
    server.offline = true;
    expect((await uploader.flush()).status).toBe('failed');
    expect(uploader.status()).toMatchObject({ failures: 1, nextAttemptAt: clock.now() + 3750 });
    expect((await uploader.flush()).status).toBe('backoff'); // inside the window: no request
    expect(server.upsertCalls).toHaveLength(1);
    clock.advance(4000);
    expect((await uploader.flush()).status).toBe('failed');
    expect(uploader.status().failures).toBe(2);
    expect(uploader.status().nextAttemptAt - clock.now()).toBe(7500);
    server.offline = false;
    expect((await uploader.flush({ force: true })).status).toBe('uploaded');
    expect(uploader.status()).toMatchObject({ failures: 0, nextAttemptAt: 0 });
    expect((await q.counts(db)).pending).toBe(0);
  });

  it('nothing is lost while offline', async () => {
    const { uploader, server, db } = await setup({ points: 30 });
    server.offline = true;
    for (let i = 0; i < 5; i++) await uploader.flush({ force: true });
    expect(await q.counts(db)).toMatchObject({ pending: 30, uploaded: 0 });
    server.offline = false;
    await uploader.flushAll();
    expect(seqs(server)).toHaveLength(30);
  });

  it('ND-8: isolates rows RLS refuses (clock skew) and uploads the rest', async () => {
    const { uploader, server, db, clock } = await setup({ points: 8 });
    // Two rows stamped 10 minutes in the future (phone clock skew) → server refuses them.
    db.raw.exec(
      `update point_queue set recorded_at = '${new Date(clock.now() + 600_000).toISOString()}' where seq in (3, 7)`,
    );
    const r = await uploader.flushAll();
    expect(r).toMatchObject({ status: 'uploaded', uploaded: 6, rejected: 2 });
    expect(seqs(server)).toEqual([1, 2, 4, 5, 6, 8]);
    const rejected = db.raw
      .prepare('select seq, reject_reason from point_queue where uploaded = 2')
      .all() as any[];
    expect(rejected.map((x) => x.seq)).toEqual([3, 7]);
    expect(rejected[0].reject_reason).toContain('42501');
    expect((await uploader.flush()).status).toBe('idle'); // queue no longer blocked
  });

  it('without a session nothing is sent and nothing is quarantined', async () => {
    const { uploader, server, db, session } = await setup({ session: false });
    expect((await uploader.flush({ force: true })).status).toBe('no-session');
    expect(server.upsertCalls).toHaveLength(0);
    expect(await q.counts(db)).toMatchObject({ pending: 5, rejected: 0 });
    session.ok = true;
    expect((await uploader.flush()).status).toBe('uploaded');
  });

  it('a transient failure during bisection stops without quarantining', async () => {
    const { uploader, server, db, clock } = await setup({ points: 4 });
    db.raw.exec(
      `update point_queue set recorded_at = '${new Date(clock.now() + 600_000).toISOString()}' where seq = 4`,
    );
    const real = server.upsert;
    let calls = 0;
    const seen: number[][] = [];
    server.upsert = async (rows) => {
      seen.push(rows.map((r) => r.seq));
      return ++calls === 1 ? real(rows) : { error: { message: 'Network request failed' } };
    };
    expect((await uploader.flush()).status).toBe('failed');
    expect(seen).toEqual([
      [1, 2, 3, 4],
      [1, 2],
    ]); // bisection started, then the network dropped
    expect(await q.counts(db)).toMatchObject({ pending: 4, rejected: 0 });
  });

  it('a local DB error never throws out of flush', async () => {
    const { uploader, db } = await setup();
    db.close();
    await expect(uploader.flush()).resolves.toMatchObject({ status: 'failed' });
  });
});
