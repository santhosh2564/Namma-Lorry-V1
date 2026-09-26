// Tracking configuration (TRD §4.2). Changing these changes what the server can verify:
// docs/08 thresholds (gaps, coverage) assume ~10 s / 25 m updates.
import * as Location from 'expo-location';

import { t } from '@/i18n';

/** Background task name registered with expo-task-manager (src/tracking/task.ts). */
export const TRIP_LOCATION_TASK = 'namma-lorry-trip-location';

/** Built when tracking starts, so the foreground-service notification is in the driver's language. */
export const trackingOptions = (): Location.LocationTaskOptions => ({
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 10_000, // Android: ~10 s
  distanceInterval: 25, // metres
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.AutomotiveNavigation,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: t.tracking.notificationTitle,
    notificationBody: t.tracking.notificationBody,
    killServiceOnDestroy: false,
  },
});

/** Fresh fix used for start_trip (docs/06 §1: getCurrentPositionAsync, BestForNavigation). */
export const START_FIX_OPTIONS: Location.LocationOptions = { accuracy: Location.Accuracy.BestForNavigation };
/** Give up waiting for the start fix after this long (shown as "Waiting for GPS"). */
export const START_FIX_TIMEOUT_MS = 20_000;

/** Uploader (TRD §4.3). */
export const UPLOAD_INTERVAL_MS = 30_000;
export const UPLOAD_BATCH_SIZE = 200; // docs/06 §2: max 200 rows per call
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** trip_points RLS rejects points recorded more than 1 min before the server's started_at. */
export const START_TOLERANCE_MS = 60_000;

export const SQLITE_DB_NAME = 'namma-lorry-tracking.db';
