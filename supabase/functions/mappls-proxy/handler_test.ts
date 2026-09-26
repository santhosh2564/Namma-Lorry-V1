import { assert, assertEquals } from '@std/assert';

import { createRateLimiter } from '../_shared/rateLimit.ts';
import { fakeUserClients, post } from '../_shared/testing.ts';
import { createHandler } from './handler.ts';

// ---- Mocked Mappls responses (shapes from developer.mappls.com, Sep 2026) ----
const AUTOSUGGEST = {
  suggestedLocations: [
    {
      type: 'POI',
      placeAddress: 'Hosur, Tamil Nadu, 635126',
      eLoc: 'B2C3D4',
      placeName: 'SIPCOT Phase 1',
      orderIndex: 2,
    },
    {
      type: 'POI',
      placeAddress: 'Sriperumbudur, Kancheepuram District, Tamil Nadu, 602105',
      eLoc: 'A1B2C3',
      placeName: 'SIPCOT Industrial Park',
      orderIndex: 1,
      latitude: 12.9563,
      longitude: '79.9422',
    },
  ],
  userAddedLocations: [],
  suggestedSearches: [],
};
const GEOCODE = {
  copResults: {
    formattedAddress: 'Peenya Industrial Area, Bengaluru, Karnataka, 560058',
    eLoc: 'PEEN01',
    geocodeLevel: 'locality',
    confidenceScore: 0.8,
  },
};
const REVERSE = {
  responseCode: 200,
  version: '270.191',
  results: [{
    formatted_address: 'SIPCOT Industrial Park, Sriperumbudur, Tamil Nadu. pin-602105 (India)',
    lat: '12.9563',
    lng: '79.9422',
  }],
};
const DISTANCE = {
  responseCode: 200,
  version: '191.17',
  results: { code: 'Ok', distances: [[0, 511872.4]], durations: [[0, 34812.6]] },
};

interface Call {
  url: URL;
}

function mockFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  const f = ((input: URL | string) => {
    const url = new URL(String(input));
    calls.push({ url });
    const key = Object.keys(routes).find((k) => url.href.startsWith(k));
    if (!key) return Promise.reject(new Error(`unexpected fetch ${url}`));
    const r = routes[key]!;
    const status = r.status ?? 200;
    return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(r.body ?? {}), { status }));
  }) as typeof fetch;
  return { fetch: f, calls };
}

function setup(
  routes: Record<string, { status?: number; body?: unknown }> = {},
  env: Record<string, string> = {},
  limit = 3,
) {
  const m = mockFetch(routes);
  const handler = createHandler({
    makeUserClient: fakeUserClients,
    rateLimiter: createRateLimiter(limit, 60_000),
    fetch: m.fetch,
    getEnv: (n) => ({ MAPPLS_REST_KEY: 'test-rest-key', ...env })[n],
  });
  return { handler, calls: m.calls };
}

Deno.test('rejects a request with no JWT (401) and never calls Mappls', async () => {
  const { handler, calls } = setup();
  const res = await handler(post({ action: 'reverse', lat: 12, lng: 79 }));
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, 'UNAUTHENTICATED');
  assertEquals(calls.length, 0);
});

Deno.test('rejects an invalid JWT (401)', async () => {
  const { handler } = setup();
  const res = await handler(post({ action: 'reverse', lat: 12, lng: 79 }, 'forged'));
  assertEquals(res.status, 401);
});

Deno.test('rejects a non-admin JWT (403) and never calls Mappls', async () => {
  const { handler, calls } = setup();
  const res = await handler(post({ action: 'reverse', lat: 12, lng: 79 }, 'driver-token'));
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'FORBIDDEN');
  assertEquals(calls.length, 0);
});

