// Driver trip state machine (TRD §4.1) as a pure reducer, plus the engine that
// performs the side effects in the order docs/06 §1 prescribes.
//
//   IDLE ──(start_trip ok)──▶ TRACKING
//   TRACKING ──(End)──▶ ENDING (flush queue) ──(end_trip ok)──▶ ENDED
//   ENDING ──(offline)──▶ ENDED_PENDING_SYNC ──(online, flush + rpc)──▶ ENDED
//   TRACKING ──(app killed / reboot)──▶ next launch: read persisted state → restart updates
//   ENDED ──(server final, rows deleted)──▶ IDLE
import {
  START_FIX_OPTIONS,
  START_FIX_TIMEOUT_MS,
  START_TOLERANCE_MS,
  trackingOptions,
  TRIP_LOCATION_TASK,
} from './config';
import type { SqlDb, TripStateName, TripStateRow } from './db';
import { parseRpcError, TripError, type RpcErrorLike } from './errors';
import { mapLocations, type LocationLike } from './mapping';
import * as q from './queue';
import type { Uploader } from './uploader';

// ---------------------------------------------------------------- reducer

export interface EndInfo {
  endedAt: string;
  lastSeq: number;
  end: { lat: number; lng: number; accuracy: number | null } | null;
}

export type MachineState =
  | { status: 'IDLE' }
  | { status: 'TRACKING'; tripId: string; startedAt: string }
  | ({ status: 'ENDING' | 'ENDED_PENDING_SYNC'; tripId: string; startedAt: string } & EndInfo)
  | { status: 'ENDED'; tripId: string; serverStatus: string | null };

export type MachineEvent =
  | { type: 'STARTED'; tripId: string; startedAt: string }
  | ({ type: 'END_REQUESTED' } & EndInfo)
  | { type: 'SYNC_OFFLINE' }
  | { type: 'END_CONFIRMED'; serverStatus: string | null }
  | { type: 'FINALIZED' };

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: TripStateName,
    public readonly event: MachineEvent['type'],
  ) {
    super(`Invalid transition ${from} --${event}-->`);
    this.name = 'InvalidTransitionError';
  }
}

export function transition(state: MachineState, event: MachineEvent): MachineState {
  const bad = () => new InvalidTransitionError(state.status, event.type);
  switch (event.type) {
    case 'STARTED':
      if (state.status !== 'IDLE') throw bad();
      return { status: 'TRACKING', tripId: event.tripId, startedAt: event.startedAt };
    case 'END_REQUESTED':
      if (state.status !== 'TRACKING') throw bad();
      return {
        status: 'ENDING',
        tripId: state.tripId,
        startedAt: state.startedAt,
        endedAt: event.endedAt,
        lastSeq: event.lastSeq,
        end: event.end,
      };
    case 'SYNC_OFFLINE':
      if (state.status !== 'ENDING' && state.status !== 'ENDED_PENDING_SYNC') throw bad();
      return { ...state, status: 'ENDED_PENDING_SYNC' };
    case 'END_CONFIRMED':
      if (state.status !== 'ENDING' && state.status !== 'ENDED_PENDING_SYNC') throw bad();
      return { status: 'ENDED', tripId: state.tripId, serverStatus: event.serverStatus };
    case 'FINALIZED':
      if (state.status !== 'ENDED') throw bad();
      return { status: 'IDLE' };
  }
}

/** Machine view of a persisted trip_state row (null row = IDLE). */
export function fromRow(row: TripStateRow | null): MachineState {
  if (!row) return { status: 'IDLE' };
  switch (row.state) {
    case 'TRACKING':
      return { status: 'TRACKING', tripId: row.trip_id, startedAt: row.started_at ?? '' };
    case 'ENDING':
    case 'ENDED_PENDING_SYNC':
      return {
        status: row.state,
        tripId: row.trip_id,
        startedAt: row.started_at ?? '',
        endedAt: row.ended_at ?? '',
        lastSeq: row.last_seq ?? 0,
        end:
          row.end_lat !== null && row.end_lng !== null
            ? { lat: row.end_lat, lng: row.end_lng, accuracy: row.end_accuracy }
            : null,
      };
    case 'ENDED':
      return { status: 'ENDED', tripId: row.trip_id, serverStatus: row.server_status };
  }
}

