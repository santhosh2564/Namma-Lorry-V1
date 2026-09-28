/**
 * The D1 permission flow (M9, docs/12 D1, docs/09 §1–§3).
 *
 * The screen shows the prominent disclosure **before** anything requests a
 * permission (Google Play's background-location rule, docs/09 §2), then walks
 * the driver through three rows in a fixed order: precise (foreground)
 * location, background ("Allow all the time"), notifications. Every row shows
 * its own status so a partially granted install resumes at the right row.
 *
 * The request order matters: Android 10+ refuses to show the "Allow all the
 * time" option unless foreground is already granted, and both location rows
 * must exist before the foreground-service notification can be seen. The chain
 * therefore runs foreground → background → notifications and stops early only
 * when a row is permanently blocked — the driver is sent to system settings
 * for that row rather than being asked a dialog that will never appear.
 *
 * The pure pieces (row state derivation, readiness) are exported for tests; the
 * async half is a thin sequence over expo-location / expo-notifications.
 */
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/** State of one D1 permission row. */
export type PermissionRowState =
  /** Granted — green check. */
  | "granted"
  /** Not yet asked (or asked and soft-denied) — show the Allow button. */
  | "requestable"
  /** Permanently denied — "Open settings" instead of another dialog. */
  | "blocked";

export type PermissionSnapshot = {
  foreground: PermissionRowState;
  background: PermissionRowState;
  notifications: PermissionRowState;
};

export type PermissionRowName = keyof PermissionSnapshot;

/** Web has no permission dialogs this flow can drive; D1 renders its web note. */
export function isPermissionFlowSupported(): boolean {
  return Platform.OS !== "web";
}

/** Pure: expo-location's foreground status → a D1 row state. */
export function foregroundStateFrom(status: Location.PermissionStatus): PermissionRowState {
  if (status === Location.PermissionStatus.GRANTED) {
    return "granted";
  }
  return status === Location.PermissionStatus.UNDETERMINED ? "requestable" : "blocked";
}

/**
 * Pure: the background row.
 *
 * On Android < 10 (API < 29) "Allow all the time" does not exist as a separate
 * grant — foreground permission already covers the background task, so the row
 * is `granted` when foreground is. iOS models background as `Always`; a
 * soft-denied "When in use" still leaves the row requestable later.
 */
export function backgroundStateFrom(
  status: Location.PermissionStatus,
  foregroundStatus: Location.PermissionStatus,
  apiLevel: number | null,
): PermissionRowState {
  if (status === Location.PermissionStatus.GRANTED) {
    return "granted";
  }
  if (apiLevel !== null && apiLevel < 29) {
    return foregroundStatus === Location.PermissionStatus.GRANTED ? "granted" : "requestable";
  }
  return status === Location.PermissionStatus.UNDETERMINED ? "requestable" : "blocked";
}

/** Pure: the notifications row (web and pre-13 Android cannot be blocked). */
export function notificationsStateFrom(granted: boolean, canAskAgain: boolean): PermissionRowState {
  if (granted) {
    return "granted";
  }
  return canAskAgain ? "requestable" : "blocked";
}

/** Pure: can the driver leave D1 for D2? */
export function permissionsComplete(snapshot: PermissionSnapshot): boolean {
  return (
    snapshot.foreground === "granted" &&
    snapshot.background === "granted" &&
    snapshot.notifications === "granted"
  );
}

const API_LEVEL = Platform.OS === "android" ? Number(Platform.Version) : null;

/** Read every row without asking for anything (the screen's initial state). */
export async function readPermissionSnapshot(): Promise<PermissionSnapshot> {
  if (!isPermissionFlowSupported()) {
    return { foreground: "requestable", background: "requestable", notifications: "requestable" };
  }
  try {
    const [foreground, notifications] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
    ]);
    const background = await Location.getBackgroundPermissionsAsync();
    return {
      foreground: foregroundStateFrom(foreground.status),
      background: backgroundStateFrom(background.status, foreground.status, API_LEVEL),
      notifications: notificationsStateFrom(
        notifications.granted,
        notifications.canAskAgain ?? true,
      ),
    };
  } catch {
    // A failure to *read* must not look like "everything granted"; the rows
    // show as still pending and the driver taps Allow to find out.
    return { foreground: "requestable", background: "requestable", notifications: "requestable" };
  }
}

/**
 * The single "Allow" action: requests the one missing permission, then returns
 * the refreshed snapshot. Kept per-row (rather than one requestEverything) so
 * the screen can re-run it after "Open settings" too.
 */
export async function requestPermissionRow(row: PermissionRowName): Promise<PermissionSnapshot> {
  if (!isPermissionFlowSupported()) {
    return readPermissionSnapshot();
  }
  try {
    if (row === "foreground") {
      await Location.requestForegroundPermissionsAsync();
    } else if (row === "background") {
      await Location.requestBackgroundPermissionsAsync();
    } else {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // The snapshot below reflects whatever the OS reports; a throw here is
    // usually "dialog unavailable", which reads back as blocked.
  }
  return readPermissionSnapshot();
}

/** The fixed D1 request order (module doc). */
export const PERMISSION_ROW_ORDER: readonly PermissionRowName[] = [
  "foreground",
  "background",
  "notifications",
];

/** The first row the driver can still act on, or null when everything is set. */
export function nextPendingRow(snapshot: PermissionSnapshot): PermissionRowName | null {
  for (const row of PERMISSION_ROW_ORDER) {
    if (snapshot[row] === "requestable") {
      return row;
    }
  }
  return null;
}

/**
 * Pure: did this foreground/re-check lose something the driver needs?
 *
 * The app re-reads permissions on every foreground (docs/12 D1); if background
 * location was revoked while a trip is not running, the driver goes back to D1
 * before D3 renders anything. Foreground loss counts too — the background row
 * cannot be trusted without it.
 */
export function permissionsLost(snapshot: PermissionSnapshot): boolean {
  return snapshot.foreground !== "granted" || snapshot.background !== "granted";
}
