# `mappls-proxy` — Mappls REST calls for the ops console

Server-side proxy for the four Mappls APIs the console needs (docs/06 §4).
The console never talks to Mappls directly: it calls this function with the
admin's own Supabase JWT, the function checks the caller, calls Mappls with a
key that never leaves the server, and returns a normalised payload.

```
POST /functions/v1/mappls-proxy        Authorization: Bearer <supabase jwt>
```

| `action` | Body | Returns |
|---|---|---|
| `autosuggest` | `{ query, lat?, lng? }` | `{ results: [{ label, address, lat, lng, eLoc? }] }` |
| `geocode` | `{ address }` | `{ lat, lng, formattedAddress }` |
| `reverse` | `{ lat, lng }` | `{ formattedAddress }` |
| `distance` | `{ from: {lat,lng}, to: {lat,lng} }` | `{ distanceM, durationS }` |

Errors are always `{ error: { code, message } }` with `code` one of
`UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, `BAD_REQUEST`, `NOT_FOUND`,
`METHOD_NOT_ALLOWED`, `MAPPLS_NOT_CONFIGURED`, `MAPPLS_BAD_RESPONSE`,
`MAPPLS_UPSTREAM_ERROR`.

---

## Authentication — what actually changed in August 2025

**This is the part worth re-reading before a deployment.**

`mappls-api/mappls-rest-apis` states on its `main` branch:

> The main branch contains the documentation for releases using the updated
> Authorization & Authentication mechanism introduced in **August 2025**. If you
> wish to use the releases that use the legacy authentication method based on
> **OAuth 2.0**, please refer to the **`auth-legacy`** branch.

So there are two models in the wild:

| | Current (`main`, Aug 2025+) | Legacy (`auth-legacy`) |
|---|---|---|
| Credential | One **static key** from the Mappls console | `client_id` + `client_secret` |
| How it is sent | `?access_token=<key>` **query parameter** on every call | `POST` a token endpoint, then `Authorization: Bearer` |
| Where the plan assumed it | — | docs/07 §4 listed "REST client id/secret" |

**This function is built for the current model**: one static key in
`access_token`. `MAPPLS_CLIENT_ID` / `MAPPLS_CLIENT_SECRET` are still read as a
fallback so a legacy-keyed project keeps working, but the OAuth token exchange
itself is *not* implemented — if your project is on the legacy model, add the
token call here first (see "Upgrading to a token-based key" below).

`getAccessToken()` in `index.ts` is the single place that decides which secret
is used.

### Upgrading to a token-based key

If Mappls issues your project a client id/secret instead, wrap the key in a
cached token fetch inside `index.ts`:

```ts
let cached: { token: string; expiresAt: number } | null = null;

async function legacyAccessToken(): Promise<string> {
  if (cached !== null && cached.expiresAt > Date.now()) return cached.token;
  const res = await fetch("https://outpost.mappls.com/api/security/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: Deno.env.get("MAPPLS_CLIENT_ID"),
      client_secret: Deno.env.get("MAPPLS_CLIENT_SECRET"),
    }),
  });
  const { access_token, expires_in } = await res.json();
  cached = { token: access_token, expires_at: Date.now() + expires_in * 1000 };
  return access_token;
}
```

`getAccessToken` is synchronous today; making it async is the only change the
rest of the code needs, because the access token is read in exactly one place.

---

## Endpoints and response shapes (as researched)

Verified against `developer.mappls.com/documentation/sdk/rest-apis/…` and
`mapplsapi.com`. Base hosts differ per product — search and routing do **not**
share one.

### `autosuggest`

```
GET https://search.mappls.com/search/places/autosuggest/json
    ?query=…&location=<lat>,<lng>&access_token=…
```

```jsonc
{ "suggestedLocations": [
  { "placeName": "Mappls Head Office",
    "placeAddress": "Okhla Industrial Estate Phase 3, New Delhi, 110020",
    "latitude": 28.4729, "longitude": 77.2937,   // see the note below
    "entryLatitude": 28.4729, "entryLongitude": 77.2937,
    "eLoc": "MMI000", "type": "POI", "orderIndex": 1, "distance": 9101 } ] }