// ---------------------------------------------------------------- engine

/** Server statuses after which nothing more will be accepted or changed by the device. */
export const FINAL_STATUSES = ['verified', 'needs_review', 'rejected', 'cancelled'];

export interface LocationApi {
  getForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  getBackgroundPermissionsAsync(): Promise<{ granted: boolean }>;
  hasServicesEnabledAsync(): Promise<boolean>;
  getCurrentPositionAsync(options: typeof START_FIX_OPTIONS): Promise<LocationLike>;
  startLocationUpdatesAsync(task: string, options: ReturnType<typeof trackingOptions>): Promise<void>;
  stopLocationUpdatesAsync(task: string): Promise<void>;
  hasStartedLocationUpdatesAsync(task: string): Promise<boolean>;
}

export interface ServerTrip {
  id: string;
  status: string;
  started_at: string | null;
}

export interface EngineDeps {
  db: SqlDb;
  location: LocationApi;
  rpc(
    fn: 'start_trip' | 'end_trip',
    args: Record<string, unknown>,
  ): Promise<{ data: ServerTrip | null; error: RpcErrorLike | null }>;
  /**
   * Current server row (RLS: the driver's own trip). null = not visible to a signed-in driver.
   * Must throw when offline or signed out, so "unknown" is never mistaken for "gone".
   */
  fetchTrip(tripId: string): Promise<ServerTrip | null>;
  uploader: Uploader;
  now(): number;
  deviceInfo(): Record<string, string> | null;
  startFixTimeoutMs?: number;
  log?(msg: string, err?: unknown): void;
}

export type EndOutcome =
  | { state: 'ENDED'; tripId: string; serverStatus: string | null; error?: string }
  | { state: 'ENDED_PENDING_SYNC'; tripId: string; reason: string };

export interface ResumeResult {
  /** A trip that is TRACKING on this device (Splash routes to Active Trip). */
  activeTripId: string | null;
  /** Location updates are running for it after resume. */
  tracking: boolean;
  /** A trip ended locally that still waits for sync. */
  pendingTripId: string | null;
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function createEngine(deps: EngineDeps) {
  const { db, location } = deps;
  const iso = () => new Date(deps.now()).toISOString();
  const log = deps.log ?? (() => {});
  // One engine operation at a time (start / end / resume / sync never interleave).
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = chain.then(fn, fn);
    chain = r.catch(() => undefined);
    return r;
  };

