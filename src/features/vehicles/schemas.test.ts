/**
 * Vehicle registration tests (M6).
 *
 * `vehicles.registration_no` is UNIQUE, so a validator that quietly accepts a
 * malformed plate creates a duplicate truck rather than an error message.
 */
import {
  REGISTRATION_PATTERN,
  VEHICLE_TYPES,
  addVehicleSchema,
  formatRegistration,
  normaliseRegistration,
} from "./schemas";

describe("normaliseRegistration", () => {
  it("upper-cases and drops separators", () => {
    expect(normaliseRegistration("tn 23 bk 4521")).toBe("TN23BK4521");
    expect(normaliseRegistration("TN-23-BK-4521")).toBe("TN23BK4521");
    expect(normaliseRegistration("  ka 01 ab 1234 ")).toBe("KA01AB1234");
  });
});

describe("REGISTRATION_PATTERN", () => {
  it("accepts the formats seen on Indian trucks", () => {
    const valid = [
      "TN23BK4521", // TN 23 BK 4521 (DESIGN.md sample)
      "KA01AB1234", // KA 01 AB 1234
      "MH12DE1433",
      "GJ18XY9900", // two digits, no series letters
      "TN9Z1234", // one digit, three letters
    ];
    for (const value of valid) {
      expect(REGISTRATION_PATTERN.test(value)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    const invalid = [
      "",
      "TNBK4521", // no RTO digits
      "TN23BK452", // three digits at the end
      "T123BK4521", // starts with a digit
      "TN23BK4521X", // trailing letter
      "TN234BK4521", // three RTO digits
      "T23BK4521", // one letter state code
      "TN23BK4A21", // a letter in the number block
    ];
    for (const value of invalid) {
      expect(REGISTRATION_PATTERN.test(value)).toBe(false);
    }
  });
});

describe("formatRegistration", () => {
  it("produces the display form stored in the database", () => {
    expect(formatRegistration("tn23bk4521")).toBe("TN 23 BK 4521");
    expect(formatRegistration("KA01AB1234")).toBe("KA 01 AB 1234");
    expect(formatRegistration("TN9Z1234")).toBe("TN 9 Z 1234");
    expect(formatRegistration("GJ18XY9900")).toBe("GJ 18 XY 9900");
  });

  it("leaves an unparseable value alone rather than inventing a format", () => {
    expect(formatRegistration("not a plate")).toBe("NOT A PLATE");
  });
});

describe("addVehicleSchema", () => {
  it("normalises a valid submission into the stored shape", () => {
    const parsed = addVehicleSchema.safeParse({
      registrationNo: "tn 23 bk 4521",
      vehicleType: "19ft",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ registrationNo: "TN 23 BK 4521", vehicleType: "19ft" });
    }
  });

  it("refuses a bad registration and a vehicle type the schema does not know", () => {
    const badPlate = addVehicleSchema.safeParse({
      registrationNo: "TN23BK45",
      vehicleType: "19ft",
    });
    expect(badPlate.success).toBe(false);

    const badType = addVehicleSchema.safeParse({
      registrationNo: "TN23BK4521",
      vehicleType: "3-axle",
    });
    expect(badType.success).toBe(false);
  });
});

describe("VEHICLE_TYPES", () => {
  it("is the list doc 12 C9 asks for", () => {
    expect(VEHICLE_TYPES).toEqual([
      "407",
      "14ft",
      "17ft",
      "19ft",
      "20ft",
      "22ft",
      "24ft",
      "multi-axle",
    ]);
  });
});
