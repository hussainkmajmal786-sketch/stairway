-- Phase 4 (part 2): paid registration. Same lock order as Phase 3 everywhere: events row, then registrations rows.

-- 1. Waitlist promotion: free events confirm the head; paid events (payments switched on) give it a 15-minute
--    payment hold. Nothing moves once the event has started. CALLER MUST HOLD the event row lock.
create or replace function private.promote_waitlist(p_event_id uuid) returns setof uuid
language plpgsql set search_path = '' as $$
declare
  cap int;
  price int;
  starts timestamptz;
  head_id uuid;
  head_token int;
begin
  select e.capacity, e.price_paise, e.starts_at into cap, price, starts
    from public.events e where e.id = p_event_id and e.status = 'published';
  if not found or now() >= starts then
    return;
  end if;
  if price > 0 and not private.flag_enabled('payments') then
    return;
  end if;
  loop
    exit when private.seats_taken(p_event_id) >= cap;
    select r.id, r.token_number into head_id, head_token
      from public.registrations r
     where r.event_id = p_event_id and r.status = 'waitlisted'
     order by r.waitlist_position
     limit 1
     for update;
    exit when not found;
    if price > 0 then
      update public.registrations r
         set status = 'pending_payment', waitlist_position = null, hold_expires_at = now() + interval '15 minutes',
             amount_paise = price, razorpay_order_id = null, razorpay_payment_id = null, razorpay_refund_id = null,
             paid_at = null, receipt_number = null, refunded_at = null, refund_claimed_until = null, cancel_reason = null
       where r.id = head_id;
    else
      update public.registrations r
         set status = 'confirmed', waitlist_position = null, confirmed_at = now(),
             token_number = coalesce(head_token, private.next_token(p_event_id))
       where r.id = head_id;
    end if;
    perform private.compact_waitlist(p_event_id);
    return next head_id;
  end loop;
end $$;
revoke execute on function private.promote_waitlist(uuid) from public, anon, authenticated, service_role;

