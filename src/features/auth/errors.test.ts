import { OTP_EXPIRY_SECONDS, mapSendOtpError, mapVerifyOtpError } from './errors';

describe('mapSendOtpError', () => {
  it.each([
    [{ code: 'otp_disabled', status: 422, message: 'Signups not allowed for otp' }, 'unregistered'],
    [{ status: 400, message: 'Signups not allowed for otp' }, 'unregistered'],
    [{ code: 'user_not_found', status: 404 }, 'unregistered'],
    [{ code: 'over_sms_send_rate_limit', status: 429 }, 'rate_limited'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'rate_limited'],
    [{ status: 429, message: 'For security purposes, you can only request this after 5 seconds.' }, 'rate_limited'],
    [{ code: 'sms_send_failed', status: 500 }, 'sms_failed'],
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, 'network'],
    [{ status: 500, message: 'boom' }, 'unknown'],
  ] as const)('%j → %s', (e, expected) => {
    expect(mapSendOtpError(e)).toBe(expected);
  });
});

describe('mapVerifyOtpError', () => {
  const otpExpired = { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' };

  it('wrong code when the OTP is still within its lifetime', () => {
    expect(mapVerifyOtpError(otpExpired, 10)).toBe('wrong_code');
  });

  it('expired once the lifetime has passed', () => {
    expect(mapVerifyOtpError(otpExpired, OTP_EXPIRY_SECONDS)).toBe('expired');
  });

  it('rate limited', () => {
    expect(mapVerifyOtpError({ code: 'over_request_rate_limit', status: 429 }, 5)).toBe('rate_limited');
  });

  it('network and unknown', () => {
    expect(mapVerifyOtpError({ name: 'AuthRetryableFetchError', status: 0 }, 5)).toBe('network');
    expect(mapVerifyOtpError({ status: 500, message: 'db down' }, 5)).toBe('unknown');
  });
});
