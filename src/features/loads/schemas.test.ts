/**
 * Load schema tests (M7).
 *
 * The column mapping and the status derivation are the two places a quiet
 * mistake would be expensive: a load stored in the wrong units, or a load
 * hidden under the wrong tab, both look fine until an admin trusts the screen.
 */
import {
  DEFAULT_RADIUS_M,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  OPEN_TRIP_STATUSES,
  PAGE_SIZE,
  assignTripSchema,
  clampRadius,
  createLoadSchema,
  formatDuration,
  formatKm,
  loadStatusFrom,
  pageCount,
  sanitiseSearchTerm,
  toDateBounds,
  toLoadInsert,
  toRange,
  tripStatusForTab,
} from "./schemas";

const PICKUP = {
  address: "SIPCOT Industrial Park, Sriperumbudur, Tamil Nadu",
  point: { lat: 12.9676, lng: 79.9426 },
  radiusM: 500,
};

const DROP = {
  address: "Kurichi Industrial Estate, Coimbatore, Tamil Nadu",
  point: { lat: 11.0016, lng: 76.9555 },
  radiusM: 500,
};

function validLoad(overrides: Record<string, unknown> = {}) {
  return { pickup: PICKUP, drop: DROP, ...overrides };
}

describe("createLoadSchema", () => {
  it("accepts a complete load", () => {
    const parsed = createLoadSchema.safeParse(
      validLoad({
        material: "Granite blocks",
        weightTonnes: "12.5",
        notes: "Tail-lift not required",
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts a load with only the two addresses, because material and weight are optional", () => {
    const parsed = createLoadSchema.safeParse(validLoad());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.material).toBeNull();
      expect(parsed.data.weightTonnes).toBeUndefined();
      expect(parsed.data.notes).toBeNull();
    }
  });

  it("refuses an endpoint that was typed but never located on the map", () => {
    const parsed = createLoadSchema.safeParse(
      validLoad({ pickup: { address: "Somewhere", radiusM: 500 } }),
    );
    expect(parsed.success).toBe(false);
  });

  it("refuses the null island, which is what an unresolved pin would become", () => {
    const parsed = createLoadSchema.safeParse(
      validLoad({ pickup: { address: "Somewhere", point: { lat: 0, lng: 0 }, radiusM: 500 } }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toContain(
        "console.load.locationUnresolved",
      );
    }
  });

  it("refuses coordinates outside the world", () => {
    const parsed = createLoadSchema.safeParse(
      validLoad({ drop: { ...DROP, point: { lat: 91, lng: 0 } } }),
    );
    expect(parsed.success).toBe(false);
  });

  it("collapses whitespace in an address so a pasted line does not store twice", () => {
    const parsed = createLoadSchema.safeParse(
      validLoad({ pickup: { ...PICKUP, address: "  SIPCOT   Industrial  Park  " } }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.pickup.address).toBe("SIPCOT Industrial Park");
    }
  });

  it("refuses a zero or negative weight, and reads an empty field as not given", () => {
    expect(createLoadSchema.safeParse(validLoad({ weightTonnes: "0" })).success).toBe(false);
    expect(createLoadSchema.safeParse(validLoad({ weightTonnes: "-3" })).success).toBe(false);

    const empty = createLoadSchema.safeParse(validLoad({ weightTonnes: "" }));
    expect(empty.success).toBe(true);
    if (empty.success) {
      expect(empty.data.weightTonnes).toBeUndefined();
    }
  });
});

describe("clampRadius", () => {
  it("keeps the doc 12 bounds and defaults", () => {
    expect(MIN_RADIUS_M).toBe(100);
    expect(MAX_RADIUS_M).toBe(2000);
    expect(DEFAULT_RADIUS_M).toBe(500);
  });

  it("snaps to the nearest 50 m step", () => {
    expect(clampRadius(499)).toBe(500);
    expect(clampRadius(123)).toBe(100);
    expect(clampRadius(1749)).toBe(1750);
  });

  it("clamps out-of-range and non-finite values instead of passing them on", () => {
    expect(clampRadius(10)).toBe(MIN_RADIUS_M);
    expect(clampRadius(99_999)).toBe(MAX_RADIUS_M);
    expect(clampRadius(Number.NaN)).toBe(DEFAULT_RADIUS_M);
  });
});

describe("toLoadInsert", () => {
  it("maps the form onto the load columns and converts tonnes to kg", () => {
    const parsed = createLoadSchema.parse(
      validLoad({ material: "Granite blocks", weightTonnes: "12.5", notes: "Call before arrival" }),
    );
    const row = toLoadInsert(parsed, 512_000);

    expect(row).toEqual({
      pickup_address: PICKUP.address,
      pickup_lat: PICKUP.point.lat,
      pickup_lng: PICKUP.point.lng,
      pickup_radius_m: 500,
      drop_address: DROP.address,
      drop_lat: DROP.point.lat,
      drop_lng: DROP.point.lng,
      drop_radius_m: 500,
      planned_distance_m: 512_000,
      material: "Granite blocks",
      weight_kg: 12_500,
      notes: "Call before arrival",
      shipper_id: null,
    });
  });

  it("never sends a load code — the database generates it", () => {
    const parsed = createLoadSchema.parse(validLoad());
    expect(toLoadInsert(parsed)).not.toHaveProperty("load_code");
  });

  it("stores a null planned distance when Mappls could not be reached", () => {
    const parsed = createLoadSchema.parse(validLoad());
    expect(toLoadInsert(parsed, null).planned_distance_m).toBeNull();
  });

  it("rounds a fractional tonne rather than storing a decimal kilogramme", () => {
    const parsed = createLoadSchema.parse(validLoad({ weightTonnes: "8.4" }));
    expect(toLoadInsert(parsed).weight_kg).toBe(8_400);
  });
});

describe("loadStatusFrom (ND-20)", () => {
  it("derives every tab from the load's latest trip", () => {
    expect(loadStatusFrom(null)).toBe("unassigned");
    expect(loadStatusFrom("assigned")).toBe("assigned");
    expect(loadStatusFrom("in_progress")).toBe("in_trip");
    expect(loadStatusFrom("completed")).toBe("done");
    expect(loadStatusFrom("verified")).toBe("done");
    expect(loadStatusFrom("needs_review")).toBe("done");
  });

  it("treats a rejected or cancelled trip as unassigned, so the load can be re-dispatched", () => {
    // trips_one_open_per_load does not cover these, so the load is dispatchable.
    expect(loadStatusFrom("rejected")).toBe("unassigned");
    expect(loadStatusFrom("cancelled")).toBe("unassigned");
  });
});

describe("tripStatusForTab", () => {
  it("returns null for 'all' so the query adds no filter", () => {
    expect(tripStatusForTab("all")).toBeNull();
  });

  it("returns the trip statuses that satisfy a specific tab", () => {
    expect(tripStatusForTab("assigned")).toEqual(["assigned"]);
    expect(tripStatusForTab("in_trip")).toEqual(["in_progress"]);
    expect(tripStatusForTab("done")).toEqual(["completed", "verified", "needs_review"]);
  });

  it("returns an empty set for 'unassigned', which the query expresses as an exclusion", () => {
    expect(tripStatusForTab("unassigned")).toEqual([]);
  });

  it("keeps the open-trip set aligned with trips_one_open_per_load", () => {
    expect(OPEN_TRIP_STATUSES).toEqual([
      "assigned",
      "in_progress",
      "completed",
      "verified",
      "needs_review",
    ]);
    // Every open status lands in a tab, and only in one.
    const reachable = new Set(
      (["assigned", "in_trip", "done"] as const).flatMap((tab) => tripStatusForTab(tab)),
    );
    expect([...OPEN_TRIP_STATUSES].sort()).toEqual([...reachable].sort());
  });
});

describe("toRange", () => {
  it("is the inclusive PostgREST range for a 1-based page", () => {
    expect(toRange({ page: 1, pageSize: 20 })).toEqual({ from: 0, to: 19 });
    expect(toRange({ page: 2, pageSize: 20 })).toEqual({ from: 20, to: 39 });
    expect(toRange({ page: 3, pageSize: 20 })).toEqual({ from: 40, to: 59 });
  });
});

describe("pageCount", () => {
  it("never reports zero pages, even with no rows", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
    expect(pageCount(0, 0)).toBe(1);
  });
});

describe("toDateBounds", () => {
  it("covers the whole of the 'to' day", () => {
    expect(toDateBounds({ from: "2026-09-01", to: "2026-09-27" })).toEqual({
      gte: "2026-09-01T00:00:00.000Z",
      lte: "2026-09-27T23:59:59.999Z",
    });
  });

  it("omits an end the admin left empty", () => {
    expect(toDateBounds({ from: "2026-09-01", to: "" })).toEqual({
      gte: "2026-09-01T00:00:00.000Z",
    });
    expect(toDateBounds({ from: "", to: "" })).toEqual({});
  });
});

describe("sanitiseSearchTerm", () => {
  it("strips the characters that would change a PostgREST or() filter's meaning", () => {
    expect(sanitiseSearchTerm("NL-2026-000142")).toBe("NL-2026-000142");
    expect(sanitiseSearchTerm("or(id.not.is.null)")).toBe("or id.not.is.null");
    expect(sanitiseSearchTerm("100%")).toBe("100");
    expect(sanitiseSearchTerm('a"b')).toBe("a b");
    expect(sanitiseSearchTerm("  spaced  ")).toBe("spaced");
  });
});

describe("assignTripSchema", () => {
  // A real v4-shaped UUID: the version nibble and the RFC variant nibble are
  // both checked, which `z.uuid()` (unlike `z.string().uuid()`) enforces.
  const uuid = "11111111-1111-4111-8111-111111111111";

  it("requires a load, a driver and a vehicle", () => {
    expect(
      assignTripSchema.safeParse({ loadId: uuid, driverId: uuid, vehicleId: uuid }).success,
    ).toBe(true);
    expect(assignTripSchema.safeParse({ loadId: uuid, driverId: uuid }).success).toBe(false);
    expect(
      assignTripSchema.safeParse({ loadId: "nope", driverId: uuid, vehicleId: uuid }).success,
    ).toBe(false);
  });
});

describe("formatKm", () => {
  it("converts the stored metres into the km the console shows", () => {
    expect(formatKm(512_000)).toBe("512 km");
    expect(formatKm(41_000)).toBe("41 km");
    expect(formatKm(41_250, 1)).toBe("41.3 km");
  });

  it("shows a dash rather than a zero for a load with no planned distance yet", () => {
    expect(formatKm(null)).toBe("—");
    expect(formatKm(undefined)).toBe("—");
    expect(formatKm(Number.NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("renders the proxy's seconds as the rough drive time in the strip", () => {
    expect(formatDuration(10 * 3600)).toBe("~10 h");
    expect(formatDuration(45 * 60)).toBe("~45 min");
    expect(formatDuration(30 * 3600)).toBe("~1 d");
  });

  it("returns null when there is nothing worth showing", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
});
