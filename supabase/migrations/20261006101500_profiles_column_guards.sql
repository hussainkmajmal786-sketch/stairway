-- Phase 2 final review I1: column-level write grants and DB constraints behind the client-side zod checks.

-- 1. Column grants: users may only write the fields the UI edits.
--    id / created_at / updated_at (profiles) and email / user_id / timestamps (profile_private) become read-only.
revoke update on public.profiles from authenticated;
grant update (full_name, handle, avatar_url, headline, bio, college, branch, year, skills, links, onboarded)
  on public.profiles to authenticated;

revoke update on public.profile_private from authenticated;
grant update (phone, ieee_member_id) on public.profile_private to authenticated;

-- Projects / experience: user_id is already pinned by the RLS `with check`; also stop id/timestamp writes.
revoke insert, update on public.profile_projects from authenticated;
grant insert (user_id, title, description, url, image_url, sort_order) on public.profile_projects to authenticated;
grant update (title, description, url, image_url, sort_order) on public.profile_projects to authenticated;

revoke insert, update on public.profile_experience from authenticated;
grant insert (user_id, title, organization, start_date, end_date, description, sort_order) on public.profile_experience to authenticated;
grant update (title, organization, start_date, end_date, description, sort_order) on public.profile_experience to authenticated;

-- 2. Constraints (0 users at the time of writing, so no data clean-up is needed).
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles
  -- links: a flat object of at most 5 social URLs (client caps each at 300 chars).
  add constraint profiles_links_shape check (
    jsonb_typeof(links) = 'object' and octet_length(links::text) <= 2048),
  -- avatar: https only (no mixed content on the owner's own pages), bounded length.
  add constraint profiles_avatar_url_https check (
    avatar_url is null or (char_length(avatar_url) <= 512 and avatar_url ~* '^https://')),
  -- skills: client allows 30 skills x 30 chars; 30*30 + 29 separators = 929.
  add constraint profiles_skills_len check (
    array_position(skills, null) is null and char_length(array_to_string(skills, '|')) <= 929),
  -- onboarded rows always carry the fields Phase 3 registration reads.
  add constraint profiles_onboarded_complete check (
    not onboarded or (
      char_length(btrim(full_name)) >= 2 and char_length(btrim(college)) >= 2
      and btrim(branch) <> '' and btrim(year) <> ''));

-- 3. Signup trigger: also drop over-long provider avatars so profiles_avatar_url_https can never block a signup.
--    (Same logic as 20261005091015 otherwise.)
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  email_local text := split_part(coalesce(new.email, ''), '@', 1);
  display text := coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', ''), email_local, '');
  avatar text := nullif(coalesce(meta->>'avatar_url', meta->>'picture'), '');
  seed text := coalesce(nullif(email_local, ''), display);
  candidate text;
  cname text;
  attempt int := 0;
  done boolean := false;
begin
  if avatar is not null and (avatar !~* '^https://' or char_length(avatar) > 512) then avatar := null; end if;

  while not done and attempt < 6 loop
    attempt := attempt + 1;
    if attempt <= 5 then
      candidate := private.generate_handle(seed);
      if attempt > 1 then
        candidate := left(candidate, 24) || '-' || substr(md5(random()::text || clock_timestamp()::text || new.id::text), 1, 4);
      end if;
    else
      candidate := 'u' || left(replace(new.id::text, '-', ''), 12);
    end if;
    begin
      insert into public.profiles (id, handle, full_name, avatar_url)
      values (new.id, candidate, left(display, 80), avatar);
      done := true;
    exception when unique_violation then
      get stacked diagnostics cname = constraint_name;
      if cname is distinct from 'profiles_handle_key' then raise; end if;
    end;
  end loop;

  insert into public.profile_private (user_id, email) values (new.id, coalesce(new.email, ''));
  return new;
end $$;

-- 4. Private trigger functions and generate_handle need no caller grants: triggers fire without an EXECUTE
--    check, and generate_handle is only called from the security-definer signup trigger.
--    The RLS helpers (is_super_admin, is_society_admin, is_any_admin, can_manage_media) keep their explicit grants.
revoke execute on function
  private.generate_handle(text),
  private.handle_new_user(),
  private.guard_society_update(),
  private.check_event_track(),
  private.check_gallery_event()
from public;
