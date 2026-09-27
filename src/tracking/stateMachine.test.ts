/**
 * Trip state machine (M8, TRD §4.1, docs/06 §1).
 *
 * Two halves: the pure reducer (every transition, and every event that must be
 * ignored) and the service (start, end, resume) driven through injected
 * dependencies so the offline paths and the "app was killed" paths are real
 * tests rather than device folklore.
 */
import {
  createMemoryTrackingStore,
  type PointInput,
  type TrackingStore,
  type TripStateRow,
} from "@/tracking/queue";
import { createTrackingService, reduce, type TrackingDeps } from "@/tracking/stateMachine";
import { EMPTY_FLUSH, type FlushResult } from "@/tracking/uploader";

const TRIP = "11111111-1111-4111-8111-111111111111";
const STARTED_AT = "2026-09-27T10:00:00.000Z";
const NOW = Date.parse("2026-09-27T12:00:00.000Z");

function tracking(overrides: Partial<TripStateRow> = {}): TripStateRow {
  return {
    tripId: TRIP,
    state: "TRACKING",
    nextSeq: 0,
    startedAt: STARTED_AT,
    endedAt: null,
    endLat: null,
    endLng: null,
    endAccuracy: null,
    ...overrides,
  };
}

function pendingFlush(message = "offline"): FlushResult {
  return { uploaded: 0, quarantined: 0, network: true, message };
}

type Harness = {
  store: TrackingStore;
  service: ReturnType<typeof createTrackingService>;
  calls: {
    startRpc: number;
    endRpc: number;
    startUpdates: number;
    stopUpdates: number;
    flush: number;
  };
  lastEndArgs: Parameters<TrackingDeps["endTripRpc"]>[0] | null;
  setFlush: (result: FlushResult) => void;
  setEndRpc: (outcome: Awaited<ReturnType<TrackingDeps["endTripRpc"]>>) => void;
};

function harness(initial?: Partial<TripStateRow>, overrides: Partial<TrackingDeps> = {}): Harness {
  const store = createMemoryTrackingStore(initial);
  const calls = { startRpc: 0, endRpc: 0, startUpdates: 0, stopUpdates: 0, flush: 0 };
  let flushResult: FlushResult = EMPTY_FLUSH;
  let endOutcome: Awaited<ReturnType<TrackingDeps["endTripRpc"]>> = {
    ok: true,
    status: "completed",
  };
  const state: Harness = {
    store,
    service: undefined as unknown as ReturnType<typeof createTrackingService>,
    calls,
    lastEndArgs: null,
    setFlush: (result) => {
      flushResult = result;
    },
    setEndRpc: (outcome) => {
      endOutcome = outcome;
    },
  };

  const deps: TrackingDeps = {
    store,
    now: () => NOW,
    getFreshFix: async () => ({ lat: 12.9698, lng: 79.9382, accuracyM: 8 }),
    startTripRpc: async () => {
      calls.startRpc += 1;
      return { ok: true, startedAt: STARTED_AT };
    },
    endTripRpc: async (args) => {
      calls.endRpc += 1;
      state.lastEndArgs = args;
      return endOutcome;
    },
    startLocationUpdates: async () => {
      calls.startUpdates += 1;
    },
    stopLocationUpdates: async () => {
      calls.stopUpdates += 1;
    },
    flush: async () => {
      calls.flush += 1;
      return flushResult;
    },
    ...overrides,
  };

  state.service = createTrackingService(deps);
  return state;
}

async function seedPoints(store: TrackingStore, count: number): Promise<number> {
  const points: PointInput[] = [];
  for (let index = 1; index <= count; index += 1) {
    points.push({
      recordedAt: new Date(Date.parse(STARTED_AT) + index * 5_000).toISOString(),
      lat: 12.9 + index * 0.001,
      lng: 79.9,
      accuracyM: 5,
      speedMps: 10,
      heading: 0,
      altitudeM: null,
      isMocked: false,
    });
  }
  return store.insertPoints(TRIP, points);
}

