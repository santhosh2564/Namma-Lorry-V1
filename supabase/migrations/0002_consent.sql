-- =====================================================================
-- Namma Lorry — 0002: DPDP consent record (docs/09 §1)
-- The D1 permission screen shows the notice; "I agree" calls record_consent.
-- Drivers have no UPDATE policy on profiles, so this SECURITY DEFINER RPC is
-- the only way a non-admin can write these two columns, and only on their own row.
-- =====================================================================
alter table public.profiles
  add column consent_version text,
  add column consent_at      timestamptz;

create or replace function public.record_consent(p_version text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'VERSION_REQUIRED' using errcode = 'P0001'; end if;

  update public.profiles
     set consent_version = trim(p_version), consent_at = now()
   where id = auth.uid() and is_active
  returning * into p;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return p;
end $$;

revoke all on function public.record_consent(text) from public, anon;
grant execute on function public.record_consent(text) to authenticated;
