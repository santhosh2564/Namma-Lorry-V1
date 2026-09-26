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

// ---------- Display simplification (M12a performance) ----------

/** Most points a polyline is drawn with. Raw points stay untouched for replay, km and review. */
export const MAX_DISPLAY_POINTS = 1_000;

/** Metres on a local equirectangular projection around the path's mean latitude (display only). */
function project(path: LatLng[]): { x: Float64Array; y: Float64Array } {
  const k = Math.cos(rad(path.reduce((a, p) => a + p.lat, 0) / path.length));
  const x = new Float64Array(path.length);
  const y = new Float64Array(path.length);
  path.forEach((p, i) => {
    x[i] = rad(p.lng) * k * R;
    y[i] = rad(p.lat) * R;
  });
  return { x, y };
}

/**
 * Douglas–Peucker: keeps the points needed so the line stays within `toleranceM` of the
 * original. Always keeps the first and last point. Iterative (no recursion depth limit).
 */
export function douglasPeucker<T extends LatLng>(path: T[], toleranceM: number): T[] {
  const n = path.length;
  if (n <= 2) return path.slice();
  const { x, y } = project(path);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const tol2 = toleranceM * toleranceM;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const e = stack.pop()!;
    const s = stack.pop()!;
    const ax = x[s]!;
    const ay = y[s]!;
    const bx = x[e]! - ax;
    const by = y[e]! - ay;
    const len2 = bx * bx + by * by;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const px = x[i]! - ax;
      const py = y[i]! - ay;
      const t = len2 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
      const dx = px - t * bx;
      const dy = py - t * by;
      const d = dx * dx + dy * dy;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tol2) {
      keep[idx] = 1;
      stack.push(s, idx, idx, e);
    }
  }
  return path.filter((_, i) => keep[i] === 1);
}

/** Evenly spaced points, keeping both ends. */
function sample<T>(path: T[], count: number): T[] {
  const step = (path.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => path[Math.round(i * step)]!);
}

/**
 * The path to draw: unchanged when short, else Douglas–Peucker with a tolerance that grows
 * (5 m, 10 m, 20 m…) until at most `maxPoints` remain. Display only (docs/13 P13).
 * Very long inputs are first thinned to 5 × maxPoints so the cost stays bounded.
 */
export function simplifyForDisplay<T extends LatLng>(path: T[], maxPoints = MAX_DISPLAY_POINTS): T[] {
  if (path.length <= maxPoints) return path;
  const input = path.length > maxPoints * 5 ? sample(path, maxPoints * 5) : path;
  let out = input;
  for (let tol = 5; tol <= 50_000 && out.length > maxPoints; tol *= 2) out = douglasPeucker(input, tol);
  // Pathological input (noise everywhere): evenly sample what is left.
  return out.length <= maxPoints ? out : sample(out, maxPoints);
}
