/**
 * Tracking composition root (M8).
 *
 * `stateMachine.ts` is written against injected dependencies so it can be tested
 * without a device. This module is where the real ones are supplied: the SQLite
 * (or in-memory) store, the two Supabase RPCs, the expo-location task, and the
 * uploader.
 *
 * It is the only place the rest of the app should import tracking side effects
 * from — the screens call `startTrip` / `endTrip`, and the launch bootstrap
 * calls `resumeTrackingOnLaunch`. Everything is built lazily and memoised, so
 * importing this module costs nothing until a trip is actually started.
 */
import { Platform } from "react-native";

import type { Json } from "@/lib/database.types";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { resetTrackingStore, getTrackingStore } from "@/tracking/db";
import { errorMessage, isNetworkError } from "@/tracking/errors";
import {
  getDeviceInfo,
  getFreshFix,
  startLocationUpdates,
  stopLocationUpdates,
} from "@/tracking/permissions";
import {
  createTrackingService,
  type EndTripResult,
  type EndTripRpcArgs,
  type EndTripRpcOutcome,
  type ResumeResult,
  type StartTripResult,
  type StartTripRpcArgs,
  type StartTripRpcOutcome,
  type TrackingService,
} from "@/tracking/stateMachine";
import {
  createUploader,
  type FlushResult,
  type UploadOutcome,
  type UploadRow,
  type Uploader,
} from "@/tracking/uploader";

/**
 * `start_trip`. The generated types mark the SQL parameters non-null, but a
 * missing accuracy is meaningful to the RPC: it raises `GPS_ACCURACY_TOO_LOW`,
 * which is exactly what the driver should be told. The cast documents that the
 * null is intentional rather than a mistake.
 */
async function startTripRpc(args: StartTripRpcArgs): Promise<StartTripRpcOutcome> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: "Supabase is not configured" };
  }
  const { data, error } = await supabase.rpc("start_trip", {
    p_trip_id: args.tripId,
    p_lat: args.lat,
    p_lng: args.lng,
    p_accuracy_m: args.accuracyM as number,
    p_device_info: (args.deviceInfo ?? null) as Json,
  });
  if (error) {
    return { ok: false, error };
  }
  return { ok: true, startedAt: data?.started_at ?? null };
}

/**
 * `end_trip`. `p_lat` / `p_lng` are nullable in the SQL — a phone with no fix
 * must still be able to end, and the verifier then flags `END_OUTSIDE_DROP`
 * rather than the app silently inventing a coordinate. The generated types call
 * them required, hence the casts.
 */
async function endTripRpc(args: EndTripRpcArgs): Promise<EndTripRpcOutcome> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: "Supabase is not configured" };
  }
  const { data, error } = await supabase.rpc("end_trip", {
    p_trip_id: args.tripId,
    p_lat: args.lat as number,
    p_lng: args.lng as number,
    p_accuracy_m: args.accuracyM as number,
    p_ended_at: args.endedAt,
    p_expected_points: args.expectedPoints,
  });
  if (error) {
    return { ok: false, error };
  }
  return { ok: true, status: data?.status ?? null };
}

/**
 * The real `trip_points` upsert (docs/06 §2). `ignoreDuplicates` is what makes
 * re-sending a batch after a partial failure safe.
 */
async function uploadRows(rows: UploadRow[]): Promise<UploadOutcome> {
  if (!isSupabaseConfigured) {
    // Treated as "not yet": nothing is lost, the rows stay queued and go up once
    // the build is configured. Quarantining them would destroy data.
    return { ok: false, kind: "network", message: "Supabase is not configured" };
  }
  try {
    const { error } = await supabase
      .from("trip_points")
      .upsert(rows, { onConflict: "trip_id,seq", ignoreDuplicates: true });
    if (!error) {
      return { ok: true };
    }
    return isNetworkError(error)
      ? { ok: false, kind: "network", message: error.message }
      : { ok: false, kind: "data", message: error.message };
  } catch (thrown) {
    return { ok: false, kind: "network", message: errorMessage(thrown) };
  }
}

let uploaderPromise: Promise<Uploader> | null = null;
let servicePromise: Promise<TrackingService> | null = null;

function getUploader(): Promise<Uploader> {
  if (uploaderPromise === null) {
    uploaderPromise = getTrackingStore().then((store) =>
      createUploader({ store, upload: uploadRows, now: Date.now }),
    );
  }
  return uploaderPromise;
}

export function getTrackingService(): Promise<TrackingService> {
  if (servicePromise === null) {
    servicePromise = (async () => {
      const store = await getTrackingStore();
      const uploader = await getUploader();
      return createTrackingService({
        store,
        now: Date.now,
        getFreshFix,
        startTripRpc,
        endTripRpc,
        startLocationUpdates,
        stopLocationUpdates,
        flush: () => uploader.flush(),
        deviceInfo: getDeviceInfo,
        log: (message, detail) => console.warn(`[tracking] ${message}`, detail),
      });
    })();
  }
  return servicePromise;
}

/** Start recording a trip (D4, M9). Never starts the task unless the RPC agrees. */
export async function startTrip(tripId: string): Promise<StartTripResult> {
  return (await getTrackingService()).startTrip(tripId);
}

/** End the trip being recorded (D5, M10). Works offline via ENDED_PENDING_SYNC. */
export async function endTrip(): Promise<EndTripResult> {
  return (await getTrackingService()).endTrip();
}

/** Called once at launch: restart tracking, or finish a pending end. */
export async function resumeTrackingOnLaunch(): Promise<ResumeResult> {
  return (await getTrackingService()).resumeOnLaunch();
}

/** One upload pass (the dev screen's "flush now"). */
export async function flushPoints(): Promise<FlushResult> {
  return (await getUploader()).flush();
}

/**
 * Start the upload scheduler: a 30 s timer plus a reconnect and a foreground
 * trigger (TRD §4.3). Native only — web has no trips and nothing to sync, so a
 * timer there would be pure noise.
 */
export function startUploadScheduler(): void {
  if (Platform.OS === "web") {
    return;
  }
  void getUploader().then((uploader) => uploader.start());
}

export function stopUploadScheduler(): void {
  if (Platform.OS === "web") {
    return;
  }
  void getUploader().then((uploader) => uploader.stop());
}

/** Drop the memoised store/service (the dev screen's "start over"). */
export function resetTrackingSingletons(): void {
  uploaderPromise = null;
  servicePromise = null;
  resetTrackingStore();
}
