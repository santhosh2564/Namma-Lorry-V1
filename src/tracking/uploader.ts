/**
 * Point uploader (M8, docs/03-TRD.md §4.3 and docs/06 §2).
 *
 * Runs on a 30 s timer, on a NetInfo reconnect and on app foreground. Each pass
 * takes at most `UPLOAD_BATCH_SIZE` un-uploaded rows for the active trip and
 * upserts them with `onConflict: 'trip_id,seq', ignoreDuplicates: true`, which
 * makes the write idempotent — a retry after a partial failure cannot duplicate
 * or overwrite a point.
 *
 * Two things this module is careful about:
 *
 * - **Single-flight.** A 30 s timer, a reconnect and an end-of-trip flush can
 *   all fire at once. `flush()` returns the in-flight promise instead of
 *   starting a second batch, so the same rows are never uploaded twice in
 *   parallel (which would race the `uploaded` marks).
 * - **ND-8, the poison batch.** The RLS policy rejects a row whose device time
 *   is more than 2 minutes ahead of the server or earlier than `started_at - 1
 *   min`. One such row fails the whole batch, and a naive retry loop would
 *   retry that batch forever. Rows we can already prove are out of bounds are
 *   dropped before sending; anything the server still refuses is **quarantined**
 *   row-by-row and never retried, so a single bad point can never wedge a trip.
 */
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  MAX_FUTURE_SKEW_MS,
  MAX_PAST_SKEW_MS,
  UPLOAD_BATCH_SIZE,
  UPLOAD_INTERVAL_MS,
} from "@/tracking/config";
import type { PointQueueRow, TrackingStore } from "@/tracking/queue";

/** The `trip_points` insert shape (docs/06 §2). */
export type UploadRow = {
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
};

export type UploadOutcome = { ok: true } | { ok: false; kind: "network" | "data"; message: string };

export type FlushResult = {
  uploaded: number;
  quarantined: number;
  /** True when the server was unreachable, so the caller can go offline. */
  network: boolean;
  message?: string;
};

export const EMPTY_FLUSH: FlushResult = { uploaded: 0, quarantined: 0, network: false };

const CLIENT_QUARANTINE_REASON = "INVALID_LOCAL_ROW";

/** Map a queue row onto the server's insert shape. */
export function toUploadRow(row: PointQueueRow): UploadRow {
  return {
    trip_id: row.tripId,
    seq: row.seq,
    recorded_at: row.recordedAt,
    lat: row.lat,
    lng: row.lng,
    accuracy_m: row.accuracyM,
    speed_mps: row.speedMps,
    heading: row.heading,
    altitude_m: row.altitudeM,
    is_mocked: row.isMocked,
  };
}

/**
 * Is this row worth sending at all?
 *
 * A row is refused locally when it is malformed, when it predates the trip by
 * more than the RLS window, or when its timestamp is implausibly far in the
 * future. This is the cheap half of ND-8; the server-rejected half is the
 * quarantine path below.
 */
export function isUploadable(
  row: PointQueueRow,
  bounds: {
    startedAt: string | null;
    nowMs: number;
    maxPastSkewMs?: number;
    maxFutureSkewMs?: number;
  },
): boolean {
  const maxPast = bounds.maxPastSkewMs ?? MAX_PAST_SKEW_MS;
  const maxFuture = bounds.maxFutureSkewMs ?? MAX_FUTURE_SKEW_MS;

  if (!Number.isInteger(row.seq) || row.seq <= 0) {
    return false;
  }
  if (!Number.isFinite(row.lat) || row.lat < -90 || row.lat > 90) {
    return false;
  }
  if (!Number.isFinite(row.lng) || row.lng < -180 || row.lng > 180) {
    return false;
  }
  const recorded = Date.parse(row.recordedAt);
  if (!Number.isFinite(recorded)) {
    return false;
  }
  if (recorded > bounds.nowMs + maxFuture) {
    return false;
  }
  if (bounds.startedAt !== null) {
    const started = Date.parse(bounds.startedAt);
    if (Number.isFinite(started) && recorded < started - maxPast) {
      return false;
    }
  }
  return true;
}

/**
 * Exponential backoff with equal jitter.
 *
 * `attempt` is the number of consecutive failures (0 for the first retry). The
 * delay is `min(max, base · 2^attempt)` capped, split half fixed and half
 * random so a fleet of phones that lost signal together does not reconnect in
 * lockstep. Injectable `random` keeps it testable.
 */
export function computeBackoff(
  attempt: number,
  random: () => number = Math.random,
  baseMs: number = BACKOFF_BASE_MS,
  maxMs: number = BACKOFF_MAX_MS,
): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const capped = Math.min(maxMs, baseMs * 2 ** safeAttempt);
  const half = capped / 2;
  return Math.round(half + random() * half);
}

export type TimerApi = {
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (handle: ReturnType<typeof setInterval>) => void;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
};

const REAL_TIMERS: TimerApi = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};

const realSubscribeOnline = (onOnline: () => void): (() => void) => {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected === true && state.isInternetReachable !== false) {
      onOnline();
    }
  });
  return unsubscribe;
};

const realSubscribeForeground = (onForeground: () => void): (() => void) => {
  const subscription = AppState.addEventListener("change", (next) => {
    if (next === "active") {
      onForeground();
    }
  });
  return () => subscription.remove();
};

export type UploaderDeps = {
  store: TrackingStore;
  /** The real Supabase upsert; injected so tests never touch the network. */
  upload: (rows: UploadRow[]) => Promise<UploadOutcome>;
  now: () => number;
  random?: () => number;
  batchSize?: number;
  intervalMs?: number;
  timers?: TimerApi;
  subscribeOnline?: (onOnline: () => void) => () => void;
  subscribeForeground?: (onForeground: () => void) => () => void;
};

