-- Phase 5 review fixes (Tasks 1-3 review, .superpowers/sdd/p5-review-1-3.md). Additive: functions re-created in place.
-- I-1 confirm_payment never revives a seat an admin (or an event cancellation) released.
-- M-1 last-super-admin guard serialises; M-2 invite lifetime cap + no un-revoke; M-3 answers only for live rows;
-- M-5 log_admin_event summaries are numbers/booleans only; M-6 anonymisation also scrubs queued outbox payloads, auth
-- one-time tokens and MFA factors and blocks on an open order; M-7 role changes are always audited.
-- M-4 (slug lock bypass via unpublish) is deferred.

create or replace function private.confirm_payment(
  p_registration_id uuid, p_order_id text, p_payment_id text, p_amount_paise int, p_currency text,
  p_source text, p_event_id text default null, p_event_name text default null, p_details jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ord private.payment_orders%rowtype;
  ev public.events%rowtype;
  reg public.registrations%rowtype;
  v_outcome text;
  new_status public.registration_status;
  receipt text;
  live boolean;
  v_details jsonb := '{}'::jsonb;
begin
  if p_source is null or p_source not in ('client_verify', 'webhook') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid_payment' using errcode = 'P0001';
  end if;
  if p_event_id is not null and (p_event_id = '' or char_length(p_event_id) > 100) then
    raise exception 'invalid_event' using errcode = 'P0001';
  end if;
  -- The order must be one we created for THIS registration (binds order id + registration + amount).
  select o.* into ord from private.payment_orders o
   where o.razorpay_order_id = p_order_id and o.registration_id = p_registration_id;
  if not found then
    -- Not an order we created for this registration (Fund Easy shares the Razorpay account): store nothing.
    return jsonb_build_object('outcome', 'unknown_order');
  end if;

  select e.* into ev from public.events e
   where e.id = (select r.event_id from public.registrations r where r.id = ord.registration_id)
   for update;
  select r.* into reg from public.registrations r where r.id = ord.registration_id for update;
  select o.* into ord from private.payment_orders o where o.razorpay_order_id = p_order_id for update;

  -- Checked under the locks, so two deliveries of the same webhook event serialise here.
  if p_event_id is not null and exists (select 1 from private.payment_events pe where pe.razorpay_event_id = p_event_id) then
    return jsonb_build_object('outcome', 'duplicate_event', 'registration_id', reg.id, 'status', reg.status);
  end if;

  if ord.razorpay_payment_id = p_payment_id or reg.razorpay_payment_id = p_payment_id then
    v_outcome := 'already_processed';
  elsif p_currency is distinct from 'INR' or p_amount_paise is distinct from ord.amount_paise then
    v_outcome := 'amount_mismatch';
  elsif ord.razorpay_payment_id is not null or reg.razorpay_payment_id is not null or reg.status = 'confirmed' then
    -- The seat is already paid for (or free now): keep the money on record for a manual refund (Phase 5 list).
    v_outcome := 'duplicate_payment';
  else
    -- A payment id already attached to another order / registration is inconsistent input: refuse, change nothing.
    if exists (select 1 from private.payment_orders o where o.razorpay_payment_id = p_payment_id)
       or exists (select 1 from public.registrations r where r.razorpay_payment_id = p_payment_id) then
      raise exception 'payment_conflict' using errcode = 'P0001';
    end if;
    live := reg.status = 'pending_payment' and reg.hold_expires_at > now();
    if ord.amount_paise is distinct from (case when live then reg.amount_paise else ev.price_paise end) then
      -- An order for an old price never pays for the seat at today's price: row untouched, attention list.
      v_outcome := 'amount_mismatch';
    elsif live and ev.status = 'published' then
      v_outcome := 'confirmed';
    elsif reg.cancel_reason in ('user', 'admin', 'event_cancelled') then
      -- The user cancelled this place themselves: the late money is refunded, the seat is not revived.
      v_outcome := 'refund_needed';
    elsif ev.status = 'published' and now() < ev.starts_at and private.seats_taken(ev.id) < ev.capacity then
      v_outcome := 'late_confirmed';
    else
      v_outcome := 'refund_needed';
    end if;

    if v_outcome <> 'amount_mismatch' then
      new_status := case when v_outcome = 'refund_needed' then 'refund_needed'::public.registration_status
                         else 'confirmed'::public.registration_status end;
      receipt := private.next_receipt_number();
      update public.registrations r
         set status = new_status, razorpay_order_id = p_order_id, razorpay_payment_id = p_payment_id,
             amount_paise = ord.amount_paise, paid_at = now(), receipt_number = receipt,
             hold_expires_at = null, waitlist_position = null,
             confirmed_at = case when new_status = 'confirmed' then now() else r.confirmed_at end,
             token_number = case when new_status = 'confirmed' then coalesce(r.token_number, private.next_token(ev.id))
                                 else r.token_number end,
             cancelled_at = case when new_status = 'confirmed' then null else coalesce(r.cancelled_at, now()) end,
             cancel_reason = case when new_status = 'confirmed' then null
                                  when r.cancel_reason in ('user', 'admin', 'event_cancelled') then r.cancel_reason
                                  else 'late_payment_no_seat' end
       where r.id = reg.id;
      if reg.status = 'waitlisted' then
        perform private.compact_waitlist(ev.id);
      end if;
      update private.payment_orders o
         set status = 'paid', razorpay_payment_id = p_payment_id, receipt_number = receipt, paid_at = now()
       where o.razorpay_order_id = p_order_id;
    end if;
  end if;

  -- Whitelisted, size-bounded details only (never card / contact data).
  if jsonb_typeof(p_details) = 'object' then
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'status', left(p_details ->> 'status', 40),
      'method', left(p_details ->> 'method', 40),
      'error_code', left(p_details ->> 'error_code', 60)));
  end if;
  insert into private.payment_events (registration_id, source, razorpay_event_id, razorpay_event, razorpay_order_id,
                                      razorpay_payment_id, amount_paise, currency, outcome, details)
  values (reg.id, p_source, p_event_id, left(p_event_name, 60), p_order_id, p_payment_id, p_amount_paise,
          case when p_currency ~ '^[A-Z]{3}$' then p_currency end, v_outcome, v_details);

  return jsonb_build_object('outcome', v_outcome, 'registration_id', reg.id,
                            'status', (select r.status from public.registrations r where r.id = reg.id));
