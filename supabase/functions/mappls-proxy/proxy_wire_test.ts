/**
 * `mappls-proxy` wire-format tests (M7).
 *
 * The tests in `proxy_test.ts` stub `fetch`, which is the right way to test
 * normalisation but cannot prove what actually goes out on the wire: a stub
 * never sees a real URL parse, a real query string or a real HTTP round trip.
 * These tests run the **real handler over real HTTP** against a local server
 * that speaks Mappls' documented response shapes, swapping only the origin.
 * Path and query string are preserved exactly, so what the stub server records
 * is what Mappls would receive.
 *
 * This is the closest thing to a "real call" that can run without a Mappls
 * account. It does **not** prove that Mappls' live service matches the shapes
 * below — only a deployed function with a real `MAPPLS_REST_KEY` can do that.
 *
 * Run with:  deno test supabase/functions/
 */
import { type LatLng, type ProxyDeps, handleProxy } from "./proxy.ts";

const TOKEN = "mappls-static-key-do-not-leak";

const BENGALURU: LatLng = { lat: 12.9716, lng: 77.5946 };
const COIMBATORE: LatLng = { lat: 11.0168, lng: 76.9558 };

type Seen = { path: string; query: URLSearchParams };

/**
 * A local HTTP server standing in for search.mappls.com / route.mappls.com.
 *
 * Async because the port is only known once the listener is up, and the
 * handler needs the origin to rewrite the proxy's URLs to.
 */
async function startMapplsStandIn(
  route: (seen: Seen) => { payload: unknown; status?: number },
): Promise<{ origin: string; seen: Seen[]; close: () => Promise<void> }> {
  const seen: Seen[] = [];
  let resolvePort: (port: number) => void = () => {};
  const portReady = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });

  const server = Deno.serve(
    {
      hostname: "127.0.0.1",
      port: 0,
      onListen: (address) => resolvePort(address.port),
    },
    (request) => {
      const url = new URL(request.url);
      const record: Seen = { path: url.pathname, query: url.searchParams };
      seen.push(record);      const { payload, status = 200 } = route(record);
        // A 204 must not carry a body; `new Response("null", { status: 204 })`
        // throws, which is how this test caught its own bad fixture first.
        return status === 204
          ? new Response(null, { status })
          : new Response(JSON.stringify(payload), {
              status,
              headers: { "Content-Type": "application/json" },
            });
    },
  );

  const port = await portReady;

  return {
    origin: `http://127.0.0.1:${port}`,
    seen,
    close: () => server.shutdown(),
  };
}

/** Rewrites only the origin, so path and query reach the server untouched. */
function wireFetch(origin: string): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    url.host = new URL(origin).host;
    url.protocol = new URL(origin).protocol;
    return await fetch(url, init);
  }) as typeof fetch;
}

function deps(overrides: Partial<ProxyDeps> = {}): ProxyDeps {
  return {
    fetchImpl: (async () => new Response("{}", { status: 200 })) as typeof fetch,
    now: () => 1_700_000_000_000,
    getUser: async () => ({ id: "admin-1" }),
    isAdmin: async () => true,
    getAccessToken: () => TOKEN,
    ...overrides,
  };
}

