/**
 * Mappls client (M6, docs/07 §7 row for the console).
 *
 * The app never calls Mappls directly. Every call goes through the
 * `mappls-proxy` Edge Function with the signed-in admin's JWT, which is what
 * keeps the Mappls key and the quota on the server (docs/06 §4). That is also
 * why this file can be perfectly ordinary client code: the proxy has already
 * normalised Mappls's payloads, so the response types here are ours.
 *
 * The shapes below are the docs/06 §4 contract, not Mappls's.
 */
import { mapAuthError } from "@/features/auth/errors";
import { supabase } from "@/lib/supabase";

export const MAPPLS_PROXY_FUNCTION = "mappls-proxy";

/** docs/06 §4 `autosuggest` row. `lat`/`lng` are null when Mappls restricts geometry. */
export type MapSuggestion = {
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  eLoc?: string;
};

export type MapGeocodeResult = { lat: number; lng: number; formattedAddress: string };

export type MapReverseResult = { formattedAddress: string };

/** Metres and seconds — the unit `loads.planned_distance_m` is stored in. */
export type MapDistanceResult = { distanceM: number; durationS: number };

export type LatLng = { lat: number; lng: number };

export type MapplsErrorCode =
  | "not_configured"
  | "forbidden"
  | "rate_limited"
  | "unauthenticated"
  | "not_found"
  | "upstream"
  | "bad_request"
  | "network"
  | "unknown";

export class MapplsError extends Error {
  readonly code: MapplsErrorCode;
  /** i18n key, so the UI never shows Mappls or Supabase prose. */
  readonly messageKey: string;

  constructor(code: MapplsErrorCode, messageKey: string) {
    super(messageKey);
    this.name = "MapplsError";
    this.code = code;
    this.messageKey = messageKey;
  }
}

const MESSAGE_KEYS: Record<MapplsErrorCode, string> = {
  not_configured: "mappls.notConfigured",
  forbidden: "mappls.forbidden",
  rate_limited: "mappls.rateLimited",
  unauthenticated: "mappls.unauthenticated",
  not_found: "mappls.notFound",
  upstream: "mappls.upstreamError",
  bad_request: "mappls.badRequest",
  network: "mappls.networkError",
  unknown: "mappls.unknownError",
};

function mapErrorCode(code: string): MapplsErrorCode {
  switch (code) {
    case "MAPPLS_NOT_CONFIGURED":
      return "not_configured";
    case "FORBIDDEN":
      return "forbidden";
    case "RATE_LIMITED":
      return "rate_limited";
    case "UNAUTHENTICATED":
      return "unauthenticated";
    case "NOT_FOUND":
      return "not_found";
    case "MAPPLS_UPSTREAM_ERROR":
    case "MAPPLS_BAD_RESPONSE":
      return "upstream";
    case "BAD_REQUEST":
    case "MAPPLS_BAD_REQUEST":
      return "bad_request";
    default:
      return "unknown";
  }
}

/** Deno-free response reader shared by every call. */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<MapplsEnvelope<T>>(
    MAPPLS_PROXY_FUNCTION,
    {
      body,
    },
  );

  if (error) {
    // A transport failure: no Supabase project, no network, or the function is
    // not deployed. The M5 error mapper already knows these shapes.
    const mapped = mapAuthError(error);
    const code: MapplsErrorCode =
      mapped === "network" || mapped === "not_configured" ? mapped : "upstream";
    throw new MapplsError(code, MESSAGE_KEYS[code]);
  }

  const envelope = data as MapplsEnvelope<T> | null;
  if (envelope === null || envelope === undefined) {
    throw new MapplsError("upstream", MESSAGE_KEYS.upstream);
  }
  if (envelope.error) {
    const code = mapErrorCode(envelope.error.code);
    throw new MapplsError(code, MESSAGE_KEYS[code]);
  }
  if (envelope.result === undefined) {
    throw new MapplsError("upstream", MESSAGE_KEYS.upstream);
  }

  return envelope.result;
}

/** What the proxy actually sends: the result under `result`, or an error. */
type MapplsEnvelope<T> = { result?: T; error?: { code: string; message: string } };

/** Address search for the pickup/drop fields. `at` biases results near a point. */
export function autosuggest(query: string, at?: LatLng): Promise<MapSuggestion[]> {
  const body: Record<string, unknown> = { action: "autosuggest", query };
  if (at) {
    body.lat = at.lat;
    body.lng = at.lng;
  }
  return call<MapSuggestion[]>(body);
}

/** Address → coordinates. This is how a chosen suggestion gets a real pin. */
export function geocode(address: string): Promise<MapGeocodeResult> {
  return call<MapGeocodeResult>({ action: "geocode", address });
}

/** Coordinates → a readable address (P1-2). */
export function reverse(at: LatLng): Promise<MapReverseResult> {
  return call<MapReverseResult>({ action: "reverse", ...at });
}

/**
 * Driving distance for a lorry, in metres. The Mappls side uses the
 * `trucking` routing profile — see the function README.
 */
export function distance(from: LatLng, to: LatLng): Promise<MapDistanceResult> {
  return call<MapDistanceResult>({ action: "distance", from, to });
}
