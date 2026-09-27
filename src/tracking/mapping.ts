// LocationObject (expo-location) → queue point (docs/06 §2 "Map expo-location → row").
import type { NewPoint } from './queue';

/** Structural subset of expo-location's LocationObject (keeps this module free of native imports). */
export interface LocationLike {
  timestamp: number;
  mocked?: boolean;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    altitude: number | null;
  };
}

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
/** iOS reports -1 for an invalid speed/heading/accuracy. */
const valid = (v: number | null | undefined) => (finite(v) && v >= 0 ? v : null);

export function toNewPoint(l: LocationLike): NewPoint | null {
  const { latitude: lat, longitude: lng } = l.coords;
  if (!finite(lat) || !finite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (!finite(l.timestamp) || l.timestamp <= 0) return null;
  return {
    recorded_at: new Date(l.timestamp).toISOString(),
    lat,
    lng,
    accuracy_m: valid(l.coords.accuracy),
    speed_mps: valid(l.coords.speed),
    heading: valid(l.coords.heading),
    altitude_m: finite(l.coords.altitude) ? l.coords.altitude : null,
    is_mocked: l.mocked === true, // Android only; iOS never reports it
  };
}

/**
 * Maps a task batch, dropping unusable fixes and ones recorded before the trip
 * started (minus tolerance): the server's RLS would reject those anyway (ND-8).
 */
export function mapLocations(
  locations: LocationLike[],
  startedAt: string | null,
  toleranceMs: number,
): NewPoint[] {
  const min = startedAt ? Date.parse(startedAt) - toleranceMs : -Infinity;
  const out: NewPoint[] = [];
  for (const l of locations) {
    const p = toNewPoint(l);
    if (p && l.timestamp >= min) out.push(p);
  }
  return out;
}
