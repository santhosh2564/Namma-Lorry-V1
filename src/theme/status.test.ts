import { TRIP_STATUS, tripStatusList, tripStatusMeta } from "./status";

/**
 * docs/06 §5 "Status values shown in the app" — the exact driver and console
 * wording for each database status. If this table changes, the docs and this
 * test change together.
 */
const DOC_06_SECTION_5: Record<string, { driver: string; console: string }> = {
  assigned: { driver: "Ready to start", console: "Assigned" },
  in_progress: { driver: "Trip in progress", console: "Live" },
  completed: { driver: "Verifying…", console: "Awaiting data" },
  verified: { driver: "Verified ✅", console: "Verified" },
  needs_review: { driver: "Under review", console: "Needs review" },
  rejected: { driver: "Not verified", console: "Rejected" },
  cancelled: { driver: "Cancelled", console: "Cancelled" },
};

describe("trip status mapping", () => {
  it("covers every database status in docs/06 §5", () => {
    expect(Object.keys(TRIP_STATUS).sort()).toEqual(Object.keys(DOC_06_SECTION_5).sort());
  });

  it("uses the exact driver and console labels from docs/06 §5", () => {
    for (const [status, expected] of Object.entries(DOC_06_SECTION_5)) {
      const meta = tripStatusMeta(status as keyof typeof TRIP_STATUS);
      expect(meta.driverLabel).toBe(expected.driver);
      expect(meta.consoleLabel).toBe(expected.console);
    }
  });

  it("never relies on colour alone — every chip has an icon", () => {
    for (const meta of tripStatusList) {
      expect(meta.icon.length).toBeGreaterThan(0);
      expect(meta.color).toMatch(/^#|^rgb/);
    }
  });

  it("marks only the live status as pulsing", () => {
    const pulsing = tripStatusList.filter((s) => s.pulse).map((s) => s.status);
    expect(pulsing).toEqual(["in_progress"]);
  });
});
