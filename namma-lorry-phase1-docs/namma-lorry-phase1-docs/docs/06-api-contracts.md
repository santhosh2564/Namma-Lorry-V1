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

## 2. Table access (via RLS)
| Operation | Who | Call |
|---|---|---|
| My trips | driver | `from('trips').select('*, load:loads(*), vehicle:vehicles(*)').order('created_at',{ascending:false})` |
| Upload points | driver | `from('trip_points').upsert(rows, { onConflict: 'trip_id,seq', ignoreDuplicates: true })` — max 200 rows per call |
| My stats | driver | `from('driver_stats').select('*').maybeSingle()` |
| Trip route | admin / driver | `from('trip_points').select('seq,recorded_at,lat,lng,speed_mps,heading').eq('trip_id',id).order('seq')` (paginate 1,000 rows) |
| Create load | admin | `from('loads').insert({...}).select().single()` |
| Assign | admin | `from('trips').insert({ load_id, driver_id, vehicle_id })` |
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
