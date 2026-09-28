import {
  agoParts,
  approxDistanceM,
  STALE_POINT_MS,
  distanceToDropM,
  formatElapsed,
  isNearDrop,
  lastUploadedAt,
  liveGpsState,
  liveStats,
  liveSyncState,
  trackingProblem,
  type LivePoint,
} from "./liveState";
import { destinationPoint } from "@/lib/geo";

const PICKUP = { lat: 12.9675, lng: 79.9475 };
const DROP = { lat: 10.9975, lng: 76.9625 };

function point(overrides: Partial<LivePoint> = {}): LivePoint {
  return {
    lat: PICKUP.lat,
    lng: PICKUP.lng,
    recordedAt: "2026-09-28T06:00:00.000Z",
    accuracyM: 10,
    uploaded: false,
    ...overrides,
  };
}

describe("liveSyncState", () => {
  it("reports offline even when points are also waiting", () => {
    expect(liveSyncState({ offline: true, pendingPoints: 142 })).toBe("offline");
  });

  it("reports pending only when the queue still owes the server", () => {
    expect(liveSyncState({ offline: false, pendingPoints: 142 })).toBe("pending");
    expect(liveSyncState({ offline: false, pendingPoints: 0 })).toBe("synced");
  });
});

describe("liveGpsState", () => {
  it("is lost with no point at all", () => {
    expect(liveGpsState(null)).toBe("lost");
  });

  it("uses the verifier's 50 m threshold", () => {
    expect(liveGpsState(point({ accuracyM: 50 }))).toBe("good");
    expect(liveGpsState(point({ accuracyM: 51 }))).toBe("weak");
  });

  it("treats a point without an accuracy reading as usable", () => {
    expect(liveGpsState(point({ accuracyM: null }))).toBe("good");
  });
});

describe("trackingProblem", () => {
  const now = Date.parse("2026-09-28T06:10:00.000Z");

  it("says nothing while a point has arrived recently", () => {
    expect(
      trackingProblem({
        lastPointAt: "2026-09-28T06:09:00.000Z",
        startedAt: "2026-09-28T06:00:00.000Z",
        now,
        permissionsOk: true,
      }),
    ).toBeNull();
  });

  it("flags a gap longer than two minutes, but not the boundary itself", () => {
    expect(
      trackingProblem({
        lastPointAt: new Date(now - STALE_POINT_MS).toISOString(),
        startedAt: "2026-09-28T06:00:00.000Z",
        now,
        permissionsOk: true,
      }),
    ).toBeNull();

    expect(
      trackingProblem({
        lastPointAt: new Date(now - STALE_POINT_MS - 1_000).toISOString(),
        startedAt: "2026-09-28T06:00:00.000Z",
        now,
        permissionsOk: true,
      }),
    ).toBe("stale");
  });

  it("measures from the trip start when no point has arrived at all", () => {
    expect(
      trackingProblem({
        lastPointAt: null,
        startedAt: "2026-09-28T06:05:00.000Z",
        now,
        permissionsOk: true,
      }),
    ).toBe("stale");
  });

  it("lets a revoked permission outrank staleness — it is the fixable cause", () => {
    expect(
      trackingProblem({
        lastPointAt: "2026-09-28T05:00:00.000Z",
        startedAt: "2026-09-28T04:00:00.000Z",
        now,
        permissionsOk: false,
      }),
    ).toBe("permission");
  });

  it("says nothing when the trip has no start and no points yet", () => {
    expect(
      trackingProblem({ lastPointAt: null, startedAt: null, now, permissionsOk: true }),
    ).toBeNull();
  });
});

describe("approxDistanceM", () => {
  it("adds the trace up", () => {
    const second = destinationPoint(PICKUP, 1_000, 0);
    const third = destinationPoint(second, 1_000, 90);
    const total = approxDistanceM([point(), point(second), point(third)]);
    expect(total).toBeGreaterThan(1_950);
    expect(total).toBeLessThan(2_050);
  });

  it("leaves out the points the verifier would drop (> 50 m accuracy)", () => {
    const far = destinationPoint(PICKUP, 5_000, 0);
    const noisy = [point(), point({ ...far, accuracyM: 120 })];
    expect(approxDistanceM(noisy)).toBe(0);
  });

  it("is zero for a trace that never moved", () => {
    expect(approxDistanceM([point(), point()])).toBe(0);
  });
});

