-- Phase 5 (part 2): admin registration operations.
alter table public.registrations drop constraint registrations_cancel_reason_check;
alter table public.registrations add constraint registrations_cancel_reason_check
  check (cancel_reason in ('user', 'hold_expired', 'late_payment_no_seat', 'refunded', 'admin', 'event_cancelled'));

-- Society of an event, or 42501 (same error for "no such event" and "not yours": no existence oracle).
create or replace function private.admin_scope(p_event_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_sid uuid;
begin
  select e.society_id into v_sid from public.events e where e.id = p_event_id;
  if v_sid is null or (select auth.uid()) is null or not private.is_society_admin(v_sid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_sid;
end $$;
revoke execute on function private.admin_scope(uuid) from public, anon, service_role;
grant execute on function private.admin_scope(uuid) to authenticated;

-- Minimal registrant listing. Contact only for live statuses; payment id only for super admins.
create or replace function private.admin_event_registrants(
  p_event_id uuid, p_status text default null, p_q text default null, p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_super boolean := private.is_super_admin();
  v_q text := nullif(btrim(p_q), '');
  v_like text;
  v_result jsonb;
begin
  perform private.admin_scope(p_event_id);
  if v_q is not null then
    v_like := '%' || replace(replace(replace(left(v_q, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select jsonb_build_object('total', coalesce(max(g.total), 0),
           'rows', coalesce(jsonb_agg(to_jsonb(g) - 'total' - 'ord' order by g.ord), '[]'::jsonb))
    into v_result
    from (
      select r.id as registration_id, r.status, r.token_number, r.waitlist_position, r.checked_in_at, r.created_at,
             r.amount_paise, r.receipt_number,
             case when v_super then r.razorpay_payment_id end as razorpay_payment_id,
             p.full_name, p.handle, p.college, p.branch, p.year,
             case when r.status in ('confirmed', 'waitlisted', 'pending_payment', 'refund_needed') then pp.email end as email,
             case when r.status in ('confirmed', 'waitlisted', 'pending_payment', 'refund_needed') then pp.phone end as phone,
             r.answers,
             count(*) over () as total,
             row_number() over (order by r.created_at, r.id) as ord
        from public.registrations r
        join public.profiles p on p.id = r.user_id
        left join public.profile_private pp on pp.user_id = r.user_id
       where r.event_id = p_event_id
         and (p_status is null or r.status::text = p_status)
         and (v_like is null or p.full_name ilike v_like or p.handle ilike v_like or r.token_number::text = v_q)
       order by r.created_at, r.id
       limit least(greatest(coalesce(p_limit, 100), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
    ) g;
  return v_result;
end $$;

create or replace function private.admin_check_in(
  p_event_id uuid, p_code text default null, p_registration_id uuid default null, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  ev public.events%rowtype;
  reg public.registrations%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_kind text;
  v_who jsonb;
begin
  perform private.admin_scope(p_event_id);
  select e.* into ev from public.events e where e.id = p_event_id;
  if ev.status <> 'published' then return jsonb_build_object('result', 'event_not_open'); end if;
  if now() < ev.starts_at - interval '24 hours' or now() > ev.ends_at + interval '24 hours' then
    return jsonb_build_object('result', 'outside_window');
  end if;

  if p_registration_id is not null then
    v_kind := 'manual';
    select r.* into reg from public.registrations r where r.id = p_registration_id and r.event_id = p_event_id for update;
  elsif v_code ~ '^[A-Z2-7]{26}$' then
    v_kind := 'qr';
    select r.* into reg from public.registrations r where r.ticket_code = v_code and r.event_id = p_event_id for update;
  elsif v_code ~ '^([A-Z0-9]+-)*[0-9]{1,6}$' then
    v_kind := 'token';
    -- a typed prefix must be this event's prefix (a RAS-05 token is never accepted at another session)
    if regexp_replace(v_code, '-?[0-9]{1,6}$', '') <> '' and regexp_replace(v_code, '-?[0-9]{1,6}$', '') <> ev.token_prefix then
      return jsonb_build_object('result', 'not_found');
    end if;
    select r.* into reg from public.registrations r
     where r.event_id = p_event_id and r.token_number = (substring(v_code from '([0-9]{1,6})$'))::int for update;
  else
    return jsonb_build_object('result', 'invalid_code');
  end if;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  select jsonb_build_object('registration_id', reg.id, 'full_name', p.full_name, 'handle', p.handle,
           'avatar_url', p.avatar_url, 'college', p.college, 'token_number', reg.token_number,
           'token_prefix', ev.token_prefix)
    into v_who from public.profiles p where p.id = reg.user_id;

  if reg.status <> 'confirmed' then
    return jsonb_build_object('result', 'not_confirmed', 'status', reg.status, 'attendee', v_who);
  end if;
  if reg.checked_in_at is not null then
    return jsonb_build_object('result', 'already_checked_in', 'checked_in_at', reg.checked_in_at, 'attendee', v_who);
  end if;
  if v_kind = 'token' and not coalesce(p_confirm, false) then
    return jsonb_build_object('result', 'confirm_identity', 'attendee', v_who);
  end if;
  update public.registrations r set checked_in_at = now(), checked_in_by = v_uid where r.id = reg.id;
  return jsonb_build_object('result', 'checked_in', 'checked_in_at', now(), 'attendee', v_who);
end $$;

create or replace function private.admin_undo_check_in(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_sid uuid;
begin
  select r.event_id into v_event from public.registrations r where r.id = p_registration_id;
  if v_event is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_sid := private.admin_scope(v_event);
  update public.registrations r set checked_in_at = null, checked_in_by = null
   where r.id = p_registration_id and r.checked_in_at is not null;
  if not found then raise exception 'not_checked_in' using errcode = 'P0001'; end if;
  perform private.write_audit('checkin.undone', 'registration', p_registration_id::text, v_sid, '{}'::jsonb);
  return jsonb_build_object('registration_id', p_registration_id);
end $$;

create or replace function private.admin_cancel_registration(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  ev public.events%rowtype;
  reg public.registrations%rowtype;
  v_new public.registration_status;
  v_promoted int;
begin
  select r.event_id into v_event from public.registrations r where r.id = p_registration_id;
  if v_event is null then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.admin_scope(v_event);
  select e.* into ev from public.events e where e.id = v_event for update;          -- lock order: event, then rows
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;
  if reg.status not in ('confirmed', 'waitlisted', 'pending_payment') then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  if reg.checked_in_at is not null then raise exception 'already_checked_in' using errcode = 'P0001'; end if;
  v_new := (case when reg.status = 'confirmed' and reg.razorpay_payment_id is not null
                 then 'refund_needed' else 'cancelled' end)::public.registration_status;
  update public.registrations r
     set status = v_new, cancelled_at = now(), cancel_reason = 'admin', waitlist_position = null
   where r.id = reg.id;
  if reg.status = 'waitlisted' then perform private.compact_waitlist(ev.id); end if;
  select count(*)::int into v_promoted from private.promote_waitlist(ev.id);
  perform private.write_audit('registration.cancelled', 'registration', reg.id::text, ev.society_id,
    jsonb_build_object('from', reg.status, 'to', v_new, 'promoted', v_promoted));
  return jsonb_build_object('registration_id', reg.id, 'status', v_new, 'promoted', v_promoted);
end $$;

create or replace function private.admin_promote_waitlist(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sid uuid := private.admin_scope(p_event_id); v_promoted int;
begin
  perform 1 from public.events e where e.id = p_event_id for update;
  select count(*)::int into v_promoted from private.promote_waitlist(p_event_id);
  perform private.write_audit('waitlist.promoted', 'event', p_event_id::text, v_sid, jsonb_build_object('promoted', v_promoted));
  return jsonb_build_object('promoted', v_promoted);
end $$;

create or replace function private.admin_cancel_event(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sid uuid := private.admin_scope(p_event_id);
  ev public.events%rowtype;
  v_cancelled int; v_refund int; v_wait int;
begin
  select e.* into ev from public.events e where e.id = p_event_id for update;
  if ev.status = 'cancelled' then raise exception 'event_cancelled' using errcode = 'P0001'; end if;
  perform set_config('stairway.admin_cancel', 'on', true);
  update public.events e set status = 'cancelled' where e.id = p_event_id;
  perform set_config('stairway.admin_cancel', 'off', true);
  select count(*)::int into v_wait from public.registrations r where r.event_id = p_event_id and r.status = 'waitlisted';
  with moved as (
    update public.registrations r
       set status = (case when r.status = 'confirmed' and r.razorpay_payment_id is not null
                          then 'refund_needed' else 'cancelled' end)::public.registration_status,
           cancelled_at = now(), cancel_reason = 'event_cancelled', waitlist_position = null
     where r.event_id = p_event_id and r.status in ('confirmed', 'waitlisted', 'pending_payment')
    returning r.status)
  select count(*)::int, (count(*) filter (where m.status = 'refund_needed'))::int
    into v_cancelled, v_refund from moved m;
  perform private.write_audit('event.cancelled', 'event', p_event_id::text, v_sid,
    jsonb_build_object('registrations', v_cancelled, 'refund_needed', v_refund, 'waitlisted', v_wait));
  return jsonb_build_object('cancelled', v_cancelled, 'refund_needed', v_refund, 'waitlisted', v_wait);
end $$;

-- Grants: authenticated only (anon, service_role and PUBLIC revoked), then thin SECURITY INVOKER wrappers in public.
revoke execute on function
  private.admin_event_registrants(uuid, text, text, integer, integer),
  private.admin_check_in(uuid, text, uuid, boolean),
  private.admin_undo_check_in(uuid),
  private.admin_cancel_registration(uuid),
  private.admin_promote_waitlist(uuid),
  private.admin_cancel_event(uuid)
from public, anon, service_role;
grant execute on function
  private.admin_event_registrants(uuid, text, text, integer, integer),
  private.admin_check_in(uuid, text, uuid, boolean),
  private.admin_undo_check_in(uuid),
  private.admin_cancel_registration(uuid),
  private.admin_promote_waitlist(uuid),
  private.admin_cancel_event(uuid)
to authenticated;

create function public.admin_event_registrants(
  p_event_id uuid, p_status text default null, p_q text default null, p_limit int default 100, p_offset int default 0)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.admin_event_registrants(p_event_id, p_status, p_q, p_limit, p_offset);
$$;
create function public.admin_check_in(
  p_event_id uuid, p_code text default null, p_registration_id uuid default null, p_confirm boolean default false)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.admin_check_in(p_event_id, p_code, p_registration_id, p_confirm);
$$;
create function public.admin_undo_check_in(p_registration_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.admin_undo_check_in(p_registration_id);
$$;
create function public.admin_cancel_registration(p_registration_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.admin_cancel_registration(p_registration_id);
$$;
create function public.admin_promote_waitlist(p_event_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.admin_promote_waitlist(p_event_id);
$$;
create function public.admin_cancel_event(p_event_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.admin_cancel_event(p_event_id);
$$;

revoke execute on function
  public.admin_event_registrants(uuid, text, text, integer, integer),
  public.admin_check_in(uuid, text, uuid, boolean),
  public.admin_undo_check_in(uuid),
  public.admin_cancel_registration(uuid),
  public.admin_promote_waitlist(uuid),
  public.admin_cancel_event(uuid)
from public, anon, service_role;
grant execute on function
  public.admin_event_registrants(uuid, text, text, integer, integer),
  public.admin_check_in(uuid, text, uuid, boolean),
  public.admin_undo_check_in(uuid),
  public.admin_cancel_registration(uuid),
  public.admin_promote_waitlist(uuid),
  public.admin_cancel_event(uuid)
to authenticated;
