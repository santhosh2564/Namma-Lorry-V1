/**
 * Typed error parsing (M8, docs/06 §1).
 *
 * The whole point of this module is that `OUTSIDE_PICKUP:1234` reaches the UI as
 * `{ code: "OUTSIDE_PICKUP", outsidePickupM: 1234 }` — the distance is data, not
 * prose — and that every other failure becomes one of a small, switchable set.
 */
import {
  errorMessage,
  gpsUnavailable,
  isNetworkError,
  notConfiguredError,
  parseTrackingError,
} from "@/tracking/errors";

describe("parseTrackingError", () => {
  it("parses OUTSIDE_PICKUP:<metres> into a number", () => {
    expect(parseTrackingError({ message: "OUTSIDE_PICKUP:3210" })).toEqual({
      code: "OUTSIDE_PICKUP",
      message: "OUTSIDE_PICKUP:3210",
      outsidePickupM: 3210,
    });
  });

  it("rounds a fractional distance and tolerates spaces", () => {
    expect(parseTrackingError("OUTSIDE_PICKUP: 1234.6").outsidePickupM).toBe(1235);
  });

  it("carries a zero distance rather than dropping it", () => {
    expect(parseTrackingError("OUTSIDE_PICKUP:0").outsidePickupM).toBe(0);
  });

  it.each([
    "TRIP_NOT_FOUND",
    "TRIP_NOT_STARTABLE",
    "ANOTHER_TRIP_ACTIVE",
    "GPS_ACCURACY_TOO_LOW",
    "TRIP_NOT_ACTIVE",
    "CONSENT_REQUIRED",
  ])("maps the raw RPC message %s to its code", (code) => {
    expect(parseTrackingError({ message: code }).code).toBe(code);
  });

  it("reads the code out of a PostgREST-shaped error object", () => {
    const error = { code: "P0001", message: "ANOTHER_TRIP_ACTIVE", details: null, hint: null };
    expect(parseTrackingError(error).code).toBe("ANOTHER_TRIP_ACTIVE");
  });

  it.each([
    "Network request failed",
    "TypeError: Failed to fetch",
    "fetch failed",
    "connect ECONNREFUSED 127.0.0.1:54321",
  ])("classifies %s as NETWORK", (message) => {
    expect(parseTrackingError(new Error(message)).code).toBe("NETWORK");
  });

  it("falls back to UNKNOWN for an unrecognised message", () => {
    expect(parseTrackingError(new Error("something exploded")).code).toBe("UNKNOWN");
  });

  it("falls back to UNKNOWN for nothing at all", () => {
    expect(parseTrackingError(null)).toEqual({
      code: "UNKNOWN",
      message: "Unknown tracking failure",
    });
  });

  it("prefers a real RPC code over the network phrases", () => {
    // A message can contain both; the specific code must win.
    expect(parseTrackingError("GPS_ACCURACY_TOO_LOW: network request failed").code).toBe(
      "GPS_ACCURACY_TOO_LOW",
    );
  });
});

describe("errorMessage", () => {
  it("reads `message` from an object", () => {
    expect(errorMessage({ message: "boom" })).toBe("boom");
  });

  it("falls back to `error_description`", () => {
    expect(errorMessage({ error_description: "bad code" })).toBe("bad code");
  });

  it("accepts a bare string", () => {
    expect(errorMessage("plain")).toBe("plain");
  });

  it("returns an empty string for anything else", () => {
    expect(errorMessage(42)).toBe("");
    expect(errorMessage(undefined)).toBe("");
  });
});

describe("isNetworkError", () => {
  it("is true for a fetch failure", () => {
    expect(isNetworkError(new Error("Network request failed"))).toBe(true);
  });

  it("is false for an RPC rejection", () => {
    expect(isNetworkError(new Error("TRIP_NOT_STARTABLE"))).toBe(false);
  });
});

describe("client errors", () => {
  it("has a GPS_UNAVAILABLE factory for a missing fix", () => {
    expect(gpsUnavailable().code).toBe("GPS_UNAVAILABLE");
  });

  it("has a NOT_CONFIGURED factory", () => {
    expect(notConfiguredError().code).toBe("NOT_CONFIGURED");
  });
});
