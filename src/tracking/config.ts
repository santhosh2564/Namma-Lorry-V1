/**
 * Tracking configuration (M8, docs/03-TRD.md §4.2).
 *
 * This module is the single place every tracking threshold lives, so the task,
 * the queue gate and the uploader cannot disagree about a number.
 *
 * **ND-6 (the parked-truck gap).** The TRD shipped
 * `distanceInterval: 25`, which the OS treats as a *movement gate*: a stationary
 * truck produces no updates at all, so a genuine trip gets `TRACKING_GAP`
 * (> 15 min, docs/08) and `LOW_COVERAGE` on long waits. Movement gating is
 * therefore moved out of the OS and into the queue writer: the OS keeps
 * delivering at the time cadence and `shouldRecord` (queue.ts) keeps a point
 * every `MIN_MOVE_M` while moving and one keep-alive every `HEARTBEAT_MS` while
 * parked — comfortably under the 15-minute gap the verifier allows. The cost is
 * the extra OS wake-up while parked; measuring it is doc 10 §3's job (M10), and
 * the decision is recorded in the PHASE1_TASKS decision register.
 */
import * as Location from "expo-location";

/** Task name shared by the definition (task.ts) and start/stop (stateMachine). */
export const TRIP_LOCATION_TASK = "namma-lorry-trip-location";

/** Android time cadence. iOS ignores it and uses its own rate (TRD §4.2). */
export const TIME_INTERVAL_MS = 10_000;

/**
 * ND-6: `0` disables the OS movement gate so updates keep arriving while the
 * truck is parked. Movement resolution is the queue writer's job instead.
 */
export const DISTANCE_INTERVAL_M = 0;

/** Movement resolution: a point is kept once the truck has moved this far. */
export const MIN_MOVE_M = 25;

/**
 * Keep-alive while parked (ND-6). Must stay below the verifier's
 * `max_gap_minutes` (15, see the migration's `app_settings`).
 */
export const HEARTBEAT_MS = 5 * 60_000;

/** The verifier's gap threshold, mirrored so the app can reason about it. */
export const GAP_THRESHOLD_MS = 15 * 60_000;

/** Uploader cadence and batch size (TRD §4.3). */
export const UPLOAD_INTERVAL_MS = 30_000;
export const UPLOAD_BATCH_SIZE = 200;

/** Exponential backoff bounds for a failed upload. */
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/**
 * ND-8: the RLS policy refuses a point older than `started_at - 1 min` or
 * newer than the server's `now() + 2 min`. We can only police the first bound
 * locally (we own `started_at`); a future-skewed row is quarantined after the
 * server rejects it — see uploader.ts.
 */
export const MAX_PAST_SKEW_MS = 60_000;
export const MAX_FUTURE_SKEW_MS = 120_000;

/** Accuracy the `start_trip` RPC accepts (`max_point_accuracy_m`). */
export const MAX_START_ACCURACY_M = 50;

/**
 * Background location options (TRD §4.2, with the ND-6 change above).
 *
 * `foregroundService` is Android-only; iOS uses `showsBackgroundLocationIndicator`
 * plus `UIBackgroundModes: location` (M9, app.config.ts).
 */
export const TRACKING_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: TIME_INTERVAL_MS,
  distanceInterval: DISTANCE_INTERVAL_M,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.AutomotiveNavigation,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: "Namma Lorry trip in progress",
    notificationBody: "Recording your trip for verified experience",
    killServiceOnDestroy: false,
  },
};
