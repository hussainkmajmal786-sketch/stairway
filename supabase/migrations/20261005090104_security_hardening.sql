-- Phase 2 pre-task: close the permission gaps found in the Phase 1 final review.

-- 1. Helpers move to a schema that PostgREST does not expose (no /rpc/is_* endpoints).
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

alter function public.is_super_admin()        set schema private;
alter function public.is_society_admin(uuid)  set schema private;
alter function public.is_any_admin()          set schema private;
revoke execute on function private.is_super_admin(), private.is_society_admin(uuid), private.is_any_admin() from public;
grant  execute on function private.is_super_admin(), private.is_society_admin(uuid), private.is_any_admin() to anon, authenticated;
-- Existing policies keep working: policy expressions reference these functions by OID.

-- 2. Speakers: a society admin may only write their own society's speakers;
--    speakers with no society are super-admin only.
drop policy if exists "admins write speakers" on public.speakers;
create policy "admins write speakers" on public.speakers for all
  using      (private.is_super_admin() or (society_id is not null and private.is_society_admin(society_id)))
  with check (private.is_super_admin() or (society_id is not null and private.is_society_admin(society_id)));

-- 3. Societies: society admins may change description / logo / page content only.
create or replace function private.guard_society_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_super_admin() then
    if new.id         is distinct from old.id
    or new.slug       is distinct from old.slug
    or new.name       is distinct from old.name
    or new.short_name is distinct from old.short_name
    or new.color      is distinct from old.color
    or new.sort_order is distinct from old.sort_order then
      raise exception 'Only a super admin can change a society''s identity fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger societies_guard_update before update on public.societies
  for each row execute function private.guard_society_update();

-- 4. Cross-society integrity.
create or replace function private.check_event_track() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.track_id is not null and not exists (
    select 1 from public.tracks t where t.id = new.track_id and t.society_id = new.society_id
  ) then
    raise exception 'Track does not belong to the event''s society' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger events_check_track before insert or update of track_id, society_id on public.events
  for each row execute function private.check_event_track();

create or replace function private.check_gallery_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.event_id is not null and new.society_id is not null and not exists (
    select 1 from public.events e where e.id = new.event_id and e.society_id = new.society_id
  ) then
    raise exception 'Gallery item society does not match its event''s society' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger gallery_items_check_event before insert or update of event_id, society_id on public.gallery_items
  for each row execute function private.check_gallery_event();

-- 5. Media bucket: super admins anywhere; society admins only under societies/<their-society-uuid>/.
create or replace function private.can_manage_media(object_name text) returns boolean
language sql stable set search_path = '' as $$
  select private.is_super_admin() or (
    case
      when (storage.foldername(object_name))[1] = 'societies'
       and (storage.foldername(object_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_society_admin(((storage.foldername(object_name))[2])::uuid)
      else false
    end
  );
$$;
revoke execute on function private.can_manage_media(text) from public;
grant  execute on function private.can_manage_media(text) to authenticated;

drop policy if exists "admins upload media" on storage.objects;
drop policy if exists "admins update media" on storage.objects;
drop policy if exists "admins delete media" on storage.objects;
create policy "admins upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and private.can_manage_media(name));
create policy "admins update media" on storage.objects for update to authenticated
  using (bucket_id = 'media' and private.can_manage_media(name));
create policy "admins delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and private.can_manage_media(name));
-- SVGs can carry scripts and the bucket is public: drop SVG from the allow-list.
update storage.buckets set allowed_mime_types =
  array['image/png','image/jpeg','image/webp','image/avif','video/mp4','video/webm','application/pdf']
  where id = 'media';

-- 6. Grants: anon is read-only; nobody needs TRUNCATE / REFERENCES / TRIGGER through the API.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- 7. Indexes on foreign keys flagged by the performance advisor.
create index if not exists events_track_id_idx          on public.events (track_id);
create index if not exists event_speakers_speaker_idx   on public.event_speakers (speaker_id);
create index if not exists gallery_items_event_id_idx   on public.gallery_items (event_id);
create index if not exists gallery_items_society_id_idx on public.gallery_items (society_id);
create index if not exists speakers_society_id_idx      on public.speakers (society_id);
create index if not exists admin_roles_society_id_idx   on public.admin_roles (society_id);
