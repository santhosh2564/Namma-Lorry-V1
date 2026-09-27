/**
 * Auth error mapping tests (M5).
 *
 * Every failure the two auth screens can show is pinned here, so a change in
 * how Supabase words an error cannot silently turn into a raw English string
 * on a driver's phone.
 */
import { type AuthErrorCode, AuthError, authErrorMessageKey, mapAuthError } from "./errors";

const cases: [string, AuthErrorCode][] = [
  // ND-12: `shouldCreateUser: false` turns an unknown number into this.
  ["Signups not allowed for otp", "unregistered"],
  ["Invalid login credentials", "wrong_code"],
  ["Token has expired or is invalid", "expired_code"],
  ["otp_expired", "expired_code"],
  ["Too many requests", "rate_limited"],
  ["Email rate limit exceeded", "rate_limited"],
  ["Unable to validate phone number", "invalid_phone"],
  ["Network request failed", "network"],
  ["something nobody predicted", "unknown"],
];

describe("mapAuthError", () => {
  for (const [message, code] of cases) {
    it(`maps "${message}" to ${code}`, () => {
      expect(mapAuthError({ message })).toBe(code);
    });
  }

  it("treats HTTP 429 as rate limiting whatever the message says", () => {
    expect(mapAuthError({ message: "nope", status: 429 })).toBe("rate_limited");
  });

  it("treats a missing error object as a network failure", () => {
    expect(mapAuthError(null)).toBe("network");
    expect(mapAuthError({})).toBe("network");
  });
});

describe("authErrorMessageKey", () => {
  it("gives every code an i18n key, never raw copy", () => {
    const codes: AuthErrorCode[] = [
      "invalid_phone",
      "unregistered",
      "wrong_code",
      "expired_code",
      "rate_limited",
      "network",
      "not_configured",
      "unknown",
    ];
    for (const code of codes) {
      const key = authErrorMessageKey(code);
      expect(key.startsWith("auth.")).toBe(true);
      expect(key).toBe(authErrorMessageKey(code));
    }
  });
});

describe("AuthError", () => {
  it("carries the code and nothing a screen should render", () => {
    const error = new AuthError("unregistered");
    expect(error.code).toBe("unregistered");
    expect(error.message).toBe("unregistered");
    expect(error).toBeInstanceOf(Error);
  });
});
