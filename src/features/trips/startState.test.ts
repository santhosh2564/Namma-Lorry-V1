import { startEnabled, startState } from "@/features/trips/startState";
import { destinationPoint, haversineMetres } from "@/lib/geo";

const PICKUP = { lat: 12.9698, lng: 79.9382, radiusM: 500 };

const goodFix = { lat: 12.9699, lng: 79.9383, accuracyM: 8 };

function input(overrides: Partial<Parameters<typeof startState>[0]> = {}) {
  return {
    fix: goodFix,
    permissionsOk: true,
    pickup: PICKUP,
    starting: false,
    error: null,
    ...overrides,
  };
}

describe("startState", () => {
  it("is ready at the pickup with an accurate fix", () => {
    expect(startState(input())).toBe("ready");
  });

  it("has no fix before any fix or without permissions", () => {
    expect(startState(input({ fix: null }))).toBe("no_fix");
    expect(startState(input({ permissionsOk: false }))).toBe("no_fix");
  });

  it("treats a coarse fix as weak GPS even inside the radius", () => {
    // Accuracy outranks distance: a 60 m fix at 50 m out is not "outside".
    const coarse = { lat: 12.97024, lng: 79.93825, accuracyM: 60 };
    expect(startState(input({ fix: coarse }))).toBe("gps_weak");
  });

  it("shows outside radius beyond the load's own radius", () => {
    const far = { lat: 12.9748, lng: 79.9382, accuracyM: 8 }; // ~556 m north
    expect(startState(input({ fix: far }))).toBe("outside_radius");
  });

  it("is ready one metre inside the radius and outside one metre beyond", () => {
    // ±1 m of the load's own radius, computed rather than hand-placed, so the
    // boundary tracks the same haversine the screen and the server use.
    const inside = { ...destinationPoint(PICKUP, PICKUP.radiusM - 1, 0), accuracyM: 10 };
    expect(haversineMetres(inside, PICKUP)).toBeLessThan(PICKUP.radiusM);
    expect(startState(input({ fix: inside }))).toBe("ready");

    const outside = { ...destinationPoint(PICKUP, PICKUP.radiusM + 1, 0), accuracyM: 10 };
    expect(haversineMetres(outside, PICKUP)).toBeGreaterThan(PICKUP.radiusM);
    expect(startState(input({ fix: outside }))).toBe("outside_radius");
  });

  it("starting and error outrank every other state", () => {
    expect(startState(input({ starting: true }))).toBe("starting");
    expect(startState(input({ error: "OUTSIDE_PICKUP:1200", fix: null }))).toBe("error");
  });
});

describe("startEnabled", () => {
  it("enables only the ready state", () => {
    expect(startEnabled("ready")).toBe(true);
    for (const state of ["no_fix", "gps_weak", "outside_radius", "starting", "error"] as const) {
      expect(startEnabled(state)).toBe(false);
    }
  });
});
