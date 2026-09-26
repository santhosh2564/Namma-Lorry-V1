// Mappls REST calls + normalisation into the docs/06 §4 shapes.
// Endpoints and auth: see README.md (static REST key as the `access_token` query param).

import { HttpError } from '../_shared/http.ts';

export const MAPPLS = {
  autosuggest: 'https://search.mappls.com/search/places/autosuggest/json',
  geocode: 'https://search.mappls.com/search/address/geocode',
  reverse: 'https://search.mappls.com/search/address/rev-geocode',
  distance: 'https://route.mappls.com/route/dm/distance_matrix',
  route: 'https://route.mappls.com/route/direction/route_adv',
} as const;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Suggestion {
  label: string;
  address: string;
  /** null when the Mappls plan doesn't return coordinates (they are premium); use eLoc. */
  lat: number | null;
  lng: number | null;
  eLoc: string | null;
}
export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  formattedAddress: string;
  eLoc: string | null;
}
export interface ReverseResult {
  formattedAddress: string;
}
export interface DistanceResult {
  distanceM: number;
  durationS: number;
}

export interface RouteResult extends DistanceResult {
  /** Simplified route geometry for drawing the planned route (display only). */
  path: LatLng[];
}

export interface MapplsDeps {
  fetch: typeof fetch;
  key: string;
  /** Routing profile for planned distance: `trucking` (default) or `driving`. */
  profile: 'trucking' | 'driving';
  timeoutMs?: number;
}

type Json = Record<string, unknown>;

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Coordinates if Mappls included them (field names vary by API and plan). */
function coords(o: Json): { lat: number | null; lng: number | null } {
  const lat = num(o.latitude ?? o.lat ?? o.entryLatitude);
  const lng = num(o.longitude ?? o.lng ?? o.entryLongitude);
  return lat !== null && lng !== null ? { lat, lng } : { lat: null, lng: null };
}

async function call(deps: MapplsDeps, url: URL): Promise<Json | null> {
  url.searchParams.set('access_token', deps.key);
  let res: Response;
  try {
    res = await deps.fetch(url, { signal: AbortSignal.timeout(deps.timeoutMs ?? 8000) });
  } catch {
    throw new HttpError(504, 'MAPPLS_UNAVAILABLE');
  }
  if (res.status === 204) return null;
  if (res.status === 401) throw new HttpError(502, 'MAPPLS_AUTH', 'Mappls rejected the REST key');
  if (res.status === 403) {
    throw new HttpError(502, 'MAPPLS_QUOTA', 'Mappls quota exceeded or IP not whitelisted');
  }
  if (res.status === 400 || res.status === 412) throw new HttpError(400, 'MAPPLS_BAD_REQUEST');
  if (!res.ok) throw new HttpError(502, 'MAPPLS_UNAVAILABLE');
  try {
    return (await res.json()) as Json;
  } catch {
    throw new HttpError(502, 'MAPPLS_BAD_RESPONSE');
  }
}

export function normaliseAutosuggest(body: Json | null): Suggestion[] {
  const list = Array.isArray(body?.suggestedLocations) ? (body!.suggestedLocations as Json[]) : [];
  return list
    .slice()
    .sort((a, b) => (num(a.orderIndex) ?? 0) - (num(b.orderIndex) ?? 0))
    .map((s) => ({
      label: str(s.placeName) || str(s.placeAddress),
      address: str(s.placeAddress),
      ...coords(s),
      eLoc: str(s.eLoc) || null,
    }))
    .filter((s) => s.label !== '');
}

export function normaliseGeocode(body: Json | null): GeocodeResult | null {
  const raw = body?.copResults;
  const first = (Array.isArray(raw) ? raw[0] : raw) as Json | undefined;
  if (!first || !str(first.formattedAddress)) return null;
  return {
    ...coords(first),
    formattedAddress: str(first.formattedAddress),
    eLoc: str(first.eLoc ?? first.eloc) || null,
  };
}

export function normaliseReverse(body: Json | null): ReverseResult | null {
  const first = Array.isArray(body?.results) ? (body!.results as Json[])[0] : undefined;
  const formattedAddress = str(first?.formatted_address);
  return formattedAddress ? { formattedAddress } : null;
}

export function normaliseDistance(body: Json | null): DistanceResult | null {
  const results = body?.results as Json | undefined;
  const d = num((results?.distances as unknown[][] | undefined)?.[0]?.[1]);
  const t = num((results?.durations as unknown[][] | undefined)?.[0]?.[1]);
  return d !== null && t !== null ? { distanceM: Math.round(d), durationS: Math.round(t) } : null;
}

/** Decodes a Google/OSRM encoded polyline (precision 5 = 1e5), as returned by route_adv. */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

export function normaliseRoute(body: Json | null): RouteResult | null {
  const route = Array.isArray(body?.routes) ? (body!.routes as Json[])[0] : undefined;
  const d = num(route?.distance);
  const t = num(route?.duration);
  const geometry = str(route?.geometry);
  if (d === null || t === null) return null;
  return {
    distanceM: Math.round(d),
    durationS: Math.round(t),
    path: geometry ? decodePolyline(geometry) : [],
  };
}

export async function autosuggest(deps: MapplsDeps, query: string, near?: LatLng): Promise<Suggestion[]> {
  const url = new URL(MAPPLS.autosuggest);
  url.searchParams.set('query', query);
  url.searchParams.set('region', 'IND');
  if (near) url.searchParams.set('location', `${near.lat},${near.lng}`);
  return normaliseAutosuggest(await call(deps, url));
}

export async function geocode(deps: MapplsDeps, address: string): Promise<GeocodeResult | null> {
  const url = new URL(MAPPLS.geocode);
  url.searchParams.set('address', address);
  return normaliseGeocode(await call(deps, url));
}

export async function reverse(deps: MapplsDeps, at: LatLng): Promise<ReverseResult | null> {
  const url = new URL(MAPPLS.reverse);
  url.searchParams.set('lat', String(at.lat));
  url.searchParams.set('lng', String(at.lng));
  return normaliseReverse(await call(deps, url));
}

export async function distance(deps: MapplsDeps, from: LatLng, to: LatLng): Promise<DistanceResult | null> {
  // Mappls positions are "lng,lat". `region`/`rtype` are not supported with the trucking profile.
  const path = `${MAPPLS.distance}/${deps.profile}/${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = new URL(path);
  if (deps.profile === 'driving') {
    url.searchParams.set('rtype', '0');
    url.searchParams.set('region', 'ind');
  }
  return normaliseDistance(await call(deps, url));
}

export async function route(deps: MapplsDeps, from: LatLng, to: LatLng): Promise<RouteResult | null> {
  const url = new URL(`${MAPPLS.route}/${deps.profile}/${from.lng},${from.lat};${to.lng},${to.lat}`);
  url.searchParams.set('geometries', 'polyline');
  url.searchParams.set('overview', 'simplified');
  url.searchParams.set('alternatives', 'false');
  return normaliseRoute(await call(deps, url));
}