function post(body: unknown) {
  return new Request("http://localhost/functions/v1/mappls-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer jwt" },
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

Deno.test("autosuggest: the real request carries the path, the key and lat,lng", async () => {
  const stand = await startMapplsStandIn(() => ({
    payload: {
      suggestedLocations: [
        {
          placeName: "SIPCOT Industrial Park",
          placeAddress: "Sriperumbudur, Tamil Nadu",
          eLoc: "abc123",
          latitude: "12.9676",
          longitude: "79.9426",
        },
      ],
    },
  }));

  const response = await handleProxy(
    post({ action: "autosuggest", query: "Sriperumbudur", lat: BENGALURU.lat, lng: BENGALURU.lng }),
    { deps: deps({ fetchImpl: wireFetch(stand.origin) }) },
  );

  const seen = stand.seen[0];
  if (seen === undefined) {
    throw new Error("the stand-in server was never called");
  }

  expectEquals(seen.path, "/search/places/autosuggest/json");
  expectEquals(seen.query.get("query"), "Sriperumbudur");
  // Aug 2025 auth: a single static key as a query parameter.
  expectEquals(seen.query.get("access_token"), TOKEN);
  // Mappls takes `location` as latitude,longitude.
  expectEquals(seen.query.get("location"), `${BENGALURU.lat},${BENGALURU.lng}`);

  // Geometry came back this time, so the pin is real.
  const payload = await json(response);
  expectEquals((payload.result as { lat: number | null }[])[0]?.lat, 12.9676);

  await stand.close();
});

Deno.test("geocode: address in, one normalised point out", async () => {
  const stand = await startMapplsStandIn(() => ({
    payload: {
      copResults: {
        formattedAddress: "Kurichi Industrial Estate, Coimbatore",
        latitude: "11.0016",
        longitude: "76.9555",
      },
    },
  }));

  const response = await handleProxy(post({ action: "geocode", address: "Kurichi" }), {
    deps: deps({ fetchImpl: wireFetch(stand.origin) }),
  });

  expectEquals(stand.seen[0]?.path, "/search/address/geocode");
  expectEquals(stand.seen[0]?.query.get("address"), "Kurichi");
  expectEquals(await json(response), {
    result: {
      lat: 11.0016,
      lng: 76.9555,
      formattedAddress: "Kurichi Industrial Estate, Coimbatore",
    },
  });

  await stand.close();
});

Deno.test("reverse: Mappls answers in snake_case and the proxy normalises it", async () => {
  const stand = await startMapplsStandIn(() => ({
    payload: {
      results: [{ formatted_address: "12 Main Road, Bengaluru", lat: "12.97", lng: "77.59" }],
    },
  }));

  const response = await handleProxy(post({ action: "reverse", ...BENGALURU }), {
    deps: deps({ fetchImpl: wireFetch(stand.origin) }),
  });

  expectEquals(stand.seen[0]?.path, "/search/address/rev-geocode");
  // Verified against the Mappls reverse-geocoding docs: `lat` and `lng` are
  // separate parameters here, *not* the `location=lat,lng` that autosuggest
  // takes. https://developer.mappls.com/documentation/sdk/rest-apis/
  //   mappls-maps-reverse-geocoding-rest-api-example/Readme/
  expectEquals(stand.seen[0]?.query.get("lat"), String(BENGALURU.lat));
  expectEquals(stand.seen[0]?.query.get("lng"), String(BENGALURU.lng));
  expectEquals(await json(response), { result: { formattedAddress: "12 Main Road, Bengaluru" } });

  await stand.close();
});

Deno.test("geocode: 204 means 'no match', not 'Mappls is broken'", async () => {
  // The documented success-with-no-results code for the search APIs.
  const stand = await startMapplsStandIn(() => ({ payload: null, status: 204 }));

  const response = await handleProxy(post({ action: "geocode", address: "Nowhere at all" }), {
    deps: deps({ fetchImpl: wireFetch(stand.origin) }),
  });

  expectEquals(response.status, 404);
  expectEquals(((await json(response)).error as { code: string }).code, "NOT_FOUND");

  await stand.close();
});

Deno.test("a restricted suggestion has no coordinates at all, not a point at 0,0", async () => {
  const stand = await startMapplsStandIn(() => ({
    payload: {
      suggestedLocations: [
        // This is how RESTRICTED geometry actually arrives: empty strings.
        { placeName: "SIPCOT", placeAddress: "Sriperumbudur", latitude: "", longitude: "" },
        // And a genuinely usable result, to prove the normaliser still works.
        { placeName: "Peenya", placeAddress: "Bengaluru", latitude: "13.03", longitude: "77.52" },
      ],
    },
  }));

  const response = await handleProxy(post({ action: "autosuggest", query: "Peenya" }), {
    deps: deps({ fetchImpl: wireFetch(stand.origin) }),
  });

  const results = (await json(response)).result as { lat: number | null; lng: number | null }[];

  // `Number("")` is 0, so an unguarded parse would hand the console (0, 0) and
  // it would place the pin there instead of geocoding.
  expectEquals(results[0]?.lat, null);
  expectEquals(results[0]?.lng, null);
  expectEquals(results[1]?.lat, 13.03);

  await stand.close();
});

Deno.test("distance: the trucking path segment is lng,lat — the opposite of `location`", async () => {
  const stand = await startMapplsStandIn(() => ({
    payload: {
      results: {
        // Column 0 is the source-to-source zero; the real answer is [0][1].
        distances: [[0, 512_000]],
        durations: [[0, 36_000]],
      },
    },
  }));

  const response = await handleProxy(
    post({ action: "distance", from: BENGALURU, to: COIMBATORE }),
    { deps: deps({ fetchImpl: wireFetch(stand.origin) }) },
  );

  const path = stand.seen[0]?.path ?? "";
  const expected = `/route/dm/distance_matrix/trucking/` +
    `${BENGALURU.lng},${BENGALURU.lat};${COIMBATORE.lng},${COIMBATORE.lat}`;

  // The two orderings are the single easiest thing to get wrong here, so the
  // assertion spells the whole segment out rather than checking a prefix.
  expectEquals(path, expected);
  expect(
    path.includes(`${BENGALURU.lng},${BENGALURU.lat}`),
    "the routing path must be longitude first",
  );
  expectEquals(await json(response), { result: { distanceM: 512_000, durationS: 36_000 } });

  await stand.close();
});

Deno.test("a rejected Mappls key is an operator problem, and the key never leaks", async () => {
  const stand = await startMapplsStandIn(() => ({ payload: { error: "unauthorised" }, status: 401 }));

  const response = await handleProxy(post({ action: "geocode", address: "Kurichi" }), {
    deps: deps({ fetchImpl: wireFetch(stand.origin) }),
  });

  expectEquals(response.status, 502);
  const payload = await json(response);
  expectEquals((payload.error as { code: string }).code, "MAPPLS_NOT_CONFIGURED");
  expect(
    !JSON.stringify(payload).includes(TOKEN),
    "the Mappls key must never appear in a response body",
  );
  expect(
    !JSON.stringify(payload).includes(stand.seen[0]?.query.get("access_token") ?? "x"),
    "the echoed token must not be returned",
  );

  await stand.close();
});

Deno.test("a transport failure is a 502, not a stack trace", async () => {
  // Nothing is listening here, so the real fetch rejects.
  const response = await handleProxy(post({ action: "geocode", address: "Kurichi" }), {
    deps: deps({ fetchImpl: wireFetch("http://127.0.0.1:1") }),
  });

  expectEquals(response.status, 502);
  expectEquals((await json(response)).error !== undefined, true);
});

// --- tiny assertion helpers so the file has no imports ---------------------

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