Deno.test('CORS preflight and wrong method', async () => {
  const { handler } = setup();
  const pre = await handler(new Request('http://localhost/fn', { method: 'OPTIONS' }));
  assertEquals(pre.status, 200);
  assertEquals(pre.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals((await handler(post(null, 'admin-token', 'GET'))).status, 405);
});

Deno.test('validates the body', async () => {
  const { handler } = setup({}, {}, 100);
  for (
    const body of [
      { action: 'nope' },
      { action: 'autosuggest', query: 'x' },
      { action: 'autosuggest', query: 'x'.repeat(46) },
      { action: 'reverse', lat: 91, lng: 0 },
      { action: 'distance', from: { lat: 1, lng: 2 } },
    ]
  ) {
    const res = await handler(post(body, 'admin-token'));
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals((await res.json()).error, 'INVALID_REQUEST');
  }
  const bad = await handler(
    new Request('http://localhost/fn', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: '{',
    }),
  );
  assertEquals((await bad.json()).error, 'INVALID_JSON');
});

Deno.test('autosuggest: normalised, ordered, key sent server-side, location bias passed', async () => {
  const { handler, calls } = setup({
    'https://search.mappls.com/search/places/autosuggest/json': { body: AUTOSUGGEST },
  });
  const res = await handler(
    post({ action: 'autosuggest', query: 'sipcot', lat: 12.9, lng: 79.9 }, 'admin-token'),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), [
    {
      label: 'SIPCOT Industrial Park',
      address: 'Sriperumbudur, Kancheepuram District, Tamil Nadu, 602105',
      lat: 12.9563,
      lng: 79.9422,
      eLoc: 'A1B2C3',
    },
    { label: 'SIPCOT Phase 1', address: 'Hosur, Tamil Nadu, 635126', lat: null, lng: null, eLoc: 'B2C3D4' },
  ]);
  const url = calls[0]!.url;
  assertEquals(url.searchParams.get('access_token'), 'test-rest-key');
  assertEquals(url.searchParams.get('query'), 'sipcot');
  assertEquals(url.searchParams.get('location'), '12.9,79.9');
  assertEquals(url.searchParams.get('region'), 'IND');
});

Deno.test('autosuggest: 204 from Mappls → empty list', async () => {
  const { handler } = setup({ 'https://search.mappls.com/search/places/autosuggest/json': { status: 204 } });
  const res = await handler(post({ action: 'autosuggest', query: 'zzzz' }, 'admin-token'));
  assertEquals(await res.json(), []);
});

Deno.test('geocode: normalised; not found → 404', async () => {
  const { handler } = setup({ 'https://search.mappls.com/search/address/geocode': { body: GEOCODE } });
  const res = await handler(post({ action: 'geocode', address: 'Peenya Industrial Area' }, 'admin-token'));
  assertEquals(await res.json(), {
    lat: null,
    lng: null,
    formattedAddress: 'Peenya Industrial Area, Bengaluru, Karnataka, 560058',
    eLoc: 'PEEN01',
  });
  const nf = setup({ 'https://search.mappls.com/search/address/geocode': { status: 204 } });
  const res2 = await nf.handler(post({ action: 'geocode', address: 'nowhere at all' }, 'admin-token'));
  assertEquals(res2.status, 404);
});

Deno.test('geocode: multi-item response takes the first item', async () => {
  const { handler } = setup({
    'https://search.mappls.com/search/address/geocode': {
      body: {
        copResults: [{ formattedAddress: 'First', eLoc: 'AAA111', latitude: '13.03', longitude: '77.52' }, {
          formattedAddress: 'Second',
        }],
      },
    },
  });
  const res = await handler(post({ action: 'geocode', address: 'Peenya' }, 'admin-token'));
  assertEquals(await res.json(), { lat: 13.03, lng: 77.52, formattedAddress: 'First', eLoc: 'AAA111' });
});

Deno.test('reverse: normalised', async () => {
  const { handler, calls } = setup({
    'https://search.mappls.com/search/address/rev-geocode': { body: REVERSE },
  });
  const res = await handler(post({ action: 'reverse', lat: 12.9563, lng: 79.9422 }, 'admin-token'));
  assertEquals(await res.json(), {
    formattedAddress: 'SIPCOT Industrial Park, Sriperumbudur, Tamil Nadu. pin-602105 (India)',
  });
  assertEquals(calls[0]!.url.searchParams.get('lat'), '12.9563');
  assertEquals(calls[0]!.url.searchParams.get('lng'), '79.9422');
});

