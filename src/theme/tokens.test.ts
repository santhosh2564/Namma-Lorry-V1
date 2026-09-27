import { colors, spacing, touch } from "./tokens";

describe("design tokens", () => {
  it("satisfies the 48 px minimum touch target", () => {
    expect(touch.min).toBeGreaterThanOrEqual(48);
  });

  it("keeps the driver primary button between 56 and 64 px", () => {
    expect(touch.driverPrimary).toBeGreaterThanOrEqual(56);
    expect(touch.driverPrimary).toBeLessThanOrEqual(64);
  });

  it("uses an 8 px spacing grid", () => {
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
    for (const value of Object.values(spacing)) {
      expect(value % 2).toBe(0);
    }
  });

  it("defines the brief palette", () => {
    expect(colors.primary).toBe("#0F2A44");
    expect(colors.accent).toBe("#F5A300");
    expect(colors.verified).toBe("#1E8E3E");
    expect(colors.review).toBe("#E37400");
    expect(colors.rejected).toBe("#D93025");
    expect(colors.live).toBe("#1A73E8");
  });
});
