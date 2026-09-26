// Geo helpers for display (never for the official distance, which is computed in Postgres).

export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6_371_008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north (0–360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point at `distanceM` from `origin` along `bearing` (degrees). */
export function destination(origin: LatLng, bearing: number, distanceM: number): LatLng {
  const d = distanceM / R;
  const b = rad(bearing);
  const lat1 = rad(origin.lat);
  const lng1 = rad(origin.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 =
    lng1 +
    Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
}

/** Closed polygon approximating a circle (for SDKs without a native circle). */
export function circlePolygon(center: LatLng, radiusM: number, steps = 64): LatLng[] {
  const pts = Array.from({ length: steps }, (_, i) => destination(center, (360 * i) / steps, radiusM));
  return [...pts, pts[0]!];
}

/** Bounding box of points as [[minLng, minLat], [maxLng, maxLat]] (Mappls/MapLibre order). */
export function bounds(points: LatLng[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export const isLatLng = (p: Partial<LatLng> | null | undefined): p is LatLng =>
  !!p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat!) <= 90 &&
  Math.abs(p.lng!) <= 180;
