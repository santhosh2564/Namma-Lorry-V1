import type { LatLng, MapMarker } from "./types";

/** Mappls coordinate order. */
export type Coord = [number, number];

/**
 * Bounding box of everything on the map, padded by each geofence radius so the
 * circle fits. Returns `undefined` when there is nothing to frame.
 */
export function contentBounds(
  markers: MapMarker[],
  paths: LatLng[][],
  centers: LatLng[],
  radiiM: number[],
): { ne: Coord; sw: Coord } | undefined {
  const lngs: number[] = [];
  const lats: number[] = [];

  for (const marker of markers) {
    lngs.push(marker.position.lng);
    lats.push(marker.position.lat);
  }
  for (const path of paths) {
    for (const point of path) {
      lngs.push(point.lng);
      lats.push(point.lat);
    }
  }
  centers.forEach((center, index) => {
    // Pad by the geofence radius (≈111 km per degree) so the circle fits too.
    const pad = (radiiM[index] ?? 0) / 111_000;
    lngs.push(center.lng - pad, center.lng + pad);
    lats.push(center.lat - pad, center.lat + pad);
  });

  if (lngs.length === 0 || lats.length === 0) {
    return undefined;
  }

  return {
    ne: [Math.max(...lngs), Math.max(...lats)],
    sw: [Math.min(...lngs), Math.min(...lats)],
  };
}

/**
 * Approximate centre + zoom for a bounding box. Used by the web map, which has
 * no single "fit bounds" call we rely on — it re-centres with `setCenter` +
 * `setZoom` instead.
 */
export function boundsCenterZoom(bounds: { ne: Coord; sw: Coord }): {
  center: LatLng;
  zoom: number;
} {
  const [neLng, neLat] = bounds.ne;
  const [swLng, swLat] = bounds.sw;

  const lngSpan = Math.max(0.0005, neLng - swLng);
  const latSpan = Math.max(0.0005, neLat - swLat);

  // Web-Mercator-ish zoom: the map is 360° wide at zoom 0 and ~170° tall.
  const zoom = Math.log2(360 / lngSpan);
  const latZoom = Math.log2(170 / latSpan);

  return {
    center: { lat: (neLat + swLat) / 2, lng: (neLng + swLng) / 2 },
    // 0.5 of headroom so padding-less bounds are not clipped.
    zoom: Math.max(2, Math.min(18, Math.min(zoom, latZoom) - 0.5)),
  };
}
