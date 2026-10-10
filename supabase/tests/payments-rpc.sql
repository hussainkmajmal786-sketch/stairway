-- Phase 4 Task 2: paid registration RPCs. Run as ONE execute_sql call; rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004b1', 'p4-b1@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee One"}'),
  ('00000000-0000-0000-0000-0000000004b2', 'p4-b2@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee Two"}'),
  ('00000000-0000-0000-0000-0000000004b3', 'p4-b3@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee Three"}'),
  ('00000000-0000-0000-0000-0000000004b4', 'p4-b4@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee Four"}'),
  ('00000000-0000-0000-0000-0000000004b5', 'p4-b5@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee Five"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id::text like '00000000-0000-0000-0000-0000000004b%';

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix, price_paise)
select s.id, v.step, v.slug, v.slug, now() + interval '10 days', now() + interval '10 days 6 hours', 'published',
       v.capacity, 'RAS-' || v.step, v.price
from public.societies s,
  (values (82, 'p4-paid', 2, 19900), (83, 'p4-free', 5, 0)) as v(step, slug, capacity, price)
where s.slug = 'ras';

do $$
declare
  paid uuid;
  free uuid;
  b1 constant uuid := '00000000-0000-0000-0000-0000000004b1';
  b2 constant uuid := '00000000-0000-0000-0000-0000000004b2';
  b3 constant uuid := '00000000-0000-0000-0000-0000000004b3';
  b4 constant uuid := '00000000-0000-0000-0000-0000000004b4';
  b5 constant uuid := '00000000-0000-0000-0000-0000000004b5';
  r jsonb;
  reg public.registrations%rowtype;
  r1 uuid;
  r2 uuid;
  r3 uuid;
  c record;
  tok_before int;
  tok_r3 int;
  asserts_on boolean := false;
