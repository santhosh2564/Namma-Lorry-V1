/**
 * Maps anything thrown by supabase-js / fetch to an i18n key + params, so every
 * RPC error code in docs/06 (plus 0002/0003 codes) has a user-friendly message.
 * RPC errors arrive as `error.message` = the code (docs/06 §1).
 */
import i18n from '@/i18n';

export const RPC_ERROR_CODES = [
  'TRIP_NOT_FOUND',
  'TRIP_NOT_STARTABLE',
  'ANOTHER_TRIP_ACTIVE',
  'GPS_ACCURACY_TOO_LOW',
  'OUTSIDE_PICKUP',
  'TRIP_NOT_ACTIVE',
  'FORBIDDEN',
  'NOTE_REQUIRED',
  'TRIP_NOT_IN_REVIEW',
  'VERSION_REQUIRED',
  'PROFILE_NOT_FOUND',
  'LANGUAGE_NOT_SUPPORTED',
] as const;
export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

export type AppError = {
  kind: 'rpc' | 'network' | 'forbidden' | 'session' | 'notConfigured' | 'unknown';
  key: string;
  params?: Record<string, string | number>;
  code?: RpcErrorCode;
  /** OUTSIDE_PICKUP:<metres> → metres, for UI that shows distance. */
  metres?: number;
};

/** Thrown by data loaders when no Supabase client is configured (outside dev demo mode). */
export class NotConfiguredError extends Error {
  constructor() {
    super('NOT_CONFIGURED');
    this.name = 'NotConfiguredError';
  }
}

const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /network request failed/i,
  /networkerror/i,
  /load failed/i,
  /fetch failed/i,
];

const messageOf = (error: unknown) =>
  typeof error === 'string'
    ? error
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';

const codeOf = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';

export function classifyError(error: unknown): AppError {
  if (error instanceof NotConfiguredError)
    return { kind: 'notConfigured', key: 'errors.notConfigured' };
  const message = messageOf(error).trim();

  const outside = /^OUTSIDE_PICKUP:(\d+)$/.exec(message);
  if (outside) {
    const metres = Number(outside[1]);
    return {
      kind: 'rpc',
      code: 'OUTSIDE_PICKUP',
      key: 'rpc.OUTSIDE_PICKUP',
      metres,
      params: { km: (metres / 1000).toFixed(1) },
    };
  }
  const rpc = RPC_ERROR_CODES.find((code) => code === message);
  if (rpc) return { kind: 'rpc', code: rpc, key: `rpc.${rpc}` };

  if (NETWORK_PATTERNS.some((pattern) => pattern.test(message)))
    return { kind: 'network', key: 'errors.network' };
  // 42501 = insufficient_privilege / RLS; PGRST301/303 = JWT problems.
  const code = codeOf(error);
  if (code === '42501') return { kind: 'forbidden', key: 'errors.forbidden' };
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt expired/i.test(message)) {
    return { kind: 'session', key: 'errors.sessionExpired' };
  }
  return { kind: 'unknown', key: 'errors.generic' };
}

/** A translated, user-facing message for any error. Never shows raw server text. */
export function errorMessage(error: unknown): string {
  const { key, params } = classifyError(error);
  return i18n.t(key, params);
}
