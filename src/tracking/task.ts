// Background location task (TRD §4.2). Defined at module top level and imported first in
// app/_layout.tsx, so it exists whenever the OS wakes the JS runtime for a location batch.
// The task only maps and queues points (SQLite), returns fast, never throws.
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { TRIP_LOCATION_TASK } from './config';
import type { LocationLike } from './mapping';
import { getTrackingDb } from './runtime';
import { handleLocationUpdate } from './taskHandler';

if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask<{ locations?: LocationLike[] }>(TRIP_LOCATION_TASK, async ({ data, error }) => {
      if (error) {
        console.warn('[tracking] location task error', error.message);
        return;
      }
      await handleLocationUpdate(getTrackingDb, data?.locations, Date.now, (m, e) =>
        console.warn(`[tracking] ${m}`, e),
      );
    });
  } catch (e) {
    console.warn('[tracking] defineTask failed', e);
  }
}
