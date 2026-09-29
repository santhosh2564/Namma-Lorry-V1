/**
 * Douglas–Peucker polyline simplification — for DISPLAY ONLY (M12a performance).
 * Official distance is computed from every stored point in Postgres (verify_trip);
 * nothing simplified here is ever uploaded or used for verification.
 */
export type LatLng = { lat: number; lng: number };

const METRES_PER_DEGREE = 111_320;

/** Keeps the first and last point and every point further than toleranceM from the simplified line. */
export function douglasPeucker<T extends LatLng>(points: readonly T[], toleranceM: number): T[] {
  if (points.length <= 2) return [...points];
  // Local equirectangular projection to metres: accurate enough at trip scale.
  const cosLat = Math.cos(
    ((points[0]!.lat + points[points.length - 1]!.lat) / 2) * (Math.PI / 180),
  );
  const xy = points.map(
    (p) => [p.lng * cosLat * METRES_PER_DEGREE, p.lat * METRES_PER_DEGREE] as const,
  );

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]]; // iterative: long trips have 10k+ points
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDistance = -1;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpendicularDistance(xy[i]!, xy[start]!, xy[end]!);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > toleranceM) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

function perpendicularDistance(
  [px, py]: readonly [number, number],
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export const MAX_DISPLAY_POINTS = 500;

/**
 * Simplify a route to at most maxPoints for drawing. Starts at a 5 m tolerance and
 * doubles it until the cap is met; endpoints are always kept.
 */
export function simplifyForDisplay<T extends LatLng>(
  points: readonly T[],
  maxPoints = MAX_DISPLAY_POINTS,
): T[] {
  if (points.length <= maxPoints) return [...points];
  let tolerance = 5;
  let result = douglasPeucker(points, tolerance);
  while (result.length > maxPoints && tolerance < 1_000_000) {
    tolerance *= 2;
    result = douglasPeucker(points, tolerance);
  }
  return result;
}