describe("reduce", () => {
  it("goes IDLE → TRACKING on STARTED", () => {
    const next = reduce(tracking({ state: "IDLE", tripId: null, startedAt: null, nextSeq: 3 }), {
      type: "STARTED",
      tripId: TRIP,
      startedAt: STARTED_AT,
    });
    expect(next).toEqual({
      tripId: TRIP,
      state: "TRACKING",
      nextSeq: 0,
      startedAt: STARTED_AT,
      endedAt: null,
      endLat: null,
      endLng: null,
      endAccuracy: null,
    });
  });

  it("goes TRACKING → ENDING on END_REQUESTED, carrying the end fix and time", () => {
    const next = reduce(tracking(), {
      type: "END_REQUESTED",
      endedAt: "2026-09-27T11:00:00.000Z",
      lat: 10.99,
      lng: 76.95,
      accuracyM: 12,
    });
    expect(next).toMatchObject({
      state: "ENDING",
      endedAt: "2026-09-27T11:00:00.000Z",
      endLat: 10.99,
      endLng: 76.95,
      endAccuracy: 12,
    });
  });

  it("goes ENDING → ENDED on END_CONFIRMED", () => {
    expect(reduce(tracking({ state: "ENDING" }), { type: "END_CONFIRMED" }).state).toBe("ENDED");
  });

  it("goes ENDING → ENDED_PENDING_SYNC on END_OFFLINE", () => {
    expect(reduce(tracking({ state: "ENDING" }), { type: "END_OFFLINE" }).state).toBe(
      "ENDED_PENDING_SYNC",
    );
  });

  it("goes ENDED_PENDING_SYNC → ENDED on END_CONFIRMED", () => {
    expect(reduce(tracking({ state: "ENDED_PENDING_SYNC" }), { type: "END_CONFIRMED" }).state).toBe(
      "ENDED",
    );
  });

  it("resets only from ENDED", () => {
    expect(reduce(tracking({ state: "ENDED" }), { type: "RESET" }).state).toBe("IDLE");
  });

  it("returns the same object for an event that does not apply", () => {
    // Identity (`toBe`) is the contract: callers use it to tell "nothing
    // changed" and skip a redundant write.
    const idle = tracking({ state: "IDLE", tripId: null, startedAt: null });
    expect(
      reduce(idle, {
        type: "END_REQUESTED",
        endedAt: STARTED_AT,
        lat: null,
        lng: null,
        accuracyM: null,
      }),
    ).toBe(idle);
    expect(reduce(idle, { type: "END_CONFIRMED" })).toBe(idle);
    expect(reduce(idle, { type: "END_OFFLINE" })).toBe(idle);
    expect(reduce(idle, { type: "RESET" })).toBe(idle);

    const ended = tracking({ state: "ENDED" });
    expect(reduce(ended, { type: "STARTED", tripId: TRIP, startedAt: STARTED_AT })).toBe(ended);
    expect(reduce(ended, { type: "END_OFFLINE" })).toBe(ended);

    const running = tracking();
    expect(reduce(running, { type: "STARTED", tripId: TRIP, startedAt: STARTED_AT })).toBe(running);
    expect(reduce(running, { type: "END_CONFIRMED" })).toBe(running);
    expect(reduce(running, { type: "RESET" })).toBe(running);
  });
});

describe("startTrip", () => {
  it("persists TRACKING and starts the task only after the RPC agrees", async () => {
    const h = harness();
    const result = await h.service.startTrip(TRIP);

    expect(result.kind).toBe("started");
    expect(h.calls.startRpc).toBe(1);
    expect(h.calls.startUpdates).toBe(1);
    expect(await h.store.readState()).toMatchObject({
      tripId: TRIP,
      state: "TRACKING",
      startedAt: STARTED_AT,
      nextSeq: 0,
    });
  });

  it("never starts the location task when the RPC fails", async () => {
    const h = harness(undefined, {
      startTripRpc: async () => ({ ok: false, error: { message: "GPS_ACCURACY_TOO_LOW" } }),
    });

    const result = await h.service.startTrip(TRIP);
    expect(result).toEqual({
      kind: "failed",
      error: { code: "GPS_ACCURACY_TOO_LOW", message: "GPS_ACCURACY_TOO_LOW" },
    });
    expect(h.calls.startUpdates).toBe(0);
    expect((await h.store.readState()).state).toBe("IDLE");
  });

  it("surfaces the parsed OUTSIDE_PICKUP distance", async () => {
    const h = harness(undefined, {
      startTripRpc: async () => ({ ok: false, error: "OUTSIDE_PICKUP:3210" }),
    });
    const result = await h.service.startTrip(TRIP);
    expect(result).toMatchObject({
      kind: "failed",
      error: { code: "OUTSIDE_PICKUP", outsidePickupM: 3210 },
    });
  });

  it("refuses to call the RPC at all without a fix", async () => {
    const h = harness(undefined, { getFreshFix: async () => null });
    const result = await h.service.startTrip(TRIP);
    expect(result).toMatchObject({ kind: "failed", error: { code: "GPS_UNAVAILABLE" } });
    expect(h.calls.startRpc).toBe(0);
    expect(h.calls.startUpdates).toBe(0);
  });

  it("is idempotent for the trip already tracking", async () => {
    const h = harness(tracking());
    expect((await h.service.startTrip(TRIP)).kind).toBe("already_tracking");
    expect(h.calls.startRpc).toBe(0);
  });

  it("refuses a second trip while one is in flight", async () => {
    const h = harness(tracking({ tripId: "22222222-2222-4222-8222-222222222222" }));
    const result = await h.service.startTrip(TRIP);
    expect(result).toMatchObject({ kind: "failed", error: { code: "ANOTHER_TRIP_ACTIVE" } });
    expect(h.calls.startRpc).toBe(0);
  });
});

