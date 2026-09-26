-- =====================================================================
-- Namma Lorry — 0003: console load list (C2) with derived status (ND-20)
-- loads has no status column; C2 shows unassigned / assigned / in trip / done,
-- taken from the load's latest non-cancelled trip. A view keeps filtering,
-- search and pagination server-side (PostgREST) without a schema change.
-- security_invoker: the caller's RLS applies (admins see all loads; shippers
-- their own; drivers only loads they have a trip on).
-- =====================================================================
create view public.load_list
with (security_invoker = true) as
select
  l.id,
  l.load_code,
  l.pickup_address,
  l.drop_address,
  l.planned_distance_m,
  l.material,
  l.weight_kg,
  l.shipper_id,
  l.created_at,
  t.id          as trip_id,
  t.status      as trip_status,
  t.driver_id,
  d.full_name   as driver_name,
  case
    when t.id is null                     then 'unassigned'
    when t.status = 'assigned'            then 'assigned'
    when t.status = 'in_progress'         then 'in_trip'
    else 'done'
  end::text     as load_status
from public.loads l
left join lateral (
  select tr.id, tr.status, tr.driver_id
  from public.trips tr
  where tr.load_id = l.id and tr.status <> 'cancelled'
  order by tr.created_at desc
  limit 1
) t on true
left join public.profiles d on d.id = t.driver_id;

grant select on public.load_list to authenticated;
