/**
 * D8 device-health rules (M11, docs/12 D8).
 *
 * The Profile tab's "Location & battery check" answers one question a driver
 * actually has after a trip went wrong: *is my phone still set up to record?*
 * It re-reads the same snapshot D1 works with rather than inventing a second
 * notion of permission, and it is honest about the one thing it cannot know:
 *
 * Whether the OS battery-optimisation exemption is actually set is not
 * readable from the app. On Android the check therefore reports "needs review"
 * and points at D2's steps; claiming "all good" would be the exact kind of
 * invented reassurance this product is built to avoid.
 */
import type { PermissionSnapshot } from "@/features/onboarding/permissions";

export type HealthLevel = "ok" | "warning" | "unknown";

export type DeviceHealth = {
  location: HealthLevel;
  notifications: HealthLevel;
  battery: HealthLevel;
  /** No warnings — the one-line answer the list row shows. */
  allGood: boolean;
  /** Translation key for the row's trailing label. */
  labelKey: "driver.profile.health.good" | "driver.profile.health.check";
};

function level(isOk: boolean): HealthLevel {
  return isOk ? "ok" : "warning";
}

/**
 * Pure: the health of the three things that break a trip record.
 *
 * `permissionFlowSupported` is false on web, where trips are not recorded at
 * all, so the location and notification rows read "not applicable" rather than
 * "broken".
 */
export function deviceHealth(input: {
  snapshot: PermissionSnapshot | null;
  permissionFlowSupported: boolean;
  /** True on Android, where D2's battery steps apply. */
  batterySetupNeeded: boolean;
}): DeviceHealth {
  const { snapshot } = input;
  const location: HealthLevel = !input.permissionFlowSupported
    ? "unknown"
    : snapshot === null
      ? "unknown"
      : level(snapshot.foreground === "granted" && snapshot.background === "granted");

  const notifications: HealthLevel = !input.permissionFlowSupported
    ? "unknown"
    : snapshot === null
      ? "unknown"
      : level(snapshot.notifications === "granted");

  // Not readable from the app: see the note at the top of this file.
  const battery: HealthLevel = input.batterySetupNeeded ? "unknown" : "ok";

  return {
    location,
    notifications,
    battery,
    allGood: location !== "warning" && notifications !== "warning",
    labelKey:
      location === "warning" || notifications === "warning"
        ? "driver.profile.health.check"
        : "driver.profile.health.good",
  };
}

/**
 * Pure: may this driver sign out right now?
 *
 * Signing out during a recording trip would stop the background task, so the
 * button is blocked and the row says why (docs/12 D8: "Sign-out blocked during
 * active trip"). Ending the trip first is the only way through.
 */
export function signOutBlockedBy(activeTripId: string | null): boolean {
  return activeTripId !== null;
}