-- 2. Register: free -> confirmed; paid (flag on) -> 15-minute pending_payment hold; full -> waitlisted.
--    Re-registration is allowed from cancelled, refunded or an expired hold, and resets every payment field.
create or replace function private.register_for_event(p_event_id uuid, p_answers jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  ev public.events%rowtype;
  existing public.registrations%rowtype;
  had_row boolean;
  paid boolean;
  new_status public.registration_status;
  pos int;
  tok int;
  hold timestamptz;
  rid uuid;
  promoted uuid[];
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.onboarded) then
    raise exception 'not_onboarded' using errcode = 'P0001';
  end if;

  select e.* into ev from public.events e where e.id = p_event_id for update;
  if not found or ev.status <> 'published' then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  paid := ev.price_paise > 0;
  if paid and not private.flag_enabled('payments') then
    raise exception 'paid_event' using errcode = 'P0001';
  end if;
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then
    raise exception 'not_open_yet' using errcode = 'P0001';
  end if;
  if now() >= least(coalesce(ev.registration_closes_at, ev.starts_at), ev.starts_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if octet_length(v_answers::text) > 32768 or not private.validate_answers(ev.questions, v_answers) then
    raise exception 'invalid_answers' using errcode = 'P0001';
  end if;

  select r.* into existing from public.registrations r where r.event_id = ev.id and r.user_id = uid for update;
  had_row := found;
  if had_row then
    if existing.status = 'refund_needed' then
      raise exception 'refund_pending' using errcode = 'P0001';
    end if;
    if existing.status not in ('cancelled', 'refunded')
       and not (existing.status = 'pending_payment' and existing.hold_expires_at <= now()) then
      raise exception 'already_registered' using errcode = 'P0001';
    end if;
  end if;

  -- Anyone already waiting goes first if seats have freed up (e.g. capacity was raised or a hold expired).
  select coalesce(array_agg(p.id), '{}') into promoted from private.promote_waitlist(ev.id) as p(id);

  if private.seats_taken(ev.id) < ev.capacity then
    pos := null;
    if paid then
      new_status := 'pending_payment';
      hold := now() + interval '15 minutes';
      tok := case when had_row then existing.token_number end;
    else
      new_status := 'confirmed';
      hold := null;
      tok := case when had_row and existing.token_number is not null then existing.token_number
                  else private.next_token(ev.id) end;
    end if;
  else
    new_status := 'waitlisted';
    hold := null;
    tok := case when had_row then existing.token_number end;
    select coalesce(max(r.waitlist_position), 0) + 1 into pos
      from public.registrations r where r.event_id = ev.id and r.status = 'waitlisted';
  end if;

  if had_row then
    update public.registrations r
       set status = new_status, answers = v_answers, ticket_code = private.new_ticket_code(),
           token_number = tok, waitlist_position = pos, hold_expires_at = hold,
           amount_paise = case when paid then ev.price_paise else 0 end,
           razorpay_order_id = null, razorpay_payment_id = null, razorpay_refund_id = null,
           paid_at = null, receipt_number = null, refunded_at = null, refund_claimed_until = null, cancel_reason = null,
           confirmed_at = case when new_status = 'confirmed' then now() end,
           cancelled_at = null, checked_in_at = null, checked_in_by = null
     where r.id = existing.id
     returning r.id into rid;
  else
    insert into public.registrations (event_id, user_id, status, answers, ticket_code, token_number, waitlist_position,
                                      hold_expires_at, amount_paise, confirmed_at)
    values (ev.id, uid, new_status, v_answers, private.new_ticket_code(), tok, pos, hold,
            case when paid then ev.price_paise else 0 end,
            case when new_status = 'confirmed' then now() end)
    returning id into rid;
  end if;

  return jsonb_build_object(
    'registration_id', rid, 'status', new_status, 'waitlist_position', pos, 'hold_expires_at', hold,
    'amount_paise', case when paid then ev.price_paise else 0 end, 'promoted', to_jsonb(promoted));
end $$;

-- 3. Cancel: a live hold is released; a paid confirmed seat becomes refund_needed (seat released, no automatic
--    refund); free seats and waitlist places are cancelled as before. The freed seat promotes the waitlist.
create or replace function private.cancel_registration(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_event_id uuid;
  ev public.events%rowtype;
  reg public.registrations%rowtype;
  new_status public.registration_status;
  promoted int;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select r.event_id into v_event_id from public.registrations r where r.id = p_registration_id and r.user_id = uid;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;

  select e.* into ev from public.events e where e.id = v_event_id for update;
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;

  if reg.status not in ('confirmed', 'waitlisted', 'pending_payment') or reg.checked_in_at is not null then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  if reg.status <> 'pending_payment' and now() >= ev.starts_at then
    raise exception 'event_started' using errcode = 'P0001';
  end if;

  new_status := case when reg.status = 'confirmed' and reg.razorpay_payment_id is not null
                     then 'refund_needed'::public.registration_status
                     else 'cancelled'::public.registration_status end;
  update public.registrations r
     set status = new_status, cancelled_at = now(), cancel_reason = 'user', waitlist_position = null
   where r.id = reg.id;
  if reg.status = 'waitlisted' then
    perform private.compact_waitlist(ev.id);
  end if;
  select count(*)::int into promoted from private.promote_waitlist(ev.id);

  return jsonb_build_object('registration_id', reg.id, 'event_id', ev.id, 'promoted', promoted, 'status', new_status);
end $$;

-- 4. Link a Razorpay order (created by our server for this hold) to the user's own live hold. Idempotent: if the
--    hold already has an order, that order is returned and the new one is only recorded in the ledger (so a
--    payment to it is still matched). Every order is recorded, so late payments always find their registration.
create or replace function private.attach_payment_order(p_registration_id uuid, p_order_id text, p_amount_paise int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_event_id uuid;
  reg public.registrations%rowtype;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if p_order_id is null or p_order_id !~ '^order_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;
  select r.event_id into v_event_id from public.registrations r where r.id = p_registration_id and r.user_id = uid;
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
revoke execute on function private.attach_payment_order(uuid, text, int) from public, anon, service_role;
grant execute on function private.attach_payment_order(uuid, text, int) to authenticated;

create function public.attach_payment_order(p_registration_id uuid, p_order_id text, p_amount_paise int) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.attach_payment_order(p_registration_id, p_order_id, p_amount_paise);
$$;
revoke execute on function public.attach_payment_order(uuid, text, int) from public, anon, service_role;
grant execute on function public.attach_payment_order(uuid, text, int) to authenticated;
