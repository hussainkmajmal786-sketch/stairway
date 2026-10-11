-- Phase 5 (part 1): audit log, admin guards, admin invites. Additive; no existing object is dropped.

-- 1. Audit log: append-only, super-admin readable, written only by definer functions.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- No FKs on actor_id / society_id: ON DELETE SET NULL would UPDATE an append-only table (blocked by the trigger
  -- below) and so make deleting an admin user or a society fail. The ids are a historical record.
  actor_id uuid,
  actor_label text not null default '',
  action text not null check (char_length(action) between 3 and 60),
  target_type text not null check (char_length(target_type) between 2 and 40),
  target_id text check (char_length(target_id) <= 80),
  society_id uuid,
  summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 2048)
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_society_idx on public.audit_log (society_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated, service_role;
grant select on public.audit_log to authenticated;
create policy "super admin reads audit" on public.audit_log for select to authenticated
  using (private.is_super_admin());

create or replace function private.audit_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'audit_log is append-only' using errcode = '42501'; end $$;
revoke execute on function private.audit_append_only() from public, anon, authenticated, service_role;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function private.audit_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_append_only();

create or replace function private.write_audit(
  p_action text, p_target_type text, p_target_id text, p_society_id uuid, p_summary jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_label text;
begin
  select p.handle into v_label from public.profiles p where p.id = v_uid;
  insert into public.audit_log (actor_id, actor_label, action, target_type, target_id, society_id, summary)
  values (v_uid, coalesce(v_label, ''), p_action, p_target_type, p_target_id, p_society_id, coalesce(p_summary, '{}'::jsonb));
end $$;
revoke execute on function private.write_audit(text, text, text, uuid, jsonb) from public, anon, authenticated, service_role;

-- 2. Whitelisted entries for things SQL cannot see (CSV export, refunds, uploads, speaker links).
create or replace function private.log_admin_event(
  p_action text, p_target_type text, p_target_id text, p_society_id uuid, p_summary jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_any_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('registrations.export', 'refund.attempt', 'refund.result', 'media.upload', 'event.speakers') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_society_id is null then
    if not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not private.is_society_admin(p_society_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_summary is not null and (jsonb_typeof(p_summary) <> 'object' or octet_length(p_summary::text) > 1024) then
    raise exception 'invalid_summary' using errcode = 'P0001';
  end if;
  perform private.write_audit(p_action, left(coalesce(p_target_type, 'misc'), 40), left(p_target_id, 80), p_society_id, p_summary);
end $$;
revoke execute on function private.log_admin_event(text, text, text, uuid, jsonb) from public, anon, service_role;
grant execute on function private.log_admin_event(text, text, text, uuid, jsonb) to authenticated;

create function public.log_admin_event(
  p_action text, p_target_type text, p_target_id text, p_society_id uuid, p_summary jsonb default '{}'::jsonb)
returns void language sql security invoker set search_path = '' as $$
  select private.log_admin_event(p_action, p_target_type, p_target_id, p_society_id, p_summary);
$$;
revoke execute on function public.log_admin_event(text, text, text, uuid, jsonb) from public, anon, service_role;
grant execute on function public.log_admin_event(text, text, text, uuid, jsonb) to authenticated;

-- 3. Content-table audit trigger: only admin actors are logged (service role, cron, SQL editor are not).
create or replace function private.audit_content_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_r jsonb := coalesce(v_n, v_o);
  v_cols text[];
  v_sid uuid;
  v_summary jsonb := jsonb_build_object('op', tg_op);
begin
  if (select auth.uid()) is null or not private.is_any_admin() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(e.k order by e.k), '{}') into v_cols
      from jsonb_each(v_n) as e(k, v) where e.k <> 'updated_at' and v_o -> e.k is distinct from e.v;
    if cardinality(v_cols) = 0 then return null; end if;
    v_summary := v_summary || jsonb_build_object('columns', to_jsonb(v_cols))
      || coalesce((select jsonb_object_agg(k, jsonb_build_object('from', v_o -> k, 'to', v_n -> k))
                     from unnest(array['status', 'capacity', 'price_paise', 'role', 'slug']) as k
                    where v_o -> k is distinct from v_n -> k), '{}'::jsonb);
  end if;
  v_sid := case tg_table_name when 'societies' then (v_r ->> 'id')::uuid else nullif(v_r ->> 'society_id', '')::uuid end;
  perform private.write_audit(tg_table_name || '.' || lower(tg_op), tg_table_name,
                              coalesce(v_r ->> 'id', v_r ->> 'key'), v_sid, v_summary);
  return null;
end $$;
revoke execute on function private.audit_content_change() from public, anon, authenticated, service_role;

do $$ declare t text; begin
  foreach t in array array['events', 'societies', 'tracks', 'speakers', 'gallery_items', 'site_blocks', 'sponsors',
                           'team_members', 'faqs', 'testimonials', 'admin_roles'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit_content_change()', t || '_audit', t);
  end loop;
end $$;

-- 4. Event guard (admins write events through RLS; these rules RLS cannot express).
create or replace function private.guard_event_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;             -- service role / cron / SQL editor
  if tg_op = 'INSERT' then
    if new.status = 'cancelled' then raise exception 'use_cancel_event' using errcode = 'P0001'; end if;
    return new;
  end if;
  if new.society_id is distinct from old.society_id and not private.is_super_admin() then
    raise exception 'society_locked' using errcode = '42501';
  end if;
  if new.slug is distinct from old.slug and old.status <> 'draft' then
    raise exception 'slug_locked' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'cancelled' then raise exception 'event_cancelled' using errcode = 'P0001'; end if;
    if new.status = 'cancelled' and coalesce(current_setting('stairway.admin_cancel', true), '') <> 'on' then
      raise exception 'use_cancel_event' using errcode = 'P0001';
    end if;
    if new.status = 'draft' and exists (
         select 1 from public.registrations r where r.event_id = old.id
            and r.status in ('confirmed', 'waitlisted', 'pending_payment', 'refund_needed')) then
      raise exception 'has_registrations' using errcode = 'P0001';
    end if;
  end if;
  if new.price_paise is distinct from old.price_paise and exists (
       select 1 from public.registrations r where r.event_id = old.id and r.amount_paise > 0
          and r.status in ('pending_payment', 'confirmed', 'refund_needed')) then
    raise exception 'price_locked' using errcode = 'P0001';
  end if;
  if new.capacity < old.capacity and new.capacity < private.seats_taken(old.id) then
    raise exception 'capacity_below_taken' using errcode = 'P0001';
  end if;
  if (new.ticket_type is distinct from old.ticket_type or new.token_prefix is distinct from old.token_prefix)
     and exists (select 1 from public.registrations r where r.event_id = old.id and r.token_number is not null) then
    raise exception 'ticket_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function private.guard_event_write() from public, anon, authenticated, service_role;
create trigger events_guard before insert or update on public.events
  for each row execute function private.guard_event_write();

-- 5. The last super admin can never be deleted or demoted (also stops an auth.users cascade removing them).
create or replace function private.guard_last_super_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'super_admin' and (tg_op = 'DELETE' or new.role <> 'super_admin')
     and not exists (select 1 from public.admin_roles r where r.role = 'super_admin' and r.id <> old.id) then
    raise exception 'last_super_admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function private.guard_last_super_admin() from public, anon, authenticated, service_role;
create trigger admin_roles_guard before update or delete on public.admin_roles
  for each row execute function private.guard_last_super_admin();

-- 6. Invites: hash only, super admin only. The token itself never reaches the database.
create table public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254
                             and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role public.admin_role not null,
  society_id uuid references public.societies(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check ((role = 'super_admin' and society_id is null) or (role = 'society_admin' and society_id is not null))
);
create index admin_invites_society_idx on public.admin_invites (society_id);
create index admin_invites_created_by_idx on public.admin_invites (created_by);
create index admin_invites_accepted_by_idx on public.admin_invites (accepted_by);
alter table public.admin_invites enable row level security;
revoke all on public.admin_invites from public, anon, authenticated, service_role;
grant select (id, email, role, society_id, created_by, created_at, expires_at, accepted_at, accepted_by, revoked_at)
  on public.admin_invites to authenticated;
grant insert (email, role, society_id, token_hash, created_by, expires_at) on public.admin_invites to authenticated;
grant update (revoked_at) on public.admin_invites to authenticated;
create policy "super admin reads invites" on public.admin_invites for select to authenticated using (private.is_super_admin());
create policy "super admin creates invites" on public.admin_invites for insert to authenticated
  with check (private.is_super_admin() and created_by = (select auth.uid()) and accepted_at is null);
create policy "super admin revokes invites" on public.admin_invites for update to authenticated
  using (private.is_super_admin() and accepted_at is null) with check (private.is_super_admin());
create trigger admin_invites_audit after insert or update on public.admin_invites
  for each row execute function private.audit_content_change();