Deno.test('distance: trucking profile by default, lng,lat order, rounded', async () => {
  const { handler, calls } = setup({
    'https://route.mappls.com/route/dm/distance_matrix/': { body: DISTANCE },
  });
  const res = await handler(
    post(
      { action: 'distance', from: { lat: 12.9563, lng: 79.9422 }, to: { lat: 10.9608, lng: 76.9656 } },
      'admin-token',
    ),
  );
  assertEquals(await res.json(), { distanceM: 511872, durationS: 34813 });
  const url = calls[0]!.url;
  assertEquals(url.pathname, '/route/dm/distance_matrix/trucking/79.9422,12.9563;76.9656,10.9608');
  assertEquals(url.searchParams.get('region'), null);
});

Deno.test('distance: driving profile adds rtype and region', async () => {
  const { handler, calls } = setup({
    'https://route.mappls.com/route/dm/distance_matrix/': { body: DISTANCE },
  }, { MAPPLS_ROUTE_PROFILE: 'driving' });
  await handler(
    post({ action: 'distance', from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 } }, 'admin-token'),
  );
  assert(calls[0]!.url.pathname.startsWith('/route/dm/distance_matrix/driving/'));
  assertEquals(calls[0]!.url.searchParams.get('region'), 'ind');
});

Deno.test('distance: no route in response → 404 NO_ROUTE', async () => {
  const { handler } = setup({
    'https://route.mappls.com/route/dm/distance_matrix/': { body: { results: { code: 'NoRoute' } } },
  });
  const res = await handler(
    post({ action: 'distance', from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 } }, 'admin-token'),
  );
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, 'NO_ROUTE');
});

Deno.test('Mappls errors map to stable codes', async () => {
  const cases: [number, number, string][] = [
    [401, 502, 'MAPPLS_AUTH'],
    [403, 502, 'MAPPLS_QUOTA'],
    [400, 400, 'MAPPLS_BAD_REQUEST'],
    [503, 502, 'MAPPLS_UNAVAILABLE'],
  ];
  for (const [upstream, status, code] of cases) {
    const { handler } = setup({
      'https://search.mappls.com/search/address/rev-geocode': { status: upstream },
    });
    const res = await handler(post({ action: 'reverse', lat: 1, lng: 2 }, 'admin-token'));
    assertEquals(res.status, status);
    assertEquals((await res.json()).error, code);
  }
});

Deno.test('network failure → 504 MAPPLS_UNAVAILABLE; missing key → 500 CONFIG_MISSING', async () => {
  const { handler } = setup({});
  const res = await handler(post({ action: 'reverse', lat: 1, lng: 2 }, 'admin-token'));
  assertEquals(res.status, 504);
  const noKey = createHandler({
    makeUserClient: fakeUserClients,
    rateLimiter: createRateLimiter(3, 60_000),
    fetch: (() => Promise.reject(new Error('should not be called'))) as typeof fetch,
    getEnv: () => undefined,
  });
  const res2 = await noKey(post({ action: 'reverse', lat: 1, lng: 2 }, 'admin-token'));
  assertEquals(res2.status, 500);
  assertEquals((await res2.json()).error, 'CONFIG_MISSING');
});

Deno.test('rate limit is per user: 4th call in the window → 429 with Retry-After', async () => {
  const { handler } = setup({ 'https://search.mappls.com/search/address/rev-geocode': { body: REVERSE } });
  for (let i = 0; i < 3; i++) {
    assertEquals((await handler(post({ action: 'reverse', lat: 1, lng: 2 }, 'admin-token'))).status, 200);
  }
  const limited = await handler(post({ action: 'reverse', lat: 1, lng: 2 }, 'admin-token'));
  assertEquals(limited.status, 429);
  assertEquals((await limited.json()).error, 'RATE_LIMITED');
  assert(Number(limited.headers.get('Retry-After')) > 0);
  // Another admin is not affected.
  assertEquals((await handler(post({ action: 'reverse', lat: 1, lng: 2 }, 'admin-2-token'))).status, 200);
});

Deno.test('responses never echo the Mappls key', async () => {
  const { handler } = setup({
    'https://search.mappls.com/search/places/autosuggest/json': { body: AUTOSUGGEST },
  });
  const text = await (await handler(post({ action: 'autosuggest', query: 'sipcot' }, 'admin-token'))).text();
  assert(!text.includes('test-rest-key'));
});