describe("endTrip", () => {
  it("stops the task, flushes, then calls end_trip with the last seq", async () => {
    const h = harness(tracking());
    await seedPoints(h.store, 4);

    const result = await h.service.endTrip();
    expect(result.kind).toBe("ended");
    expect(h.calls.stopUpdates).toBe(1);
    expect(h.calls.flush).toBe(1);
    expect(h.calls.endRpc).toBe(1);
    expect(h.lastEndArgs).toMatchObject({ tripId: TRIP, expectedPoints: 4 });
    expect((await h.store.readState()).state).toBe("ENDED");
  });

  it("works offline: ENDED_PENDING_SYNC, no end_trip call", async () => {
    const h = harness(tracking());
    await seedPoints(h.store, 2);
    h.setFlush(pendingFlush());

    const result = await h.service.endTrip();
    expect(result.kind).toBe("pending");
    expect(h.calls.endRpc).toBe(0);
    expect((await h.store.readState()).state).toBe("ENDED_PENDING_SYNC");
    // The end position and time were persisted before the network was touched.
    expect((await h.store.readState()).endedAt).not.toBeNull();
  });

  it("treats a network failure on end_trip as pending too", async () => {
    const h = harness(tracking());
    h.setEndRpc({ ok: false, error: { message: "Network request failed" } });

    const result = await h.service.endTrip();
    expect(result.kind).toBe("pending");
    expect((await h.store.readState()).state).toBe("ENDED_PENDING_SYNC");
  });

  it("treats TRIP_NOT_ACTIVE as success — it is already ended", async () => {
    const h = harness(tracking());
    h.setEndRpc({ ok: false, error: { message: "TRIP_NOT_ACTIVE" } });

    const result = await h.service.endTrip();
    expect(result.kind).toBe("ended");
    expect((await h.store.readState()).state).toBe("ENDED");
  });

  it("deletes uploaded rows once the trip is final", async () => {
    const h = harness(tracking());
    await seedPoints(h.store, 3);
    await h.store.markUploaded(TRIP, [1, 2]);

    await h.service.endTrip();
    expect(await h.store.countPoints(TRIP)).toMatchObject({ total: 1 });
  });

  it("fails when nothing is being recorded", async () => {
    const h = harness();
    const result = await h.service.endTrip();
    expect(result).toMatchObject({ kind: "failed", error: { code: "TRIP_NOT_FOUND" } });
  });

  it("retries a pending end without stopping the task again", async () => {
    const h = harness(tracking({ state: "ENDED_PENDING_SYNC", endedAt: STARTED_AT }));
    h.setEndRpc({ ok: true, status: "verified" });

    const result = await h.service.endTrip();
    expect(result).toMatchObject({ kind: "ended", tripStatus: "verified" });
    expect(h.calls.stopUpdates).toBe(0);
    expect((await h.store.readState()).state).toBe("ENDED");
  });
});

describe("resumeOnLaunch", () => {
  it("does nothing when idle", async () => {
    const h = harness();
    expect((await h.service.resumeOnLaunch()).kind).toBe("idle");
    expect(h.calls.startUpdates).toBe(0);
  });

  it("restarts the task and flushes after a kill", async () => {
    // The state row survived the process death; only the OS task is gone.
    const h = harness(tracking({ nextSeq: 3 }));
    await seedPoints(h.store, 3);

    const result = await h.service.resumeOnLaunch();
    expect(result.kind).toBe("resumed");
    expect(h.calls.startUpdates).toBe(1);
    expect(h.calls.flush).toBe(1);
    expect((await h.store.readState()).state).toBe("TRACKING");
  });

  it("finishes an offline end once the network returns", async () => {
    const h = harness(
      tracking({ state: "ENDED_PENDING_SYNC", endedAt: "2026-09-27T11:00:00.000Z" }),
    );
    await seedPoints(h.store, 2);
    h.setEndRpc({ ok: true, status: "completed" });

    const result = await h.service.resumeOnLaunch();
    expect(result.kind).toBe("synced");
    expect(h.calls.endRpc).toBe(1);
    expect(h.lastEndArgs).toMatchObject({ expectedPoints: 2 });
    expect((await h.store.readState()).state).toBe("ENDED");
  });

  it("stays pending when still offline", async () => {
    const h = harness(
      tracking({ state: "ENDED_PENDING_SYNC", endedAt: "2026-09-27T11:00:00.000Z" }),
    );
    h.setFlush(pendingFlush());

    expect((await h.service.resumeOnLaunch()).kind).toBe("pending");
    expect(h.calls.endRpc).toBe(0);
    expect((await h.store.readState()).state).toBe("ENDED_PENDING_SYNC");
  });

  it("cleans up an ENDED trip without restarting anything", async () => {
    const h = harness(tracking({ state: "ENDED", endedAt: STARTED_AT }));
    await seedPoints(h.store, 2);
    await h.store.markUploaded(TRIP, [1]);

    expect((await h.service.resumeOnLaunch()).kind).toBe("idle");
    expect(await h.store.countPoints(TRIP)).toMatchObject({ total: 1 });
    expect(h.calls.startUpdates).toBe(0);
  });
});