export type UploaderStatus = {
  running: boolean;
  /** Consecutive failed passes; resets on success. */
  attempts: number;
  lastResult: FlushResult | null;
};

export type Uploader = {
  /** One pass. Single-flight: concurrent callers share the same promise. */
  flush: () => Promise<FlushResult>;
  start: () => void;
  stop: () => void;
  getStatus: () => UploaderStatus;
};

export function createUploader(deps: UploaderDeps): Uploader {
  const {
    store,
    upload,
    now,
    random = Math.random,
    batchSize = UPLOAD_BATCH_SIZE,
    intervalMs = UPLOAD_INTERVAL_MS,
    timers = REAL_TIMERS,
    subscribeOnline = realSubscribeOnline,
    subscribeForeground = realSubscribeForeground,
  } = deps;

  let inFlight: Promise<FlushResult> | null = null;
  let attempts = 0;
  let lastResult: FlushResult | null = null;
  let running = false;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let backoffHandle: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeOnline: (() => void) | null = null;
  let unsubscribeForeground: (() => void) | null = null;

  async function doFlush(): Promise<FlushResult> {
    const state = await store.readState();
    const tripId = state.tripId;
    if (tripId === null) {
      return EMPTY_FLUSH;
    }

    const rows = await store.pendingPoints(tripId, batchSize);
    if (rows.length === 0) {
      return EMPTY_FLUSH;
    }

    const bounds = { startedAt: state.startedAt, nowMs: now() };
    const sendable: PointQueueRow[] = [];
    const invalid: number[] = [];
    for (const row of rows) {
      if (isUploadable(row, bounds)) {
        sendable.push(row);
      } else {
        invalid.push(row.seq);
      }
    }

    if (invalid.length > 0) {
      await store.quarantine(tripId, invalid, CLIENT_QUARANTINE_REASON);
    }
    if (sendable.length === 0) {
      return { uploaded: 0, quarantined: invalid.length, network: false };
    }

    const outcome = await upload(sendable.map(toUploadRow));
    if (outcome.ok) {
      await store.markUploaded(
        tripId,
        sendable.map((row) => row.seq),
      );
      return { uploaded: sendable.length, quarantined: invalid.length, network: false };
    }

    if (outcome.kind === "network") {
      return {
        uploaded: 0,
        quarantined: invalid.length,
        network: true,
        message: outcome.message,
      };
    }

    // A data rejection from the server: one bad row is failing the batch.
    // Re-send row by row so the good points land and the bad one is parked
    // instead of retried forever (ND-8).
    const uploaded: number[] = [];
    const rejected: { seq: number; reason: string }[] = [];
    for (const row of sendable) {
      const single = await upload([toUploadRow(row)]);
      if (single.ok) {
        uploaded.push(row.seq);
        continue;
      }
      if (single.kind === "network") {
        if (uploaded.length > 0) {
          await store.markUploaded(tripId, uploaded);
        }
        return {
          uploaded: uploaded.length,
          quarantined: invalid.length,
          network: true,
          message: single.message,
        };
      }
      rejected.push({ seq: row.seq, reason: single.message });
    }

    if (uploaded.length > 0) {
      await store.markUploaded(tripId, uploaded);
    }
    if (rejected.length > 0) {
      await store.quarantine(
        tripId,
        rejected.map((entry) => entry.seq),
        rejected[0]?.reason ?? "REJECTED_BY_SERVER",
      );
    }
    return {
      uploaded: uploaded.length,
      quarantined: invalid.length + rejected.length,
      network: false,
    };
  }

  function flush(): Promise<FlushResult> {
    if (inFlight !== null) {
      return inFlight;
    }
    inFlight = doFlush()
      .catch((error: unknown): FlushResult => {
        // A local read/write failure is not a network decision, but it must not
        // reject into the timer; the next pass retries.
        const message = error instanceof Error ? error.message : "upload failed";
        return { uploaded: 0, quarantined: 0, network: false, message };
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function run(): Promise<void> {
    const result = await flush();
    lastResult = result;
    if (result.network) {
      attempts += 1;
      scheduleBackoff();
      return;
    }
    attempts = 0;
    if (backoffHandle !== null) {
      timers.clearTimeout(backoffHandle);
      backoffHandle = null;
    }
  }

  function scheduleBackoff(): void {
    if (!running) {
      return;
    }
    if (backoffHandle !== null) {
      timers.clearTimeout(backoffHandle);
    }
    const delay = computeBackoff(attempts - 1, random);
    backoffHandle = timers.setTimeout(() => {
      backoffHandle = null;
      void run();
    }, delay);
  }

  function start(): void {
    if (running) {
      return;
    }
    running = true;
    intervalHandle = timers.setInterval(() => void run(), intervalMs);
    unsubscribeOnline = subscribeOnline(() => void run());
    unsubscribeForeground = subscribeForeground(() => void run());
  }

  function stop(): void {
    running = false;
    if (intervalHandle !== null) {
      timers.clearInterval(intervalHandle);
      intervalHandle = null;
    }
    if (backoffHandle !== null) {
      timers.clearTimeout(backoffHandle);
      backoffHandle = null;
    }
    unsubscribeOnline?.();
    unsubscribeForeground?.();
    unsubscribeOnline = null;
    unsubscribeForeground = null;
  }

  return {
    flush,
    start,
    stop,
    getStatus: () => ({ running, attempts, lastResult }),
  };
}
