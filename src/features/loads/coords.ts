import { isLatLng } from '@/lib/geo';

/** "12.9563, 79.9422" (comma or space) → {lat, lng}, or null. */
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const p = { lat: Number(m[1]), lng: Number(m[2]) };
  return isLatLng(p) ? p : null;
}
