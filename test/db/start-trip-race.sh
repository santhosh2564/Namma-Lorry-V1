#!/usr/bin/env bash
# Scenario 10 under real concurrency (docs/10 §4): the same driver starts two trips at
# the same moment from two sessions. The second must get ANOTHER_TRIP_ACTIVE — not a raw
# unique-index error — and exactly one trip may be in progress.
#
# pgTAP can't test this (one session, one transaction), so this script drives two psql
# sessions inside the local Supabase DB container. Fixtures are committed with fixed
# ids and removed on exit.
#
# Usage: test/db/start-trip-race.sh        (local stack running: `supabase start` or `supabase db start`)
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

psql >/dev/null <<SQL
insert into auth.users (instance_id, id, aud, role, phone, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '$DRIVER', 'authenticated', 'authenticated', '919300000001', now(), now());
insert into public.vehicles (id, registration_no, vehicle_type) values ('$VEHICLE', 'RACE 0001', '19ft');
insert into public.loads (id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng)
values ('$LOAD_A', 'Hosur', 12.7392, 77.8233, 'Peenya', 13.0329, 77.5273),
       ('$LOAD_B', 'Hosur', 12.7392, 77.8233, 'Peenya', 13.0329, 77.5273);
insert into public.trips (id, load_id, driver_id, vehicle_id)
values ('$TRIP_A', '$LOAD_A', '$DRIVER', '$VEHICLE'), ('$TRIP_B', '$LOAD_B', '$DRIVER', '$VEHICLE');
SQL

as_driver="set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$DRIVER\",\"role\":\"authenticated\"}', false);"

# Session A starts trip A and holds its transaction open for 3 s (a slow request).
psql >/dev/null <<SQL &
begin;
$as_driver
select status from public.start_trip('$TRIP_A', 12.7392, 77.8233, 10, null);
select pg_sleep(3);
commit;
SQL
A_PID=$!
sleep 1

# Session B starts trip B while A is still in flight.
B_OUT=$(psql 2>&1 <<SQL || true
$as_driver
select status from public.start_trip('$TRIP_B', 12.7392, 77.8233, 10, null);
SQL
)
wait "$A_PID"

ACTIVE=$(psql -c "select count(*) from public.trips where driver_id = '$DRIVER' and status = 'in_progress'")
B_STATUS=$(psql -c "select status from public.trips where id = '$TRIP_B'")

echo "session B said: $(echo "$B_OUT" | tr '\n' ' ')"
echo "in_progress trips: $ACTIVE · trip B: $B_STATUS"

fail=0
if ! grep -q 'ANOTHER_TRIP_ACTIVE' <<<"$B_OUT"; then echo "FAIL: second start must return ANOTHER_TRIP_ACTIVE"; fail=1; fi
if [ "$ACTIVE" != "1" ]; then echo "FAIL: expected exactly 1 in-progress trip"; fail=1; fi
if [ "$B_STATUS" != "assigned" ]; then echo "FAIL: trip B must stay assigned"; fail=1; fi
[ $fail -eq 0 ] && echo "PASS: scenario 10 (concurrent start)"
exit $fail
