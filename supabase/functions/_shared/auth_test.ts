// Exercises the real @supabase/server path (JWT verification against a JWKS)
// with a locally generated ES256 key; PostgREST is replaced by a fetch stub.
import { assertEquals, assertRejects } from '@std/assert';

import { requireAdmin, supabaseContext } from './auth.ts';
import { HttpError } from './http.ts';

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function keyPair(kid: string) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'ES256', use: 'sig' };
  return { privateKey: pair.privateKey, jwk };
}

async function signJwt(privateKey: CryptoKey, kid: string, claims: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

const trusted = await keyPair('trusted');
const rogue = await keyPair('rogue');
const now = Math.floor(Date.now() / 1000);
const claims = (over: Record<string, unknown> = {}) => ({
  sub: '11111111-1111-4111-8111-111111111111',
  role: 'authenticated',
  aud: 'authenticated',
  iat: now,
  exp: now + 3600,
  ...over,
});

function setup(isAdminResult: unknown) {
  const calls: { url: string; auth: string | null; apikey: string | null }[] = [];
  const fetchStub = ((input: Request | URL | string, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push({ url: req.url, auth: req.headers.get('Authorization'), apikey: req.headers.get('apikey') });
    return Promise.resolve(Response.json(isAdminResult));
  }) as typeof fetch;
  const make = supabaseContext(() => 'admin-client', {
    env: {
      url: 'http://127.0.0.1:54321',
      publishableKeys: { default: 'sb_publishable_test' },
      secretKeys: { default: 'sb_secret_test' },
      jwks: { keys: [trusted.jwk] },
    },
    supabaseOptions: { global: { fetch: fetchStub } },
  });
  return { make, calls };
}

const req = (token?: string) =>
  new Request('http://localhost/fn', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

Deno.test('no JWT → 401', async () => {
  const { make } = setup(true);
  const e = await assertRejects(() => make(req()), HttpError);
  assertEquals([e.status, e.code], [401, 'UNAUTHENTICATED']);
});

Deno.test('malformed, wrong-key and expired JWTs → 401', async () => {
  const { make } = setup(true);
  for (
    const token of [
      'not-a-jwt',
      await signJwt(rogue.privateKey, 'rogue', claims()),
      await signJwt(rogue.privateKey, 'trusted', claims()), // right kid, wrong key
      await signJwt(trusted.privateKey, 'trusted', claims({ exp: now - 60 })),
    ]
  ) {
    const e = await assertRejects(() => make(req(token)), HttpError);
    assertEquals([e.status, e.code], [401, 'UNAUTHENTICATED']);
  }
});

Deno.test('valid JWT → caller id; is_admin() runs as the caller (JWT + publishable key)', async () => {
  const { make, calls } = setup(true);
  const token = await signJwt(trusted.privateKey, 'trusted', claims());
  const ctx = await make(req(token));
  assertEquals(ctx.userId, '11111111-1111-4111-8111-111111111111');
  assertEquals(ctx.admin, 'admin-client');
  assertEquals(await ctx.isAdmin(), true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.url, 'http://127.0.0.1:54321/rest/v1/rpc/is_admin');
  assertEquals(calls[0]!.auth, `Bearer ${token}`);
  assertEquals(calls[0]!.apikey, 'sb_publishable_test');
});

Deno.test('requireAdmin: non-admin → 403', async () => {
  const { make } = setup(false);
  const token = await signJwt(trusted.privateKey, 'trusted', claims());
  const e = await assertRejects(() => requireAdmin(req(token), make), HttpError);
  assertEquals([e.status, e.code], [403, 'FORBIDDEN']);
});

Deno.test('JWKS unreachable → 500 AUTH_CONFIG, not 401', async () => {
  // With no inline JWKS the key set is fetched from {url}/auth/v1/.well-known/jwks.json; port 9 is closed.
  const make = supabaseContext(() => null, {
    env: {
      url: 'http://127.0.0.1:9',
      publishableKeys: { default: 'sb_publishable_test' },
      secretKeys: { default: 'sb_secret_test' },
      jwks: null,
    },
  });
  const token = await signJwt(trusted.privateKey, 'trusted', claims());
  const e = await assertRejects(() => make(req(token)), HttpError);
  assertEquals([e.status, e.code], [500, 'AUTH_CONFIG']);
});
