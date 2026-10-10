-- Phase 4 review fixes (Tasks 1-3 adversarial review, .superpowers/sdd/p4-review-1-3.md).
-- I-1 attach_payment_order becomes server-only (service_role passes the session user id); M-2 it refuses while the
--     payments flag is off.
-- I-2 confirm_payment refuses an order whose amount differs from what the seat costs now (stale-price order).
-- I-3 mark_refunded records a partial refund without touching the seat (new outcome partial_refund).
-- M-1 a live hold on an event that is no longer published is not confirmed; M-5 replays of an applied payment are
--     already_processed even if their amount differs; M-6 a late payment never revives a seat the user cancelled;
-- M-4 payment_orders state shape; M-7 payment_events.details key whitelist (enforced + filtered at write);
-- M-8 a refunded seat records cancel_reason 'refunded'.
-- Lock order unchanged everywhere: events row, registrations row, then the ledger.

-- ───────── schema ─────────
alter table public.registrations drop constraint registrations_cancel_reason_check;
alter table public.registrations add constraint registrations_cancel_reason_check
  check (cancel_reason in ('user', 'hold_expired', 'late_payment_no_seat', 'refunded'));

alter table private.payment_orders add constraint payment_orders_state_shape check (
  (status = 'created' and razorpay_payment_id is null and receipt_number is null and paid_at is null
     and razorpay_refund_id is null and refunded_at is null)
  or (status = 'paid' and razorpay_payment_id is not null and receipt_number is not null and paid_at is not null
     and razorpay_refund_id is null and refunded_at is null)
  or (status = 'refunded' and razorpay_payment_id is not null and razorpay_refund_id is not null
     and refunded_at is not null));

alter table private.payment_events drop constraint payment_events_outcome_check;
alter table private.payment_events add constraint payment_events_outcome_check
  check (outcome in ('confirmed', 'late_confirmed', 'refund_needed', 'already_processed', 'duplicate_payment',
                     'amount_mismatch', 'refunded', 'already_refunded', 'ledger_refund', 'partial_refund'));
alter table private.payment_events add constraint payment_events_details_keys
  check (details - array['status', 'method', 'error_code'] = '{}'::jsonb);

drop index private.payment_events_attention_idx;
create index payment_events_attention_idx on private.payment_events (received_at desc)
  where outcome in ('duplicate_payment', 'amount_mismatch', 'partial_refund');

-- ───────── I-1 / M-2: server-only attach ─────────
drop function public.attach_payment_order(uuid, text, int);
drop function private.attach_payment_order(uuid, text, int);

