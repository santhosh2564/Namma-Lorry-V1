/**
 * Auth schema tests (M5): the rules S2 and S3 rely on, without a renderer.
 *
 * The sample numbers are the national half of the seeded test numbers in
 * `supabase/seed.sql` / `docs/DEV_SETUP.md` (91 90000 00011 etc.).
 */
import { formatCountdown, formatPhone, maskPhone, otpSchema, phoneSchema, toE164 } from "./schemas";

describe("phoneSchema", () => {
  it("accepts the seeded test numbers", () => {
    for (const number of ["9000000001", "9000000011", "9000000012", "9000000013"]) {
      expect(phoneSchema.safeParse(number).success).toBe(true);
    }
  });

  it("rejects anything that is not a 10-digit Indian mobile number", () => {
    const rejected = [
      "", // empty
      "90000", // too short
      "90000000112", // 11 digits
      "900000000123", // too long
      "1000000001", // does not start 6-9
      "abcdefghij", // letters
    ];
    for (const number of rejected) {
      expect(phoneSchema.safeParse(number).success).toBe(false);
    }
  });

  it("rejects pasted text; the input layer strips it to digits first", () => {
    // `PhoneInput` keeps only digits, so anything with a space or a `+`
    // reaching the schema means the sanitising was bypassed.
    expect(phoneSchema.safeParse(" 98765 43210 ").success).toBe(false);
    expect(phoneSchema.safeParse("9876543210").success).toBe(true);
  });
});

describe("otpSchema", () => {
  it("accepts exactly six digits", () => {
    expect(otpSchema.safeParse("123456").success).toBe(true);
  });

  it("rejects short, long or non-numeric codes", () => {
    for (const code of ["", "12345", "1234567", "12345a", "     "]) {
      expect(otpSchema.safeParse(code).success).toBe(false);
    }
  });
});

describe("formatting helpers", () => {
  it("converts a national number to E.164 for Supabase", () => {
    expect(toE164("9000000011")).toBe("+919000000011");
  });

  it("strips formatting characters before converting", () => {
    expect(toE164("90000 00011")).toBe("+919000000011");
  });

  it("formats a number for confirmation copy", () => {
    expect(formatPhone("9876543210")).toBe("+91 98765 43210");
    expect(formatPhone("987")).toBe("+91 987");
  });

  it("masks all but the first four and last four digits", () => {
    expect(maskPhone("9000000011")).toBe("+91 9000xxx x0011");
    expect(maskPhone("9876543210")).toBe("+91 9876xxx x3210");
  });

  it("formats the resend countdown as m:ss", () => {
    expect(formatCountdown(24)).toBe("0:24");
    expect(formatCountdown(9)).toBe("0:09");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
