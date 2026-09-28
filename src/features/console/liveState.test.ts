/**
 * C1 rule tests (M11, docs/12 C1).
 *
 * The board's job is to make a quiet truck obvious. Everything that decides
 * "quiet" is a pure function, so these are the assertions that matter: the
 * 15-minute threshold, the red row, and the KPI strip agreeing with the list.
 */
import {
  ageParts,
  isStale,
  kmPerHour,
  kpiStrip,
  liveMarker,
  liveMapView,
  liveTail,
  sortLiveTrips,
  STALE_AFTER_MS,
  type LiveTrip,
} from "./liveState";

const NOW = Date.parse("2026-09-28T06:00:00.000Z");

function live(overrides: Partial<LiveTrip> = {}): LiveTrip {
  return {
    tripId: "trip-1",
    driverId: "driver-1",
    driverName: "Murugan S",
    vehicleNo: "TN 23 BK 4521",
    loadCode: "NL-2026-000142",
    pickupAddress: "Sriperumbudur",
    dropAddress: "Coimbatore",
    position: { lat: 11.02, lng: 77.1 },
    heading: 275,
    speedMps: 12.5,
    accuracyM: 8,
    recordedAt: new Date(NOW - 40_000).toISOString(),
    pickup: { lat: 12.97, lng: 79.94 },
    drop: { lat: 11.02, lng: 76.96 },
    dropRadiusM: 500,
    ...overrides,
  };
}

describe("ageParts", () => {
  it("counts in seconds, then minutes, then hours", () => {
    expect(ageParts(new Date(NOW - 20_000).toISOString(), NOW)).toEqual({
      unit: "seconds",
      count: 20,
    });
    expect(ageParts(new Date(NOW - 18 * 60_000).toISOString(), NOW)).toEqual({
      unit: "minutes",
      count: 18,
    });
    expect(ageParts(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toEqual({
      unit: "hours",
      count: 3,
    });
  });

  it("returns null for a missing or unreadable timestamp", () => {
    expect(ageParts(null, NOW)).toBeNull();
    expect(ageParts("not-a-date", NOW)).toBeNull();
  });

  it("clamps a clock skew to zero rather than showing a negative age", () => {
    expect(ageParts(new Date(NOW + 60_000).toISOString(), NOW)).toEqual({
      unit: "seconds",
      count: 0,
    });
  });
});

describe("isStale — the 15-minute rule", () => {
  it("is fresh inside the threshold", () => {
    expect(isStale(new Date(NOW - (STALE_AFTER_MS - 1_000)).toISOString(), NOW)).toBe(false);
  });

  it("is stale past 15 minutes, which is what C1 highlights in red", () => {
    expect(isStale(new Date(NOW - 18 * 60_000).toISOString(), NOW)).toBe(true);
  });

  it("treats an unreadable timestamp as stale — silence is not health", () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale("nonsense", NOW)).toBe(true);
  });
});

describe("sortLiveTrips", () => {
  it("puts fresh trucks first and stale ones at the bottom", () => {
    const stale = live({ tripId: "stale", recordedAt: new Date(NOW - 20 * 60_000).toISOString() });
    const fresh = live({ tripId: "fresh" });
    expect(sortLiveTrips([stale, fresh], NOW).map((row) => row.tripId)).toEqual(["fresh", "stale"]);
  });

  it("orders the fresh ones by most recent report", () => {
    const older = live({ tripId: "older", recordedAt: new Date(NOW - 300_000).toISOString() });
    const newer = live({ tripId: "newer", recordedAt: new Date(NOW - 10_000).toISOString() });
    expect(sortLiveTrips([older, newer], NOW).map((row) => row.tripId)).toEqual(["newer", "older"]);
  });
});

describe("kpiStrip", () => {
  it("derives live and stale from the rows it is given", () => {
    const kpis = kpiStrip({
      trips: [
        live({ tripId: "a" }),
        live({ tripId: "b" }),
        live({ tripId: "c", recordedAt: new Date(NOW - 40 * 60_000).toISOString() }),
      ],
      nowMs: NOW,
      assignedToday: 12,
      needsReview: 3,
    });

    expect(kpis).toEqual([
      { key: "live", value: 3 },
      { key: "stale", value: 1 },
      { key: "assignedToday", value: 12 },
      { key: "needsReview", value: 3 },
    ]);
  });

  it("reports zeros rather than hiding the strip when nothing is live", () => {
    const kpis = kpiStrip({ trips: [], nowMs: NOW, assignedToday: 0, needsReview: 0 });
    expect(kpis.every((kpi) => kpi.value === 0)).toBe(true);
  });
});

describe("map geometry", () => {
  it("rotates the truck marker by the reported heading", () => {
    expect(liveMarker(live({ heading: 92 })).heading).toBe(92);
  });

  it("leaves the rotation off when the device had no heading", () => {
    expect(liveMarker(live({ heading: null })).heading).toBeUndefined();
  });

  it("draws a tail from the pickup to where the truck is now", () => {
    const tail = liveTail(live());
    expect(tail?.kind).toBe("actual");
    expect(tail?.path[0]).toEqual({ lat: 12.97, lng: 79.94 });
  });

  it("skips a tail for a truck still sitting on the pickup", () => {
    const parked = live({ position: { lat: 12.97, lng: 79.94 } });
    expect(liveTail(parked)).toBeNull();
  });

  it("centres the map on the fleet rather than on a default", () => {
    const view = liveMapView([live()]);
    expect(view.center).toEqual({ lat: 11.02, lng: 77.1 });
    expect(view.markers).toHaveLength(1);
  });

  it("has no centre to give when nothing is live", () => {
    expect(liveMapView([]).center).toBeUndefined();
  });
});

describe("kmPerHour", () => {
  it("converts m/s to whole km/h", () => {
    expect(kmPerHour(25)).toBe(90);
    expect(kmPerHour(12.4)).toBe(45);
  });

  it("returns null rather than a zero for a missing or negative reading", () => {
    expect(kmPerHour(null)).toBeNull();
    expect(kmPerHour(-1)).toBeNull();
    expect(kmPerHour(Number.NaN)).toBeNull();
  });
});
