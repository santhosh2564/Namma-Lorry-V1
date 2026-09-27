// Wires the tracking engine to the real modules (expo-sqlite, expo-location, Supabase,
// NetInfo, AppState). Everything here is lazy: importing it opens nothing.
import NetInfo from '@react-native-community/netinfo';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { AppState, Platform } from 'react-native';

import { devSessionGet, devSessionSet } from '@/lib/devDriverWeb';
import { supabase } from '@/lib/supabase';

import { TRIP_LOCATION_TASK, UPLOAD_INTERVAL_MS } from './config';
import type { SqlDb } from './db';
import { counts, getActiveTrip } from './queue';
import { createSimulatedLocation, type SimulatedLocation } from './simulatedLocation';
import { createEngine, type LocationApi, type ServerTrip, type TrackingEngine } from './stateMachine';
import { getTrackingDb } from './trackingDb';
import { createUploader, type Uploader } from './uploader';

export { getTrackingDb };

const isWeb = Platform.OS === 'web';
const log = (msg: string, e?: unknown) => console.warn(`[tracking] ${msg}`, e ?? '');

const nativeLocation: LocationApi = {
  getForegroundPermissionsAsync: () => Location.getForegroundPermissionsAsync(),
  getBackgroundPermissionsAsync: () => Location.getBackgroundPermissionsAsync(),
  hasServicesEnabledAsync: () => Location.hasServicesEnabledAsync(),
  getCurrentPositionAsync: (o) => Location.getCurrentPositionAsync(o),
  startLocationUpdatesAsync: (task, o) => Location.startLocationUpdatesAsync(task, o),
  stopLocationUpdatesAsync: (task) => Location.stopLocationUpdatesAsync(task),
  hasStartedLocationUpdatesAsync: (task) => Location.hasStartedLocationUpdatesAsync(task),
};

let simulated: SimulatedLocation | null = null;
/** Web dev only (/dev/tracking). */
export function getSimulatedLocation(): SimulatedLocation {
  if (!simulated) {
    simulated = createSimulatedLocation(Date.now);
    const saved = devSessionGet<SimulatedLocation['position']>('position');
    if (saved) simulated.position = saved;
  }
  return simulated;
}

/** Web dev only: move the simulated phone (kept across reloads for the driver preview). */
export function setSimulatedPosition(position: SimulatedLocation['position']): void {
  getSimulatedLocation().position = position;
  devSessionSet('position', position);
}

async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

let engineAndUploader: Promise<{ engine: TrackingEngine; uploader: Uploader; db: SqlDb }> | null = null;

export function getTracking() {
  engineAndUploader ??= getTrackingDb().then((db) => {
    const uploader = createUploader({
      db,
      upsertPoints: async (rows) => {
        const { error } = await supabase
          .from('trip_points')
          .upsert(rows, { onConflict: 'trip_id,seq', ignoreDuplicates: true });
        return { error };
      },
      hasSession,
      now: Date.now,
      random: Math.random,
    });
    const engine = createEngine({
      db,
      location: isWeb ? getSimulatedLocation() : nativeLocation,
      rpc: async (fn, args) => {
        const { data, error } = await supabase.rpc(fn, args as never);
        return { data: (data as ServerTrip | null) ?? null, error };
      },
      fetchTrip: async (tripId) => {
        if (!(await hasSession())) throw new Error('NO_SESSION');
        const { data, error } = await supabase
          .from('trips')
          .select('id, status, started_at')
          .eq('id', tripId)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      uploader,
      now: Date.now,
      deviceInfo: () => ({
        os: Platform.OS,
        osVersion: Device.osVersion ?? '',
        model: Device.modelName ?? '',
        appVersion: Application.nativeApplicationVersion ?? '',
      }),
      log,
    });
    return { engine, uploader, db };
  });
  engineAndUploader.catch(() => {
    engineAndUploader = null;
  });
  return engineAndUploader;
}

/** One sync pass: upload a batch, retry a pending end, clean up finished trips. Never throws. */
export async function syncTick(force = false): Promise<void> {
  try {
    const { engine, uploader, db } = await getTracking();
    const r = await uploader.flush({ force });
    const active = await getActiveTrip(db);
    if (active && active.state !== 'TRACKING' && (r.status === 'idle' || r.status === 'uploaded')) {
      await engine.syncPendingEnd();
    }
    if (r.status === 'idle') await engine.cleanupFinished();
  } catch (e) {
    log('sync failed', e);
  }
}

/**
 * Starts the foreground sync loop: resume on launch, then every 30 s, on reconnect and on
 * app foreground (TRD §4.3). Returns a stop function. Native only (web never runs trips).
 */
export function startTrackingRuntime(): () => void {
  let stopped = false;
  void getTracking()
    .then(({ engine }) => engine.resumeOnLaunch())
    .catch((e) => log('resume failed', e));

  const timer = setInterval(() => void syncTick(), UPLOAD_INTERVAL_MS);

  const appState = AppState.addEventListener('change', (s) => {
    if (s !== 'active' || stopped) return;
    void getTracking().then(async ({ engine, uploader }) => {
      uploader.resetBackoff();
      await engine.resumeOnLaunch(); // re-checks permissions, restarts updates if needed
      await syncTick(true);
    });
  });

  let online: boolean | null = null;
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    const now = !!state.isConnected && state.isInternetReachable !== false;
    if (now && online === false) {
      void getTracking().then(({ uploader }) => {
        uploader.resetBackoff();
        void syncTick(true);
      });
    }
    online = now;
  });

  return () => {
    stopped = true;
    clearInterval(timer);
    appState.remove();
    unsubscribeNet();
  };
}

/** Background location task running (D5 tracking-problem banner). */
export async function isTripTaskRunning(): Promise<boolean> {
  const location = isWeb ? getSimulatedLocation() : nativeLocation;
  return location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK);
}

/** Local data that must reach the server before the driver may sign out. */
export async function unsyncedSummary(): Promise<{
  activeTripId: string | null;
  unsyncedTripId: string | null;
  pending: number;
}> {
  const { db } = await getTracking();
  const active = await getActiveTrip(db);
  const c = await counts(db);
  return {
    activeTripId: active?.state === 'TRACKING' ? active.trip_id : null,
    unsyncedTripId: active && active.state !== 'TRACKING' ? active.trip_id : null,
    pending: c.pending,
  };
}
