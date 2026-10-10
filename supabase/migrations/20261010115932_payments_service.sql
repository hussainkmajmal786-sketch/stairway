-- Phase 4 (part 3): server-side payment state transitions. security definer in `private`, executable only by
-- service_role (the Worker, after it verified the Razorpay signature and re-fetched the payment), reached through
-- security-invoker wrappers in `public`. Lock order (same as register/cancel/attach): events row, registrations
-- row, then the ledger. Every accepted signal is logged in private.payment_events inside the same transaction.

create index registrations_hold_idx on public.registrations (hold_expires_at) where status = 'pending_payment';

-- 1. Confirm a captured payment. Idempotent across client verify, webhook deliveries and retries.
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

  if p_currency is distinct from 'INR' or p_amount_paise is distinct from ord.amount_paise then
    v_outcome := 'amount_mismatch';
  elsif ord.razorpay_payment_id = p_payment_id or reg.razorpay_payment_id = p_payment_id then
    v_outcome := 'already_processed';
  elsif ord.razorpay_payment_id is not null or reg.razorpay_payment_id is not null or reg.status = 'confirmed' then
    -- The seat is already paid for (or free now): keep the money on record for a manual refund (Phase 5 list).
    v_outcome := 'duplicate_payment';
  else
    -- A payment id already attached to another order / registration is inconsistent input: refuse, change nothing.
    if exists (select 1 from private.payment_orders o where o.razorpay_payment_id = p_payment_id)
       or exists (select 1 from public.registrations r where r.razorpay_payment_id = p_payment_id) then
      raise exception 'payment_conflict' using errcode = 'P0001';
    end if;
    -- reg.status is pending_payment (live or expired), cancelled or waitlisted.
    if reg.status = 'pending_payment' and reg.hold_expires_at > now() then
      v_outcome := 'confirmed';
    elsif ev.status = 'published' and now() < ev.starts_at and private.seats_taken(ev.id) < ev.capacity then
      v_outcome := 'late_confirmed';
    else
      v_outcome := 'refund_needed';
    end if;
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
           cancel_reason = case when new_status = 'confirmed' then null else 'late_payment_no_seat' end
     where r.id = reg.id;
    if reg.status = 'waitlisted' then
      perform private.compact_waitlist(ev.id);
    end if;
    update private.payment_orders o
       set status = 'paid', razorpay_payment_id = p_payment_id, receipt_number = receipt, paid_at = now()
     where o.razorpay_order_id = p_order_id;
  end if;

  insert into private.payment_events (registration_id, source, razorpay_event_id, razorpay_event, razorpay_order_id,
                                      razorpay_payment_id, amount_paise, currency, outcome, details)
  values (reg.id, p_source, p_event_id, left(p_event_name, 60), p_order_id, p_payment_id, p_amount_paise,
          case when p_currency ~ '^[A-Z]{3}$' then p_currency end, v_outcome,
          case when jsonb_typeof(p_details) = 'object' and octet_length(p_details::text) <= 2048 then p_details
               else '{}'::jsonb end);

  return jsonb_build_object('outcome', v_outcome, 'registration_id', reg.id,
                            'status', (select r.status from public.registrations r where r.id = reg.id));
end $$;