begin
  -- sentinel: ASSERT must be enabled, or every check below would pass vacuously
  begin
    assert false, 'sentinel';
  exception when assert_failure then asserts_on := true; end;
  if not asserts_on then
    raise exception 'plpgsql.check_asserts is off';
  end if;

  select id into paid from public.events where slug = 'p4-paid';
  select id into free from public.events where slug = 'p4-free';
  assert paid is not null and free is not null, 'fixture events missing';
  assert not private.flag_enabled('payments'), 'payments flag must be OFF on the live database';

  -- flag OFF: paid events are still refused
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.register_for_event(paid, '{}');
    assert false, 'paid event accepted with the flag off';
  exception when others then if sqlerrm <> 'paid_event' then raise; end if; end;
  reset role;

  update private.feature_flags set enabled = true where key = 'payments';

  -- flag ON, capacity 2: two holds, then the waitlist (holds count toward capacity)
  set local role authenticated;
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'pending_payment' and (r->>'amount_paise')::int = 19900, 'b1: ' || r::text;
  assert (r->>'hold_expires_at')::timestamptz between now() + interval '14 minutes' and now() + interval '16 minutes', 'b1 hold ' || r::text;
  assert r->'promoted' = '[]'::jsonb and r->'waitlist_position' = 'null'::jsonb, 'b1 shape: ' || r::text;
  r1 := (r->>'registration_id')::uuid;
  -- double submit while the hold is live
  begin
    perform public.register_for_event(paid, '{}');
    assert false, 'second registration during a live hold accepted';
  exception when others then if sqlerrm <> 'already_registered' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b2, 'role', 'authenticated')::text, true);
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'pending_payment', 'b2: ' || r::text;
  r2 := (r->>'registration_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', b3, 'role', 'authenticated')::text, true);
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 1, 'b3: ' || r::text;
  assert r->'hold_expires_at' = 'null'::jsonb and (r->>'amount_paise')::int = 19900, 'b3 shape: ' || r::text;
  r3 := (r->>'registration_id')::uuid;
  reset role;
  select * into c from public.event_seat_counts where event_id = paid;
  assert c.seats_taken = 2 and c.attending = 0 and c.waitlisted = 1, format('counts %s', row_to_json(c));
  select * into reg from public.registrations where id = r1;
  assert reg.token_number is null and reg.razorpay_order_id is null, 'hold got a token or an order';

  -- attach an order: own live hold only, exact amount, idempotent
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.attach_payment_order(r1, 'order_P4RPC000001', 19900);
  assert r->>'order_id' = 'order_P4RPC000001', 'attach: ' || r::text;
  r := public.attach_payment_order(r1, 'order_P4RPC000002', 19900);
  assert r->>'order_id' = 'order_P4RPC000001', 'second attach replaced the order: ' || r::text;
  begin
    perform public.attach_payment_order(r1, 'order_P4RPC000003', 100);
    assert false, 'wrong amount accepted';
  exception when others then if sqlerrm <> 'amount_mismatch' then raise; end if; end;
  begin
    perform public.attach_payment_order(r1, 'nope', 19900);
    assert false, 'malformed order accepted';
  exception when others then if sqlerrm <> 'invalid_order' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b2, 'role', 'authenticated')::text, true);
  begin
    perform public.attach_payment_order(r1, 'order_P4RPC000004', 19900);
    assert false, 'attached an order to someone else''s hold';
  exception when others then if sqlerrm <> 'registration_not_found' then raise; end if; end;
  -- b2 cannot hijack b1's order id for their own hold
  begin
    perform public.attach_payment_order(r2, 'order_P4RPC000001', 19900);
    assert false, 'an order id of another registration was attached';
  exception when others then if sqlerrm <> 'invalid_order' then raise; end if; end;
  -- a waitlist place has no hold to pay for
  perform set_config('request.jwt.claims', json_build_object('sub', b3, 'role', 'authenticated')::text, true);
  begin
    perform public.attach_payment_order(r3, 'order_P4RPC000005', 19900);
    assert false, 'an order was attached to a waitlist place';
  exception when others then if sqlerrm <> 'hold_expired' then raise; end if; end;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.attach_payment_order(r1, 'order_P4RPC000006', 19900);
    assert false, 'attach without a user id accepted';
  exception when others then if sqlerrm <> 'not_signed_in' then raise; end if; end;
  reset role;
  assert (select count(*) from private.payment_orders where registration_id = r1) = 2, 'both orders must be in the ledger';
  assert (select razorpay_order_id from public.registrations where id = r1) = 'order_P4RPC000001', 'hold not linked to its order';
  assert (select razorpay_order_id from public.registrations where id = r2) is null, 'b2 hold got an order';
  assert not exists (select 1 from private.payment_orders
                     where razorpay_order_id in ('order_P4RPC000003', 'order_P4RPC000004', 'order_P4RPC000005', 'order_P4RPC000006')),
    'a refused attach left a ledger row';
  assert (select amount_paise from private.payment_orders where razorpay_order_id = 'order_P4RPC000002') = 19900, 'ledger amount';

  -- b1's hold expires: a new registration promotes the waitlist head (b3) into a hold, and is itself waitlisted
  update public.registrations set hold_expires_at = now() - interval '1 second' where id = r1;
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.attach_payment_order(r1, 'order_P4RPC000001', 19900);
    assert false, 'an order was attached to an expired hold';
  exception when others then if sqlerrm <> 'hold_expired' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b4, 'role', 'authenticated')::text, true);
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'waitlisted', 'b4: ' || r::text;
  assert (r->'promoted') @> to_jsonb(array[r3]), 'promoted ids missing: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = r3;
  assert reg.status = 'pending_payment' and reg.hold_expires_at > now() and reg.amount_paise = 19900, 'b3 not given a hold';
  assert reg.hold_expires_at between now() + interval '14 minutes' and now() + interval '16 minutes', 'promoted hold is not 15 minutes';
  assert reg.waitlist_position is null and reg.token_number is null, 'promoted hold kept a position or got a token';
  assert (select waitlist_position from public.registrations where event_id = paid and user_id = b4) = 1, 'waitlist not compacted';

  -- b1 (expired hold) may register again; every payment field is reset
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'waitlisted' and (r->>'registration_id')::uuid = r1, 'b1 re-register: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = r1;
  assert reg.razorpay_order_id is null and reg.hold_expires_at is null, 'payment fields not reset';
  assert reg.status = 'waitlisted' and reg.waitlist_position = 2 and reg.amount_paise = 19900, 'b1 re-registered row shape';
  assert (select count(*) from private.payment_orders where registration_id = r1) = 2, 'ledger history lost on re-registration';

  -- b2 cancels a live hold: released, waitlist head (b4) gets a hold
  perform set_config('request.jwt.claims', json_build_object('sub', b2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.cancel_registration(r2);
  assert r->>'status' = 'cancelled' and (r->>'promoted')::int = 1, 'cancel hold: ' || r::text;
  reset role;
  assert (select cancel_reason from public.registrations where id = r2) = 'user', 'cancel reason not recorded';
  assert (select status from public.registrations where event_id = paid and user_id = b4) = 'pending_payment', 'b4 not promoted';

  -- a paid confirmed seat cancelled by its owner becomes refund_needed and frees the seat
  update public.registrations
     set status = 'confirmed', razorpay_order_id = 'order_P4RPC000009', razorpay_payment_id = 'pay_P4RPC000009',
         paid_at = now(), confirmed_at = now(), hold_expires_at = null, token_number = private.next_token(paid)
   where id = r3;
  select token_number into tok_r3 from public.registrations where id = r3;
  perform set_config('request.jwt.claims', json_build_object('sub', b3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.cancel_registration(r3);
  assert r->>'status' = 'refund_needed' and (r->>'promoted')::int = 1, 'paid cancel: ' || r::text;
  -- refund_needed blocks re-registration
  begin
    perform public.register_for_event(paid, '{}');
    assert false, 're-registered with a refund pending';
  exception when others then if sqlerrm <> 'refund_pending' then raise; end if; end;
  reset role;
  assert (select status from public.registrations where id = r1) = 'pending_payment', 'b1 not promoted after paid cancel';
  select * into reg from public.registrations where id = r3;
  assert reg.cancelled_at is not null and reg.cancel_reason = 'user' and reg.razorpay_payment_id = 'pay_P4RPC000009',
    'refund_needed row lost its payment or cancel details';
  select * into c from public.event_seat_counts where event_id = paid;
  assert c.seats_taken = 2 and c.attending = 0 and c.waitlisted = 0, format('counts after paid cancel %s', row_to_json(c));

  -- after the refund, re-registration works and resets the money fields
  update public.registrations set status = 'refunded', razorpay_refund_id = 'rfnd_P4RPC000009', refunded_at = now() where id = r3;
  perform set_config('request.jwt.claims', json_build_object('sub', b3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'waitlisted', 'b3 after refund: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = r3;
  assert reg.razorpay_payment_id is null and reg.razorpay_refund_id is null and reg.refunded_at is null
     and reg.receipt_number is null and reg.cancel_reason is null, 'refunded row not reset';
  assert reg.razorpay_order_id is null and reg.paid_at is null and reg.cancelled_at is null and reg.confirmed_at is null,
    'refunded row kept order, paid or cancel timestamps';
  assert reg.token_number = tok_r3, 're-registration must keep the row''s existing token';

  -- free events: tokens come from the counter and are never reused
  perform set_config('request.jwt.claims', json_build_object('sub', b5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.register_for_event(free, '{}');
  assert r->>'status' = 'confirmed' and (r->>'amount_paise')::int = 0, 'free: ' || r::text;
  reset role;
  select token_number into tok_before from public.registrations where event_id = free and user_id = b5;
  delete from public.registrations where event_id = free and user_id = b5;
  set local role authenticated;
  r := public.register_for_event(free, '{}');
  reset role;
  assert (select token_number from public.registrations where event_id = free and user_id = b5) = tok_before + 1,
    'free token reused after a delete';

  -- grants
  assert not has_function_privilege('anon', 'public.attach_payment_order(uuid, text, integer)', 'execute'), 'anon can attach orders';
  assert has_function_privilege('authenticated', 'public.attach_payment_order(uuid, text, integer)', 'execute'), 'users cannot attach orders';
  assert not has_function_privilege('service_role', 'private.attach_payment_order(uuid, text, integer)', 'execute'), 'service_role runs attach';

  -- capacity never exceeded by confirmed + live holds
  set constraints all immediate;
  assert (select count(*) from public.registrations x where x.event_id = paid
          and (x.status = 'confirmed' or (x.status = 'pending_payment' and x.hold_expires_at > now()))) <= 2,
    'paid event over capacity';

  -- payments switched off again: a freed paid seat is not promoted into a hold
  -- (state now: b4 hold, b1 hold, b3 waitlisted #1)
  update private.feature_flags set enabled = false where key = 'payments';
  perform set_config('request.jwt.claims', json_build_object('sub', b4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.cancel_registration((select id from public.registrations where event_id = paid and user_id = b4));
  assert r->>'status' = 'cancelled' and (r->>'promoted')::int = 0, 'promoted into a hold with the flag off: ' || r::text;
  reset role;
  assert (select status from public.registrations where id = r3) = 'waitlisted', 'b3 moved with the flag off';

  -- event started: a live hold can still be released, but nothing is promoted; waitlist places stay
  update private.feature_flags set enabled = true where key = 'payments';
  update public.events set starts_at = now() - interval '1 minute' where id = paid;
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.cancel_registration(r1);
  assert r->>'status' = 'cancelled' and (r->>'promoted')::int = 0, 'promoted after the start: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', b3, 'role', 'authenticated')::text, true);
  begin
    perform public.cancel_registration(r3);
    assert false, 'waitlist place cancelled after the start';
  exception when others then if sqlerrm <> 'event_started' then raise; end if; end;
  reset role;
  assert (select status from public.registrations where id = r3) = 'waitlisted', 'b3 promoted after the start';

  -- function shape: definer bodies in private, invoker wrappers in public, search_path pinned
  assert (select p.prosecdef from pg_proc p where p.oid = 'private.attach_payment_order(uuid, text, integer)'::regprocedure),
    'private attach is not security definer';
  assert not (select p.prosecdef from pg_proc p where p.oid = 'public.attach_payment_order(uuid, text, integer)'::regprocedure),
    'public attach is security definer';
  assert not exists (select 1 from pg_proc p
                     where p.proname in ('attach_payment_order', 'register_for_event', 'cancel_registration', 'promote_waitlist')
                       and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
                       and not coalesce(p.proconfig @> array['search_path=""'], false)),
    'a payments RPC lacks search_path=''''';
  assert not has_function_privilege('service_role', 'public.attach_payment_order(uuid, text, integer)', 'execute'), 'service_role can attach';
  assert not has_function_privilege('anon', 'private.attach_payment_order(uuid, text, integer)', 'execute'), 'anon runs the attach body';
  assert has_function_privilege('authenticated', 'private.attach_payment_order(uuid, text, integer)', 'execute'), 'wrapper target not executable';
  assert not has_function_privilege('authenticated', 'private.promote_waitlist(uuid)', 'execute'), 'promote_waitlist is callable';
  assert not has_function_privilege('service_role', 'private.promote_waitlist(uuid)', 'execute'), 'service_role runs promote_waitlist';
  assert has_function_privilege('authenticated', 'private.register_for_event(uuid, jsonb)', 'execute')
     and not has_function_privilege('service_role', 'private.register_for_event(uuid, jsonb)', 'execute')
     and not has_function_privilege('anon', 'private.cancel_registration(uuid)', 'execute'), 'register/cancel body ACL changed';
end $$;

-- anon cannot call attach at all
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.attach_payment_order(gen_random_uuid(), 'order_P4RPC000007', 100);
    assert false, 'anon executed attach_payment_order';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

rollback;
select 'payments-rpc: all assertions passed' as result;
