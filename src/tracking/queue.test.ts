/**
 * Point queue (M8, TRD §4.3).
 *
 * The behaviour that matters: `seq` is allocated from persisted state (never
 * reused across a crash), rows are uploaded newest-last, and the ND-6 gate keeps
 * movement resolution while still emitting a keep-alive for a parked truck.
 */
import type { LocationObject } from "expo-location";

import { destinationPoint } from "@/lib/geo";
import {
  createMemoryTrackingStore,
  shouldRecord,
  selectPoints,
  toPointInput,
  type PointInput,
} from "@/tracking/queue";

const TRIP = "11111111-1111-4111-8111-111111111111";
const STARTED_AT = "2026-09-27T10:00:00.000Z";
const OPTIONS = { minMoveM: 25, heartbeatMs: 5 * 60_000 };

function location(
  overrides: Partial<LocationObject> = {},
  lat = 12.9698,
  lng = 79.9382,
): LocationObject {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      altitude: 250,
      accuracy: 8,
      altitudeAccuracy: 5,
      heading: 45,
      speed: 12.5,
    },
    timestamp: Date.parse(STARTED_AT),
    ...overrides,
  };
}

function fix(recordedAt: string, lat: number, lng: number): PointInput {
  return {
    recordedAt,
    lat,
    lng,
    accuracyM: 8,
    speedMps: 10,
    heading: 45,
    altitudeM: 250,
    isMocked: false,
  };
}

describe("toPointInput", () => {
  it("maps a fix onto the server's row shape", () => {
    expect(toPointInput(location())).toEqual({
      recordedAt: STARTED_AT,
      lat: 12.9698,
      lng: 79.9382,
      accuracyM: 8,
      speedMps: 12.5,
      heading: 45,
      altitudeM: 250,
      isMocked: false,
    });
  });

  it("carries the Android mocked flag (docs/06 §2)", () => {
    expect(toPointInput(location({ mocked: true }))?.isMocked).toBe(true);
  });

  it("keeps null accuracy rather than inventing a number", () => {
    const mapped = toPointInput(
      location({
        coords: {
          ...location().coords,
          accuracy: null,
          speed: null,
          heading: null,
          altitude: null,
        },
      }),
    );
    expect(mapped).toMatchObject({
      accuracyM: null,
      speedMps: null,
      heading: null,
      altitudeM: null,
    });
  });

  it("drops a non-finite coordinate", () => {
    expect(toPointInput(location({}, Number.NaN, 79.9382))).toBeNull();
  });

  it("drops an out-of-range coordinate", () => {
    expect(toPointInput(location({}, 91, 79.9382))).toBeNull();
    expect(toPointInput(location({}, 12.9, -181))).toBeNull();
  });

  it("drops a fix with no usable timestamp", () => {
    expect(toPointInput(location({ timestamp: Number.NaN }))).toBeNull();
  });
});

describe("shouldRecord (ND-6)", () => {
  const base = { lat: 12.9698, lng: 79.9382, recordedAt: STARTED_AT };

  it("keeps the first point", () => {
    expect(shouldRecord(null, base, OPTIONS)).toBe(true);
  });

  it("keeps a point once the truck has moved 25 m", () => {
    const moved = destinationPoint(base, 30, 0);
    expect(shouldRecord(base, { ...moved, recordedAt: "2026-09-27T10:00:10.000Z" }, OPTIONS)).toBe(
      true,
    );
  });

  it("drops a short move inside the heartbeat window", () => {
    const nudged = destinationPoint(base, 5, 0);
    expect(shouldRecord(base, { ...nudged, recordedAt: "2026-09-27T10:00:10.000Z" }, OPTIONS)).toBe(
      false,
    );
  });

  it("keeps a parked keep-alive after the heartbeat", () => {
    expect(shouldRecord(base, { ...base, recordedAt: "2026-09-27T10:05:00.000Z" }, OPTIONS)).toBe(
      true,
    );
  });

  it("does not treat a backwards clock as a heartbeat", () => {
    expect(shouldRecord(base, { ...base, recordedAt: "2026-09-27T09:59:00.000Z" }, OPTIONS)).toBe(
      false,
    );
  });

  it("keeps a point when the timestamp cannot be parsed", () => {
    expect(shouldRecord(base, { ...base, recordedAt: "not-a-date" }, OPTIONS)).toBe(true);
  });
});

describe("selectPoints", () => {
  it("collapses a parked burst to the heartbeat", () => {
    const base = { lat: 12.9698, lng: 79.9382, recordedAt: STARTED_AT };
    // Six stationary fixes, ten seconds apart: only the first is kept, because
    // the heartbeat has not elapsed.
    const burst: PointInput[] = [];
    for (let index = 1; index <= 6; index += 1) {
      burst.push(
        fix(new Date(Date.parse(STARTED_AT) + index * 10_000).toISOString(), base.lat, base.lng),
      );
    }
    expect(selectPoints(base, burst, OPTIONS)).toHaveLength(0);
  });

  it("keeps every fix of a moving burst", () => {
    const base = { lat: 12.9698, lng: 79.9382, recordedAt: STARTED_AT };
    const burst: PointInput[] = [];
    let cursor = base;
    for (let index = 1; index <= 6; index += 1) {
      const moved = destinationPoint(cursor, 30, 45);
      burst.push(
        fix(new Date(Date.parse(STARTED_AT) + index * 10_000).toISOString(), moved.lat, moved.lng),
      );
      cursor = { ...moved, recordedAt: STARTED_AT };
    }
    expect(selectPoints(base, burst, OPTIONS)).toHaveLength(6);
  });
});

