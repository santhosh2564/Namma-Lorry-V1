// Uploads queued points to trip_points (TRD §4.3, docs/06 §2).
// - ≤ 200 rows per call, upsert onConflict (trip_id, seq) ignoreDuplicates → idempotent.
// - Single flight: concurrent callers share the one upload in progress.
// - Exponential backoff with jitter after failures; reconnect/foreground can force a retry.
// - ND-8: rows the server permanently refuses (RLS/constraint) are isolated by bisection
//   and set aside (uploaded = 2) so one bad row never blocks the rest of the trip.
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, UPLOAD_BATCH_SIZE } from './config';
import type { PointRow, SqlDb } from './db';
import { isPermanentRowError, type RpcErrorLike } from './errors';
import { markRejected, markUploaded, pendingBatch, toUploadRow, type UploadRow } from './queue';

export interface UploaderDeps {
  db: SqlDb;
  /** supabase.from('trip_points').upsert(rows, { onConflict: 'trip_id,seq', ignoreDuplicates: true }) */
  upsertPoints(rows: UploadRow[]): Promise<{ error: RpcErrorLike | null }>;
  /** Uploads without a signed-in driver would be refused by RLS and wrongly quarantined. */
  hasSession(): Promise<boolean>;
  now(): number;
  random(): number;
  batchSize?: number;
  baseMs?: number;
  maxMs?: number;
}

export type FlushStatus = 'idle' | 'uploaded' | 'backoff' | 'no-session' | 'failed';

export interface FlushResult {
  status: FlushStatus;
  uploaded: number;
  rejected: number;
  error?: RpcErrorLike;
}

/** "Equal jitter": half the exponential delay fixed, half random. failures ≥ 1. */
export function backoffDelay(
  failures: number,
  random: number,
  baseMs = BACKOFF_BASE_MS,
  maxMs = BACKOFF_MAX_MS,
): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1));
  return Math.round(exp / 2 + random * (exp / 2));
}

export interface Uploader {
  /** Uploads one batch. `force` ignores the backoff window (reconnect, foreground, End). */
  flush(opts?: { force?: boolean }): Promise<FlushResult>;
  /** Uploads batches until the queue is empty or a batch fails. */
  flushAll(): Promise<FlushResult>;
  resetBackoff(): void;
  status(): { failures: number; nextAttemptAt: number; busy: boolean };
}

export function createUploader(deps: UploaderDeps): Uploader {
  const size = deps.batchSize ?? UPLOAD_BATCH_SIZE;
  let inflight: Promise<FlushResult> | null = null;
  let failures = 0;
  let nextAttemptAt = 0;

  async function send(
    rows: PointRow[],
  ): Promise<{ uploaded: number; rejected: number; error?: RpcErrorLike }> {
    let error: RpcErrorLike | null;
    try {
      ({ error } = await deps.upsertPoints(rows.map(toUploadRow)));
    } catch (e) {
      error = { message: e instanceof Error ? e.message : String(e) };
    }
    if (!error) {
      await markUploaded(deps.db, rows);
      return { uploaded: rows.length, rejected: 0 };
    }
    if (!isPermanentRowError(error)) return { uploaded: 0, rejected: 0, error };
    if (rows.length === 1) {
      await markRejected(deps.db, rows[0]!, `${error.code ?? ''} ${error.message ?? ''}`.trim());
      return { uploaded: 0, rejected: 1 };
    }
    const mid = Math.ceil(rows.length / 2);
    const left = await send(rows.slice(0, mid));
    if (left.error) return left;
    const right = await send(rows.slice(mid));
    return {
      uploaded: left.uploaded + right.uploaded,
      rejected: left.rejected + right.rejected,
      error: right.error,
    };
  }

  async function run(force: boolean): Promise<FlushResult> {
    if (!force && deps.now() < nextAttemptAt) return { status: 'backoff', uploaded: 0, rejected: 0 };
    const rows = await pendingBatch(deps.db, size);
    if (!rows.length) {
      failures = 0;
      nextAttemptAt = 0;
      return { status: 'idle', uploaded: 0, rejected: 0 };
    }
    if (!(await deps.hasSession())) return { status: 'no-session', uploaded: 0, rejected: 0 };
    const r = await send(rows);
    if (r.error) {
      failures += 1;
      nextAttemptAt = deps.now() + backoffDelay(failures, deps.random(), deps.baseMs, deps.maxMs);
      return { status: 'failed', uploaded: r.uploaded, rejected: r.rejected, error: r.error };
    }
    failures = 0;
    nextAttemptAt = 0;
    return { status: 'uploaded', uploaded: r.uploaded, rejected: r.rejected };
  }

  function flush(opts: { force?: boolean } = {}): Promise<FlushResult> {
    if (inflight) return inflight;
    inflight = run(!!opts.force)
      .catch((e): FlushResult => {
        // Local DB failure: count it as a failed attempt, never throw to timers.
        failures += 1;
        nextAttemptAt = deps.now() + backoffDelay(failures, deps.random(), deps.baseMs, deps.maxMs);
        return { status: 'failed', uploaded: 0, rejected: 0, error: { message: String(e) } };
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  async function flushAll(): Promise<FlushResult> {
    const total: FlushResult = { status: 'idle', uploaded: 0, rejected: 0 };
    // Bounded: each round empties the queue, uploads/rejects ≥ 1 row, or stops. The cap
    // (100 × 200 = 20,000 points) guards against a bookkeeping bug looping forever.
    for (let round = 0; round < 100; round++) {
      const r = await flush({ force: true });
      total.uploaded += r.uploaded;
      total.rejected += r.rejected;
      if (r.status !== 'uploaded') {
        total.status =
          r.status === 'idle' ? (total.uploaded || total.rejected ? 'uploaded' : 'idle') : r.status;
        total.error = r.error;
        return total;
      }
      total.status = 'uploaded';
    }
    return total;
  }

  return {
    flush,
    flushAll,
    resetBackoff: () => {
      failures = 0;
      nextAttemptAt = 0;
    },
    status: () => ({ failures, nextAttemptAt, busy: !!inflight }),
  };
}