end $$;

create or replace function private.guard_last_super_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- serialise concurrent demotions/deletions of super admins (two admins removing each other)
  perform 1 from public.admin_roles r0 where r0.role = 'super_admin' for update;
  if old.role = 'super_admin' and (tg_op = 'DELETE' or new.role <> 'super_admin')
     and not exists (select 1 from public.admin_roles r where r.role = 'super_admin' and r.id <> old.id) then
    raise exception 'last_super_admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

alter table public.admin_invites add constraint admin_invites_lifetime check (expires_at <= created_at + interval '7 days');
drop policy "super admin revokes invites" on public.admin_invites;
create policy "super admin revokes invites" on public.admin_invites for update to authenticated
  using (private.is_super_admin() and accepted_at is null)
  with check (private.is_super_admin() and revoked_at is not null);

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
             case when r.status in ('confirmed', 'waitlisted', 'pending_payment', 'refund_needed') then r.answers end as answers,
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
  -- counts and flags only: no free text can enter the audit log through this door
  if p_summary is not null and (jsonb_typeof(p_summary) <> 'object' or octet_length(p_summary::text) > 1024
       or exists (select 1 from jsonb_each(p_summary) e where jsonb_typeof(e.value) not in ('number', 'boolean'))) then
    raise exception 'invalid_summary' using errcode = 'P0001';
  end if;
  perform private.write_audit(p_action, left(coalesce(p_target_type, 'misc'), 40), left(p_target_id, 80), p_society_id, p_summary);
end $$;

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
  -- role changes are audited whoever makes them (a super admin removing their own role is no admin afterwards);
  -- everything else only when the actor is an admin
  if (select auth.uid()) is null or (tg_table_name <> 'admin_roles' and not private.is_any_admin()) then
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
  -- an unpaid order that could still be captured (past-event hold with an open ledger order) blocks as well
  if exists (select 1 from private.payment_orders o join public.registrations r on r.id = o.registration_id
              where r.user_id = p_user_id and o.status = 'created' and r.status = 'pending_payment') then
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
  delete from auth.one_time_tokens where user_id = p_user_id;
  delete from auth.mfa_factors where user_id = p_user_id;
  -- queued Fund Easy payloads must not carry the attendee's name / email any more
  update private.external_sync_outbox o set payload = o.payload - 'attendee'
   where o.status <> 'sent' and o.payload ? 'attendee'
     and o.registration_id in (select r.id from public.registrations r where r.user_id = p_user_id);
  delete from auth.sessions where user_id = p_user_id;

  select count(*)::int into v_kept from public.registrations r where r.user_id = p_user_id;
  perform private.write_audit('user.anonymised', 'profile', p_user_id::text, null, jsonb_build_object('registrations_kept', v_kept));
  return jsonb_build_object('registrations_kept', v_kept);
end $$;