describe("memory store", () => {
  function seeded() {
    return createMemoryTrackingStore({
      tripId: TRIP,
      state: "TRACKING",
      nextSeq: 0,
      startedAt: STARTED_AT,
    });
  }

  it("allocates seq from 1 upwards", async () => {
    const store = seeded();
    await store.insertPoints(TRIP, [fix(STARTED_AT, 1, 1), fix(STARTED_AT, 2, 2)]);
    const rows = await store.pendingPoints(TRIP, 10);
    expect(rows.map((row) => row.seq)).toEqual([1, 2]);
    expect(await store.readState()).toMatchObject({ nextSeq: 2 });
  });

  it("never reuses a seq after a crash — the counter is persisted, not in memory", async () => {
    const store = seeded();
    await store.insertPoints(TRIP, [fix(STARTED_AT, 1, 1), fix(STARTED_AT, 2, 2)]);

    // Simulate process death: a brand-new store seeded only from the persisted
    // state row.
    const recovered = createMemoryTrackingStore(await store.readState());
    await recovered.insertPoints(TRIP, [fix(STARTED_AT, 3, 3)]);

    expect(await recovered.maxSeq(TRIP)).toBe(3);
  });

  it("refuses points for a trip that is not the active one", async () => {
    const store = seeded();
    expect(await store.insertPoints("other-trip", [fix(STARTED_AT, 1, 1)])).toBe(0);
  });

  it("excludes uploaded and quarantined rows from pending, and caps the limit", async () => {
    const store = seeded();
    await store.insertPoints(TRIP, [
      fix(STARTED_AT, 1, 1),
      fix(STARTED_AT, 2, 2),
      fix(STARTED_AT, 3, 3),
      fix(STARTED_AT, 4, 4),
    ]);
    await store.markUploaded(TRIP, [1]);
    await store.quarantine(TRIP, [3], "REJECTED");

    const pending = await store.pendingPoints(TRIP, 10);
    expect(pending.map((row) => row.seq)).toEqual([2, 4]);
    expect(await store.pendingPoints(TRIP, 1)).toHaveLength(1);
    expect(await store.countPoints(TRIP)).toEqual({
      total: 4,
      uploaded: 1,
      quarantined: 1,
      pending: 2,
    });
  });

  it("marks only rows that are not already uploaded", async () => {
    const store = seeded();
    await store.insertPoints(TRIP, [fix(STARTED_AT, 1, 1)]);
    expect(await store.markUploaded(TRIP, [1])).toBe(1);
    expect(await store.markUploaded(TRIP, [1])).toBe(0);
  });

  it("records the quarantine reason", async () => {
    const store = seeded();
    await store.insertPoints(TRIP, [fix(STARTED_AT, 1, 1)]);
    await store.quarantine(TRIP, [1], "POISON");
    const rows = await store.pendingPoints(TRIP, 10);
    expect(rows).toHaveLength(0);
    expect((await store.lastPoint(TRIP))?.quarantineReason).toBe("POISON");
  });

  it("deletes only the uploaded rows once a trip is final", async () => {
    const store = seeded();
    await store.insertPoints(TRIP, [fix(STARTED_AT, 1, 1), fix(STARTED_AT, 2, 2)]);
    await store.markUploaded(TRIP, [1]);
    expect(await store.deleteUploaded(TRIP)).toBe(1);
    expect(await store.countPoints(TRIP)).toMatchObject({ total: 1, pending: 1 });
  });

  it("returns the last point by seq, and 0 as maxSeq when empty", async () => {
    const store = seeded();
    expect(await store.lastPoint(TRIP)).toBeNull();
    expect(await store.maxSeq(TRIP)).toBe(0);

    await store.insertPoints(TRIP, [fix(STARTED_AT, 1, 1), fix(STARTED_AT, 2, 2)]);
    expect((await store.lastPoint(TRIP))?.seq).toBe(2);
  });

  it("clears the trip it was asked to clear, and resets itself to IDLE", async () => {
    const store = seeded();
    await store.insertPoints(TRIP, [fix(STARTED_AT, 1, 1)]);
    await store.clearTrip(TRIP);
    expect(await store.readState()).toEqual({
      tripId: null,
      state: "IDLE",
      nextSeq: 0,
      startedAt: null,
      endedAt: null,
      endLat: null,
      endLng: null,
      endAccuracy: null,
    });
  });

  it("starts a fresh seq counter when a new trip begins", async () => {
    const store = seeded();
    await store.insertPoints(TRIP, [fix(STARTED_AT, 1, 1)]);
    const nextTrip = "22222222-2222-4222-8222-222222222222";
    await store.writeState({
      tripId: nextTrip,
      state: "TRACKING",
      nextSeq: 0,
      startedAt: STARTED_AT,
      endedAt: null,
      endLat: null,
      endLng: null,
      endAccuracy: null,
    });
    await store.insertPoints(nextTrip, [fix(STARTED_AT, 1, 1)]);
    expect((await store.pendingPoints(nextTrip, 10)).map((row) => row.seq)).toEqual([1]);
  });
});