  async function stopUpdates() {
    try {
      if (await location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK)) {
        await location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
      }
    } catch (e) {
      log('stopLocationUpdates failed', e);
    }
  }

  async function ensureUpdates(tripId: string): Promise<boolean> {
    try {
      if (await location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK)) return true;
      if (!(await location.getBackgroundPermissionsAsync()).granted) {
        await q.setState(db, tripId, 'TRACKING', iso(), { last_error: 'PERMISSION_REQUIRED' });
        return false;
      }
      await location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, trackingOptions());
      return true;
    } catch (e) {
      log('startLocationUpdates failed', e);
      await q.setState(db, tripId, 'TRACKING', iso(), { last_error: 'TRACKING_START_FAILED' });
      return false;
    }
  }

  /**
   * docs/06 §1 start order: fresh fix → start_trip RPC → persist → start updates.
   * Nothing is persisted and the task is never started if the RPC fails.
   */
  function startTrip(tripId: string): Promise<ServerTrip> {
    return exclusive(async () => {
      const active = await q.getActiveTrip(db);
      if (active) {
        if (active.trip_id === tripId && active.state === 'TRACKING') {
          await ensureUpdates(tripId); // idempotent re-start
          return { id: tripId, status: 'in_progress', started_at: active.started_at };
        }
        throw new TripError('LOCAL_TRIP_ACTIVE');
      }
      if (!(await location.getForegroundPermissionsAsync()).granted)
        throw new TripError('PERMISSION_REQUIRED');
      if (!(await location.getBackgroundPermissionsAsync()).granted)
        throw new TripError('PERMISSION_REQUIRED');
      if (!(await location.hasServicesEnabledAsync())) throw new TripError('GPS_UNAVAILABLE');

      const fix = await withTimeout(
        location.getCurrentPositionAsync(START_FIX_OPTIONS),
        deps.startFixTimeoutMs ?? START_FIX_TIMEOUT_MS,
        () => new TripError('GPS_TIMEOUT'),
      ).catch((e) => {
        throw e instanceof TripError ? e : new TripError('GPS_UNAVAILABLE', undefined, String(e));
      });

      let res: { data: ServerTrip | null; error: RpcErrorLike | null };
      try {
        res = await deps.rpc('start_trip', {
          p_trip_id: tripId,
          p_lat: fix.coords.latitude,
          p_lng: fix.coords.longitude,
          p_accuracy_m: fix.coords.accuracy,
          p_device_info: deps.deviceInfo(),
        });
      } catch (e) {
        res = { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }

      let started: ServerTrip | null = res.data;
      if (res.error) {
        const err = parseRpcError(res.error);
        // A lost response can leave the trip started on the server: the retry then says
        // TRIP_NOT_STARTABLE. Recover if the server shows it in progress for this driver.
        if (err.code === 'TRIP_NOT_STARTABLE') {
          const server = await deps.fetchTrip(tripId).catch(() => null);
          if (server?.status === 'in_progress') started = server;
        }
        if (!started) throw err;
      }
      const startedAt = started!.started_at ?? iso();

      transition({ status: 'IDLE' }, { type: 'STARTED', tripId, startedAt });
      await q.insertTracking(db, tripId, startedAt, iso());
      // The start fix is the first point: it proves where the trip began.
      await q.appendPoints(db, mapLocations([fix], startedAt, START_TOLERANCE_MS), iso());

      if (!(await ensureUpdates(tripId))) throw new TripError('TRACKING_START_FAILED');
      void deps.uploader.flush();
      return started!;
    });
  }

  /** Where the trip ended: the latest queued point (the phone has just been recording). */
  async function endPosition(tripId: string): Promise<EndInfo['end']> {
    const last = await q.lastPoint(db, tripId);
    return last ? { lat: last.lat, lng: last.lng, accuracy: last.accuracy_m } : null;
  }

  /** Flush then end_trip for an ENDING / ENDED_PENDING_SYNC trip. Never throws. */
  async function syncEnd(row: TripStateRow): Promise<EndOutcome> {
    let state = fromRow(row);
    const tripId = row.trip_id;
    const offline = async (reason: string): Promise<EndOutcome> => {
      state = transition(state, { type: 'SYNC_OFFLINE' });
      await q.setState(db, tripId, 'ENDED_PENDING_SYNC', iso(), { last_error: reason });
      return { state: 'ENDED_PENDING_SYNC', tripId, reason };
    };

    const flushed = await deps.uploader.flushAll();
    if (flushed.status === 'failed' || flushed.status === 'no-session') {
      return offline(flushed.status === 'no-session' ? 'NO_SESSION' : 'NETWORK');
    }

    let res: { data: ServerTrip | null; error: RpcErrorLike | null };
    try {
      res = await deps.rpc('end_trip', {
        p_trip_id: tripId,
        p_lat: row.end_lat,
        p_lng: row.end_lng,
        p_accuracy_m: row.end_accuracy,
        p_ended_at: row.ended_at,
        p_expected_points: row.last_seq ?? 0,
      });
    } catch (e) {
      res = { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }

    if (!res.error) {
      transition(state, { type: 'END_CONFIRMED', serverStatus: res.data?.status ?? null });
      await q.setState(db, tripId, 'ENDED', iso(), { server_status: res.data?.status ?? null });
      return { state: 'ENDED', tripId, serverStatus: res.data?.status ?? null };
    }
    const err = parseRpcError(res.error);
    if (err.code === 'NETWORK') return offline('NETWORK');
    if (err.code === 'TRIP_NOT_ACTIVE') {
      // Already ended (e.g. a retry after a lost response): success, refresh the status.
      const server = await deps.fetchTrip(tripId).catch(() => null);
      transition(state, { type: 'END_CONFIRMED', serverStatus: server?.status ?? null });
      await q.setState(db, tripId, 'ENDED', iso(), { server_status: server?.status ?? null });
      return { state: 'ENDED', tripId, serverStatus: server?.status ?? null };
    }
    // TRIP_NOT_FOUND / unknown: retrying won't help. Keep the data locally, stop retrying.
    transition(state, { type: 'END_CONFIRMED', serverStatus: null });
    await q.setState(db, tripId, 'ENDED', iso(), { last_error: err.code });
    return { state: 'ENDED', tripId, serverStatus: null, error: err.code };
  }

  /**
   * docs/06 §1 end order: stop updates → persist ENDING (ended_at, last seq) → flush → end_trip.
   * Offline → ENDED_PENDING_SYNC; the runtime retries on reconnect / foreground / timer.
   */
  function endTrip(): Promise<EndOutcome> {
    return exclusive(async () => {
      const active = await q.getActiveTrip(db);
      if (!active) throw new TripError('NO_ACTIVE_TRIP');
      if (active.state !== 'TRACKING') return syncEnd(active);

      const endedAt = iso(); // device time when End was tapped
      await stopUpdates();
      const end = await endPosition(active.trip_id);
      const lastSeq = (await q.getTripState(db, active.trip_id))!.next_seq - 1;
      transition(fromRow(active), { type: 'END_REQUESTED', endedAt, lastSeq, end });
      const ending = await q.markEnding(db, active.trip_id, endedAt, end, iso());
      const outcome = await syncEnd(ending);
      if (outcome.state === 'ENDED') void cleanupFinished();
      return outcome;
    });
  }

  /** Retries the pending end (reconnect, foreground, timer). */
  function syncPendingEnd(): Promise<EndOutcome | null> {
    return exclusive(async () => {
      const active = await q.getActiveTrip(db);
      if (!active || active.state === 'TRACKING') return null;
      const outcome = await syncEnd(active);
      if (outcome.state === 'ENDED') void cleanupFinished();
      return outcome;
    });
  }

  /** TRD §4.3: delete a trip's local rows once the server status is final and nothing is left to send. */
  async function cleanupFinished(): Promise<string[]> {
    const removed: string[] = [];
    for (const row of await q.listTripStates(db)) {
      if (row.state !== 'ENDED') continue;
      if ((await q.counts(db, row.trip_id)).pending > 0) continue;
      let server: ServerTrip | null;
      try {
        server = await deps.fetchTrip(row.trip_id);
      } catch {
        continue; // offline: try again later
      }
      if (!server || FINAL_STATUSES.includes(server.status)) {
        transition(fromRow(row), { type: 'FINALIZED' });
        await q.deleteTrip(db, row.trip_id);
        removed.push(row.trip_id);
      } else if (server.status !== row.server_status) {
        await q.setState(db, row.trip_id, 'ENDED', iso(), { server_status: server.status });
      }
    }
    return removed;
  }

  /**
   * App start / foreground: restart location updates for a TRACKING trip (killed app, reboot),
   * retry a pending end, clean up finished trips. Never throws.
   */
  function resumeOnLaunch(): Promise<ResumeResult> {
    return exclusive(async () => {
      const result: ResumeResult = { activeTripId: null, tracking: false, pendingTripId: null };
      try {
        const active = await q.getActiveTrip(db);
        if (active?.state === 'TRACKING') {
          // If the server definitely shows it ended/cancelled (admin, other device), stop tracking.
          // "Not visible" or offline is NOT proof: keep recording.
          const server = await deps.fetchTrip(active.trip_id).catch(() => null);
          if (server && server.status !== 'in_progress') {
            await stopUpdates();
            await q.setState(db, active.trip_id, 'ENDED', iso(), {
              server_status: server?.status ?? null,
              last_error: 'ENDED_ON_SERVER',
            });
          } else {
            result.activeTripId = active.trip_id;
            result.tracking = await ensureUpdates(active.trip_id);
          }
        } else if (active) {
          await stopUpdates();
          const outcome = await syncEnd(active);
          if (outcome.state === 'ENDED_PENDING_SYNC') result.pendingTripId = active.trip_id;
        }
        void deps.uploader.flush({ force: true });
        await cleanupFinished();
      } catch (e) {
        log('resumeOnLaunch failed', e);
      }
      return result;
    });
  }

  return { startTrip, endTrip, syncPendingEnd, resumeOnLaunch, cleanupFinished };
}

export type TrackingEngine = ReturnType<typeof createEngine>;
