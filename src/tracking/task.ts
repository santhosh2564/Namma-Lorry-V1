/**
 * The background location task (M8, docs/03-TRD.md §4.2, CLAUDE.md hard rule 4).
 *
 * `TaskManager.defineTask` **must** run at module top level, never inside a
 * component or behind a lazy import, because the OS can launch the app in a
 * headless context and invoke the task before any screen renders. The root
 * layout imports this module first (see `app/_layout.tsx`).
 *
 * The task's contract is deliberately tiny: map the incoming fixes to queue rows
 * and return. It does **no network I/O** (TRD §4.2) — a slow upload can never
 * delay GPS capture. It also never throws: an uncaught rejection from a task
 * handler is how a background task stops being delivered.
 *
 * The ND-6 keep-alive lives here: `shouldRecord` keeps a row every `MIN_MOVE_M`
 * while moving and one every `HEARTBEAT_MS` while parked, so a stationary truck
 * does not look like a tracking gap.
 */
import type { LocationObject } from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { HEARTBEAT_MS, MIN_MOVE_M, TRIP_LOCATION_TASK } from "@/tracking/config";
import { getTrackingStore } from "@/tracking/db";
import {
  selectPoints,
  toPointInput,
  type PointInput,
  type RecordCandidate,
} from "@/tracking/queue";

/** Pull the location array out of the task body without trusting its shape. */
function extractLocations(data: unknown): LocationObject[] {
  if (data === null || typeof data !== "object") {
    return [];
  }
  const locations = (data as { locations?: unknown }).locations;
  return Array.isArray(locations) ? (locations as LocationObject[]) : [];
}

// Web has no background task manager; a browser never runs a trip (TRD §4.4).
if (Platform.OS !== "web") {
  TaskManager.defineTask(TRIP_LOCATION_TASK, async ({ data, error }) => {
    try {
      if (error) {
        console.warn("Trip location task reported an error:", error.message);
        return;
      }

      const locations = extractLocations(data);
      if (locations.length === 0) {
        return;
      }

      const store = await getTrackingStore();
      const state = await store.readState();
      // Only an in-progress trip is recorded; anything else (a stale task after
      // an end) is ignored rather than written.
      if (state.tripId === null || state.state !== "TRACKING") {
        return;
      }

      const previousRow = await store.lastPoint(state.tripId);
      const previous: RecordCandidate | null =
        previousRow === null
          ? null
          : { lat: previousRow.lat, lng: previousRow.lng, recordedAt: previousRow.recordedAt };

      const mapped = locations
        .map((location) => toPointInput(location))
        .filter((point): point is PointInput => point !== null);
      const accepted = selectPoints(previous, mapped, {
        minMoveM: MIN_MOVE_M,
        heartbeatMs: HEARTBEAT_MS,
      });

      if (accepted.length > 0) {
        await store.insertPoints(state.tripId, accepted);
      }
    } catch (thrown) {
      // Deliberately swallowed: the OS stops delivering a task that rejects.
      // The next fix retries; nothing is lost because the queue is local.
      console.warn("Trip location task failed:", thrown);
    }
  });
}
