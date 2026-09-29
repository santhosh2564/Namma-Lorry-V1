# Runbook

Operational procedures for Namma Lorry Phase 1. Other sections (retention, incidents, stuck trips, releases) are added as their features land.

## Erasure

A driver asks for their personal data to be deleted (DPDP, docs/09 §1 "Withdrawal & erasure").

**What is erased:** every GPS point and live position of the driver, the start/end positions and device info on their trips, their name and phone number in `profiles`. The profile is deactivated and stamped with `erased_at`. Trips still `assigned` to them are cancelled, so the loads can be reassigned.

**What is kept (anonymised):** the trip rows with their results (status, verified km, reasons) and `driver_stats`, so fleet history and aggregate km survive. The decision is recorded in docs/PHASE1_TASKS.md (ND-5).

**Steps**

1. **Confirm the request.** It must come from the driver, by the phone number on their profile or in writing. Record a ticket or reference; it goes into the note.
2. **Make sure no trip is still collecting points.** If the driver has a trip `in_progress`, end it with `admin_force_end` (note: "Erasure request"). If a trip is `completed` (waiting for points), wait for it to verify (at most `unsynced_grace_hours`, 6 h). The erasure refuses with `DRIVER_HAS_ACTIVE_TRIP` until then.
3. **Run the erasure** in the Supabase SQL editor as an admin, or from any admin session:
   ```sql
   select public.admin_erase_driver('<driver uuid>', 'Driver request <date>, ticket <ref>');
   ```
   It returns `{ points_deleted, trips_kept, trips_cancelled }`. The same numbers and the note are logged in `admin_events` (`action = 'driver_erased'`).
   > In the SQL editor you run as `postgres`, where `is_admin()` is false. Run it from an admin session, or first `select set_config('request.jwt.claims', json_build_object('sub', '<your admin uuid>', 'role', 'authenticated')::text, true);` in the same transaction.
4. **Block sign-in.** In the Supabase dashboard → Authentication → Users, find the user by id and **ban** them. **Do not delete the auth user**: `profiles` cascades on delete, and the trips that reference the profile would block it or lose their history. The phone number stored in `auth.users` is removed only when the user is deleted; until an Edge Function for this exists, record in the ticket that the auth record is banned, not deleted.
5. **Reply to the driver** with the date and what was kept (anonymised trip results).

**Check afterwards**

```sql
select full_name, phone, is_active, erased_at from public.profiles where id = '<driver uuid>';
select count(*) from public.trip_points p join public.trips t on t.id = p.trip_id where t.driver_id = '<driver uuid>';  -- 0
select * from public.admin_events where target_id = '<driver uuid>' order by created_at desc;
```

