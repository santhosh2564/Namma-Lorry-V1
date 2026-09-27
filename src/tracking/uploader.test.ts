/**
 * Uploader (M8, TRD §4.3, ND-8).
 *
 * These tests are about the guarantees, not the plumbing: one batch at a time,
 * a retry never duplicates a point, a dead network never drops one, and a single
 * rejected row can never wedge the queue.
 */
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, UPLOAD_BATCH_SIZE } from "@/tracking/config";
import {
  createMemoryTrackingStore,
  type PointInput,
  type PointQueueRow,
  type TrackingStore,
} from "@/tracking/queue";
import {
  computeBackoff,
  createUploader,
  isUploadable,
  toUploadRow,
  type TimerApi,
  type UploadOutcome,
  type UploadRow,
  type UploaderDeps,
} from "@/tracking/uploader";

const TRIP = "11111111-1111-4111-8111-111111111111";
const STARTED_AT = "2026-09-27T10:00:00.000Z";
const NOW = Date.parse("2026-09-28T10:00:00.000Z");

function input(index: number, recordedAt = STARTED_AT): PointInput {
  return {
    recordedAt: new Date(Date.parse(recordedAt) + index * 1_000).toISOString(),
    lat: 12.9 + index * 0.001,
    lng: 79.9,
    accuracyM: 5,
    speedMps: 10,
    heading: 0,
    altitudeM: null,
    isMocked: false,
  };
}

async function seededStore(
  count: number,
  startedAt: string | null = STARTED_AT,
): Promise<TrackingStore> {
  const store = createMemoryTrackingStore({
    tripId: TRIP,
    state: "TRACKING",
    nextSeq: 0,
    startedAt,
  });
  const points: PointInput[] = [];
  for (let index = 1; index <= count; index += 1) {
    points.push(input(index, startedAt ?? STARTED_AT));
  }
  await store.insertPoints(TRIP, points);
  return store;
}

function row(overrides: Partial<PointQueueRow> = {}): PointQueueRow {
  return {
    tripId: TRIP,
    seq: 1,
    recordedAt: STARTED_AT,
    lat: 12.9,
    lng: 79.9,
    accuracyM: 5,
    speedMps: 10,
    heading: 0,
    altitudeM: null,
    isMocked: false,
    uploaded: false,
    quarantined: false,
    quarantineReason: null,
    ...overrides,
  };
}

