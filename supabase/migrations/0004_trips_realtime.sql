-- =====================================================================
-- Namma Lorry — 0004: trips in the realtime publication (M10, D6 Trip Summary)
-- D6 subscribes to its own trip row to go Verifying → Verified / Needs review
-- without polling. Realtime postgres_changes applies RLS, so a driver only
-- receives changes to rows `trips_driver` lets them select (their own trips);
-- admins (`trips_admin`) receive all, which C1/C6 can use in M11.
-- =====================================================================
alter publication supabase_realtime add table public.trips;
