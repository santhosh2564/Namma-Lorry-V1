# mappls-proxy

Admin-only proxy from the console to the Mappls REST APIs (docs/06 §4). The Mappls key stays in
Edge Function secrets and never reaches the app bundle (CLAUDE.md rule 6).

## Contract
`POST /functions/v1/mappls-proxy` with the caller's Supabase JWT (`supabase.functions.invoke`).

| `action` | Body | 200 response |
|---|---|---|
| `autosuggest` | `{ query (2–45 chars), lat?, lng? }` | `[{ label, address, lat, lng, eLoc }]` |
| `geocode` | `{ address }` | `{ lat, lng, formattedAddress, eLoc }` |
| `reverse` | `{ lat, lng }` | `{ formattedAddress }` |
| `distance` | `{ from: {lat,lng}, to: {lat,lng} }` | `{ distanceM, durationS }` |
| `route` *(ND-28, not in docs/06)* | `{ from: {lat,lng}, to: {lat,lng} }` | `{ distanceM, durationS, path: [{lat,lng}] }`, a simplified line for drawing the planned route on C3/C4 (display only) |

**Deviation from docs/06 (ND-26):** `lat`/`lng` on `autosuggest` and `geocode` are `number | null`.
On the standard Mappls plan these APIs return only an `eLoc` (place id). Coordinates for an eLoc
are a premium field ("Location Coordinates" sub-template, shown as `RESTRICTED`). The proxy
passes coordinates through whenever Mappls includes them (`latitude`/`longitude`, `lat`/`lng`,
`entryLatitude`/`entryLongitude`) and returns `null` otherwise. The console then places the pin
from the eLoc or lets the admin drag it (C3, M7).

Errors are `{ error: CODE, message? }`:

| Status | `error` | When |
|---|---|---|
| 400 | `INVALID_JSON`, `INVALID_REQUEST`, `MAPPLS_BAD_REQUEST` | bad body / Mappls 400 or 412 |
| 401 | `UNAUTHENTICATED` | missing or invalid JWT |
| 403 | `FORBIDDEN` | caller is not an active admin (`is_admin()`) |
| 404 | `NOT_FOUND`, `NO_ROUTE` | no geocode / reverse / route result |
| 429 | `RATE_LIMITED` (+ `Retry-After`) | > 60 calls per admin per minute |
| 500 | `CONFIG_MISSING` | `MAPPLS_REST_KEY` not set |
| 502 | `MAPPLS_AUTH`, `MAPPLS_QUOTA`, `MAPPLS_UNAVAILABLE`, `MAPPLS_BAD_RESPONSE` | Mappls 401 / 403 / 5xx / bad JSON |
| 504 | `MAPPLS_UNAVAILABLE` | network error or 8 s timeout |

## Mappls auth and endpoints (researched 26 Sep 2026, developer.mappls.com)
- **Auth: a static REST key** from the Mappls Console (`auth.mappls.com/console` → your project → credentials),
  sent as the `access_token` **query parameter** on every call. Mappls lets you whitelist the key's
  use by IP (cloud apps) or domain (web). For a server key used from Supabase, leave the domain
  restriction off; IP whitelisting isn't practical because Edge Function egress IPs aren't fixed.
- OAuth (`POST https://outpost.mappls.com/api/security/oauth/token`, `grant_type=client_credentials`,
  24 h bearer token) is now documented under **Legacy** and is only needed for premium APIs such as
  Place Details. It is not used here. `MAPPLS_CLIENT_ID` / `MAPPLS_CLIENT_SECRET` in `.env.example`
  are kept for that case only.

| Action | Mappls API | URL |
|---|---|---|
| autosuggest | Autosuggest | `GET https://search.mappls.com/search/places/autosuggest/json?query=&location=lat,lng&region=IND&access_token=` → `suggestedLocations[]{placeName, placeAddress, eLoc, orderIndex}` (query ≤ 45 chars) |
| geocode | Geocoding | `GET https://search.mappls.com/search/address/geocode?address=&access_token=` → `copResults` (object, or array when `itemCount` > 1) `{formattedAddress, eLoc, …}`; 204 = no match |
| reverse | Reverse Geocoding | `GET https://search.mappls.com/search/address/rev-geocode?lat=&lng=&access_token=` → `results[0].formatted_address` |
| route | Route Driving Directions | `GET https://route.mappls.com/route/direction/route_adv/{profile}/{lng,lat};{lng,lat}?geometries=polyline&overview=simplified&access_token=` → `routes[0]{geometry (encoded polyline, 1e5), distance (m), duration (s)}` |
| distance | Driving Distance-Time Matrix | `GET https://route.mappls.com/route/dm/distance_matrix/{profile}/{lng,lat};{lng,lat}?access_token=` → `results.distances[0][1]` (m), `results.durations[0][1]` (s) |

`distance` uses the **`trucking`** profile by default (lorries). Mappls doesn't support
`region`/`rtype` with trucking. Set `MAPPLS_ROUTE_PROFILE=driving` to switch to car routing, which
adds `rtype=0&region=ind`.

Mappls HTTP codes: 200 ok, 204 no result, 400/412 bad request, 401 key not allowed,
403 quota exceeded or IP/domain not whitelisted, 5xx server/maintenance.

## Secrets
```bash
npx supabase secrets set MAPPLS_REST_KEY=<static REST key>
# optional
npx supabase secrets set MAPPLS_ROUTE_PROFILE=driving
```
Locally: put them in `supabase/functions/.env` (gitignored via `.env*`) and run
`npx supabase functions serve --env-file supabase/functions/.env`.

## Rate limit
60 requests per admin per minute, as a sliding window held in the isolate's memory. It is per
instance and resets on cold start. It stops a runaway UI loop from burning the Mappls quota, but it
is not a hard global limit.

## Tests
```bash
cd supabase/functions && deno task test   # mocked Mappls responses, fake auth
```
