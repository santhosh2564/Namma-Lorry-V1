/**
 * C6 verification metrics tests (M11, docs/08 §3).
 *
 * `verification_metrics` is jsonb written by Postgres, so the reader has to
 * survive whatever shape it finds: a null blob, an empty one, a field of the
 * wrong type, or a build of the function that measured fewer things. The rule
 * under test is that a missing measurement is never shown as a zero.
 */
import {
  EMPTY_VERIFICATION_METRICS,
  formatMaxGap,
  metricsGrid,
  readVerificationMetrics,
  reasonChips,
  reasonDistanceKey,
} from "./verificationState";

const FULL = {
  points: 3412,
  mocked: 0,
  jumps: 2,
  max_gap_s: 264,
  avg_kmh: 52.4,
  planned_ratio: 0.97,
  start_distance_m: 42,
  end_distance_m: 1804,
};

describe("readVerificationMetrics", () => {
  it("reads every measurement verify_trip writes", () => {
    expect(readVerificationMetrics(FULL)).toEqual({
      points: 3412,
      mocked: 0,
      jumps: 2,
      maxGapS: 264,
      avgKmh: 52.4,
      plannedRatio: 0.97,
      startDistanceM: 42,
      endDistanceM: 1804,
    });
  });

  it("reads null for a null, empty or wrongly-shaped blob", () => {
    expect(readVerificationMetrics(null)).toEqual(EMPTY_VERIFICATION_METRICS);
    expect(readVerificationMetrics({})).toEqual(EMPTY_VERIFICATION_METRICS);
    expect(readVerificationMetrics([1, 2, 3])).toEqual(EMPTY_VERIFICATION_METRICS);
    expect(readVerificationMetrics("nope")).toEqual(EMPTY_VERIFICATION_METRICS);
  });

  it("drops a field of the wrong type rather than rendering NaN", () => {
    const metrics = readVerificationMetrics({ ...FULL, points: "many", avg_kmh: null });
    expect(metrics.points).toBeNull();
    expect(metrics.avgKmh).toBeNull();
    expect(metrics.jumps).toBe(2);
  });
});

describe("formatMaxGap", () => {
  it("reads seconds as minutes", () => {
    expect(formatMaxGap(264)).toBe("4 min");
    expect(formatMaxGap(0)).toBe("0 min");
  });

  it("has nothing to say without a measurement", () => {
    expect(formatMaxGap(null)).toBeNull();
  });
});

describe("metricsGrid", () => {
  it("lists the five measurements docs/12 C6 asks for", () => {
    const cells = metricsGrid(readVerificationMetrics(FULL));
    expect(cells.map((cell) => cell.key)).toEqual([
      "points",
      "maxGap",
      "avgSpeed",
      "plannedRatio",
      "mocked",
    ]);
    expect(cells[0]?.value).toBe("3,412");
    expect(cells[1]?.value).toBe("4 min");
    expect(cells[2]?.value).toBe("52.4 km/h");
  });

  it("drops a cell it has no number for, instead of showing a zero", () => {
    const cells = metricsGrid(readVerificationMetrics({ points: 120 }));
    expect(cells.map((cell) => cell.key)).toEqual(["points"]);
  });

  it("is empty for a trip the verifier has not measured", () => {
    expect(metricsGrid(EMPTY_VERIFICATION_METRICS)).toEqual([]);
  });
});

describe("reasonChips", () => {
  it("gives the geofence reasons their measured distance", () => {
    const chips = reasonChips(
      ["END_OUTSIDE_DROP", "START_OUTSIDE_PICKUP"],
      readVerificationMetrics(FULL),
    );
    expect(chips[0]).toEqual({
      code: "END_OUTSIDE_DROP",
      sentenceKey: "driver.summary.reasons.END_OUTSIDE_DROP",
      distance: { amount: "1.8", unit: "km" },
    });
    // 42 m must not be rounded to "0 km away".
    expect(chips[1]?.distance).toEqual({ amount: "42", unit: "m" });
  });

  it("leaves reasons it cannot measure without a distance", () => {
    const [chip] = reasonChips(["TRACKING_GAP"], readVerificationMetrics(FULL));
    expect(chip?.distance).toBeNull();
    expect(reasonDistanceKey(chip?.distance ?? null)).toBeNull();
  });

  it("picks the metres sentence below a kilometre and the km one above", () => {
    const [metres] = reasonChips(
      ["END_OUTSIDE_DROP"],
      readVerificationMetrics({ end_distance_m: 250 }),
    );
    expect(reasonDistanceKey(metres?.distance ?? null)).toEqual({
      key: "console.trip.reasonDistanceM",
      values: { m: "250" },
    });
    const [km] = reasonChips(
      ["END_OUTSIDE_DROP"],
      readVerificationMetrics({ end_distance_m: 1804 }),
    );
    expect(reasonDistanceKey(km?.distance ?? null)).toEqual({
      key: "console.trip.reasonDistance",
      values: { km: "1.8" },
    });
  });

  it("never renders a raw code — an unknown reason still gets a sentence", () => {
    const [chip] = reasonChips(["SOME_PHASE_2_CODE"], readVerificationMetrics(FULL));
    expect(chip?.sentenceKey).toBe("driver.summary.reasons.unknown");
  });

  it("has no chips for a trip that verified cleanly", () => {
    expect(reasonChips([], readVerificationMetrics(FULL))).toEqual([]);
  });
});
