// Typed errors for the tracking engine: start_trip / end_trip RPC codes (docs/06 §1)
// plus client-side conditions. RPC errors arrive as Postgres exception messages.
import { pick, t } from '@/i18n';

export type TripErrorCode =
  // start_trip / end_trip (docs/06 §1)
  | 'TRIP_NOT_FOUND'
  | 'TRIP_NOT_STARTABLE'
  | 'ANOTHER_TRIP_ACTIVE'
  | 'GPS_ACCURACY_TOO_LOW'
  | 'OUTSIDE_PICKUP'
  | 'TRIP_NOT_ACTIVE'
  // admin_review_trip (docs/06 §1), listed for completeness
  | 'FORBIDDEN'
  | 'NOTE_REQUIRED'
  | 'TRIP_NOT_IN_REVIEW'
  // client side
  | 'NETWORK'
  | 'PERMISSION_REQUIRED'
  | 'GPS_TIMEOUT'
  | 'GPS_UNAVAILABLE'
  | 'LOCAL_TRIP_ACTIVE'
  | 'NO_ACTIVE_TRIP'
  | 'TRACKING_START_FAILED'
  | 'UNKNOWN';

const SERVER_CODES = new Set<TripErrorCode>([
  'TRIP_NOT_FOUND',
  'TRIP_NOT_STARTABLE',
  'ANOTHER_TRIP_ACTIVE',
  'GPS_ACCURACY_TOO_LOW',
  'TRIP_NOT_ACTIVE',
  'FORBIDDEN',
  'NOTE_REQUIRED',
  'TRIP_NOT_IN_REVIEW',
]);

export class TripError extends Error {
  constructor(
    public readonly code: TripErrorCode,
    /** Distance to pickup in metres for OUTSIDE_PICKUP. */
    public readonly distanceM?: number,
    message?: string,
  ) {
    super(message ?? (distanceM !== undefined ? `${code}:${distanceM}` : code));
    this.name = 'TripError';
  }

  /** Worth retrying later without user action (network / server hiccup). */
  get retryable(): boolean {
    return this.code === 'NETWORK';
  }
}

export interface RpcErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  name?: string;
}

/** fetch() failures surface as errors without a Postgres code. */
export function isNetworkError(e: RpcErrorLike | null | undefined): boolean {
  if (!e) return false;
  const msg = e.message ?? '';
  if (
    /failed to fetch|network request failed|networkerror|load failed|fetch failed|timeout|aborted/i.test(msg)
  )
    return true;
  if (e.name === 'AbortError') return true;
  if (typeof e.status === 'number' && (e.status === 0 || e.status >= 500 || e.status === 408)) return true;
  return false;
}

/** Maps a supabase-js RPC error to a TripError. */
export function parseRpcError(e: RpcErrorLike | null | undefined): TripError {
  if (!e) return new TripError('UNKNOWN');
  const msg = (e.message ?? '').trim();
  const outside = /^OUTSIDE_PICKUP:(\d+(?:\.\d+)?)$/.exec(msg);
  if (outside) return new TripError('OUTSIDE_PICKUP', Math.round(Number(outside[1])));
  if (SERVER_CODES.has(msg as TripErrorCode)) return new TripError(msg as TripErrorCode);
  if (isNetworkError(e)) return new TripError('NETWORK', undefined, msg || 'NETWORK');
  return new TripError('UNKNOWN', undefined, msg || 'UNKNOWN');
}

/**
 * Postgres errors that mean "this row will never be accepted" (RLS check, CHECK
 * constraint, bad value, missing trip) as opposed to transient failures.
 */
export function isPermanentRowError(e: RpcErrorLike | null | undefined): boolean {
  return !!e && ['42501', '23514', '22P02', '22003', '23503', '23502'].includes(e.code ?? '');
}

/** Driver-facing text for each code (D4/D5), from en.json `errors`. */
export function tripErrorText(e: TripError): string {
  switch (e.code) {
    case 'OUTSIDE_PICKUP':
      return t.errors.OUTSIDE_PICKUP(e.distanceM ?? 0);
    case 'NETWORK':
      return t.tripDetail.offlineStart;
    default:
      return pick(t.errors, e.code, t.errors.UNKNOWN);
  }
}