-- 2. Release expired holds (cancelled, reason hold_expired) and promote waitlists of events with free seats.
--    At most 50 events per call so one cron tick stays short; candidates are found per event (not per row).
create or replace function private.expire_holds(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  n_expired int := 0;
  n_promoted int := 0;
  n_events int := 0;
  k int;
  payments_on boolean := private.flag_enabled('payments');
begin
  for v_event in
    select x.event_id from (
      select r.event_id from public.registrations r
       where r.status = 'pending_payment' and r.hold_expires_at <= now()
      union
      select e.id from public.events e
       where e.status = 'published' and e.starts_at > now()
         and (e.price_paise = 0 or payments_on)
         and exists (select 1 from public.registrations w where w.event_id = e.id and w.status = 'waitlisted')
         and private.seats_taken(e.id) < e.capacity
    ) x
    order by x.event_id
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  loop
    perform 1 from public.events e where e.id = v_event for update;
    update public.registrations r
       set status = 'cancelled', cancelled_at = now(), cancel_reason = 'hold_expired'
     where r.event_id = v_event and r.status = 'pending_payment' and r.hold_expires_at <= now();
    get diagnostics k = row_count;
    n_expired := n_expired + k;
    select count(*)::int into k from private.promote_waitlist(v_event);
    n_promoted := n_promoted + k;
    n_events := n_events + 1;
  end loop;
  return jsonb_build_object('events', n_events, 'expired', n_expired, 'promoted', n_promoted);
end $$;

-- 3. Refunds. claim_refund takes a 2-minute lease so two callers never both call Razorpay; mark_refunded records
--    the result (from the refund API response or the refund.processed webhook) idempotently.
create or replace function private.claim_refund(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  reg public.registrations%rowtype;
begin
  perform 1 from public.events e
   where e.id = (select r.event_id from public.registrations r where r.id = p_registration_id) for update;
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;
  if reg.status not in ('refund_needed', 'confirmed') or reg.razorpay_payment_id is null or reg.razorpay_refund_id is not null then
    raise exception 'not_refundable' using errcode = 'P0001';
  end if;
  if reg.refund_claimed_until is not null and reg.refund_claimed_until > now() then
    raise exception 'refund_in_progress' using errcode = 'P0001';
  end if;
  update public.registrations r set refund_claimed_until = now() + interval '2 minutes' where r.id = reg.id;
  return jsonb_build_object('registration_id', reg.id, 'payment_id', reg.razorpay_payment_id, 'amount_paise', reg.amount_paise);
end $$;

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
    else
      update public.registrations r
         set status = 'refunded', razorpay_refund_id = p_refund_id, refunded_at = now(), refund_claimed_until = null,
             cancelled_at = coalesce(r.cancelled_at, now()), waitlist_position = null
       where r.id = reg.id;
      v_outcome := 'refunded';
      if reg.status = 'confirmed' then
        select count(*)::int into promoted from private.promote_waitlist(reg.event_id);
      end if;
    end if;
  elsif exists (select 1 from private.payment_orders o where o.registration_id = reg.id and o.razorpay_payment_id = p_payment_id)
        or exists (select 1 from private.payment_events pe where pe.registration_id = reg.id and pe.razorpay_payment_id = p_payment_id) then
    -- A refund of an older or duplicate payment of this registration: ledger only, the seat is untouched.
    v_outcome := 'ledger_refund';
  else
    return jsonb_build_object('outcome', 'unknown_payment', 'registration_id', reg.id);
  end if;

  update private.payment_orders o
     set status = 'refunded', razorpay_refund_id = coalesce(o.razorpay_refund_id, p_refund_id),
         refunded_at = coalesce(o.refunded_at, now())
   where o.razorpay_payment_id = p_payment_id and o.registration_id = reg.id;
  insert into private.payment_events (registration_id, source, razorpay_event_id, razorpay_event, razorpay_payment_id,
                                      razorpay_refund_id, amount_paise, currency, outcome)
  values (reg.id, p_source, p_event_id, case when p_source = 'webhook' then 'refund.processed' end, p_payment_id,
          p_refund_id, p_amount_paise, 'INR', v_outcome);

  return jsonb_build_object('outcome', v_outcome, 'registration_id', reg.id, 'promoted', promoted,
                            'status', (select r.status from public.registrations r where r.id = reg.id));
end $$;

-- 4. Grants: service_role only, through security-invoker wrappers in public.
revoke execute on function
  private.confirm_payment(uuid, text, text, int, text, text, text, text, jsonb),
  private.expire_holds(int),
  private.claim_refund(uuid),
  private.mark_refunded(uuid, text, text, int, text, text)
from public, anon, authenticated;
grant execute on function
  private.confirm_payment(uuid, text, text, int, text, text, text, text, jsonb),
  private.expire_holds(int),
  private.claim_refund(uuid),
  private.mark_refunded(uuid, text, text, int, text, text)
to service_role;

create function public.confirm_payment(
  p_registration_id uuid, p_order_id text, p_payment_id text, p_amount_paise int, p_currency text,
  p_source text, p_event_id text default null, p_event_name text default null, p_details jsonb default '{}'::jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.confirm_payment(p_registration_id, p_order_id, p_payment_id, p_amount_paise, p_currency,
                                 p_source, p_event_id, p_event_name, p_details);
$$;
create function public.expire_holds(p_limit int default 50) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.expire_holds(p_limit);
$$;
create function public.claim_refund(p_registration_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.claim_refund(p_registration_id);
$$;
create function public.mark_refunded(
  p_registration_id uuid, p_payment_id text, p_refund_id text, p_amount_paise int, p_source text,
  p_event_id text default null)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.mark_refunded(p_registration_id, p_payment_id, p_refund_id, p_amount_paise, p_source, p_event_id);
$$;

revoke execute on function
  public.confirm_payment(uuid, text, text, int, text, text, text, text, jsonb),
  public.expire_holds(int),
  public.claim_refund(uuid),
  public.mark_refunded(uuid, text, text, int, text, text)
from public, anon, authenticated;
grant execute on function
  public.confirm_payment(uuid, text, text, int, text, text, text, text, jsonb),
  public.expire_holds(int),
  public.claim_refund(uuid),
  public.mark_refunded(uuid, text, text, int, text, text)
to service_role;