create function private.attach_payment_order(p_user_id uuid, p_registration_id uuid, p_order_id text, p_amount_paise int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  reg public.registrations%rowtype;
begin
  if p_user_id is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not private.flag_enabled('payments') then
    raise exception 'payments_disabled' using errcode = 'P0001';
  end if;
  if p_order_id is null or p_order_id !~ '^order_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;
  select r.event_id into v_event_id from public.registrations r where r.id = p_registration_id and r.user_id = p_user_id;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;
  perform 1 from public.events e where e.id = v_event_id for update;
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;
  if reg.status <> 'pending_payment' or reg.hold_expires_at <= now() then
    raise exception 'hold_expired' using errcode = 'P0001';
  end if;
  if reg.amount_paise <= 0 or p_amount_paise is distinct from reg.amount_paise then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  insert into private.payment_orders (razorpay_order_id, registration_id, amount_paise)
  values (p_order_id, reg.id, reg.amount_paise)
  on conflict (razorpay_order_id) do nothing;
  if not exists (select 1 from private.payment_orders o
                 where o.razorpay_order_id = p_order_id and o.registration_id = reg.id) then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;

  if reg.razorpay_order_id is null then
    update public.registrations r set razorpay_order_id = p_order_id where r.id = reg.id;
    return jsonb_build_object('order_id', p_order_id, 'hold_expires_at', reg.hold_expires_at);
  end if;
  return jsonb_build_object('order_id', reg.razorpay_order_id, 'hold_expires_at', reg.hold_expires_at);
end $$;
revoke execute on function private.attach_payment_order(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function private.attach_payment_order(uuid, uuid, text, int) to service_role;

create function public.attach_payment_order(p_user_id uuid, p_registration_id uuid, p_order_id text, p_amount_paise int)
returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.attach_payment_order(p_user_id, p_registration_id, p_order_id, p_amount_paise);
$$;
revoke execute on function public.attach_payment_order(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function public.attach_payment_order(uuid, uuid, text, int) to service_role;

-- ───────── I-2, M-1, M-5, M-6, M-7: confirm_payment ─────────
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
    elsif reg.cancel_reason = 'user' then
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
                                  when r.cancel_reason = 'user' then 'user'
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

-- ───────── I-3, M-8: mark_refunded ─────────
create or replace function private.mark_refunded(
  p_registration_id uuid, p_payment_id text, p_refund_id text, p_amount_paise int, p_source text,
  p_event_id text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  reg public.registrations%rowtype;
  v_outcome text;
  promoted int := 0;
begin
  if p_source is null or p_source not in ('webhook', 'refund_api') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]{6,40}$'
     or p_refund_id is null or p_refund_id !~ '^rfnd_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid_refund' using errcode = 'P0001';
  end if;
  if p_event_id is not null and (p_event_id = '' or char_length(p_event_id) > 100) then
    raise exception 'invalid_event' using errcode = 'P0001';
  end if;
  perform 1 from public.events e
   where e.id = (select r.event_id from public.registrations r where r.id = p_registration_id) for update;
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;
  if not found then
    return jsonb_build_object('outcome', 'unknown_registration');
  end if;
  if p_event_id is not null and exists (select 1 from private.payment_events pe where pe.razorpay_event_id = p_event_id) then
    return jsonb_build_object('outcome', 'duplicate_event', 'registration_id', reg.id, 'status', reg.status);
  end if;

  if reg.razorpay_payment_id = p_payment_id then
    if reg.status = 'refunded' then
      v_outcome := 'already_refunded';
    elsif p_amount_paise is distinct from reg.amount_paise then
      -- Only part of the money went back: record it, keep the seat (admin decides; Phase 5 attention list).
      v_outcome := 'partial_refund';
    else
      update public.registrations r
         set status = 'refunded', razorpay_refund_id = p_refund_id, refunded_at = now(), refund_claimed_until = null,
             cancelled_at = coalesce(r.cancelled_at, now()), waitlist_position = null,
             cancel_reason = coalesce(r.cancel_reason, 'refunded')
       where r.id = reg.id;
      v_outcome := 'refunded';
      if reg.status = 'confirmed' then
        select count(*)::int into promoted from private.promote_waitlist(reg.event_id);
      end if;
    end if;
  elsif exists (select 1 from private.payment_orders o where o.registration_id = reg.id and o.razorpay_payment_id = p_payment_id) then
    -- A refund of an older payment of this registration: ledger only, the seat is untouched.
    v_outcome := case when exists (select 1 from private.payment_orders o
                                   where o.registration_id = reg.id and o.razorpay_payment_id = p_payment_id
                                     and o.amount_paise is distinct from p_amount_paise)
                      then 'partial_refund' else 'ledger_refund' end;
  elsif exists (select 1 from private.payment_events pe where pe.registration_id = reg.id and pe.razorpay_payment_id = p_payment_id) then
    -- A refund of a duplicate payment we only logged.
    v_outcome := case when exists (select 1 from private.payment_events pe
                                   where pe.registration_id = reg.id and pe.razorpay_payment_id = p_payment_id
                                     and pe.amount_paise = p_amount_paise)
                      then 'ledger_refund' else 'partial_refund' end;
  else
    return jsonb_build_object('outcome', 'unknown_payment', 'registration_id', reg.id);
  end if;

  if v_outcome <> 'partial_refund' then
    update private.payment_orders o
       set status = 'refunded', razorpay_refund_id = coalesce(o.razorpay_refund_id, p_refund_id),
           refunded_at = coalesce(o.refunded_at, now())
     where o.razorpay_payment_id = p_payment_id and o.registration_id = reg.id;
  end if;
  insert into private.payment_events (registration_id, source, razorpay_event_id, razorpay_event, razorpay_payment_id,
                                      razorpay_refund_id, amount_paise, currency, outcome)
  values (reg.id, p_source, p_event_id, case when p_source = 'webhook' then 'refund.processed' end, p_payment_id,
          p_refund_id, p_amount_paise, 'INR', v_outcome);

  return jsonb_build_object('outcome', v_outcome, 'registration_id', reg.id, 'promoted', promoted,
                            'status', (select r.status from public.registrations r where r.id = reg.id));
end $$;
