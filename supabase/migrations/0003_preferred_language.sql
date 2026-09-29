-- =====================================================================
-- Namma Lorry — 0003: per-user UI language (M12a i18n)
-- profiles.preferred_language exists since 0001, but non-admins have no UPDATE
-- policy on profiles (prevents role escalation). This RPC is the only way a user
-- can change it, and it touches only that one column on their own row.
-- (ND-21's phase-1 fixes, if approved, move to 0004+.)
-- =====================================================================
create or replace function public.set_preferred_language(p_language text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_language is null or p_language not in ('en', 'ta', 'kn', 'hi') then
    raise exception 'LANGUAGE_NOT_SUPPORTED' using errcode = 'P0001';
  end if;

  update public.profiles set preferred_language = p_language
   where id = auth.uid() and is_active
  returning * into p;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return p;
end $$;

revoke all on function public.set_preferred_language(text) from public, anon;
grant execute on function public.set_preferred_language(text) to authenticated;
