// Maps Supabase Auth (GoTrue) errors to the S2/S3 error states in docs/12:
// unregistered number, too many attempts, wrong code, expired code.

export type SendOtpError = 'unregistered' | 'rate_limited' | 'network' | 'sms_failed' | 'unknown';
export type VerifyOtpError = 'wrong_code' | 'expired' | 'rate_limited' | 'network' | 'unknown';

/** Phone OTP lifetime. Supabase default ("SMS OTP Expiry") is 60 s; keep in sync with docs/DEV_SETUP.md. */
export const OTP_EXPIRY_SECONDS = 60;
export const RESEND_SECONDS = 30;

export interface AuthErrorLike {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

function isNetwork(e: AuthErrorLike): boolean {
  return e.name === 'AuthRetryableFetchError' || e.status === 0 || /network|fetch/i.test(e.message ?? '');
}

function isRateLimited(e: AuthErrorLike): boolean {
  return e.status === 429 || (e.code ?? '').startsWith('over_');
}

export function mapSendOtpError(e: AuthErrorLike): SendOtpError {
  if (isRateLimited(e)) return 'rate_limited';
  // signInWithOtp({ shouldCreateUser: false }) for a phone with no auth user (ND-12).
  if (
    e.code === 'otp_disabled' ||
    e.code === 'user_not_found' ||
    e.code === 'signup_disabled' ||
    /signups not allowed/i.test(e.message ?? '')
  ) {
    return 'unregistered';
  }
  if (e.code === 'sms_send_failed') return 'sms_failed';
  if (isNetwork(e)) return 'network';
  return 'unknown';
}

/**
 * GoTrue answers `otp_expired` ("Token has expired or is invalid") for both a wrong
 * and an expired code, so the client tells them apart by how long ago the code was sent.
 */
export function mapVerifyOtpError(e: AuthErrorLike, secondsSinceSent: number): VerifyOtpError {
  if (isRateLimited(e)) return 'rate_limited';
  if (e.code === 'otp_expired' || e.status === 403 || /expired|invalid/i.test(e.message ?? '')) {
    return secondsSinceSent >= OTP_EXPIRY_SECONDS ? 'expired' : 'wrong_code';
  }
  if (isNetwork(e)) return 'network';
  return 'unknown';
}
