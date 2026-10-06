-- Phase 2 review fixes: resilient signup trigger, avatar SELECT policy, URL checks.

alter table public.profiles
  add constraint profiles_avatar_url_check check (avatar_url is null or avatar_url ~* '^https?://');
alter table public.profile_projects
  add constraint profile_projects_image_url_check check (image_url is null or image_url ~* '^https?://');

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
  if avatar is not null and avatar !~* '^https://' then avatar := null; end if;

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

create policy "users read own avatar" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
