# 06 — API Contracts (Phase 1)

All calls use `supabase-js` with the user's session. Errors from RPCs come back as `error.message` = one of the codes below.

## 1. RPCs
### `start_trip`
```ts
supabase.rpc('start_trip', {
  p_trip_id: string, p_lat: number, p_lng: number, p_accuracy_m: number,
  p_device_info?: { os: string; osVersion: string; model: string; appVersion: string }
}) // → trips row (status 'in_progress')
```
| Error | Meaning | App shows |
|---|---|---|
| `TRIP_NOT_FOUND` | not yours / doesn't exist | "Trip not found" |
| `CONSENT_REQUIRED` | driver has no recorded consent (`profiles.consent_version` is null; 0006) | "Agree to the location notice" + **Review notice** → D1 |
| `TRIP_NOT_STARTABLE` | not in `assigned` | refresh list |
| `ANOTHER_TRIP_ACTIVE` | driver already tracking | open active trip |
| `GPS_ACCURACY_TOO_LOW` | accuracy > 50 m | "Waiting for better GPS signal" |
| `OUTSIDE_PICKUP:<metres>` | too far | "You are X km from pickup" |

**Client order:** get a fresh fix (`getCurrentPositionAsync`, BestForNavigation) → call RPC → on success create SQLite trip state → `startLocationUpdatesAsync`. If the RPC fails, never start the task.

### `end_trip`
```ts
supabase.rpc('end_trip', {
  p_trip_id: string, p_lat: number, p_lng: number, p_accuracy_m: number,
  p_ended_at: string /* ISO, device time when End was tapped */,
  p_expected_points: number /* last seq recorded */
}) // → trips row: 'verified' | 'needs_review' | 'completed' (still waiting for points)
```
**Client order:** stop location updates → save `ENDING` state with `endedAt`, `lastSeq` → flush queue → call RPC. If offline, save `ENDED_PENDING_SYNC`; the uploader flushes and calls `end_trip` later. Errors: `TRIP_NOT_FOUND`, `TRIP_NOT_ACTIVE` (already ended → treat as success and refresh).

### `admin_review_trip` (admin)
```ts
supabase.rpc('admin_review_trip', { p_trip_id: string, p_approve: boolean, p_note: string })
```
Errors: `FORBIDDEN`, `NOTE_REQUIRED`, `TRIP_NOT_IN_REVIEW`.

### `cancel_trip` (admin)
```ts
supabase.rpc('cancel_trip', { p_trip_id: string, p_note: string }) // → trips row (status 'cancelled')
```
Only an `assigned` trip can be cancelled; the load can then be assigned again. Logs a `cancelled` event with the admin and the note.
Errors: `FORBIDDEN`, `NOTE_REQUIRED`, `TRIP_NOT_FOUND`, `TRIP_NOT_CANCELLABLE` (not `assigned`).

### `admin_force_end` (admin)
```ts
supabase.rpc('admin_force_end', { p_trip_id: string, p_note: string }) // → trips row (status 'needs_review')
```
For an `in_progress` trip the driver cannot end (phone lost, app removed). `ended_at` = the last received point; the trip is verified over the points that arrived and always lands in `needs_review` with `MISSING_POINTS` (and `END_OUTSIDE_DROP`, since there is no end position), so it never adds stats without a review. Logs a `force_ended` event with the admin, the note and the received point count, and clears the live position.
Errors: `FORBIDDEN`, `NOTE_REQUIRED`, `TRIP_NOT_FOUND`, `TRIP_NOT_ACTIVE` (not `in_progress`).

