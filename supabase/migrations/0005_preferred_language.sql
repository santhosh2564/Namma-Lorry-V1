-- =====================================================================
-- Namma Lorry — 0005: per-user app language (M12a, docs/13 P13 "language persists per user")
-- Drivers have no UPDATE policy on profiles (docs/09 §4 "no self-update on profiles"), so,
-- like record_consent (0002), this SECURITY DEFINER RPC is the only way a non-admin can
-- change preferred_language, and only on their own row. Nothing else on the row changes.
-- =====================================================================

-- Only the languages the app ships (src/i18n/*.json). Normalise anything else first.
update public.profiles set preferred_language = 'en'
 where preferred_language is null or preferred_language not in ('en', 'ta', 'kn', 'hi');
alter table public.profiles
  alter column preferred_language set not null,
  add constraint profiles_preferred_language_check check (preferred_language in ('en', 'ta', 'kn', 'hi'));

create or replace function public.set_preferred_language(p_language text)
returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_language is null or p_language not in ('en', 'ta', 'kn', 'hi') then
    raise exception 'LANGUAGE_NOT_SUPPORTED' using errcode = 'P0001';
  end if;

  update public.profiles set preferred_language = p_language
   where id = auth.uid() and is_active
  returning preferred_language into v;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  return v;
end $$;

revoke all on function public.set_preferred_language(text) from public, anon;
grant execute on function public.set_preferred_language(text) to authenticated;
