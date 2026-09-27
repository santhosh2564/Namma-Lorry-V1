import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRIP_LOCATION_TASK } from '../config';
import { migrate, type SqlDb } from '../db';
import { TripError } from '../errors';
import * as q from '../queue';
import {
  createEngine,
  fromRow,
  InvalidTransitionError,
  transition,
  type MachineState,
} from '../stateMachine';
import { handleLocationUpdate } from '../taskHandler';
import { createUploader } from '../uploader';
import { Clock, FakeLocation, FakeServer, location } from '../testing/fakes';
import { openNodeSqlite, type TestDb } from '../testing/nodeSqlite';

const TRIP = 't-0001';
const dbFile = () => join(mkdtempSync(join(tmpdir(), 'nl-engine-')), 'tracking.db');

/** A "device": engine + uploader over one SQLite file. Re-create it on the same file to simulate a relaunch. */
async function device(
  path: string,
  clock: Clock,
  server: FakeServer,
  loc: FakeLocation,
  session = { ok: true },
) {
  const db: TestDb = openNodeSqlite(path);
  await migrate(db);
  const uploader = createUploader({
    db,
    upsertPoints: server.upsert,
    hasSession: async () => session.ok,
    now: clock.now,
    random: () => 0.5,
  });
  const engine = createEngine({
    db,
    location: loc,
    rpc: server.rpc,
    fetchTrip: server.fetchTrip,
    uploader,
    now: clock.now,
    deviceInfo: () => ({ os: 'android', osVersion: '14', model: 'Redmi Note 12', appVersion: '1.0.0' }),
    startFixTimeoutMs: 200,
  });
  const drive = async (n: number, stepMs = 10_000) => {
    for (let i = 0; i < n; i++) {
      clock.advance(stepMs);
      await handleLocationUpdate(async () => db, [location(clock.now(), 12.75 + i * 0.002, 77.8)], clock.now);
    }
  };
  return { db, uploader, engine, drive };
}

async function setup() {
  const clock = new Clock();
  const server = new FakeServer(clock);
  server.addTrip(TRIP);
  const loc = new FakeLocation(clock);
  const path = dbFile();
  const d = await device(path, clock, server, loc);
  return { clock, server, loc, path, ...d };
}

const serverPoints = (server: FakeServer, trip = TRIP) =>
  [...server.points.values()]
    .filter((p) => p.trip_id === trip)
    .map((p) => p.seq)
    .sort((a, b) => a - b);

// ------------------------------------------------------------ reducer

describe('reducer (TRD §4.1)', () => {
  const idle: MachineState = { status: 'IDLE' };
  const tracking = transition(idle, { type: 'STARTED', tripId: 'a', startedAt: 's' });
  const endInfo = { endedAt: 'e', lastSeq: 7, end: null };
  const ending = transition(tracking, { type: 'END_REQUESTED', ...endInfo });

  it('walks the happy path and the offline path', () => {
    expect(tracking).toEqual({ status: 'TRACKING', tripId: 'a', startedAt: 's' });
    expect(ending).toMatchObject({ status: 'ENDING', tripId: 'a', endedAt: 'e', lastSeq: 7 });
    const pending = transition(ending, { type: 'SYNC_OFFLINE' });
    expect(pending.status).toBe('ENDED_PENDING_SYNC');
    expect(transition(pending, { type: 'SYNC_OFFLINE' }).status).toBe('ENDED_PENDING_SYNC');
    const ended = transition(pending, { type: 'END_CONFIRMED', serverStatus: 'verified' });
    expect(ended).toEqual({ status: 'ENDED', tripId: 'a', serverStatus: 'verified' });
    expect(transition(ended, { type: 'FINALIZED' })).toEqual({ status: 'IDLE' });
    expect(transition(ending, { type: 'END_CONFIRMED', serverStatus: null }).status).toBe('ENDED');
  });

  it.each([
    [idle, { type: 'END_REQUESTED', ...endInfo }],
    [idle, { type: 'SYNC_OFFLINE' }],
    [idle, { type: 'END_CONFIRMED', serverStatus: null }],
    [idle, { type: 'FINALIZED' }],
    [tracking, { type: 'STARTED', tripId: 'b', startedAt: 's' }],
    [tracking, { type: 'SYNC_OFFLINE' }],
    [tracking, { type: 'END_CONFIRMED', serverStatus: null }],
    [tracking, { type: 'FINALIZED' }],
    [ending, { type: 'STARTED', tripId: 'b', startedAt: 's' }],
    [ending, { type: 'END_REQUESTED', ...endInfo }],
    [ending, { type: 'FINALIZED' }],
  ] as [MachineState, Parameters<typeof transition>[1]][])('rejects %j + %j', (state, event) => {
    expect(() => transition(state, event)).toThrow(InvalidTransitionError);
  });

  it('fromRow maps persisted rows', () => {
    expect(fromRow(null)).toEqual({ status: 'IDLE' });
    expect(
      fromRow({
        trip_id: 'a',
        state: 'ENDED_PENDING_SYNC',
        next_seq: 8,
        started_at: 's',
        ended_at: 'e',
        end_lat: 1,
        end_lng: 2,
        end_accuracy: 5,
        last_seq: 7,
        server_status: null,
        last_error: null,
        updated_at: 'u',
      }),
    ).toEqual({
      status: 'ENDED_PENDING_SYNC',
      tripId: 'a',
      startedAt: 's',
      endedAt: 'e',
      lastSeq: 7,
      end: { lat: 1, lng: 2, accuracy: 5 },
    });
  });
});

