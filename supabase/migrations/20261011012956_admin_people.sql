-- Phase 5 (part 3)
create or replace function private.accept_admin_invite(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  inv public.admin_invites%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  select i.* into inv from public.admin_invites i where i.token_hash = p_token_hash for update;
  -- one uniform error: unknown, used, revoked, expired and wrong-account are indistinguishable to the caller
  if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at <= now()
     or v_email is null or v_email <> inv.email then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  insert into public.admin_roles (user_id, role, society_id) values (v_uid, inv.role, inv.society_id)
    on conflict do nothing;
  update public.admin_invites i set accepted_at = now(), accepted_by = v_uid where i.id = inv.id;
  perform private.write_audit('invite.accepted', 'admin_invites', inv.id::text, inv.society_id,
                              jsonb_build_object('role', inv.role));
  return jsonb_build_object('role', inv.role, 'society_id', inv.society_id);
end $$;
revoke execute on function private.accept_admin_invite(text) from public, anon, service_role;
grant execute on function private.accept_admin_invite(text) to authenticated;

create or replace function private.anonymise_user(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_tomb text := 'deleted-' || substr(replace(p_user_id::text, '-', ''), 1, 12);
  v_kept int;
begin
  if v_uid is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user_id = v_uid or exists (select 1 from public.admin_roles r where r.user_id = p_user_id) then
    raise exception 'admin_account' using errcode = 'P0001';
  end if;
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registrations r join public.events e on e.id = r.event_id
              where r.user_id = p_user_id
                and (r.status = 'refund_needed'
                     or (r.status in ('confirmed', 'waitlisted', 'pending_payment') and e.ends_at > now()))) then
    raise exception 'open_registrations' using errcode = 'P0001';
  end if;

  update public.profiles p
     set onboarded = false, handle = v_tomb, full_name = 'Deleted user', avatar_url = null, headline = '', bio = '',
         college = '', branch = '', year = '', skills = '{}', links = '{}'::jsonb
   where p.id = p_user_id;
  update public.profile_private pp set email = '', phone = '', ieee_member_id = '' where pp.user_id = p_user_id;
  delete from public.profile_projects where user_id = p_user_id;
  delete from public.profile_experience where user_id = p_user_id;
  update public.registrations r set answers = '{}'::jsonb where r.user_id = p_user_id;
  -- Sign-in is closed for good: renamed (frees the real address), banned, identities + sessions removed.
  update auth.users u
     set email = v_tomb || '@anonymised.invalid', phone = null, raw_user_meta_data = '{}'::jsonb,
         banned_until = 'infinity', encrypted_password = null
   where u.id = p_user_id;
  delete from auth.identities where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;

  select count(*)::int into v_kept from public.registrations r where r.user_id = p_user_id;
  perform private.write_audit('user.anonymised', 'profile', p_user_id::text, null, jsonb_build_object('registrations_kept', v_kept));
  return jsonb_build_object('registrations_kept', v_kept);
end $$;
revoke execute on function private.anonymise_user(uuid) from public, anon, service_role;
grant execute on function private.anonymise_user(uuid) to authenticated;

create or replace function private.admin_payments_flag() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.flag_enabled('payments');
end $$;
revoke execute on function private.admin_payments_flag() from public, anon, service_role;
grant execute on function private.admin_payments_flag() to authenticated;

-- Public SECURITY INVOKER wrappers (the Phase 3/4 pattern); the definer bodies stay in the unexposed private schema.
create function public.accept_admin_invite(p_token_hash text) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.accept_admin_invite(p_token_hash);
$$;
create function public.anonymise_user(p_user_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.anonymise_user(p_user_id);
$$;
create function public.admin_payments_flag() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.admin_payments_flag();
$$;
revoke execute on function public.accept_admin_invite(text), public.anonymise_user(uuid), public.admin_payments_flag()
  from public, anon, service_role;
grant execute on function public.accept_admin_invite(text), public.anonymise_user(uuid), public.admin_payments_flag()
  to authenticated;

-- Overview metrics: SECURITY INVOKER, so RLS scopes every table; the explicit is_*admin filters keep non-admins at
-- zero (a plain user can otherwise read published events and their own registrations) and keep a society admin
-- from reading the public events of societies they do not run.
create function public.admin_overview(p_society_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ev as (
    select e.id, e.title, e.starts_at, e.status, e.capacity, s.short_name as society
      from public.events e
      join public.societies s on s.id = e.society_id
     where private.is_any_admin()
       and private.is_society_admin(e.society_id)
       and (p_society_id is null or e.society_id = p_society_id)
  ),
  counts as (
    select r.event_id,
           count(*) filter (where r.status = 'confirmed') as confirmed,
           count(*) filter (where r.status = 'waitlisted') as waitlisted
      from public.registrations r
     where r.event_id in (select id from ev)
     group by r.event_id
  ),
  upcoming as (
    select ev.id, ev.title, ev.society, ev.starts_at, ev.status, ev.capacity,
           coalesce(c.confirmed, 0) as confirmed, coalesce(c.waitlisted, 0) as waitlisted
      from ev left join counts c on c.event_id = ev.id
     where ev.starts_at >= now() and ev.status in ('published', 'draft')
  )
  select jsonb_build_object(
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', u.id, 'title', u.title, 'society', u.society, 'starts_at', u.starts_at, 'status', u.status,
                  'capacity', u.capacity, 'confirmed', u.confirmed, 'waitlisted', u.waitlisted) order by u.starts_at, u.id)
                 from (select * from upcoming order by starts_at, id limit 5) u), '[]'::jsonb),
    'registrations_7d', (select count(*)::int from public.registrations r
                          where r.event_id in (select id from ev) and r.created_at > now() - interval '7 days'
                            and r.status in ('confirmed', 'waitlisted', 'pending_payment')),
    'fill_rate', (select coalesce(round(sum(u.confirmed)::numeric / nullif(sum(u.capacity), 0), 4), 0)
                    from upcoming u where u.status = 'published'),
    'revenue_paise', (select coalesce(sum(r.amount_paise), 0)::bigint from public.registrations r
                       where r.event_id in (select id from ev) and r.status = 'confirmed' and r.paid_at is not null),
    'refunds_pending', (select count(*)::int from public.registrations r
                         where r.event_id in (select id from ev) and r.status = 'refund_needed'),
    'recent_checkins', coalesce((select jsonb_agg(jsonb_build_object(
                  'full_name', x.full_name, 'event', x.title, 'checked_in_at', x.checked_in_at) order by x.checked_in_at desc)
                 from (select p.full_name, e.title, r.checked_in_at
                         from public.registrations r
                         join ev e on e.id = r.event_id
                         join public.profiles p on p.id = r.user_id
                        where r.checked_in_at is not null
                        order by r.checked_in_at desc limit 8) x), '[]'::jsonb)
  );
$$;
revoke execute on function public.admin_overview(uuid) from public, anon, service_role;
grant execute on function public.admin_overview(uuid) to authenticated;
