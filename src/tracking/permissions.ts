/**
 * Platform helpers for the tracking engine (M8).
 *
 * M9 owns the permission *screens* (D1 prominent disclosure, D2 battery) and the
 * full request chain. What M8 needs is the mechanical half: is foreground
 * location granted, give me a fresh high-accuracy fix, start/stop the background
 * task, and describe this device for `start_trip`'s `p_device_info`.
 *
 * Everything here is a no-op on web: a browser cannot run a background location
 * task, and web never runs a trip (TRD §4.4).
 */
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Location from "expo-location";
import { Platform } from "react-native";

import { MAX_START_ACCURACY_M, TRACKING_OPTIONS, TRIP_LOCATION_TASK } from "@/tracking/config";
import type { FreshFix } from "@/tracking/stateMachine";

export function isNative(): boolean {
  return Platform.OS !== "web";
}

export async function hasForegroundLocationPermission(): Promise<boolean> {
  if (!isNative()) {
    return false;
  }
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

/**
 * A fresh high-accuracy fix for `start_trip` (docs/06 §1).
 *
 * The RPC — not this function — judges accuracy and the pickup geofence, so the
 * fix is returned with its own accuracy and never pre-filtered: the driver needs
 * the server's reason (`GPS_ACCURACY_TOO_LOW`, `OUTSIDE_PICKUP:<m>`), not a
 * silent refusal. Null means "no fix at all", which the state machine turns into
 * a `GPS_UNAVAILABLE` client error without calling the RPC.
 */
export async function getFreshFix(): Promise<FreshFix | null> {
  if (!isNative()) {
    return null;
  }
  if (!(await hasForegroundLocationPermission())) {
    return null;
  }
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      lat: latitude,
      lng: longitude,
      accuracyM: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
    };
  } catch {
    return null;
  }
}

export async function isTrackingTaskRunning(): Promise<boolean> {
  if (!isNative()) {
    return false;
  }
  try {
    return await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK);
  } catch {
    return false;
  }
}

/** Start the background task. Idempotent: an already-running task is left alone. */
export async function startLocationUpdates(): Promise<void> {
  if (!isNative()) {
    return;
  }
  if (await isTrackingTaskRunning()) {
    return;
  }
  await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, TRACKING_OPTIONS);
}

export async function stopLocationUpdates(): Promise<void> {
  if (!isNative()) {
    return;
  }
  if (!(await isTrackingTaskRunning())) {
    return;
  }
  await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
}

/** The `p_device_info` payload (docs/06 §1). */
export function getDeviceInfo(): {
  os: string;
  osVersion: string;
  model: string;
  appVersion: string;
} {
  return {
    os: Platform.OS,
    osVersion: String(Platform.Version),
    model: Device.modelName ?? "unknown",
    appVersion: Application.nativeApplicationVersion ?? "unknown",
  };
}

/**
 * Mirrors the server's `max_point_accuracy_m` check so the D4 start button can
 * show "waiting for GPS" (M9) before the driver taps, instead of after a failed
 * round trip. The RPC remains the authority.
 */
export function accuracyIsAcceptable(accuracyM: number | null): boolean {
  return accuracyM !== null && accuracyM <= MAX_START_ACCURACY_M;
}
