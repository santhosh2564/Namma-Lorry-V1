/**
 * Tracking config (M8).
 *
 * The numbers here are load-bearing: the task config feeds the OS, the backoff
 * bounds protect the server, and the ND-6 heartbeat must stay under the
 * verifier's gap threshold or a parked truck gets flagged. That last one is the
 * invariant this file exists to protect.
 */
import * as Location from "expo-location";

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  DISTANCE_INTERVAL_M,
  GAP_THRESHOLD_MS,
  HEARTBEAT_MS,
  MAX_FUTURE_SKEW_MS,
  MAX_PAST_SKEW_MS,
  MAX_START_ACCURACY_M,
  MIN_MOVE_M,
  TIME_INTERVAL_MS,
  TRACKING_OPTIONS,
  TRIP_LOCATION_TASK,
  UPLOAD_BATCH_SIZE,
  UPLOAD_INTERVAL_MS,
} from "@/tracking/config";

describe("tracking config", () => {
  it("names the task once", () => {
    expect(TRIP_LOCATION_TASK).toBe("namma-lorry-trip-location");
  });

  it("keeps the TRD cadence and disables the OS movement gate (ND-6)", () => {
    expect(TIME_INTERVAL_MS).toBe(10_000);
    expect(DISTANCE_INTERVAL_M).toBe(0);
    expect(TRACKING_OPTIONS.timeInterval).toBe(TIME_INTERVAL_MS);
    expect(TRACKING_OPTIONS.distanceInterval).toBe(DISTANCE_INTERVAL_M);
  });

  it("uses the best accuracy and never lets the OS pause it", () => {
    expect(TRACKING_OPTIONS.accuracy).toBe(Location.Accuracy.BestForNavigation);
    expect(TRACKING_OPTIONS.pausesUpdatesAutomatically).toBe(false);
    expect(TRACKING_OPTIONS.activityType).toBe(Location.ActivityType.AutomotiveNavigation);
  });

  it("keeps the foreground service alive and identifiable", () => {
    expect(TRACKING_OPTIONS.showsBackgroundLocationIndicator).toBe(true);
    expect(TRACKING_OPTIONS.foregroundService?.killServiceOnDestroy).toBe(false);
    expect(TRACKING_OPTIONS.foregroundService?.notificationTitle).toContain("Namma Lorry");
  });

  it("keeps the parked heartbeat under the verifier's gap threshold (ND-6)", () => {
    // If this fails, a stationary truck starts producing TRACKING_GAP.
    expect(HEARTBEAT_MS).toBeLessThan(GAP_THRESHOLD_MS);
    expect(MIN_MOVE_M).toBeGreaterThan(0);
    expect(HEARTBEAT_MS).toBeGreaterThan(TIME_INTERVAL_MS);
  });

  it("uploads 200-row batches every 30 s (TRD §4.3)", () => {
    expect(UPLOAD_BATCH_SIZE).toBe(200);
    expect(UPLOAD_INTERVAL_MS).toBe(30_000);
  });

  it("caps backoff above its base", () => {
    expect(BACKOFF_BASE_MS).toBeGreaterThan(0);
    expect(BACKOFF_MAX_MS).toBeGreaterThan(BACKOFF_BASE_MS);
  });

  it("mirrors the RLS skew window from the schema (ND-8)", () => {
    // `points_driver_insert` allows started_at - 1 min and server now + 2 min.
    expect(MAX_PAST_SKEW_MS).toBe(60_000);
    expect(MAX_FUTURE_SKEW_MS).toBe(120_000);
  });

  it("matches the server's max start accuracy", () => {
    expect(MAX_START_ACCURACY_M).toBe(50);
  });
});
