import {
  formatCount,
  formatTripDate,
  isVerificationReason,
  kmFromMetres,
  readMetrics,
  reasonDistanceM,
  reasonKey,
  reasonKeys,
  summaryVariant,
} from "./summaryState";

describe("summaryVariant", () => {
  it("waits for the verifier while the trip is still completed", () => {
    expect(summaryVariant("completed", false)).toBe("verifying");
  });

  it("says so when the end never reached the server", () => {
    expect(summaryVariant("completed", true)).toBe("pending_sync");
  });

  it("passes the finished verdicts through", () => {
    expect(summaryVariant("verified", false)).toBe("verified");
    expect(summaryVariant("needs_review", false)).toBe("needs_review");
    expect(summaryVariant("rejected", false)).toBe("rejected");
    expect(summaryVariant("cancelled", false)).toBe("cancelled");
  });

  it("falls back to the neutral story for a trip that never finished", () => {
    expect(summaryVariant("assigned", false)).toBe("verifying");
    expect(summaryVariant("in_progress", false)).toBe("verifying");
  });
});

describe("reason codes", () => {
  it("knows exactly the ten codes from docs/08 §3", () => {
    expect(isVerificationReason("END_OUTSIDE_DROP")).toBe(true);
    expect(isVerificationReason("START_OUTSIDE_PICKUP")).toBe(true);
    expect(isVerificationReason("SOMETHING_NEW")).toBe(false);
  });

  it("maps a known code to its translation key", () => {
    expect(reasonKey("TRACKING_GAP")).toBe("driver.summary.reasons.TRACKING_GAP");
  });

  it("never lets an unknown code reach the driver", () => {
    expect(reasonKey("PHASE_TWO_CODE")).toBe("driver.summary.reasons.unknown");
  });

  it("de-duplicates and collapses repeats of the same unknown code", () => {
    expect(reasonKeys(["END_OUTSIDE_DROP", "END_OUTSIDE_DROP", "NOPE", "ALSO_NOPE"])).toEqual([
      "driver.summary.reasons.END_OUTSIDE_DROP",
      "driver.summary.reasons.unknown",
    ]);
  });
});

describe("readMetrics", () => {
  it("reads the distances verify_trip records", () => {
    expect(
      readMetrics({ end_distance_m: 1800, start_distance_m: 42, planned_ratio: 0.61, points: 900 }),
    ).toEqual({ endDistanceM: 1800, startDistanceM: 42, plannedRatio: 0.61 });
  });

  it("treats missing or malformed metrics as unknown", () => {
    expect(readMetrics(null)).toEqual({
      endDistanceM: null,
      startDistanceM: null,
      plannedRatio: null,
    });
    expect(readMetrics({ end_distance_m: "1800" }).endDistanceM).toBeNull();
    expect(readMetrics([1, 2, 3]).endDistanceM).toBeNull();
  });
});

describe("reasonDistanceM", () => {
  const metrics = { endDistanceM: 1800, startDistanceM: 42, plannedRatio: 0.61 };

  it("attaches the distance the verifier measured to the two geofence reasons", () => {
    expect(reasonDistanceM("END_OUTSIDE_DROP", metrics)).toBe(1800);
    expect(reasonDistanceM("START_OUTSIDE_PICKUP", metrics)).toBe(42);
  });

  it("attaches nothing to a reason that has no distance", () => {
    expect(reasonDistanceM("TRACKING_GAP", metrics)).toBeNull();
    expect(reasonDistanceM("MISSING_POINTS", metrics)).toBeNull();
  });
});

describe("formatting", () => {
  it("rounds metres to whole kilometres", () => {
    expect(kmFromMetres(512_400)).toBe(512);
    expect(kmFromMetres(null)).toBeNull();
  });

  it("renders the design's date without relying on the platform's locale data", () => {
    expect(formatTripDate("2026-09-26T10:00:00.000Z")).toBe("26 Sep 2026");
    expect(formatTripDate("2026-01-01T00:00:00.000Z")).toBe("1 Jan 2026");
    expect(formatTripDate(null)).toBeNull();
    expect(formatTripDate("not-a-date")).toBeNull();
  });

  it("groups thousands for the totals line", () => {
    expect(formatCount(14860)).toBe("14,860");
    expect(formatCount(38)).toBe("38");
    expect(formatCount(0)).toBe("0");
  });
});
