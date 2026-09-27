/**
 * `mappls-proxy` tests (M6).
 *
 * Every Mappls response below is a trimmed copy of the shape published in the
 * Mappls REST API documentation, so a change in their real payload shows up
 * here as a failing normalisation rather than as a broken console.
 *
 * Run with:  deno test supabase/functions/
 */
import {
  type LatLng,
  type ProxyDeps,
  createRateLimiter,
  distanceUrl,
  handleProxy,
  normaliseAutosuggest,
  normaliseDistance,
  normaliseGeocode,
  normaliseReverse,
  reverseUrl,
} from "./proxy.ts";

const TOKEN = "mappls-static-key";

const BENGALURU: LatLng = { lat: 12.9716, lng: 77.5946 };
const COIMBATORE: LatLng = { lat: 11.0168, lng: 76.9558 };

function deps(overrides: Partial<ProxyDeps> = {}): ProxyDeps {
  return {
    fetchImpl: async () => new Response("{}", { status: 200 }),
    now: () => 1_700_000_000_000,
    getUser: async () => ({ id: "admin-1" }),
    isAdmin: async () => true,
    getAccessToken: () => TOKEN,
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = { Authorization: "Bearer jwt" }) {
  return new Request("http://localhost/functions/v1/mappls-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** A Mappls response served by the mocked fetch, recording the URL asked for. */
function mapplsServed(payload: unknown, status = 200) {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    seen.push(String(input));
    return new Response(JSON.stringify(payload), { status });
  };
  return { fetchImpl, seen, firstUrl: () => seen[0] ?? "" };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

// --- docs/06 §4: the four actions -----------------------------------------

Deno.test("autosuggest normalises suggestedLocations into docs/06 §4 shape", async () => {
  const { fetchImpl, firstUrl } = mapplsServed({
    suggestedLocations: [
      {
        type: "POI",
        placeName: "Mappls Head Office",
        placeAddress: "Okhla Industrial Estate Phase 3, New Delhi, 110020",
        latitude: 28.4729,
        longitude: 77.2937,
        eLoc: "MMI000",
        orderIndex: 1,
      },
      {
        // Geometry is RESTRICTED for some result types; the row must survive
        // with null coordinates rather than being dropped.
        type: "City",
        placeName: "Coimbatore",
        placeAddress: "Coimbatore, Tamil Nadu",
        eLoc: "ABC123",
        orderIndex: 2,
      },
    ],
  });

  const response = await handleProxy(
    post({ action: "autosuggest", query: "mappls", ...BENGALURU }),
    { deps: deps({ fetchImpl }) },
  );

  expectStatus(response, 200);
  const { result: results } = (await body(response)) as { result: MapplsSuggestion[] };
  expectEquals(results.length, 2);
  expectEquals(results[0].label, "Mappls Head Office");
  expectEquals(results[0].lat, 28.4729);
  expectEquals(results[0].lng, 77.2937);
  expectEquals(results[0].eLoc, "MMI000");
  expectEquals(results[1].lat, null);
  expectEquals(results[1].lng, null);
  // The bias point is sent as lat,lng per Mappls.
  expect(
    firstUrl().startsWith("https://search.mappls.com/search/places/autosuggest/json?"),
    `unexpected autosuggest URL: ${firstUrl()}`,
  );
  expect(decodeURIComponent(firstUrl()).includes("location=12.9716,77.5946"), "bias point missing");
});

Deno.test("autosuggest includes the key and omits the bias when no point is given", async () => {
  const { fetchImpl, firstUrl } = mapplsServed({ suggestedLocations: [] });
  await handleProxy(post({ action: "autosuggest", query: "hosur" }), { deps: deps({ fetchImpl }) });

  expect(firstUrl().includes(`access_token=${TOKEN}`), "the Mappls key must be sent as access_token");
  expect(!firstUrl().includes("location="), "no bias point was requested, so none should be sent");
});

Deno.test("geocode normalises copResults", async () => {
  const { fetchImpl, firstUrl } = mapplsServed({
    copResults: {
      houseNumber: "237",
      locality: "Okhla Industrial Estate Phase 3",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110020",
      formattedAddress: "237, Okhla Industrial Estate Phase 3, New Delhi, Delhi, 110020",
      eLoc: "TIYF9Q",
      latitude: 28.4729,
      longitude: 77.2937,
    },
  });

  const response = await handleProxy(post({ action: "geocode", address: "Okhla phase 3" }), {
    deps: deps({ fetchImpl }),
  });

  expectStatus(response, 200);
  const { result } = (await body(response)) as {
    result: { lat: number; lng: number; formattedAddress: string };
  };
  expectEquals(result.lat, 28.4729);
  expectEquals(result.lng, 77.2937);
  expectEquals(result.formattedAddress, "237, Okhla Industrial Estate Phase 3, New Delhi, Delhi, 110020");
  expect(firstUrl().includes("itemCount=1"), "geocode must ask for a single result");
});

Deno.test("geocode accepts the array form of copResults and 404s when there is no match", async () => {
  const { fetchImpl } = mapplsServed({
    copResults: [{ formattedAddress: "A", latitude: 1, longitude: 2 }],
  });
  const ok = await handleProxy(post({ action: "geocode", address: "a" }), { deps: deps({ fetchImpl }) });
  expectEquals(((await body(ok)) as { result: { lat: number } }).result.lat, 1);

  const empty = mapplsServed({ copResults: [] });
  const missing = await handleProxy(post({ action: "geocode", address: "nowhere" }), {
    deps: deps({ fetchImpl: empty.fetchImpl }),
  });
  expectStatus(missing, 404);
  expectEquals(((await body(missing)).error as { code: string }).code, "NOT_FOUND");
});

Deno.test("reverse normalises results[0].formatted_address", async () => {
  const { fetchImpl, firstUrl } = mapplsServed({
    responseCode: 200,
    version: "270.191",
    results: [
      {
        street: "Unnamed Road",
        village: "Basopatti",
        district: "Madhubani District",
        state: "Bihar",
        lat: "26.5645",
        lng: "85.9914",
        formatted_address: "Unnamed Road, Basopatti, Madhubani District, Bihar (India)",
      },
    ],
  });

  const response = await handleProxy(post({ action: "reverse", ...BENGALURU }), {
    deps: deps({ fetchImpl }),
  });

  expectStatus(response, 200);
  const { result } = (await body(response)) as { result: { formattedAddress: string } };
  expectEquals(result.formattedAddress, "Unnamed Road, Basopatti, Madhubani District, Bihar (India)");
  // Strings in Mappls' payload must still normalise to numbers upstream.
  expect(firstUrl().includes("lat=12.9716"), `unexpected reverse URL: ${firstUrl()}`);
  expect(reverseUrl(TOKEN, BENGALURU).includes("search/address/rev-geocode"), "wrong reverse path");
});

Deno.test("distance reads the source-to-destination cell and flips lng,lat in the path", async () => {
  const { fetchImpl, firstUrl } = mapplsServed({
    responseCode: 200,
    version: "191.17",
    results: {
      code: "Ok",
      distances: [[0, 359_412.4]],
      durations: [[0, 14_266.9]],
    },
  });

  const response = await handleProxy(
    post({ action: "distance", from: BENGALURU, to: COIMBATORE }),
    { deps: deps({ fetchImpl }) },
  );

  expectStatus(response, 200);
  const { result } = (await body(response)) as { result: { distanceM: number; durationS: number } };
  expectEquals(result.distanceM, 359_412.4);
  expectEquals(result.durationS, 14_266.9);

  // The routing API takes longitude,latitude — the reverse of the app's shape.
  expect(
    firstUrl().includes("distance_matrix/trucking/77.5946,12.9716;76.9558,11.0168"),
    `unexpected distance URL: ${firstUrl()}`,
  );
  expect(
    distanceUrl(TOKEN, BENGALURU, COIMBATORE).includes("route.mappls.com/route/dm"),
    "wrong routing host",
  );
});

// --- access control --------------------------------------------------------

Deno.test("a request without a bearer token is 401 and never calls Mappls", async () => {
  let called = 0;
  const response = await handleProxy(post({ action: "geocode", address: "x" }, {}), {
    deps: deps({
      fetchImpl: async () => {
        called += 1;
        return new Response("{}");
      },
    }),
  });

  expectStatus(response, 401);
  expectEquals(called, 0);
});

Deno.test("an invalid session is 401", async () => {
  const response = await handleProxy(post({ action: "geocode", address: "x" }), {
    deps: deps({ getUser: async () => null }),
  });
  expectStatus(response, 401);
  expectEquals(((await body(response)).error as { code: string }).code, "UNAUTHENTICATED");
});

Deno.test("a non-admin JWT is 403 and never calls Mappls (docs/06 §4)", async () => {
  let called = 0;
  const response = await handleProxy(post({ action: "geocode", address: "x" }), {
    deps: deps({
      isAdmin: async () => false,
      fetchImpl: async () => {
        called += 1;
        return new Response("{}");
      },
    }),
  });

  expectStatus(response, 403);
  expectEquals(((await body(response)).error as { code: string }).code, "FORBIDDEN");
  expectEquals(called, 0);
});

Deno.test("a non-POST method is refused", async () => {
  const req = new Request("http://localhost/functions/v1/mappls-proxy", { method: "GET" });
  const response = await handleProxy(req, { deps: deps() });
  expectStatus(response, 405);
});

Deno.test("a CORS preflight is answered without touching Supabase", async () => {
  const req = new Request("http://localhost/functions/v1/mappls-proxy", { method: "OPTIONS" });
  let called = 0;
  const response = await handleProxy(req, {
    deps: deps({
      getUser: async () => {
        called += 1;
        return { id: "x" };
      },
    }),
  });
  expectStatus(response, 204);
  expectEquals(called, 0);
  expectEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
});

// --- input validation ------------------------------------------------------

Deno.test("an unknown action is 400", async () => {
  const response = await handleProxy(post({ action: "delete-everything" }), { deps: deps() });
  expectStatus(response, 400);
  const message = ((await body(response)).error as { message: string }).message;
  expect(message.includes("autosuggest"), `the action list should be in the message: ${message}`);
});

Deno.test("missing or malformed parameters are 400 before any upstream call", async () => {
  let called = 0;
  const counting = deps({
    fetchImpl: async () => {
      called += 1;
      return new Response("{}");
    },
  });

  const cases: unknown[] = [
    { action: "autosuggest" },
    { action: "geocode" },
    { action: "reverse" },
    { action: "reverse", lat: 12.9 },
    { action: "distance", from: BENGALURU },
    { action: "distance", from: { lat: "x", lng: 1 }, to: BENGALURU },
  ];

  for (const payload of cases) {
    const response = await handleProxy(post(payload), { deps: counting });
    expectStatus(response, 400);
  }
  expectEquals(called, 0);
});

Deno.test("a search longer than Mappls' 45 characters is refused locally", async () => {
  let called = 0;
  const response = await handleProxy(post({ action: "autosuggest", query: "x".repeat(46) }), {
    deps: deps({
      fetchImpl: async () => {
        called += 1;
        return new Response("{}");
      },
    }),
  });
  expectStatus(response, 400);
  expectEquals(called, 0);
});

Deno.test("a body that is not JSON is 400", async () => {
  const req = new Request("http://localhost/functions/v1/mappls-proxy", {
    method: "POST",
    headers: { Authorization: "Bearer jwt", "Content-Type": "application/json" },
    body: "not json",
  });
  const response = await handleProxy(req, { deps: deps() });
  expectStatus(response, 400);
});

// --- upstream failures -----------------------------------------------------

Deno.test("an unauthorised Mappls key is reported as a server-side config problem", async () => {
  for (const status of [401, 403]) {
    const { fetchImpl } = mapplsServed({}, status);
    const response = await handleProxy(post({ action: "geocode", address: "x" }), {
      deps: deps({ fetchImpl }),
    });
    expectStatus(response, 502);
    expectEquals(((await body(response)).error as { code: string }).code, "MAPPLS_NOT_CONFIGURED");
  }
});

Deno.test("a missing Mappls key is 503 and the payload never echoes it", async () => {
  const response = await handleProxy(post({ action: "geocode", address: "x" }), {
    deps: deps({ getAccessToken: () => "" }),
  });
  expectStatus(response, 503);
  expectEquals(JSON.stringify(await body(response)).includes(TOKEN), false);
});

Deno.test("a network failure or unparseable body is 502", async () => {
  const thrown = await handleProxy(post({ action: "geocode", address: "x" }), {
    deps: deps({
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    }),
  });
  expectStatus(thrown, 502);

  const garbage = await handleProxy(post({ action: "geocode", address: "x" }), {
    deps: deps({ fetchImpl: async () => new Response("<html>nope</html>", { status: 200 }) }),
  });
  expectStatus(garbage, 502);
  expectEquals(((await body(garbage)).error as { code: string }).code, "MAPPLS_BAD_RESPONSE");
});

// --- rate limiting ---------------------------------------------------------

Deno.test("the limiter allows `limit` calls in the window and then 429s", () => {
  let now = 0;
  const limiter = createRateLimiter(3, 1_000, () => now);

  expectEquals(limiter.take("admin-1").allowed, true);
  expectEquals(limiter.take("admin-1").allowed, true);
  expectEquals(limiter.take("admin-1").allowed, true);

  const blocked = limiter.take("admin-1");
  expectEquals(blocked.allowed, false);
  expectEquals(blocked.retryAfterSeconds, 1);

  // A different user has their own budget.
  expectEquals(limiter.take("admin-2").allowed, true);

  // The window slides.
  now += 1_001;
  expectEquals(limiter.take("admin-1").allowed, true);
});

Deno.test("the handler returns 429 with Retry-After once the budget is gone", async () => {
  const geocode = { copResults: { formattedAddress: "Somewhere", latitude: 1, longitude: 2 } };
  const shared = deps({ fetchImpl: async () => new Response(JSON.stringify(geocode)) });
  // One limiter across both calls, the way a warm function instance sees them.
  const limiter = createRateLimiter(1, 60_000, shared.now);

  const response = await handleProxy(post({ action: "geocode", address: "x" }), {
    deps: shared,
    rateLimiter: limiter,
  });
  expectStatus(response, 200);

  const second = await handleProxy(post({ action: "geocode", address: "x" }), {
    deps: shared,
    rateLimiter: limiter,
  });
  expectStatus(second, 429);
  expectEquals(((await body(second)).error as { code: string }).code, "RATE_LIMITED");
  expect(Number(second.headers.get("Retry-After")) > 0, "Retry-After must be set on a 429");
});

// --- normalisers in isolation ---------------------------------------------

Deno.test("the normalisers tolerate junk instead of throwing", () => {
  expectEquals(normaliseAutosuggest(null), []);
  expectEquals(normaliseAutosuggest({ suggestedLocations: "nope" }), []);
  expectEquals(normaliseGeocode({}), null);
  expectEquals(normaliseGeocode({ copResults: { latitude: 1, longitude: 2 } }), null);
  expectEquals(normaliseReverse({ results: [] }), null);
  expectEquals(normaliseDistance({ results: { distances: [[0]], durations: [[0]] } }), null);
  expectEquals(normaliseDistance(null), null);
});

type MapplsSuggestion = { label: string; address: string; lat: number | null; lng: number | null; eLoc?: string };

// --- tiny assertion helpers so the file has no imports ---------------------

function expectStatus(response: Response, expected: number): void {
  if (response.status !== expected) {
    throw new Error(`expected status ${expected}, got ${response.status}`);
  }
}

function expectEquals<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(message === undefined ? `expected ${b}, got ${a}` : `${message} (expected ${b}, got ${a})`);
  }
}

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}
