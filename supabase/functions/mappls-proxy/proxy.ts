/**
 * Mappls proxy core (M6).
 *
 * Framework-free on purpose: every dependency the handler needs (fetch, the
 * clock, JWT verification, the admin check and the Mappls key) is injected, so
 * `proxy_test.ts` can exercise the whole request path with mocked Mappls
 * responses and no network, no Supabase instance and no Deno.env access.
 *
 * The point of the proxy (docs/06 §4) is that the app never learns Mappls's
 * payload shapes: everything is normalised here into the four shapes the
 * console is written against, and the Mappls credentials never leave this
 * process. See README.md for the researched endpoints and auth model.
 */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const PROXY_ACTIONS = ["autosuggest", "geocode", "reverse", "distance"] as const;
export type ProxyAction = (typeof PROXY_ACTIONS)[number];

/**
 * docs/06 §4 `autosuggest` row. `lat`/`lng` are null when Mappls restricts
 * geometry — see `normaliseAutosuggest` and the README.
 */
export type Suggestion = {
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  eLoc?: string;
};

/** docs/06 §4 `geocode` row. */
export type GeocodeResult = { lat: number; lng: number; formattedAddress: string };

/** docs/06 §4 `reverse` row. */
export type ReverseResult = { formattedAddress: string };

/** docs/06 §4 `distance` row — metres and seconds, the unit the DB stores. */
export type DistanceResult = { distanceM: number; durationS: number };

/** Production hosts, from the Mappls REST API documentation (see README.md). */
export const SEARCH_BASE = "https://search.mappls.com/search";
export const ROUTE_BASE = "https://route.mappls.com/route/dm";

/** A cheap default: one console user typing in a search box. */
const DEFAULT_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export type LatLng = { lat: number; lng: number };

/**
 * Everything the handler talks to. `getUser` / `isAdmin` are the Supabase
 * boundary, `fetchImpl` the Mappls boundary and `now` the clock, so tests are
 * deterministic.
 */
export type ProxyDeps = {
  fetchImpl: typeof fetch;
  now: () => number;
  /** Resolves a Supabase JWT to a user id, or null when it is not valid. */
  getUser: (jwt: string) => Promise<{ id: string } | null>;
  /** True when the JWT's user is an active admin (docs/06 §4: `is_admin()`). */
  isAdmin: (jwt: string) => Promise<boolean>;
  /** The server-held Mappls key. Never logged, never returned. */
  getAccessToken: () => string;
  /** Requests per user per window; defaults to 60 per minute. */
  rateLimit?: { limit: number; windowMs: number };
};

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Per-user sliding window, in memory. The Edge Function is the only place that
 * sees the real Mappls quota, and the traffic worth limiting (a typing admin,
 * a burst of searches) is short-lived. The README documents the multi-instance
 * caveat: this is a courtesy brake, not a quota guarantee.
 */
export type RateLimiter = {
  take: (key: string) => { allowed: boolean; retryAfterSeconds: number };
};

