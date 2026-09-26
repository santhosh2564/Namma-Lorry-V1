// Typed client for the `mappls-proxy` Edge Function (docs/06 §4).
// The app never calls Mappls REST directly and never sees Mappls payload formats.
import { invokeFunction } from './functions';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Suggestion {
  label: string;
  address: string;
  /** null when the Mappls plan returns only an eLoc (ND-26). */
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

/** Error codes the proxy can return (see supabase/functions/mappls-proxy/README.md). */
export type MapplsErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NO_ROUTE'
  | 'RATE_LIMITED'
  | 'CONFIG_MISSING'
  | 'MAPPLS_AUTH'
  | 'MAPPLS_QUOTA'
  | 'MAPPLS_UNAVAILABLE'
  | 'MAPPLS_BAD_REQUEST'
  | 'MAPPLS_BAD_RESPONSE'
  | 'NETWORK';

const call = <T>(body: Record<string, unknown>) => invokeFunction<T>('mappls-proxy', body);

export const mappls = {
  autosuggest: (query: string, near?: LatLng) =>
    call<Suggestion[]>({ action: 'autosuggest', query: query.trim().slice(0, 45), ...near }),
  geocode: (address: string) => call<GeocodeResult>({ action: 'geocode', address }),
  reverse: (at: LatLng) => call<ReverseResult>({ action: 'reverse', lat: at.lat, lng: at.lng }),
  distance: (from: LatLng, to: LatLng) => call<DistanceResult>({ action: 'distance', from, to }),
};
