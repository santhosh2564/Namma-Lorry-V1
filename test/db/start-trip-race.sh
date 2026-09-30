#!/usr/bin/env bash
# Scenario 10 under real concurrency (docs/10 §4, validation M5): the same driver starts
# two trips at the same moment from two sessions. The second must get ANOTHER_TRIP_ACTIVE,
# not the raw 23505 from the trips_one_active_per_driver index, and exactly one trip may
# be in progress.
#
# pgTAP can't test this (one session, one transaction), so this script drives two psql
# sessions inside the local Supabase DB container. Fixtures are committed with fixed ids
# and removed on exit. The driver is set up the way an operator does it: activated
# (0007: new profiles start inactive) and with a consent recorded through record_consent
# (0006: start_trip needs one). Both are checked before the race, so a refusal for those
# reasons can't pass for a race result.
#
# Usage: test/db/start-trip-race.sh   (local stack running: `supabase start` or `supabase db start`)
# CI runs it in the database job after pgTAP.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: don't rewrite container paths

PROJECT_ID=$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$(dirname "$0")/../../supabase/config.toml")
DB="supabase_db_${PROJECT_ID}"
psql() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

DRIVER=7ace0000-0000-4000-8000-0000000000d1
VEHICLE=7ace0000-0000-4000-8000-0000000000e1
LOAD_A=7ace0000-0000-4000-8000-0000000000a1
LOAD_B=7ace0000-0000-4000-8000-0000000000a2
TRIP_A=7ace0000-0000-4000-8000-0000000000f1
TRIP_B=7ace0000-0000-4000-8000-0000000000f2
PICKUP="12.7392, 77.8233"

cleanup() {
  psql >/dev/null <<SQL || true
delete from public.trips where id in ('$TRIP_A', '$TRIP_B');
delete from public.loads where id in ('$LOAD_A', '$LOAD_B');
delete from public.vehicles where id = '$VEHICLE';
delete from auth.users where id = '$DRIVER';
SQL
}
trap cleanup EXIT
cleanup

as_driver="set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$DRIVER\",\"role\":\"authenticated\"}', false);"

psql >/dev/null <<SQL
insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '$DRIVER', 'authenticated', 'authenticated', '919300000001', now(), now(), now());
update public.profiles set role = 'driver', full_name = 'Race Driver', is_active = true where id = '$DRIVER';
insert into public.vehicles (id, registration_no, vehicle_type) values ('$VEHICLE', 'RACE 0001', '19ft');
insert into public.loads (id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng)
values ('$LOAD_A', 'Hosur', $PICKUP, 'Peenya', 13.0329, 77.5273),
       ('$LOAD_B', 'Hosur', $PICKUP, 'Peenya', 13.0329, 77.5273);
insert into public.trips (id, load_id, driver_id, vehicle_id)
values ('$TRIP_A', '$LOAD_A', '$DRIVER', '$VEHICLE'), ('$TRIP_B', '$LOAD_B', '$DRIVER', '$VEHICLE');
SQL

psql >/dev/null <<SQL
$as_driver
select public.record_consent('2026-10-01');
SQL

READY=$(psql -c "select is_active and consent_version is not null from public.profiles where id = '$DRIVER'")
if [ "$READY" != "t" ]; then echo "FAIL: fixture driver is not active with a recorded consent"; exit 1; fi

# Session A starts trip A and holds its transaction open for 3 s (a slow request).
psql >/dev/null <<SQL &
begin;
$as_driver
select status from public.start_trip('$TRIP_A', $PICKUP, 10, null);
select pg_sleep(3);
commit;
SQL
A_PID=$!
sleep 1

# Session B starts trip B while A is still in flight.
B_OUT=$(psql 2>&1 <<SQL || true
$as_driver
select status from public.start_trip('$TRIP_B', $PICKUP, 10, null);
SQL
)
A_RC=0; wait "$A_PID" || A_RC=$?

ACTIVE=$(psql -c "select count(*) from public.trips where driver_id = '$DRIVER' and status = 'in_progress'")
A_STATUS=$(psql -c "select status from public.trips where id = '$TRIP_A'")
B_STATUS=$(psql -c "select status from public.trips where id = '$TRIP_B'")

echo "session B said: $(echo "$B_OUT" | tr '\n' ' ')"
echo "in_progress trips: $ACTIVE · trip A: $A_STATUS · trip B: $B_STATUS"

fail=0
if [ "$A_RC" != "0" ] || [ "$A_STATUS" != "in_progress" ]; then echo "FAIL: session A must start trip A"; fail=1; fi
if ! grep -q 'ANOTHER_TRIP_ACTIVE' <<<"$B_OUT"; then echo "FAIL: second start must return ANOTHER_TRIP_ACTIVE"; fail=1; fi
if [ "$ACTIVE" != "1" ]; then echo "FAIL: expected exactly 1 in-progress trip"; fail=1; fi
if [ "$B_STATUS" != "assigned" ]; then echo "FAIL: trip B must stay assigned"; fail=1; fi
[ $fail -eq 0 ] && echo "PASS: scenario 10 (concurrent start)"
exit $fail