export function createRateLimiter(limit: number, windowMs: number, now: () => number): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    take(key: string) {
      const cutoff = now() - windowMs;
      const recent = (hits.get(key) ?? []).filter((at) => at > cutoff);

      if (recent.length >= limit) {
        const retryAfterMs = (recent[0] ?? now()) + windowMs - now();
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }

      recent.push(now());
      hits.set(key, recent);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function withToken(url: URL, token: string): string {
  url.searchParams.set("access_token", token);
  return url.toString();
}

export function autosuggestUrl(token: string, query: string, at?: LatLng): string {
  const url = new URL(`${SEARCH_BASE}/places/autosuggest/json`);
  url.searchParams.set("query", query);
  if (at) {
    // Mappls takes `location` as latitude,longitude — the opposite order to
    // the routing path segment below.
    url.searchParams.set("location", `${at.lat},${at.lng}`);
  }
  return withToken(url, token);
}

export function geocodeUrl(token: string, address: string): string {
  const url = new URL(`${SEARCH_BASE}/address/geocode`);
  url.searchParams.set("address", address);
  url.searchParams.set("itemCount", "1");
  return withToken(url, token);
}

export function reverseUrl(token: string, at: LatLng): string {
  const url = new URL(`${SEARCH_BASE}/address/rev-geocode`);
  url.searchParams.set("lat", String(at.lat));
  url.searchParams.set("lng", String(at.lng));
  return withToken(url, token);
}

export function distanceUrl(token: string, from: LatLng, to: LatLng): string {
  // The routing path segment is longitude,latitude, and `trucking` is the
  // profile that models a lorry. It supports the `distance_matrix` resource
  // only, so `region` and `rtype` are deliberately not sent.
  const points = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  return withToken(new URL(`${ROUTE_BASE}/distance_matrix/trucking/${points}`), token);
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** `suggestedLocations[]` → docs/06 §4 `[{ label, address, lat, lng, eLoc? }]`. */
export function normaliseAutosuggest(payload: unknown): Suggestion[] {
  if (!isRecord(payload) || !Array.isArray(payload.suggestedLocations)) {
    return [];
  }

  return payload.suggestedLocations.filter(isRecord).map((item) => {
    const suggestion: Suggestion = {
      label: str(item.placeName) ?? str(item.alternateName) ?? "",
      address: str(item.placeAddress) ?? "",
      // Mappls documents these as RESTRICTED: geometry comes back for some
      // result types and not for others, so the console geocodes the address
      // the admin picks instead of trusting a possibly-absent pin.
      lat: num(item.latitude) ?? num(item.entryLatitude),
      lng: num(item.longitude) ?? num(item.entryLongitude),
    };
    const eLoc = str(item.eLoc);
    if (eLoc) {
      suggestion.eLoc = eLoc;
    }
    return suggestion;
  });
}

/** `copResults` (object, or array when `itemCount` > 1) → the geocode row. */
export function normaliseGeocode(payload: unknown): GeocodeResult | null {
  if (!isRecord(payload)) {
    return null;
  }

  const result = Array.isArray(payload.copResults) ? payload.copResults[0] : payload.copResults;
  if (!isRecord(result)) {
    return null;
  }

  const lat = num(result.latitude) ?? num(result.lat);
  const lng = num(result.longitude) ?? num(result.lng);
  const formattedAddress = str(result.formattedAddress) ?? str(result.formatted_address);

  if (lat === null || lng === null || formattedAddress === null) {
    return null;
  }
  return { lat, lng, formattedAddress };
}

/** `results[0]` → `{ formattedAddress }`. */
export function normaliseReverse(payload: unknown): ReverseResult | null {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return null;
  }
  const first = payload.results[0];
  if (!isRecord(first)) {
    return null;
  }
  const formattedAddress = str(first.formatted_address) ?? str(first.formattedAddress);
  return formattedAddress === null ? null : { formattedAddress };
}

/**
 * `results.distances[0][1]` / `results.durations[0][1]` → metres and seconds.
 *
 * Column 0 is the source-to-source cell (always 0), so column 1 is the
 * source → destination value for the two points we sent.
 */
export function normaliseDistance(payload: unknown): DistanceResult | null {
  if (!isRecord(payload) || !isRecord(payload.results)) {
    return null;
  }
  const { distances, durations } = payload.results;
  if (!Array.isArray(distances) || !Array.isArray(durations)) {
    return null;
  }

  const row = distances[0];
  const timeRow = durations[0];
  if (!Array.isArray(row) || !Array.isArray(timeRow)) {
    return null;
  }

  const distanceM = num(row[1]);
  const durationS = num(timeRow[1]);
  if (distanceM === null || durationS === null) {
    return null;
  }
  return { distanceM, durationS };
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extra },
  });
}

/**
 * Every success is `{ result }` and every failure is `{ error }`, so the client
 * unwraps one shape instead of four.
 */
function fail(code: string, message: string, status: number, extra?: Record<string, string>): Response {
  return json({ error: { code, message } }, status, extra);
}

