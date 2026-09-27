/**
 * Geo helpers (M3).
 *
 * All math is on the app's `{ lat, lng }` shape (see
 * `src/components/map/types.ts`). Coordinate-order conversion to Mappls'
 * `[lng, lat]` happens only inside the map components, never here.
 *
 * These are display helpers — the "official" distances and verification always
 * come from Postgres (`verify_trip`). Distances computed here are labelled
 * "approx." in the UI (CLAUDE.md rule 1).
 */
import type { LatLng } from "@/components/map/types";

/** Mean Earth radius (IUGG), metres. */
const EARTH_RADIUS_M = 6371008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Great-circle distance between two points, metres (haversine). */
export function haversineMetres(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Initial bearing from `from` to `to` in degrees clockwise from true north,
 * normalised to `[0, 360)`. Used to rotate the truck marker.
 */
export function bearing(from: LatLng, to: LatLng): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLng = toRadians(to.lng - from.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached by travelling `distanceM` metres from `origin` on `bearingDeg`. */
export function destinationPoint(origin: LatLng, distanceM: number, bearingDeg: number): LatLng {
  const angularDistance = distanceM / EARTH_RADIUS_M;
  const theta = toRadians(bearingDeg);
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(theta),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDegrees(lat2), lng: ((toDegrees(lng2) + 540) % 360) - 180 };
}

/**
 * Approximates a geofence circle as a closed polygon (`steps` vertices). Mappls
 * native draws geofences with a fill layer over a polygon source rather than a
 * dedicated circle primitive, and the web SDK accepts the same polygon.
 */
export function circlePolygon(center: LatLng, radiusM: number, steps = 64): LatLng[] {
  if (steps < 3) {
    throw new Error("circlePolygon needs at least 3 steps");
  }

  const ring: LatLng[] = [];
  for (let i = 0; i < steps; i += 1) {
    ring.push(destinationPoint(center, radiusM, (i * 360) / steps));
  }
  // Close the ring so it renders as a polygon, not an open line.
  ring.push({ ...ring[0]! });
  return ring;
}
