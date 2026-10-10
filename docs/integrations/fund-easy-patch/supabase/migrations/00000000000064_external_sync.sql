-- PROPOSED — NOT APPLIED. st(AI)rway -> Fund Easy one-way sync (contract v1, docs/integrations/fund-easy-sync.md in
-- the st(AI)rway repo). Imports st(AI)rway registrations as Fund Easy event tickets. Follows this repo's conventions
-- (security definer, search_path public, explicit grants).

alter table events
  add column external_source text check (external_source in ('stairway')),
  add column external_ref text;
create unique index events_external_ref_key on events (external_source, external_ref) where external_ref is not null;

alter table ticket_orders
  add column external_source text check (external_source in ('stairway')),
  add column external_id text;
create unique index ticket_orders_external_id_key on ticket_orders (external_source, external_id) where external_id is not null;

-- Every processed message, so a replay returns the stored result without re-applying it.
create table external_sync_receipts (
  idempotency_key text primary key check (char_length(idempotency_key) <= 200),
  source text not null check (source in ('stairway')),
  event_type text not null,
  result jsonb not null,
  processed_at timestamptz not null default now()
);
alter table external_sync_receipts enable row level security;
revoke all on external_sync_receipts from public, anon, authenticated;

create or replace function external_find_user(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;
revoke execute on function external_find_user(text) from public, anon, authenticated;
grant execute on function external_find_user(text) to service_role;

create or replace function import_external_ticket(p_envelope jsonb, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := p_envelope->>'idempotency_key';
  v_type text := p_envelope->>'type';
  r jsonb := p_envelope->'data'->'registration';
  e jsonb := p_envelope->'data'->'event';
  v_ext_id text := p_envelope->'data'->'registration'->>'id';
  v_amount bigint := coalesce((p_envelope->'data'->'registration'->>'amount_paise')::bigint, 0);
  v_prior jsonb;
  v_event events%rowtype;
  v_tier ticket_tiers%rowtype;
  v_order ticket_orders%rowtype;
  v_creator uuid;
  v_receipt_id uuid;
  v_result jsonb;
begin
  if (p_envelope->>'contract_version') is distinct from '1' then
    raise exception 'unsupported_version';
  end if;
  if v_key is null or v_ext_id is null or r is null or e is null then
    raise exception 'malformed';
  end if;
  select s.result into v_prior from external_sync_receipts s where s.idempotency_key = v_key;
  if found then
    return v_prior || jsonb_build_object('replayed', true);
  end if;

  if v_type = 'registration.confirmed' then
    if p_user_id is null or coalesce(r->>'ticket_code', '') !~ '^[A-Z2-7]{26}$' then
      raise exception 'malformed';
    end if;

    select * into v_event from events where external_source = 'stairway' and external_ref = e->>'id' for update;
    if not found then
      select p.id into v_creator from profiles p where p.role = 'super_admin' order by p.created_at limit 1;
      if v_creator is null then
        raise exception 'no_super_admin';
      end if;
      insert into events (slug, title, description, category, venue, starts_at, ends_at, status, created_by,
                          external_source, external_ref)
      values (left('stw-' || (e->>'slug'), 80), left(e->>'title', 120), 'Registration and payment on st(AI)rway.',
              'workshop', left(coalesce(nullif(btrim(e->>'venue'), ''), 'IEEE SB CE Kidangoor'), 160),
              (e->>'starts_at')::timestamptz, (e->>'ends_at')::timestamptz, 'published', v_creator,
              'stairway', e->>'id')
      returning * into v_event;
    else
      update events
         set title = left(e->>'title', 120), starts_at = (e->>'starts_at')::timestamptz,
             ends_at = (e->>'ends_at')::timestamptz, updated_at = now()
       where id = v_event.id;
    end if;

    -- One inactive tier per synced event: never sold on Fund Easy (reserve_ticket / public_event_tiers skip inactive).
    select * into v_tier from ticket_tiers where event_id = v_event.id and name = 'st(AI)rway' for update;
    if not found then
      insert into ticket_tiers (event_id, name, description, price, capacity, active, sort_order)
      values (v_event.id, 'st(AI)rway', 'Registered on st(AI)rway.', greatest(coalesce((e->>'price_paise')::bigint, 0), 0),
              greatest(coalesce((e->>'capacity')::int, 1), 1), false, 0)
      returning * into v_tier;
    else
      update ticket_tiers
         set price = greatest(coalesce((e->>'price_paise')::bigint, 0), 0),
             capacity = greatest(coalesce((e->>'capacity')::int, 1), tier_taken(v_tier.id), 1)
       where id = v_tier.id;
    end if;

    select * into v_order from ticket_orders where external_source = 'stairway' and external_id = v_ext_id for update;
    if exists (select 1 from ticket_orders o where o.event_id = v_event.id and o.user_id = p_user_id
               and o.status in ('held', 'paid') and o.id is distinct from v_order.id) then
      raise exception 'conflict_existing_order';
    end if;
    if v_order.id is null then
      insert into ticket_orders (event_id, tier_id, user_id, amount, answers, status, razorpay_order_id, razorpay_payment_id,
                                 paid_at, external_source, external_id)
      values (v_event.id, v_tier.id, p_user_id, v_amount, '{}'::jsonb, 'paid', r->>'razorpay_order_id', r->>'razorpay_payment_id',
              coalesce((r->>'paid_at')::timestamptz, (r->>'confirmed_at')::timestamptz, now()), 'stairway', v_ext_id)
      returning * into v_order;
      v_result := jsonb_build_object('result', 'imported', 'order_id', v_order.id);
    else
      update ticket_orders
         set status = 'paid', user_id = p_user_id, amount = v_amount,
             razorpay_order_id = r->>'razorpay_order_id', razorpay_payment_id = r->>'razorpay_payment_id',
             paid_at = coalesce((r->>'paid_at')::timestamptz, (r->>'confirmed_at')::timestamptz, now())
       where id = v_order.id
      returning * into v_order;
      v_result := jsonb_build_object('result', 'duplicate', 'order_id', v_order.id);
    end if;

    -- The ticket is inserted directly, NOT through issue_ticket(), which would queue Fund Easy's own confirmation
    -- email. Its code is st(AI)rway's ticket code, so Fund Easy's scanner accepts the same QR.
    insert into tickets (order_id, event_id, tier_id, user_id, code)
    values (v_order.id, v_event.id, v_tier.id, p_user_id, r->>'ticket_code')
    on conflict (order_id) do update
      set code = excluded.code, user_id = excluded.user_id,
          status = case when tickets.status = 'checked_in' then tickets.status else 'valid' end;

    if v_amount > 0 and coalesce(r->>'receipt_number', '') <> '' and v_order.receipt_id is null then
      insert into receipts (ticket_order_id, receipt_number) values (v_order.id, r->>'receipt_number')
      returning id into v_receipt_id;
      update ticket_orders set receipt_id = v_receipt_id where id = v_order.id;
    end if;

  elsif v_type = 'registration.cancelled' then
    select * into v_order from ticket_orders where external_source = 'stairway' and external_id = v_ext_id for update;
    if not found then
      v_result := jsonb_build_object('result', 'ignored', 'reason', 'unknown_registration');
    else
      update tickets set status = 'cancelled' where order_id = v_order.id and status = 'valid';
      -- Free seats are released; paid seats stay 'paid' until the refund arrives from st(AI)rway.
      if v_order.amount = 0 or v_order.razorpay_payment_id is null then
        update ticket_orders set status = 'expired' where id = v_order.id and status = 'paid';
      end if;
      v_result := jsonb_build_object('result', 'cancelled', 'order_id', v_order.id);
    end if;

  elsif v_type = 'payment.refunded' then
    select * into v_order from ticket_orders where external_source = 'stairway' and external_id = v_ext_id for update;
    if not found then
      v_result := jsonb_build_object('result', 'ignored', 'reason', 'unknown_registration');
    else
      update ticket_orders set status = 'refunded' where id = v_order.id;
      update tickets set status = 'cancelled' where order_id = v_order.id and status = 'valid';
      if v_order.amount > 0 then
        insert into ticket_refunds (order_id, amount, reason, initiated_by, status, razorpay_refund_id, processed_at)
        values (v_order.id, v_order.amount, 'Refunded on st(AI)rway',
                (select ev.created_by from events ev where ev.id = v_order.event_id), 'processed',
                r->>'razorpay_refund_id', coalesce((r->>'refunded_at')::timestamptz, now()))
        on conflict do nothing;
      end if;
      v_result := jsonb_build_object('result', 'refunded', 'order_id', v_order.id);
    end if;

  else
    raise exception 'unsupported_type';
  end if;

  insert into external_sync_receipts (idempotency_key, source, event_type, result) values (v_key, 'stairway', v_type, v_result);
  return v_result;
end;
$$;
revoke execute on function import_external_ticket(jsonb, uuid) from public, anon, authenticated;
grant execute on function import_external_ticket(jsonb, uuid) to service_role;

-- Synced orders are refunded on st(AI)rway (shared Razorpay account); refunding them here would desynchronise both.
-- Same body as 00000000000054 plus the external_source guard.
create or replace function create_ticket_refund(p_order_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order ticket_orders%rowtype;
  v_refund_id uuid;
begin
  if not is_super_admin() then
    raise exception 'ticket refund: only a super admin can refund tickets';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'ticket refund: a reason is required';
  end if;
  select * into v_order from ticket_orders where id = p_order_id for update;
  if not found then
    raise exception 'ticket refund: order not found';
  end if;
  if v_order.external_source is not null then
    raise exception 'ticket refund: this ticket was sold on st(AI)rway; refund it there';
  end if;
  if v_order.amount = 0 or v_order.razorpay_payment_id is null then
    raise exception 'ticket refund: this ticket was free, so there is nothing to refund';
  end if;
  if v_order.status = 'refunded' and exists (select 1 from ticket_refunds where order_id = p_order_id and status <> 'failed') then
    raise exception 'ticket refund: this ticket is already being refunded';
  end if;
  if v_order.status not in ('paid', 'refunded') then
    raise exception 'ticket refund: only paid tickets can be refunded';
  end if;
  update ticket_orders set status = 'refunded' where id = p_order_id;
  update tickets set status = 'cancelled' where order_id = p_order_id;
  insert into ticket_refunds (order_id, amount, reason, initiated_by)
  values (p_order_id, v_order.amount, btrim(p_reason), auth.uid())
  returning id into v_refund_id;
  perform log_audit(auth.uid(), 'ticket.refund', 'ticket_orders', p_order_id, jsonb_build_object('refund_id', v_refund_id, 'reason', btrim(p_reason)));
  return v_refund_id;
end;
$$;
revoke execute on function create_ticket_refund(uuid, text) from public, anon;
grant execute on function create_ticket_refund(uuid, text) to authenticated;

-- Same body as 00000000000061 plus the external_source guard: synced events are cancelled on st(AI)rway.
create or replace function cancel_event(p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
  v_order ticket_orders%rowtype;
  v_refunds int := 0;
  v_holders int := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not is_super_admin() then
    raise exception 'event: only a super admin can cancel an event';
  end if;
  if v_reason = '' then
    raise exception 'event: give a reason; ticket holders see it';
  end if;
  select * into v_event from events where id = p_event_id for update;
  if not found then
    raise exception 'event: event not found';
  end if;
  if v_event.external_source is not null then
    raise exception 'event: this event is managed on st(AI)rway; cancel it there';
  end if;
  if v_event.status = 'cancelled' then
    raise exception 'event: this event is already cancelled';
  end if;

  update events set status = 'cancelled', updated_at = now() where id = p_event_id;
  update ticket_orders set status = 'expired' where event_id = p_event_id and status = 'held';

  for v_order in select * from ticket_orders where event_id = p_event_id and status = 'paid' for update loop
    v_holders := v_holders + 1;
    update tickets set status = 'cancelled' where order_id = v_order.id and status <> 'cancelled';
    if v_order.amount > 0 and v_order.razorpay_payment_id is not null then
      update ticket_orders set status = 'refunded' where id = v_order.id;
      insert into ticket_refunds (order_id, amount, reason, initiated_by)
      values (v_order.id, v_order.amount, 'Event cancelled: ' || v_reason, auth.uid());
      v_refunds := v_refunds + 1;
    end if;
    perform queue_notification(v_order.user_id, null, 'event_cancelled', 'Cancelled: ' || v_event.title,
      v_reason || '.' || coalesce((select ' Your ' || format_inr(v_order.amount) || ' will be refunded to your original payment method.'
                                   where v_order.amount > 0), ''),
      '/tickets', 'event-cancelled:' || p_event_id || ':' || v_order.user_id, true);
  end loop;

  perform log_audit(auth.uid(), 'event.cancel', 'events', p_event_id,
    jsonb_build_object('reason', v_reason, 'refunds', v_refunds, 'ticket_holders', v_holders));
  return jsonb_build_object('refunds', v_refunds, 'ticket_holders', v_holders);
end;
$$;
revoke execute on function cancel_event(uuid, text) from public, anon;
grant execute on function cancel_event(uuid, text) to authenticated;
