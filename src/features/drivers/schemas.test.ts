/**
 * Add-Driver form tests (M6).
 *
 * The drawer and the Edge Function must agree on what a driver is: a name and
 * a 10-digit number that can actually receive the OTP the M5 gate sends.
 */
import { addDriverSchema, normalisePhoneInput } from "./schemas";

describe("addDriverSchema", () => {
  it("accepts a plain name and national number", () => {
    const parsed = addDriverSchema.safeParse({ fullName: "Murugan S", phone: "9000000011" });
    expect(parsed.success).toBe(true);
  });

  it("trims the name", () => {
    const parsed = addDriverSchema.safeParse({ fullName: "  Murugan  S  ", phone: "9000000011" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fullName).toBe("Murugan S");
    }
  });

  it("refuses a name that is blank or absurdly long", () => {
    expect(addDriverSchema.safeParse({ fullName: "   ", phone: "9000000011" }).success).toBe(false);
    expect(
      addDriverSchema.safeParse({ fullName: "x".repeat(81), phone: "9000000011" }).success,
    ).toBe(false);
  });

  it("refuses a number that could not receive an OTP", () => {
    for (const phone of ["", "900000001", "90000000111", "1000000001", "abcdefghij"]) {
      expect(addDriverSchema.safeParse({ fullName: "Murugan S", phone }).success).toBe(false);
    }
  });
});

describe("normalisePhoneInput", () => {
  it("accepts every way a dispatcher writes the same number", () => {
    for (const input of [
      "9000000011",
      "90000 00011",
      "+91 90000 00011",
      "919000000011",
      "(90000) 00011",
    ]) {
      expect(normalisePhoneInput(input)).toBe("9000000011");
    }
  });

  it("returns null rather than a half-cleaned number", () => {
    for (const input of ["", "900000001", "1000000001", "900000000011"]) {
      expect(normalisePhoneInput(input)).toBeNull();
    }
  });
});