### `admin_erase_driver` (admin)
```ts
supabase.rpc('admin_erase_driver', { p_driver_id: string, p_note: string })
// → { points_deleted: number, trips_kept: number, trips_cancelled: number }
```
DPDP erasure (docs/09 §1). Deletes every `trip_points` / `trip_live` row of the driver, removes start/end positions and `device_info` from their trips, blanks `full_name` and `phone`, sets `is_active = false` and `erased_at`. Assigned trips are cancelled. Trip results and `driver_stats` are kept (anonymised). Logs `driver_erased` in `admin_events` with the admin and the note. The auth user is **not** removed; see docs/RUNBOOK.md §Erasure.
Errors: `FORBIDDEN`, `NOTE_REQUIRED`, `DRIVER_NOT_FOUND` (no such driver profile), `DRIVER_HAS_ACTIVE_TRIP` (a trip is `in_progress` or `completed`; end or force-end it and let it verify first).

### Internal (not callable by clients)
`downsample_old_points()` — nightly pg_cron job `downsample-old-points` (21:30 UTC). Final trips (`verified` / `rejected` / `cancelled`) older than `app_settings.raw_point_retention_days` keep ≤ 500 points (ST_Simplify; first and last point always kept) and get `points_downsampled_at`.

## 2. Table access (via RLS)
| Operation | Who | Call |
|---|---|---|
| My trips | driver | `from('trips').select('*, load:loads(*), vehicle:vehicles(*)').order('created_at',{ascending:false})` |
| Upload points | driver | `from('trip_points').upsert(rows, { onConflict: 'trip_id,seq', ignoreDuplicates: true })` — max 200 rows per call |
| My stats | driver | `from('driver_stats').select('*').maybeSingle()` |
| Trip route | admin / driver | `from('trip_points').select('seq,recorded_at,lat,lng,speed_mps,heading').eq('trip_id',id).order('seq')` (paginate 1,000 rows) |
| Create load | admin | `from('loads').insert({...}).select().single()` |
| Assign | admin | `from('trips').insert({ load_id, driver_id, vehicle_id })` — the only direct admin write to `trips`: RLS allows SELECT and an INSERT of a fresh `assigned` trip; UPDATE/DELETE go through the RPCs above (ND-13) |
| Drivers / vehicles | admin | `from('profiles')…`, `from('vehicles')…` |
| Review queue | admin | `from('trips').select(...).eq('status','needs_review').order('ended_at')` |

**Point row shape**
```ts
type TripPointRow = {
  trip_id: string; seq: number; recorded_at: string; // ISO
  lat: number; lng: number; accuracy_m: number | null; speed_mps: number | null;
  heading: number | null; altitude_m: number | null; is_mocked: boolean;
};
```
Map `expo-location` → row: `coords.latitude/longitude/accuracy/speed/heading/altitude`, `timestamp` → ISO, `mocked ?? false` (Android only).

## 3. Realtime
```ts
supabase.channel(`trip-live-${tripId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'trip_live', filter: `trip_id=eq.${tripId}` },
      (payload) => updateMarker(payload.new))
  .subscribe();
```
Dashboard: same without filter (RLS limits rows). Re-fetch on `SUBSCRIBED` after reconnect to avoid missed updates.

## 4. Edge Function `mappls-proxy` (admin only)
`POST /functions/v1/mappls-proxy` with the user's JWT. The function checks `is_admin()`, then calls Mappls with server-held credentials.
| `action` | Body | Returns |
|---|---|---|
| `autosuggest` | `{ query, lat?, lng? }` | `[{ label, address, lat, lng, eLoc? }]` |
| `geocode` | `{ address }` | `{ lat, lng, formattedAddress }` |
| `reverse` | `{ lat, lng }` | `{ formattedAddress }` |
| `distance` | `{ from: {lat,lng}, to: {lat,lng} }` | `{ distanceM, durationS }` |
Normalise Mappls responses into these shapes inside the function so the app never depends on Mappls payload formats. Rate-limit per user.

## 5. Status values shown in the app
| DB status | Driver label | Console label |
|---|---|---|
| assigned | Ready to start | Assigned |
| in_progress | Trip in progress | Live |
| completed | Verifying… | Awaiting data |
| verified | Verified ✅ | Verified |
| needs_review | Under review | Needs review |
| rejected | Not verified | Rejected |
| cancelled | Cancelled | Cancelled |