function fakeTimers() {
  const timeouts: { delay: number; run: () => void }[] = [];
  let intervalFn: (() => void) | null = null;
  const api: TimerApi = {
    setInterval: (fn) => {
      intervalFn = fn;
      return 1 as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: () => {
      intervalFn = null;
    },
    setTimeout: (fn, delay) => {
      timeouts.push({ delay, run: fn });
      return timeouts.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: () => undefined,
  };
  return {
    api,
    timeouts,
    /** Fire the interval callback (the 30 s upload tick). */
    tick: () => intervalFn?.(),
    isRunning: () => intervalFn !== null,
  };
}

/** Let every pending microtask and the scheduled `run()` settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("computeBackoff", () => {
  it("is at least half the capped delay and at most the cap", () => {
    expect(computeBackoff(0, () => 0)).toBe(BACKOFF_BASE_MS / 2);
    expect(computeBackoff(0, () => 1)).toBe(BACKOFF_BASE_MS);
  });

  it("doubles per attempt", () => {
    expect(computeBackoff(1, () => 0)).toBe(BACKOFF_BASE_MS);
    expect(computeBackoff(2, () => 0)).toBe(BACKOFF_BASE_MS * 2);
  });

  it("never exceeds the maximum", () => {
    expect(computeBackoff(50, () => 1)).toBe(BACKOFF_MAX_MS);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const value = computeBackoff(attempt, () => 0.5);
      const capped = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
      expect(value).toBeGreaterThanOrEqual(capped / 2);
      expect(value).toBeLessThanOrEqual(capped);
    }
  });

  it("treats a negative attempt as the first one", () => {
    expect(computeBackoff(-3, () => 0)).toBe(BACKOFF_BASE_MS / 2);
  });
});

describe("isUploadable (ND-8)", () => {
  const bounds = { startedAt: STARTED_AT, nowMs: NOW };

  it("accepts a normal in-window row", () => {
    expect(isUploadable(row({ recordedAt: "2026-09-27T10:00:30.000Z" }), bounds)).toBe(true);
  });

  it("rejects a non-positive seq", () => {
    expect(isUploadable(row({ seq: 0 }), bounds)).toBe(false);
  });

  it("rejects an out-of-range coordinate", () => {
    expect(isUploadable(row({ lat: 120 }), bounds)).toBe(false);
  });

  it("rejects an unparseable timestamp", () => {
    expect(isUploadable(row({ recordedAt: "yesterday" }), bounds)).toBe(false);
  });

  it("rejects a row older than started_at - 1 min (the RLS window)", () => {
    expect(isUploadable(row({ recordedAt: "2026-09-27T09:58:00.000Z" }), bounds)).toBe(false);
    // One second inside the window is fine.
    expect(isUploadable(row({ recordedAt: "2026-09-27T09:59:05.000Z" }), bounds)).toBe(true);
  });

  it("rejects a timestamp implausibly far in the future", () => {
    expect(isUploadable(row({ recordedAt: "2026-09-30T00:00:00.000Z" }), bounds)).toBe(false);
  });

  it("accepts any timestamp when the trip has no started_at", () => {
    expect(
      isUploadable(row({ recordedAt: "1999-01-01T00:00:00.000Z" }), {
        startedAt: null,
        nowMs: NOW,
      }),
    ).toBe(true);
  });
});

describe("toUploadRow", () => {
  it("drops the local-only columns", () => {
    expect(toUploadRow(row())).toEqual({
      trip_id: TRIP,
      seq: 1,
      recorded_at: STARTED_AT,
      lat: 12.9,
      lng: 79.9,
      accuracy_m: 5,
      speed_mps: 10,
      heading: 0,
      altitude_m: null,
      is_mocked: false,
    });
  });
});

function makeUploader(
  store: TrackingStore,
  upload: (rows: UploadRow[]) => Promise<UploadOutcome>,
  overrides: Partial<UploaderDeps> = {},
) {
  return createUploader({ store, upload, now: () => NOW, random: () => 0, ...overrides });
}

describe("flush", () => {
  it("uploads the queued rows and marks them", async () => {
    const store = await seededStore(3);
    const sent: number[][] = [];
    const uploader = makeUploader(store, async (rows) => {
      sent.push(rows.map((r) => r.seq));
      return { ok: true };
    });

    const result = await uploader.flush();
    expect(result).toEqual({ uploaded: 3, quarantined: 0, network: false });
    expect(sent).toEqual([[1, 2, 3]]);
    expect(await store.countPoints(TRIP)).toMatchObject({ pending: 0, uploaded: 3 });
  });

  it("is idempotent — a second flush sends nothing", async () => {
    const store = await seededStore(2);
    let calls = 0;
    const uploader = makeUploader(store, async () => {
      calls += 1;
      return { ok: true };
    });

    await uploader.flush();
    await uploader.flush();
    expect(calls).toBe(1);
  });

  it("does not re-send rows that were already uploaded before a restart", async () => {
    const store = await seededStore(2);
    await makeUploader(store, async () => ({ ok: true })).flush();

    const afterRestart = makeUploader(store, async () => {
      throw new Error("must not be called");
    });
    expect(await afterRestart.flush()).toEqual({ uploaded: 0, quarantined: 0, network: false });
  });

  it("caps a pass at the batch size", async () => {
    const store = await seededStore(UPLOAD_BATCH_SIZE + 50);
    const uploader = makeUploader(store, async () => ({ ok: true }));

    expect((await uploader.flush()).uploaded).toBe(UPLOAD_BATCH_SIZE);
    expect((await store.countPoints(TRIP)).pending).toBe(50);
  });

  it("keeps the rows and reports offline when the network fails", async () => {
    const store = await seededStore(3);
    const uploader = makeUploader(store, async () => ({
      ok: false,
      kind: "network",
      message: "Network request failed",
    }));

    const result = await uploader.flush();
    expect(result).toMatchObject({ uploaded: 0, network: true, message: "Network request failed" });
    expect((await store.countPoints(TRIP)).pending).toBe(3);
  });

  it("uploads everything on a later pass once the network returns", async () => {
    const store = await seededStore(3);
    let online = false;
    const uploader = makeUploader(store, async () =>
      online ? { ok: true } : { ok: false, kind: "network", message: "offline" },
    );

    expect((await uploader.flush()).network).toBe(true);
    online = true;
    expect((await uploader.flush()).uploaded).toBe(3);
    expect((await store.countPoints(TRIP)).pending).toBe(0);
  });

  it("single-flights concurrent calls", async () => {
    const store = await seededStore(2);
    const uploader = makeUploader(store, async () => ({ ok: true }));

    // `inFlight` is set synchronously, so the second caller joins the first
    // pass rather than starting a competing batch.
    const first = uploader.flush();
    const second = uploader.flush();
    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({ uploaded: 2 });

    // Once it settles, a later call is a fresh pass.
    const third = uploader.flush();
    expect(third).not.toBe(first);
    await third;
  });

  it("quarantines rows it can prove are out of bounds without calling the server", async () => {
    const store = await seededStore(2);
    // A row from well before the trip: the RLS policy would reject it, and the
    // whole batch with it.
    await store.insertPoints(TRIP, [{ ...input(3), recordedAt: "2026-09-27T09:00:00.000Z" }]);

    let calls = 0;
    const uploader = makeUploader(store, async () => {
      calls += 1;
      return { ok: true };
    });

    const result = await uploader.flush();
    expect(result).toEqual({ uploaded: 2, quarantined: 1, network: false });
    expect(calls).toBe(1);
    const counts = await store.countPoints(TRIP);
    expect(counts).toMatchObject({ uploaded: 2, quarantined: 1, pending: 0 });
  });

  it("does not retry a quarantined row", async () => {
    const store = await seededStore(1);
    await store.insertPoints(TRIP, [{ ...input(2), recordedAt: "2026-09-27T09:00:00.000Z" }]);

    const sentSeqs: number[][] = [];
    const uploader = makeUploader(store, async (rows) => {
      sentSeqs.push(rows.map((r) => r.seq));
      return { ok: true };
    });

    await uploader.flush();
    await uploader.flush();
    expect(sentSeqs).toEqual([[1]]);
  });

  it("falls back to one row at a time when the server rejects the batch, and parks only the bad row", async () => {
    const store = await seededStore(3);
    const badSeq = 3;
    const uploader = makeUploader(store, async (rows) => {
      if (rows.length > 1) {
        // The poison-batch symptom: one bad row fails the whole upsert.
        return { ok: false, kind: "data", message: "invalid input syntax" };
      }
      return rows[0]?.seq === badSeq
        ? { ok: false, kind: "data", message: "recorded_at out of range" }
        : { ok: true };
    });

    const result = await uploader.flush();
    expect(result).toEqual({ uploaded: 2, quarantined: 1, network: false });

    const counts = await store.countPoints(TRIP);
    expect(counts).toMatchObject({ uploaded: 2, quarantined: 1, pending: 0 });
    expect((await store.lastPoint(TRIP))?.quarantineReason).toBe("recorded_at out of range");
  });

  it("stops the per-row fallback if the network drops mid-way, keeping what landed", async () => {
    const store = await seededStore(3);
    let perRow = 0;
    const uploader = makeUploader(store, async (rows) => {
      if (rows.length > 1) {
        return { ok: false, kind: "data", message: "batch rejected" };
      }
      perRow += 1;
      if (perRow >= 3) {
        return { ok: false, kind: "network", message: "offline" };
      }
      return { ok: true };
    });

    const result = await uploader.flush();
    expect(result.network).toBe(true);
    expect(result.uploaded).toBe(2);
    expect((await store.countPoints(TRIP)).pending).toBe(1);
  });

  it("does nothing without an active trip", async () => {
    const store = createMemoryTrackingStore();
    const uploader = makeUploader(store, async () => {
      throw new Error("must not be called");
    });
    expect(await uploader.flush()).toEqual({ uploaded: 0, quarantined: 0, network: false });
  });
});

describe("scheduler", () => {
  it("wires the interval on start and clears it on stop", async () => {
    const store = await seededStore(1);
    const { api, isRunning } = fakeTimers();
    const uploader = makeUploader(store, async () => ({ ok: true }), {
      timers: api,
      subscribeOnline: () => () => undefined,
      subscribeForeground: () => () => undefined,
    });

    expect(isRunning()).toBe(false);
    uploader.start();
    expect(isRunning()).toBe(true);
    uploader.stop();
    expect(isRunning()).toBe(false);
  });

  it("backoffs grow with each consecutive failure and reset after a success", async () => {
    const store = await seededStore(2);
    const { api, timeouts, tick } = fakeTimers();
    let online = false;
    const uploader = makeUploader(
      store,
      async () => (online ? { ok: true } : { ok: false, kind: "network", message: "offline" }),
      {
        timers: api,
        // Deterministic: random() = 0 pins the jitter to the low end.
        random: () => 0,
        subscribeOnline: () => () => undefined,
        subscribeForeground: () => () => undefined,
      },
    );

    uploader.start();

    tick();
    await settle();
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]?.delay).toBe(BACKOFF_BASE_MS / 2);

    tick();
    await settle();
    expect(timeouts).toHaveLength(2);
    expect(timeouts[1]?.delay).toBe(BACKOFF_BASE_MS);

    // The queued retry is the same single-flight flush, so it can also succeed.
    online = true;
    tick();
    await settle();
    expect(timeouts).toHaveLength(2);
    expect((await store.countPoints(TRIP)).pending).toBe(0);
    expect(uploader.getStatus().attempts).toBe(0);
    expect(uploader.getStatus().lastResult).toMatchObject({ uploaded: 2, network: false });

    uploader.stop();
  });

  it("fires a reconnect and a foreground trigger", async () => {
    const store = await seededStore(1);
    const { api } = fakeTimers();
    const listeners: (() => void)[] = [];
    const uploader = makeUploader(store, async () => ({ ok: true }), {
      timers: api,
      subscribeOnline: (fn) => {
        listeners.push(fn);
        return () => undefined;
      },
      subscribeForeground: (fn) => {
        listeners.push(fn);
        return () => undefined;
      },
    });

    uploader.start();
    // One reconnect listener, one foreground listener.
    expect(listeners).toHaveLength(2);

    listeners[0]?.();
    await settle();
    expect((await store.countPoints(TRIP)).pending).toBe(0);
  });
});
