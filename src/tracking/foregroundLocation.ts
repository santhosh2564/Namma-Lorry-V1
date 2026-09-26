// Foreground GPS for D4 (distance to pickup). Separate from the background trip task:
// it runs only while D4 is on screen and records nothing.
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { Fix } from '@/features/trips/startState';

import { getSimulatedLocation } from './runtime';

const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 2_000,
  distanceInterval: 0,
};

/** Calls `onFix` with each new position until the returned function is called. */
export function watchForegroundFix(onFix: (fix: Fix) => void, onError: (e: unknown) => void): () => void {
  if (Platform.OS === 'web') {
    // Dev preview: the simulated position set on /dev/tracking.
    const tick = () => {
      const p = getSimulatedLocation().position;
      onFix({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, timestamp: Date.now() });
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }

  let cancelled = false;
  let sub: Location.LocationSubscription | null = null;
  Location.watchPositionAsync(WATCH_OPTIONS, (loc) =>
    onFix({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      timestamp: loc.timestamp,
    }),
  )
    .then((s) => {
      if (cancelled) s.remove();
      else sub = s;
    })
    .catch(onError);
  return () => {
    cancelled = true;
    sub?.remove();
  };
}