```

> **Geometry is `RESTRICTED` in many cases.** Mappls' own API reference marks
> `suggestedLocations[].latitude` / `longitude` as "not available in most
> use-case driven response". The contract therefore types them
> `number | null`, and a row with no coordinates is still returned (it has a
> perfectly good `placeAddress` and `eLoc`). The console geocodes the address
> the admin actually picks — that is also what puts a real pin on the map, and
> it lets the dispatcher correct the point by dragging it.
>
> This is a deliberate deviation from the single-line shape in docs/06 §4. The
> alternative — silently dropping un-geocodable suggestions or inventing a pin —
> would be worse.

`location` is **latitude,longitude** here, and is omitted entirely when the
caller sends only one of `lat`/`lng`.

### `geocode`

```
GET https://search.mappls.com/search/address/geocode
    ?address=…&itemCount=1&access_token=…
```

```jsonc
{ "copResults": { "formattedAddress": "237, Okhla Industrial Estate Phase 3, New Delhi, Delhi, 110020",
                  "eLoc": "TIYF9Q", "geocodeLevel": "houseNumber",
                  "latitude": 28.4729, "longitude": 77.2937,
                  "locality": "…", "city": "…", "state": "…", "pincode": "…" } }
```

`copResults` is an **object** for `itemCount=1` and an **array** when more than
one result is asked for; the normaliser accepts both and takes the first.

### `reverse`

```
GET https://search.mappls.com/search/address/rev-geocode?lat=…&lng=…&access_token=…
```

```jsonc
{ "responseCode": 200, "version": "270.191",
  "results": [ { "formatted_address": "Unnamed Road, Basopatti, Madhubani District, Bihar (India)",
                "lat": "26.5645", "lng": "85.9914",
                "poi": "…", "street": "…", "pincode": "847225" } ] }
```

Note the **snake_case** `formatted_address` here (camelCase in geocode) and that
the coordinates come back as **strings**.

### `distance`

```
GET https://route.mappls.com/route/dm/distance_matrix/trucking/<lng,lat>;<lng,lat>
    ?access_token=…
```

```jsonc
{ "responseCode": 200,
  "results": { "code": "Ok",
               "distances": [[0, 359412.4]],     // metres
               "durations": [[0, 14266.9]] } }  // seconds
```

Two traps, both handled in `distanceUrl` / `normaliseDistance`:

1. The routing path segment is **`longitude,latitude`** — the reverse of the
   `lat, lng` the app uses everywhere else.
2. Column 0 of each row is the source-to-source cell (always `0`); the value we
   want is column 1.

`trucking` is the profile that models a lorry, and it is supported **only** on
the `distance_matrix` resource, which is why `region` and `rtype` are not sent.
Units are already metres and seconds, which is what `loads.planned_distance_m`
stores — the proxy converts nothing.

---

## Access control

1. `Authorization: Bearer <jwt>` must be present (401 otherwise).
2. The JWT is verified by **Supabase**, not by decoding it locally (401).
3. `is_admin()` is called **as the caller**, so Postgres decides the role
   (403). `is_admin()` is `false` for a deactivated account, which is the
   behaviour we want: a signed-out admin cannot keep using the console.
4. Only then is the per-user rate limit charged.

A driver, an owner or a shipper cannot call this function at all, which matters
because every Mappls request costs quota.

## Rate limiting

Sliding window, default **60 requests per user per minute**, in memory
(`createRateLimiter`). Exceeding it returns `429` with `Retry-After`.

**Known limitation:** the state is per function instance, so with several
instances in front the effective limit is `limit × instances`. That is
acceptable here — the limit is a courtesy brake against a typing admin, not the
quota guarantee. Mappls' own quota is enforced upstream (HTTP 403 → our
`MAPPLS_NOT_CONFIGURED` error, which is deliberately *not* shown to the console
user as a quota problem they could fix).

## Secrets

Set with `supabase secrets set`, never in the app bundle:

```
supabase secrets set MAPPLS_REST_KEY=<the static key from the Mappls console>
```

`MAPPLS_CLIENT_SECRET` is honoured as a fallback. The Supabase service-role key
is **not** needed by this function and is never read here.

In the Mappls console, the API must be enabled for the project and the key
should be IP-whitelisted to the function's outbound addresses where the plan
allows it (docs/07 §4).

## Tests

```bash
deno test supabase/functions/          # or: bunx deno test supabase/functions/
```

`proxy_test.ts` runs the full request path with a mocked `fetch`; the Mappls
payloads in the fixtures are trimmed copies of the real ones documented above.
No network and no Supabase project are needed.

## Deploy

```bash
supabase functions deploy mappls-proxy
```

Then, as the 🧍 checkpoint in `docs/PHASE1_TASKS.md`: set the secret, deploy,
and try `autosuggest` from the console's Create Load form.
