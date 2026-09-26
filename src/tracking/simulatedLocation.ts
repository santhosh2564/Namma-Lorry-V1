// Web (dev only): browsers can't track in the background (TRD §4.4). /dev/tracking uses this
// stand-in so the queue, uploader and state machine can be exercised end-to-end on web.
import type { LocationLike } from './mapping';
import type { LocationApi } from './stateMachine';

export interface SimulatedLocation extends LocationApi {
  position: { lat: number; lng: number; accuracy: number };
  /** Next simulated fix: moves `stepM` metres north-east of the current position. */
  step(stepM?: number, mocked?: boolean): LocationLike;
}

export function createSimulatedLocation(now: () => number): SimulatedLocation {
  let started = false;
  const sim: SimulatedLocation = {
    position: { lat: 12.7409, lng: 77.8253, accuracy: 8 },
    getForegroundPermissionsAsync: async () => ({ granted: true }),
    getBackgroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    getCurrentPositionAsync: async () => fix(),
    startLocationUpdatesAsync: async () => {
      started = true;
    },
    stopLocationUpdatesAsync: async () => {
      started = false;
    },
    hasStartedLocationUpdatesAsync: async () => started,
    step(stepM = 150, mocked = false) {
      const d = stepM / 111_320;
      sim.position = { ...sim.position, lat: sim.position.lat + d, lng: sim.position.lng + d };
      return fix(mocked);
    },
  };
  function fix(mocked = false): LocationLike {
    return {
      timestamp: now(),
      mocked,
      coords: {
        latitude: sim.position.lat,
        longitude: sim.position.lng,
        accuracy: sim.position.accuracy,
        speed: 12,
        heading: 45,
        altitude: 900,
      },
    };
  }
  return sim;
}
