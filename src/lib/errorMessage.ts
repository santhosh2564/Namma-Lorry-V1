// One place that turns any backend error into a code and a driver/admin-friendly message
// (M12a): RPC `raise exception` codes (docs/06 §1), Edge Function `{ error: CODE }` codes,
// Postgres SQLSTATEs, PostgREST/JWT errors and network failures. Texts live in en.json `errors`.
import { pick, t, tr } from '@/i18n';
import { isNetworkError, TripError, type RpcErrorLike } from '@/tracking/errors';

/** Postgres SQLSTATE → our code. */
const SQLSTATE: Record<string, string> = {
  '42501': 'PERMISSION_DENIED',
  '23505': 'DUPLICATE',
  '23514': 'INVALID_VALUE',
  '22P02': 'INVALID_VALUE',
  '22003': 'INVALID_VALUE',
  '23502': 'INVALID_VALUE',
  '23503': 'REFERENCE_MISSING',
  '57014': 'TIMEOUT',
  PGRST301: 'SESSION_EXPIRED', // JWT expired / invalid
  PGRST303: 'SESSION_EXPIRED',
};

export interface ErrorInfo {
  code: string;
  /** Metres for OUTSIDE_PICKUP. */
  distanceM?: number;
}

/** Normalises any thrown value into a stable code. Unknown shapes become UNKNOWN. */
export function errorInfo(e: unknown): ErrorInfo {
  if (!e) return { code: 'UNKNOWN' };
  if (e instanceof TripError) return { code: e.code, distanceM: e.distanceM };
  // FunctionError (lib/functions.ts), matched by name so this module doesn't pull in the client.
  if (e instanceof Error && e.name === 'FunctionError') return { code: (e as Error & { code: string }).code };
  const err = e as RpcErrorLike;
  const msg = (typeof err.message === 'string' ? err.message : '').trim();
  const outside = /^OUTSIDE_PICKUP:(\d+(?:\.\d+)?)$/.exec(msg);
  if (outside) return { code: 'OUTSIDE_PICKUP', distanceM: Math.round(Number(outside[1])) };
  // RPC exceptions carry the code as the whole message (e.g. "TRIP_NOT_IN_REVIEW").
  if (/^[A-Z][A-Z_]{2,}$/.test(msg) && msg in (t.errors as object)) return { code: msg };
  if (err.code && SQLSTATE[err.code]) return { code: SQLSTATE[err.code]! };
  if (err.status === 401) return { code: 'SESSION_EXPIRED' };
  if (isNetworkError(err)) return { code: 'NETWORK' };
  return { code: 'UNKNOWN' };
}

/**
 * The message to show for an error. `overrides` are screen-specific texts keyed by code
 * (e.g. the C6 review card says more about TRIP_NOT_IN_REVIEW than the generic text).
 */
export function errorMessage(e: unknown, overrides?: object): string {
  const info = errorInfo(e);
  if (overrides) {
    const specific = pick(overrides, info.code, '');
    if (specific) return specific;
  }
  if (info.code === 'OUTSIDE_PICKUP') return t.errors.OUTSIDE_PICKUP(info.distanceM ?? 0);
  return pick(t.errors, info.code, tr('errors.UNKNOWN'));
}