// ------------------------------------------------------------ start

describe('startTrip', () => {
  it('fresh fix → start_trip → persist → start updates (in that order); start fix is seq 1', async () => {
    const { engine, server, loc, db } = await setup();
    const trip = await engine.startTrip(TRIP);
    expect(trip.status).toBe('in_progress');
    expect(loc.calls).toEqual(['getCurrentPosition', `start:${TRIP_LOCATION_TASK}`]);
    expect(server.rpcCalls[0]).toMatchObject({
      fn: 'start_trip',
      args: {
        p_trip_id: TRIP,
        p_lat: 12.7409,
        p_lng: 77.8253,
        p_accuracy_m: 8,
        p_device_info: expect.objectContaining({ os: 'android' }),
      },
    });
    expect(await q.getTripState(db, TRIP)).toMatchObject({
      state: 'TRACKING',
      next_seq: 2,
      started_at: trip.started_at,
    });
    expect((await q.lastPoint(db, TRIP))!.seq).toBe(1);
  });

  it.each([
    ['OUTSIDE_PICKUP', (s: FakeServer) => (s.distanceToPickupM = 3200), 3200],
    ['GPS_ACCURACY_TOO_LOW', (_: FakeServer, l: FakeLocation) => (l.fix.accuracy = 80), undefined],
    [
      'ANOTHER_TRIP_ACTIVE',
      (s: FakeServer) => (s.addTrip('other', 'in_progress'), s.setStatus('other', 'in_progress')),
      undefined,
    ],
    ['TRIP_NOT_FOUND', (s: FakeServer) => s.trips.delete(TRIP), undefined],
    ['NETWORK', (s: FakeServer) => (s.offline = true), undefined],
  ] as const)(
    'RPC error %s → typed error, nothing persisted, task never started',
    async (code, arrange, dist) => {
      const { engine, server, loc, db } = await setup();
      (arrange as (s: FakeServer, l: FakeLocation) => void)(server, loc);
      const err = await engine.startTrip(TRIP).catch((e) => e);
      expect(err).toBeInstanceOf(TripError);
      expect(err.code).toBe(code);
      expect(err.distanceM).toBe(dist);
      expect(loc.calls).not.toContain(`start:${TRIP_LOCATION_TASK}`);
      expect(await q.listTripStates(db)).toEqual([]);
      expect((await q.counts(db)).pending).toBe(0);
    },
  );

  it('missing permissions, GPS off and GPS timeout fail before any RPC', async () => {
    for (const [arrange, code] of [
      [(l: FakeLocation) => (l.bg = false), 'PERMISSION_REQUIRED'],
      [(l: FakeLocation) => (l.fg = false), 'PERMISSION_REQUIRED'],
      [(l: FakeLocation) => (l.services = false), 'GPS_UNAVAILABLE'],
      [(l: FakeLocation) => (l.fixDelayMs = 1000), 'GPS_TIMEOUT'],
    ] as const) {
      const { engine, server, loc } = await setup();
      arrange(loc);
      await expect(engine.startTrip(TRIP)).rejects.toMatchObject({ code });
      expect(server.rpcCalls).toEqual([]);
    }
  });

  it('recovers when the start_trip response was lost after the server committed', async () => {
    const { engine, server, loc, db } = await setup();
    server.loseNextResponse = true;
    await expect(engine.startTrip(TRIP)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(await q.listTripStates(db)).toEqual([]);
    expect(loc.started).toBe(false);
    // Retry: server says TRIP_NOT_STARTABLE, but it is in progress for us → adopt it.
    const trip = await engine.startTrip(TRIP);
    expect(trip.status).toBe('in_progress');
    expect(loc.started).toBe(true);
    expect((await q.getTripState(db, TRIP))!.state).toBe('TRACKING');
  });

  it('refuses a second trip while one is active locally; same trip is idempotent', async () => {
    const { engine, server } = await setup();
    server.addTrip('t-2');
    await engine.startTrip(TRIP);
    await expect(engine.startTrip('t-2')).rejects.toMatchObject({ code: 'LOCAL_TRIP_ACTIVE' });
    await expect(engine.startTrip(TRIP)).resolves.toMatchObject({ id: TRIP });
    expect(server.rpcCalls.filter((c) => c.fn === 'start_trip')).toHaveLength(1);
  });

  it('if the task cannot start, the trip stays TRACKING for resume to retry', async () => {
    const { engine, loc, db } = await setup();
    loc.startLocationUpdatesAsync = async () => {
      throw new Error('foreground service not allowed');
    };
    await expect(engine.startTrip(TRIP)).rejects.toMatchObject({ code: 'TRACKING_START_FAILED' });
    expect(await q.getTripState(db, TRIP)).toMatchObject({
      state: 'TRACKING',
      last_error: 'TRACKING_START_FAILED',
    });
  });
});

// ------------------------------------------------------------ task

describe('background task handler', () => {
  it('queues points only while TRACKING, maps the mocked flag, never throws', async () => {
    const { engine, db, clock } = await setup();
    const now = clock.now;
    expect(await handleLocationUpdate(async () => db, [location(now(), 1, 1)], now)).toBe(0); // IDLE
    await engine.startTrip(TRIP);
    clock.advance(10_000);
    expect(await handleLocationUpdate(async () => db, [location(now(), 12.8, 77.8, 5, true)], now)).toBe(1);
    expect((await q.lastPoint(db, TRIP))!.is_mocked).toBe(1);
    // A stale cached fix from before the trip started is dropped (RLS would refuse it).
    expect(await handleLocationUpdate(async () => db, [location(now() - 3_600_000, 12.8, 77.8)], now)).toBe(
      0,
    );
    const log = jest.fn();
    expect(
      await handleLocationUpdate(
        async () => Promise.reject(new Error('disk full')),
        [location(now(), 1, 1)],
        now,
        log,
      ),
    ).toBe(0);
    expect(log).toHaveBeenCalled();
    expect(await handleLocationUpdate(async () => db, undefined, now)).toBe(0);
  });
});

// ------------------------------------------------------------ end

describe('endTrip', () => {
  it('online: stop → ENDING (ended_at, last seq) → flush → end_trip → ENDED → cleanup', async () => {
    const { engine, server, loc, db, drive, clock } = await setup();
    await engine.startTrip(TRIP);
    await drive(30);
    const tappedAt = new Date(clock.now()).toISOString();
    const out = await engine.endTrip();
    expect(loc.calls.at(-1)).toBe(`stop:${TRIP_LOCATION_TASK}`);
    expect(out).toEqual({ state: 'ENDED', tripId: TRIP, serverStatus: 'verified' });
    const end = server.rpcCalls.find((c) => c.fn === 'end_trip')!;
    expect(end.args).toMatchObject({ p_trip_id: TRIP, p_ended_at: tappedAt, p_expected_points: 31 });
    expect(end.args.p_lat).toBeCloseTo(12.75 + 29 * 0.002);
    expect(serverPoints(server)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    // All upserts were ≤ 200 rows and every row reached the server exactly once.
    await engine.cleanupFinished();
    expect(await q.listTripStates(db)).toEqual([]);
    expect(await q.counts(db)).toEqual({ pending: 0, uploaded: 0, rejected: 0 });
  });

  it('offline end → ENDED_PENDING_SYNC; later sync uploads everything and ends with the original time', async () => {
    const { engine, server, db, drive, clock } = await setup();
    await engine.startTrip(TRIP);
    server.offline = true; // 20 min without network mid-trip
    await drive(120);
    const tappedAt = new Date(clock.now()).toISOString();
    const out = await engine.endTrip();
    expect(out).toMatchObject({ state: 'ENDED_PENDING_SYNC', reason: 'NETWORK' });
    expect((await q.getTripState(db, TRIP))!.state).toBe('ENDED_PENDING_SYNC');
    expect(server.trips.get(TRIP)!.status).toBe('in_progress');

    clock.advance(3_600_000); // reconnect an hour later
    server.offline = false;
    const synced = await engine.syncPendingEnd();
    expect(synced).toEqual({ state: 'ENDED', tripId: TRIP, serverStatus: 'verified' });
    expect(server.trips.get(TRIP)!.ended_at).toBe(tappedAt);
    expect(serverPoints(server)).toHaveLength(121);
    const endCalls = server.rpcCalls.filter((c) => c.fn === 'end_trip');
    expect(endCalls.at(-1)!.args.p_expected_points).toBe(121);
  });

  it('offline end, app killed, relaunch → resume syncs the pending end', async () => {
    const s = await setup();
    await s.engine.startTrip(TRIP);
    await s.drive(10);
    s.server.offline = true;
    await s.engine.endTrip();
    s.db.close(); // killed

    s.server.offline = false;
    s.loc.started = false;
    const d2 = await device(s.path, s.clock, s.server, s.loc);
    const r = await d2.engine.resumeOnLaunch();
    expect(r).toEqual({ activeTripId: null, tracking: false, pendingTripId: null });
    expect(s.server.trips.get(TRIP)!.status).toBe('verified');
    expect(await q.listTripStates(d2.db)).toEqual([]); // cleaned up
  });

  it('crash after ENDING was persisted but before end_trip → resume finishes it', async () => {
    const s = await setup();
    await s.engine.startTrip(TRIP);
    await s.drive(5);
    await q.markEnding(
      s.db,
      TRIP,
      new Date(s.clock.now()).toISOString(),
      null,
      new Date(s.clock.now()).toISOString(),
    );
    s.db.close();
    const d2 = await device(s.path, s.clock, s.server, s.loc);
    await d2.engine.resumeOnLaunch();
    expect(s.server.trips.get(TRIP)!.status).toBe('verified');
    expect(s.server.rpcCalls.filter((c) => c.fn === 'end_trip').at(-1)!.args.p_expected_points).toBe(6);
  });

  it('end_trip response lost → retry gets TRIP_NOT_ACTIVE → treated as ended', async () => {
    const s = await setup();
    await s.engine.startTrip(TRIP);
    await s.drive(3);
    await s.uploader.flushAll(); // queue empty, so the lost response hits end_trip itself
    s.server.loseNextResponse = true;
    expect((await s.engine.endTrip()).state).toBe('ENDED_PENDING_SYNC');
    expect(s.server.trips.get(TRIP)!.status).toBe('verified'); // the server did end it
    expect(await s.engine.syncPendingEnd()).toEqual({
      state: 'ENDED',
      tripId: TRIP,
      serverStatus: 'verified',
    });
    expect(s.server.rpcCalls.filter((c) => c.fn === 'end_trip')).toHaveLength(2);
  });

  it('points recorded after End are not queued', async () => {
    const { engine, db, clock, server } = await setup();
    await engine.startTrip(TRIP);
    server.offline = true;
    await engine.endTrip();
    clock.advance(5_000);
    expect(await handleLocationUpdate(async () => db, [location(clock.now(), 1, 1)], clock.now)).toBe(0);
  });

  it('endTrip without a trip → NO_ACTIVE_TRIP', async () => {
    const { engine } = await setup();
    await expect(engine.endTrip()).rejects.toMatchObject({ code: 'NO_ACTIVE_TRIP' });
  });
});

// ------------------------------------------------------------ resume

describe('resumeOnLaunch', () => {
  it('after a kill while TRACKING: restarts location updates; seq continues', async () => {
    const s = await setup();
    await s.engine.startTrip(TRIP);
    await s.drive(4);
    s.db.close();
    s.loc.started = false; // OS killed the service with the app
    s.loc.calls = [];

    const d2 = await device(s.path, s.clock, s.server, s.loc);
    expect(await d2.engine.resumeOnLaunch()).toEqual({
      activeTripId: TRIP,
      tracking: true,
      pendingTripId: null,
    });
    expect(s.loc.calls).toEqual([`start:${TRIP_LOCATION_TASK}`]);
    await d2.drive(2);
    expect((await q.lastPoint(d2.db, TRIP))!.seq).toBe(7);
  });

  it('does not start a second task if updates are still running', async () => {
    const s = await setup();
    await s.engine.startTrip(TRIP);
    s.loc.calls = [];
    await s.engine.resumeOnLaunch();
    expect(s.loc.calls).toEqual([]);
  });

  it('offline or signed out: keeps tracking (unknown is not "ended")', async () => {
    const s = await setup();
    await s.engine.startTrip(TRIP);
    s.server.offline = true;
    s.loc.started = false;
    expect(await s.engine.resumeOnLaunch()).toMatchObject({ activeTripId: TRIP, tracking: true });
  });

  it('server shows the trip cancelled: stop tracking and clean up', async () => {
    const s = await setup();
    await s.engine.startTrip(TRIP);
    await s.drive(2);
    await s.uploader.flushAll();
    s.server.setStatus(TRIP, 'cancelled');
    expect(await s.engine.resumeOnLaunch()).toMatchObject({ activeTripId: null });
    expect(s.loc.started).toBe(false);
    expect(await q.listTripStates(s.db)).toEqual([]);
  });

  it('background permission lost: reports not tracking and records why', async () => {
    const s = await setup();
    await s.engine.startTrip(TRIP);
    s.loc.started = false;
    s.loc.bg = false;
    expect(await s.engine.resumeOnLaunch()).toMatchObject({ activeTripId: TRIP, tracking: false });
    expect((await q.getTripState(s.db, TRIP))!.last_error).toBe('PERMISSION_REQUIRED');
  });

  it('never throws', async () => {
    const s = await setup();
    const broken = {
      ...s.db,
      getFirstAsync: async () => Promise.reject(new Error('corrupt')),
    } as unknown as SqlDb;
    const e2 = createEngine({
      db: broken,
      location: s.loc,
      rpc: s.server.rpc,
      fetchTrip: s.server.fetchTrip,
      uploader: s.uploader,
      now: s.clock.now,
      deviceInfo: () => null,
    });
    await expect(e2.resumeOnLaunch()).resolves.toEqual({
      activeTripId: null,
      tracking: false,
      pendingTripId: null,
    });
  });
});

// ------------------------------------------------------------ cleanup

describe('cleanupFinished', () => {
  it('keeps rows until the server status is final and nothing is pending', async () => {
    const s = await setup();
    await s.engine.startTrip(TRIP);
    await s.drive(3);
    await s.uploader.flushAll();
    // Simulate a server that waits (completed, expected points not all there yet).
    s.server.rpc = (async (fn: string, args: Record<string, unknown>) => {
      const t = s.server.trips.get(TRIP)!;
      t.status = 'completed';
      t.ended_at = String(args.p_ended_at);
      return { data: { id: TRIP, status: 'completed', started_at: t.started_at }, error: null };
    }) as typeof s.server.rpc;
    const e2 = createEngine({
      db: s.db,
      location: s.loc,
      rpc: s.server.rpc,
      fetchTrip: s.server.fetchTrip,
      uploader: s.uploader,
      now: s.clock.now,
      deviceInfo: () => null,
    });
    await e2.endTrip();
    expect(await e2.cleanupFinished()).toEqual([]);
    expect((await q.getTripState(s.db, TRIP))!.server_status).toBe('completed');
    s.server.setStatus(TRIP, 'needs_review');
    expect(await e2.cleanupFinished()).toEqual([TRIP]);
    s.server.offline = true;
    expect(await e2.cleanupFinished()).toEqual([]);
  });
});