describe("formatElapsed", () => {
  const start = "2026-09-28T03:00:00.000Z";

  it("pads the minutes once there are hours", () => {
    expect(formatElapsed(start, Date.parse("2026-09-28T06:05:00.000Z"))).toBe("3h 05m");
  });

  it("drops the hours below an hour", () => {
    expect(formatElapsed(start, Date.parse("2026-09-28T03:42:00.000Z"))).toBe("42m");
  });

  it("reads as 0m without a start", () => {
    expect(formatElapsed(null, Date.now())).toBe("0m");
  });
});

describe("distance and the drop geofence", () => {
  it("rounds to whole metres and handles a missing fix", () => {
    expect(distanceToDropM(null, DROP)).toBeNull();
    expect(distanceToDropM(PICKUP, DROP)).toBeGreaterThan(300_000);
  });

  it("counts the boundary itself as inside", () => {
    const inside = destinationPoint(DROP, 499, 0);
    const outside = destinationPoint(DROP, 501, 0);
    expect(isNearDrop({ last: inside, drop: DROP, dropRadiusM: 500 })).toBe(true);
    expect(isNearDrop({ last: outside, drop: DROP, dropRadiusM: 500 })).toBe(false);
    expect(isNearDrop({ last: null, drop: DROP, dropRadiusM: 500 })).toBe(false);
  });
});

describe("liveStats", () => {
  it("summarises a running trip", () => {
    const points = [
      point({ recordedAt: "2026-09-28T03:00:00.000Z" }),
      point({ ...destinationPoint(PICKUP, 2_000, 0), recordedAt: "2026-09-28T03:01:00.000Z" }),
    ];
    const stats = liveStats({
      points,
      startedAt: "2026-09-28T03:00:00.000Z",
      drop: DROP,
      dropRadiusM: 500,
      now: Date.parse("2026-09-28T06:05:00.000Z"),
    });
    expect(stats.elapsed).toBe("3h 05m");
    expect(stats.approxKm).toBe(2);
    // Straight line from the 2 km mark to the drop (Sriperumbudur → Coimbatore
    // is ~393 km as the crow flies), rounded to whole km.
    expect(stats.kmToDrop).toBe(393);
    expect(stats.nearDrop).toBe(false);
    expect(stats.last?.lat).toBeCloseTo(points[1]!.lat, 5);
  });

  it("has no to-drop figure before the load is known", () => {
    const stats = liveStats({
      points: [point()],
      startedAt: "2026-09-28T03:00:00.000Z",
      drop: null,
      dropRadiusM: 500,
      now: Date.parse("2026-09-28T03:05:00.000Z"),
    });
    expect(stats.kmToDrop).toBeNull();
    expect(stats.nearDrop).toBe(false);
  });

  it("highlights END once the truck is inside the drop circle", () => {
    const stats = liveStats({
      points: [
        point({ ...destinationPoint(DROP, 100, 0), recordedAt: "2026-09-28T03:00:00.000Z" }),
      ],
      startedAt: "2026-09-28T03:00:00.000Z",
      drop: DROP,
      dropRadiusM: 500,
      now: Date.parse("2026-09-28T03:05:00.000Z"),
    });
    expect(stats.nearDrop).toBe(true);
    expect(stats.kmToDrop).toBe(0);
  });
});

describe("lastUploadedAt", () => {
  it("picks the newest row the server has acknowledged", () => {
    expect(
      lastUploadedAt([
        point({ recordedAt: "2026-09-28T03:00:00.000Z", uploaded: true }),
        point({ recordedAt: "2026-09-28T03:05:00.000Z", uploaded: false }),
        point({ recordedAt: "2026-09-28T03:02:00.000Z", uploaded: true }),
      ]),
    ).toBe("2026-09-28T03:02:00.000Z");
  });

  it("is null when nothing has synced yet", () => {
    expect(lastUploadedAt([point(), point({ recordedAt: "2026-09-28T03:05:00.000Z" })])).toBeNull();
    expect(lastUploadedAt([])).toBeNull();
  });
});

describe("agoParts", () => {
  const now = Date.parse("2026-09-28T06:00:00.000Z");

  it("switches unit with the size of the gap", () => {
    expect(agoParts("2026-09-28T05:59:40.000Z", now)).toEqual({ unit: "seconds", count: 20 });
    expect(agoParts("2026-09-28T05:55:00.000Z", now)).toEqual({ unit: "minutes", count: 5 });
    expect(agoParts("2026-09-28T03:00:00.000Z", now)).toEqual({ unit: "hours", count: 3 });
  });

  it("is null for an unparseable time", () => {
    expect(agoParts("not-a-date", now)).toBeNull();
  });
});