/**
 * Every success is `{ result }` and every failure is `{ error }`, so the client
 * has one shape to unwrap rather than four.
 */

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (header === null || !header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

function asLatLng(value: unknown): LatLng | null {
  if (!isRecord(value)) {
    return null;
  }
  const lat = num(value.lat);
  const lng = num(value.lng);
  return lat === null || lng === null ? null : { lat, lng };
}

function mapUpstreamStatus(status: number): Response {
  if (status === 400) {
    return fail("MAPPLS_BAD_REQUEST", "Mappls rejected the request.", 400);
  }
  if (status === 401 || status === 403) {
    // The Mappls key is a server secret, so a rejection here is an operator
    // problem (wrong key, API not enabled, or quota) and not something the
    // console user can fix.
    return fail("MAPPLS_NOT_CONFIGURED", "The Mappls key is not authorised for this API.", 502);
  }
  return fail("MAPPLS_UPSTREAM_ERROR", "Mappls could not be reached.", 502);
}

/** Resolves the action + body into a Mappls URL, or an error Response. */
function buildUpstreamRequest(
  action: ProxyAction,
  body: Json,
  token: string,
): { url: string } | { error: Response } {
  switch (action) {
    case "autosuggest": {
      const query = str(body.query);
      if (query === null) {
        return { error: fail("BAD_REQUEST", "autosuggest needs a query.", 400) };
      }
      if (query.length > 45) {
        // Mappls rejects longer input with a 400; catching it here saves a
        // request the console is guaranteed to lose.
        return { error: fail("BAD_REQUEST", "Search text is too long (45 characters max).", 400) };
      }
      // docs/06 §4 sends the bias point as flat `lat`/`lng`; either both or
      // neither, so an unpaired value is ignored rather than half-applied.
      const lat = num(body.lat);
      const lng = num(body.lng);
      const bias = lat === null || lng === null ? undefined : { lat, lng };
      return { url: autosuggestUrl(token, query, bias) };
    }
    case "geocode": {
      const address = str(body.address);
      if (address === null) {
        return { error: fail("BAD_REQUEST", "geocode needs an address.", 400) };
      }
      return { url: geocodeUrl(token, address) };
    }
    case "reverse": {
      // docs/06 §4 sends `lat`/`lng` flat for reverse but nested for distance;
      // both are accepted here so the console has one shape to think about.
      const at = asLatLng(body) ?? asLatLng(body.location);
      if (at === null) {
        return { error: fail("BAD_REQUEST", "reverse needs numeric lat and lng.", 400) };
      }
      return { url: reverseUrl(token, at) };
    }
    case "distance": {
      const from = asLatLng(body.from);
      const to = asLatLng(body.to);
      if (from === null || to === null) {
        return { error: fail("BAD_REQUEST", "distance needs from and to as { lat, lng }.", 400) };
      }
      return { url: distanceUrl(token, from, to) };
    }
  }
}

export type HandleOptions = { deps: ProxyDeps; rateLimiter?: RateLimiter };

/** Handles one `POST /functions/v1/mappls-proxy` request. */
export async function handleProxy(req: Request, options: HandleOptions): Promise<Response> {
  const { deps } = options;
  const limit = deps.rateLimit ?? DEFAULT_RATE_LIMIT;
  const limiter = options.rateLimiter ?? createRateLimiter(limit.limit, limit.windowMs, deps.now);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Use POST.", 405);
  }

  const jwt = bearerToken(req);
  if (jwt === null) {
    return fail("UNAUTHENTICATED", "Missing bearer token.", 401);
  }

  const user = await deps.getUser(jwt);
  if (user === null) {
    return fail("UNAUTHENTICATED", "Invalid or expired session.", 401);
  }

  if (!(await deps.isAdmin(jwt))) {
    return fail("FORBIDDEN", "Console access is admin only.", 403);
  }

  const { allowed, retryAfterSeconds } = limiter.take(user.id);
  if (!allowed) {
    return fail("RATE_LIMITED", "Too many Mappls requests. Try again shortly.", 429, {
      "Retry-After": String(retryAfterSeconds),
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST", "Body must be JSON.", 400);
  }
  if (!isRecord(body)) {
    return fail("BAD_REQUEST", "Body must be a JSON object.", 400);
  }

  const action = body.action;
  if (typeof action !== "string" || !PROXY_ACTIONS.includes(action as ProxyAction)) {
    return fail("BAD_REQUEST", `action must be one of ${PROXY_ACTIONS.join(", ")}.`, 400);
  }

  const token = deps.getAccessToken();
  if (!token) {
    return fail("MAPPLS_NOT_CONFIGURED", "No Mappls key is configured for this deployment.", 503);
  }

  const built = buildUpstreamRequest(action as ProxyAction, body, token);
  if ("error" in built) {
    return built.error;
  }

  let upstream: Response;
  try {
    upstream = await deps.fetchImpl(built.url, { headers: { Accept: "application/json" } });
  } catch {
    return fail("MAPPLS_UPSTREAM_ERROR", "Mappls could not be reached.", 502);
  }

  if (!upstream.ok) {
    return mapUpstreamStatus(upstream.status);
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return fail("MAPPLS_BAD_RESPONSE", "Mappls returned a response we could not read.", 502);
  }

  switch (action as ProxyAction) {
    case "autosuggest":
      return json({ result: normaliseAutosuggest(payload) }, 200);
    case "geocode": {
      const result = normaliseGeocode(payload);
      return result === null
        ? fail("NOT_FOUND", "No match for that address.", 404)
        : json({ result }, 200);
    }
    case "reverse": {
      const result = normaliseReverse(payload);
      return result === null
        ? fail("NOT_FOUND", "No address at those coordinates.", 404)
        : json({ result }, 200);
    }
    case "distance": {
      const result = normaliseDistance(payload);
      return result === null
        ? fail("MAPPLS_BAD_RESPONSE", "Mappls returned no route for those points.", 502)
        : json({ result }, 200);
    }
  }
}
