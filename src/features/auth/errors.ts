/**
 * Auth error codes and the mapping from Supabase's failures onto them (M5).
 *
 * docs/12 S2/S3 list the states the screens must show: unregistered number,
 * wrong code, expired code, rate-limited. Supabase reports all of them as
 * free-form messages, so the mapping is one small pure function and the
 * screens only ever branch on an `AuthErrorCode`.
 *
 * Messages are i18n keys, never copy: user-facing text lives in `src/i18n/`
 * (CLAUDE.md rule 10).
 */

/** Every failure the S2/S3 screens can show. */
export type AuthErrorCode =
  /** Fails `phoneSchema`: not a 10-digit number starting 6-9. */
  | "invalid_phone"
  /** The number is not in `auth.users` — "Contact Namma Lorry to register". */
  | "unregistered"
  /** The six digits did not match. */
  | "wrong_code"
  /** The code timed out; a new one has to be requested. */
  | "expired_code"
  /** Too many SMS or verification attempts (HTTP 429). */
  | "rate_limited"
  /** Device offline or the request failed in transit. */
  | "network"
  /** `EXPO_PUBLIC_SUPABASE_*` is missing, so sign-in cannot run at all. */
  | "not_configured"
  /** Anything unrecognised — logged, never shown raw. */
  | "unknown";

/** Thrown by the auth API; the screens render `code`, not the message. */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(code);
    this.name = "AuthError";
    this.code = code;
  }
}

type SupabaseError = { message?: string | null; status?: number | null } | null | undefined;

const messageRules: readonly [RegExp, AuthErrorCode][] = [
  // `shouldCreateUser: false` turns an unknown number into this error, which is
  // exactly the ND-12 registration gate.
  [/signups not allowed for otp/i, "unregistered"],
  [/otp.*(expired|invalid)|token has expired|token_expired|otp_expired/i, "expired_code"],
  [/invalid login credentials|invalid otp|token not found/i, "wrong_code"],
  [/too many|rate limit|requests should be limited/i, "rate_limited"],
  [/unable to validate phone|phone number.*(invalid|not valid)|invalid phone/i, "invalid_phone"],
  [/network request failed|failed to fetch|load failed/i, "network"],
];

/**
 * Map a Supabase (or fetch) failure onto one code. Pure, so the mapping is
 * unit tested rather than discovered on a driver's phone.
 */
export function mapAuthError(error: SupabaseError): AuthErrorCode {
  if (error?.status === 429) {
    return "rate_limited";
  }

  const message = error?.message ?? "";
  for (const [pattern, code] of messageRules) {
    if (pattern.test(message)) {
      return code;
    }
  }

  // A `TypeError: Network request failed` arrives as a thrown error rather
  // than a response, so it has no status and often no message.
  return message ? "unknown" : "network";
}

/** i18n key for the banner title of a code. */
export function authErrorMessageKey(code: AuthErrorCode): string {
  switch (code) {
    case "invalid_phone":
      return "auth.invalidPhone";
    case "unregistered":
      return "auth.unregistered";
    case "wrong_code":
      return "auth.wrongCode";
    case "expired_code":
      return "auth.expiredCode";
    case "rate_limited":
      return "auth.rateLimited";
    case "network":
      return "auth.networkError";
    case "not_configured":
      return "auth.notConfigured";
    case "unknown":
      return "auth.unknownError";
  }
}
