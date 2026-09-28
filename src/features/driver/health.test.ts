/**
 * D8 health and profile rule tests (M11, docs/12 D8).
 *
 * Two things a driver is told here must be true: their phone is still set up to
 * record, and their verified experience cannot be typed over. The first is
 * derivable, the second is a caption — and the one check the app genuinely
 * cannot perform (the OS battery exemption) is reported as unknown rather than
 * as "all good".
 */
import { deviceHealth, signOutBlockedBy } from "./health";
import { initialsOf, maskPhone, monthYearLabel } from "./profileState";
import type { PermissionSnapshot } from "@/features/onboarding/permissions";

const GRANTED: PermissionSnapshot = {
  foreground: "granted",
  background: "granted",
  notifications: "granted",
};

describe("deviceHealth", () => {
  it("reports all good when location, background and notifications are granted", () => {
    const health = deviceHealth({
      snapshot: GRANTED,
      permissionFlowSupported: true,
      batterySetupNeeded: true,
    });
    expect(health.location).toBe("ok");
    expect(health.notifications).toBe("ok");
    expect(health.allGood).toBe(true);
    expect(health.labelKey).toBe("driver.profile.health.good");
  });

  it("flags a missing background grant, which is what breaks a trip", () => {
    const health = deviceHealth({
      snapshot: { ...GRANTED, background: "blocked" },
      permissionFlowSupported: true,
      batterySetupNeeded: true,
    });
    expect(health.location).toBe("warning");
    expect(health.allGood).toBe(false);
    expect(health.labelKey).toBe("driver.profile.health.check");
  });

  it("flags missing notifications too", () => {
    const health = deviceHealth({
      snapshot: { ...GRANTED, notifications: "requestable" },
      permissionFlowSupported: true,
      batterySetupNeeded: false,
    });
    expect(health.notifications).toBe("warning");
    expect(health.allGood).toBe(false);
  });

  it("is unknown, not broken, before the first read and on web", () => {
    const unread = deviceHealth({
      snapshot: null,
      permissionFlowSupported: true,
      batterySetupNeeded: true,
    });
    expect(unread.location).toBe("unknown");
    expect(unread.allGood).toBe(true);

    const web = deviceHealth({
      snapshot: GRANTED,
      permissionFlowSupported: false,
      batterySetupNeeded: false,
    });
    expect(web.location).toBe("unknown");
    expect(web.notifications).toBe("unknown");
  });

  it("never claims the battery exemption is set — the app cannot read it", () => {
    const android = deviceHealth({
      snapshot: GRANTED,
      permissionFlowSupported: true,
      batterySetupNeeded: true,
    });
    const ios = deviceHealth({
      snapshot: GRANTED,
      permissionFlowSupported: true,
      batterySetupNeeded: false,
    });
    expect(android.battery).toBe("unknown");
    expect(ios.battery).toBe("ok");
  });
});

describe("signOutBlockedBy", () => {
  it("blocks signing out while a trip is recording", () => {
    expect(signOutBlockedBy("trip-1")).toBe(true);
  });

  it("allows it when there is no active trip", () => {
    expect(signOutBlockedBy(null)).toBe(false);
  });
});

describe("profile display helpers", () => {
  it("takes initials from the first and last name", () => {
    expect(initialsOf("Murugan S")).toBe("MS");
    expect(initialsOf("  murugan   selvam  ")).toBe("MS");
    expect(initialsOf("Murugan")).toBe("M");
  });

  it("falls back rather than showing nothing for a nameless profile", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf(null)).toBe("?");
  });

  it("masks the phone, keeping the country code and the last four digits", () => {
    expect(maskPhone("+919876543210")).toBe("+91 98xxx x3210");
    expect(maskPhone("9876543210")).toBe("+91 98xxx x3210");
  });

  it("leaves a short number alone and shows a dash for none", () => {
    expect(maskPhone("12345")).toBe("12345");
    expect(maskPhone(null)).toBe("—");
  });

  it("reads the month the account was created", () => {
    expect(monthYearLabel("2026-10-04T09:00:00.000Z")).toMatch(/^[A-Z][a-z]{2} 2026$/);
    expect(monthYearLabel(null)).toBeNull();
    expect(monthYearLabel("nonsense")).toBeNull();
  });
});
