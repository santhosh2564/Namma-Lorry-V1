-- =====================================================================
-- Namma Lorry — 0006: trips are written only through RPCs, admins included (ND-13, M12a)
-- CLAUDE.md rule 2 / docs/09 §4: "status changes only via RPCs; RLS must enforce this".
-- 0001's `trips_admin` policy was FOR ALL, so an admin session could UPDATE status,
-- tracked_distance_m or verification fields directly, with no trip_events audit row and
-- no driver_stats update. The console only ever SELECTs trips and INSERTs new assignments
-- (C4 "Assign"), so the policy is narrowed to exactly that. Status changes stay in
-- start_trip / end_trip / verify_trip / admin_review_trip (SECURITY DEFINER).
-- A cancel_trip RPC is still to be designed (ND-13); until then cancelling is a DB-admin task.
-- =====================================================================
drop policy trips_admin on public.trips;

create policy trips_admin_read on public.trips for select to authenticated using (public.is_admin());

-- A new assignment only: nothing about progress or verification can be pre-filled.
create policy trips_admin_assign on public.trips for insert to authenticated
  with check (
    public.is_admin()
    and status = 'assigned'
    and started_at is null and ended_at is null
    and start_lat is null and start_lng is null and end_lat is null and end_lng is null
    and expected_points is null
    and tracked_distance_m is null
    and verification_reasons = '{}'
    and verification_metrics is null
    and verified_at is null
    and reviewed_by is null and review_note is null
  );
