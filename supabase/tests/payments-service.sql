-- Phase 4 Task 3: confirm / expire / refund (service-role functions). Run as ONE execute_sql call; rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004c1', 'p4-c1@test.local', 'authenticated', 'authenticated', '{"full_name":"Cee One"}'),
  ('00000000-0000-0000-0000-0000000004c2', 'p4-c2@test.local', 'authenticated', 'authenticated', '{"full_name":"Cee Two"}'),
  ('00000000-0000-0000-0000-0000000004c3', 'p4-c3@test.local', 'authenticated', 'authenticated', '{"full_name":"Cee Three"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id::text like '00000000-0000-0000-0000-0000000004c%';

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix, price_paise)
select s.id, v.step, v.slug, v.slug, now() + interval '10 days', now() + interval '10 days 6 hours', 'published',
       v.capacity, 'RAS-' || v.step, 19900
from public.societies s,
  (values (84, 'p4-svc-a', 1), (85, 'p4-svc-b', 1), (86, 'p4-svc-c', 2), (87, 'p4-svc-d', 1)) as v(step, slug, capacity)
where s.slug = 'ras';

do $$
declare
  ea uuid;
  eb uuid;
  ec uuid;
  ed uuid;
  c1 constant uuid := '00000000-0000-0000-0000-0000000004c1';
  c2 constant uuid := '00000000-0000-0000-0000-0000000004c2';
  c3 constant uuid := '00000000-0000-0000-0000-0000000004c3';
  ra1 uuid;
  ra2 uuid;
  rb2 uuid;
  rb3 uuid;
  rc3 uuid;
  rd1 uuid;
  rd2 uuid;
  rd3 uuid;
  r jsonb;
  reg public.registrations%rowtype;
  receipt_a text;
  tok_a int;
  n bigint;
  asserts_on boolean := false;
begin
  -- sentinel: ASSERT must be enabled, or every check below would pass vacuously
  begin
    assert false, 'sentinel';
  exception when assert_failure then asserts_on := true; end;
  if not asserts_on then
    raise exception 'plpgsql.check_asserts is off';
  end if;

  select id into ea from public.events where slug = 'p4-svc-a';
  select id into eb from public.events where slug = 'p4-svc-b';
  select id into ec from public.events where slug = 'p4-svc-c';
  select id into ed from public.events where slug = 'p4-svc-d';
  assert ea is not null and eb is not null and ec is not null and ed is not null, 'fixture events missing';
  assert not private.flag_enabled('payments'), 'payments flag must be OFF on the live database';
  update private.feature_flags set enabled = true where key = 'payments';

  -- ───────── grants: users and anon can do none of this; service_role can (through the public wrappers) ─────────
  assert not has_function_privilege('authenticated', 'public.confirm_payment(uuid, text, text, integer, text, text, text, text, jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.confirm_payment(uuid, text, text, integer, text, text, text, text, jsonb)', 'execute')
     and not has_function_privilege('authenticated', 'private.confirm_payment(uuid, text, text, integer, text, text, text, text, jsonb)', 'execute')
     and not has_function_privilege('anon', 'private.confirm_payment(uuid, text, text, integer, text, text, text, text, jsonb)', 'execute'),
    'users or anon can confirm payments';
  assert not has_function_privilege('authenticated', 'public.expire_holds(integer)', 'execute')
     and not has_function_privilege('anon', 'public.expire_holds(integer)', 'execute')
     and not has_function_privilege('authenticated', 'private.expire_holds(integer)', 'execute')
     and not has_function_privilege('anon', 'private.expire_holds(integer)', 'execute'), 'users or anon can expire holds';
  assert not has_function_privilege('authenticated', 'public.claim_refund(uuid)', 'execute')
     and not has_function_privilege('anon', 'public.claim_refund(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'private.claim_refund(uuid)', 'execute')
     and not has_function_privilege('anon', 'private.claim_refund(uuid)', 'execute'), 'users or anon can claim refunds';
  assert not has_function_privilege('authenticated', 'public.mark_refunded(uuid, text, text, integer, text, text)', 'execute')
     and not has_function_privilege('anon', 'public.mark_refunded(uuid, text, text, integer, text, text)', 'execute')
     and not has_function_privilege('authenticated', 'private.mark_refunded(uuid, text, text, integer, text, text)', 'execute')
     and not has_function_privilege('anon', 'private.mark_refunded(uuid, text, text, integer, text, text)', 'execute'),
    'users or anon can mark refunds';
  assert has_function_privilege('service_role', 'public.confirm_payment(uuid, text, text, integer, text, text, text, text, jsonb)', 'execute')
     and has_function_privilege('service_role', 'public.expire_holds(integer)', 'execute')
     and has_function_privilege('service_role', 'public.claim_refund(uuid)', 'execute')
     and has_function_privilege('service_role', 'public.mark_refunded(uuid, text, text, integer, text, text)', 'execute')
     and has_function_privilege('service_role', 'private.confirm_payment(uuid, text, text, integer, text, text, text, text, jsonb)', 'execute'),
    'service_role cannot run the payment functions';
  assert (select bool_and(p.prosecdef) from pg_proc p
          where p.pronamespace = 'private'::regnamespace
            and p.proname in ('confirm_payment', 'expire_holds', 'claim_refund', 'mark_refunded')) is true,
    'a private payment body is not security definer';
  assert (select count(*) from pg_proc p
          where p.pronamespace = 'public'::regnamespace and not p.prosecdef
            and p.proname in ('confirm_payment', 'expire_holds', 'claim_refund', 'mark_refunded')) = 4,
    'public payment wrappers must be four security invoker functions';
  assert not exists (select 1 from pg_proc p
                     where p.proname in ('confirm_payment', 'expire_holds', 'claim_refund', 'mark_refunded')
                       and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
                       and not coalesce(p.proconfig @> array['search_path=""'], false)),
    'a payment function lacks search_path=''''';

  -- ───────── fixtures: c1 holds A's only seat (order OA); c2 waits on A, holds B (OB); c3 holds C (OC) ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ra1 := (public.register_for_event(ea, '{}')->>'registration_id')::uuid;
  perform public.attach_payment_order(ra1, 'order_P4SVCA00001', 19900);
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  ra2 := (public.register_for_event(ea, '{}')->>'registration_id')::uuid;
  rb2 := (public.register_for_event(eb, '{}')->>'registration_id')::uuid;
  perform public.attach_payment_order(rb2, 'order_P4SVCB00002', 19900);
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  rc3 := (public.register_for_event(ec, '{}')->>'registration_id')::uuid;
  perform public.attach_payment_order(rc3, 'order_P4SVCC00003', 19900);
  reset role;
  assert (select status from public.registrations where id = ra2) = 'waitlisted', 'c2 should wait on A';

  set local role service_role;

  -- confirm inside a live hold: seat, token, receipt
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA00001', 19900, 'INR', 'client_verify',
                              null, null, '{"status":"captured","method":"upi"}');
  assert r->>'outcome' = 'confirmed' and r->>'status' = 'confirmed' and (r->>'registration_id')::uuid = ra1, 'confirm: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = ra1;
  receipt_a := reg.receipt_number;
  tok_a := reg.token_number;
  set local role service_role;
  -- idempotent: client retry, then the webhook, then a webhook redelivery
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA00001', 19900, 'INR', 'client_verify');
  assert r->>'outcome' = 'already_processed' and r->>'status' = 'confirmed', 'client retry: ' || r::text;
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA00001', 19900, 'INR', 'webhook', 'evt_P4SVC0000001', 'order.paid');
  assert r->>'outcome' = 'already_processed', 'webhook after verify: ' || r::text;
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA00001', 19900, 'INR', 'webhook', 'evt_P4SVC0000001', 'order.paid');
  assert r->>'outcome' = 'duplicate_event', 'webhook redelivery: ' || r::text;
  -- a second, different payment for the same paid seat is kept on record, not applied
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA0DUP1', 19900, 'INR', 'webhook', 'evt_P4SVC0000002', 'order.paid');
  assert r->>'outcome' = 'duplicate_payment' and r->>'status' = 'confirmed', 'duplicate payment: ' || r::text;
  -- foreign / unknown order ids store nothing
  r := public.confirm_payment(ra1, 'order_FUNDEASY0001', 'pay_FUNDEASY0001', 19900, 'INR', 'webhook', 'evt_FE000000001', 'order.paid');
  assert r->>'outcome' = 'unknown_order' and r->'status' is null, 'foreign order: ' || r::text;
  -- an order of ANOTHER registration never confirms this one
  r := public.confirm_payment(ra1, 'order_P4SVCB00002', 'pay_P4SVCB0XXX1', 19900, 'INR', 'client_verify');
  assert r->>'outcome' = 'unknown_order', 'cross-registration order: ' || r::text;
  r := public.confirm_payment(rb2, 'order_P4SVCA00001', 'pay_P4SVCA0XXX2', 19900, 'INR', 'client_verify');
  assert r->>'outcome' = 'unknown_order', 'cross-registration order (2): ' || r::text;
  -- wrong amount or currency never confirms (logged for the admin list)
  r := public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', 100, 'INR', 'client_verify');
  assert r->>'outcome' = 'amount_mismatch' and r->>'status' = 'pending_payment', 'amount mismatch: ' || r::text;
  r := public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', 19900, 'USD', 'client_verify');
  assert r->>'outcome' = 'amount_mismatch' and r->>'status' = 'pending_payment', 'currency mismatch: ' || r::text;
  r := public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', null, null, 'client_verify');
  assert r->>'outcome' = 'amount_mismatch', 'missing amount: ' || r::text;
  -- malformed input is refused outright
  begin
    perform public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', 19900, 'INR', 'refund_api');
    assert false, 'confirm accepted a bad source';
  exception when others then if sqlerrm <> 'invalid_source' then raise; end if; end;
  begin
    perform public.confirm_payment(rb2, 'order_P4SVCB00002', 'not-a-payment', 19900, 'INR', 'webhook');
    assert false, 'confirm accepted a malformed payment id';
  exception when others then if sqlerrm <> 'invalid_payment' then raise; end if; end;
  begin
    perform public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', 19900, 'INR', 'webhook', repeat('e', 101));
    assert false, 'confirm accepted an oversized event id';
  exception when others then if sqlerrm <> 'invalid_event' then raise; end if; end;
  -- a payment id already used by another order is inconsistent: refused, nothing changes
  begin
    perform public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCA00001', 19900, 'INR', 'webhook', 'evt_P4SVCCONFL1', 'order.paid');
    assert false, 'a payment id of another order confirmed this one';
  exception when others then if sqlerrm <> 'payment_conflict' then raise; end if; end;
  reset role;

  select * into reg from public.registrations where id = ra1;
  assert reg.status = 'confirmed' and reg.token_number is not null and reg.receipt_number ~ '^STW-[0-9]{4}-[0-9]{6,}$'
     and reg.paid_at is not null and reg.hold_expires_at is null and reg.confirmed_at is not null
     and reg.razorpay_payment_id = 'pay_P4SVCA00001' and reg.razorpay_order_id = 'order_P4SVCA00001'
     and reg.amount_paise = 19900, 'confirmed row incomplete';
  assert reg.receipt_number = receipt_a and reg.token_number = tok_a, 'retries changed the receipt or token';
  assert (select o.status = 'paid' and o.razorpay_payment_id = 'pay_P4SVCA00001' and o.receipt_number = receipt_a
                 and o.paid_at is not null
          from private.payment_orders o where o.razorpay_order_id = 'order_P4SVCA00001'), 'ledger order not marked paid';
  assert (select count(*) from private.payment_events where registration_id = ra1) = 4,
    'expected 4 logged events for A (confirmed, 2x already_processed, duplicate_payment)';
  assert (select count(*) from private.payment_events where registration_id = ra1 and outcome = 'confirmed') = 1,
    'more than one confirmation logged';
  assert (select details from private.payment_events where registration_id = ra1 and outcome = 'confirmed')
         = '{"status":"captured","method":"upi"}'::jsonb, 'details not logged';
  assert (select count(*) from private.payment_events where razorpay_event_id = 'evt_P4SVC0000001') = 1, 'redelivery logged twice';
  assert not exists (select 1 from private.payment_events
                     where razorpay_order_id = 'order_FUNDEASY0001' or razorpay_payment_id like 'pay_%XXX%'
                        or razorpay_event_id = 'evt_P4SVCCONFL1'),
    'a foreign, cross-registration or conflicting payment was logged';
  assert (select count(*) from private.payment_events where registration_id = rb2 and outcome = 'amount_mismatch') = 3,
    'mismatches not logged';
  select * into reg from public.registrations where id = rb2;
  assert reg.status = 'pending_payment' and reg.razorpay_payment_id is null and reg.receipt_number is null and reg.paid_at is null,
    'a mismatched or conflicting payment touched the hold';
  assert (select status from private.payment_orders where razorpay_order_id = 'order_P4SVCB00002') = 'created', 'mismatch touched the ledger';
  assert (select count(*) from public.registrations where receipt_number is not null
          and event_id in (ea, eb, ec, ed)) = 1, 'receipts issued for unaccepted payments';

  -- ───────── hold expiry: B (c2) and C (c3); bounded batches ─────────
  update public.registrations set hold_expires_at = now() - interval '1 second' where id in (rb2, rc3);
  set local role service_role;
  r := public.expire_holds(1);
  assert (r->>'events')::int = 1, 'expire_holds(1) must touch exactly one event: ' || r::text;
  r := public.expire_holds(50);
  assert (r->>'events')::int between 1 and 50, 'expire_holds(50): ' || r::text;
  r := public.expire_holds(100000);
  assert (r->>'events')::int <= 50, 'expire_holds ignores its 50-event cap: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = rb2;
  assert reg.status = 'cancelled' and reg.cancel_reason = 'hold_expired' and reg.cancelled_at is not null, 'B hold not expired';
  select * into reg from public.registrations where id = rc3;
  assert reg.status = 'cancelled' and reg.cancel_reason = 'hold_expired', 'C hold not expired';
  assert (select status from public.registrations where id = ra1) = 'confirmed', 'expire_holds touched a confirmed seat';

  -- late payment WITH a free seat (C has capacity 2): honoured; a retry is idempotent
  set local role service_role;
  r := public.confirm_payment(rc3, 'order_P4SVCC00003', 'pay_P4SVCC00003', 19900, 'INR', 'webhook', 'evt_P4SVC0000003', 'order.paid');
  assert r->>'outcome' = 'late_confirmed' and r->>'status' = 'confirmed', 'late with seat: ' || r::text;
  r := public.confirm_payment(rc3, 'order_P4SVCC00003', 'pay_P4SVCC00003', 19900, 'INR', 'client_verify');
  assert r->>'outcome' = 'already_processed', 'late retry: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = rc3;
  assert reg.token_number is not null and reg.receipt_number is not null and reg.cancel_reason is null
     and reg.cancelled_at is null and reg.confirmed_at is not null, 'late-confirmed row incomplete';

  -- late payment WITHOUT a seat: c3 takes B's only seat first, then c2's old order is paid -> refund_needed
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rb3 := (public.register_for_event(eb, '{}')->>'registration_id')::uuid;
  reset role;
  assert (select status from public.registrations where id = rb3) = 'pending_payment', 'c3 should hold B';
  set local role service_role;
  r := public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', 19900, 'INR', 'webhook', 'evt_P4SVC0000004', 'order.paid');
  assert r->>'outcome' = 'refund_needed' and r->>'status' = 'refund_needed', 'late without seat: ' || r::text;
  r := public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', 19900, 'INR', 'client_verify');
  assert r->>'outcome' = 'already_processed' and r->>'status' = 'refund_needed', 'refund_needed retry: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = rb2;
  assert reg.receipt_number is not null and reg.cancel_reason = 'late_payment_no_seat' and reg.token_number is null
     and reg.razorpay_payment_id = 'pay_P4SVCB00002' and reg.paid_at is not null, 'refund_needed row incomplete';
  assert (select status from public.registrations where id = rb3) = 'pending_payment', 'the late payment took c3''s seat';

  -- late payment from the WAITLIST without a seat (D, capacity 1): refund_needed, waitlist compacted
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rd1 := (public.register_for_event(ed, '{}')->>'registration_id')::uuid;
  perform public.attach_payment_order(rd1, 'order_P4SVCD00001', 19900);
  reset role;
  update public.registrations set hold_expires_at = now() - interval '1 second' where id = rd1;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rd2 := (public.register_for_event(ed, '{}')->>'registration_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  r := public.register_for_event(ed, '{}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 1 and (r->>'registration_id')::uuid = rd1,
    'c1 should re-register onto D''s waitlist: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  rd3 := (public.register_for_event(ed, '{}')->>'registration_id')::uuid;
  reset role;
  assert (select waitlist_position from public.registrations where id = rd3) = 2, 'c3 should be second on D';
  set local role service_role;
  r := public.confirm_payment(rd1, 'order_P4SVCD00001', 'pay_P4SVCD00001', 19900, 'INR', 'webhook', 'evt_P4SVC0000007', 'order.paid');
  assert r->>'outcome' = 'refund_needed' and r->>'status' = 'refund_needed', 'waitlisted late payment: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = rd1;
  assert reg.waitlist_position is null and reg.razorpay_order_id = 'order_P4SVCD00001' and reg.receipt_number is not null,
    'waitlisted refund_needed row shape';
  assert (select waitlist_position from public.registrations where id = rd3) = 1, 'D waitlist not compacted';
  assert (select status from public.registrations where id = rd2) = 'pending_payment', 'D seat holder disturbed';

  -- the cron promotes waitlists of events whose capacity grew
  update public.events set capacity = 2 where id = ed;
  set local role service_role;
  r := public.expire_holds(50);
  assert (r->>'promoted')::int >= 1, 'expire_holds did not promote: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = rd3;
  assert reg.status = 'pending_payment' and reg.hold_expires_at > now() and reg.waitlist_position is null,
    'D waitlist head not given a hold by the cron';

  -- ───────── refunds: lease, idempotent marking, seat released to the waitlist (c2 on A) ─────────
  set local role service_role;
  r := public.claim_refund(ra1);
  assert r->>'payment_id' = 'pay_P4SVCA00001' and (r->>'amount_paise')::int = 19900 and (r->>'registration_id')::uuid = ra1,
    'claim: ' || r::text;
  begin
    perform public.claim_refund(ra1);
    assert false, 'second claim inside the lease accepted';
  exception when others then if sqlerrm <> 'refund_in_progress' then raise; end if; end;
  begin
    perform public.claim_refund(gen_random_uuid());
    assert false, 'claimed a missing registration';
  exception when others then if sqlerrm <> 'registration_not_found' then raise; end if; end;
  begin
    perform public.claim_refund(rb3);
    assert false, 'claimed an unpaid hold';
  exception when others then if sqlerrm <> 'not_refundable' then raise; end if; end;
  begin
    perform public.mark_refunded(ra1, 'pay_P4SVCA00001', 'rfnd_P4SVCA00001', 19900, 'client_verify');
    assert false, 'mark_refunded accepted a bad source';
  exception when others then if sqlerrm <> 'invalid_source' then raise; end if; end;
  begin
    perform public.mark_refunded(ra1, 'pay_P4SVCA00001', 'refund-1', 19900, 'refund_api');
    assert false, 'mark_refunded accepted a malformed refund id';
  exception when others then if sqlerrm <> 'invalid_refund' then raise; end if; end;
  r := public.mark_refunded(ra1, 'pay_P4SVCA00001', 'rfnd_P4SVCA00001', 19900, 'refund_api');
  assert r->>'outcome' = 'refunded' and r->>'status' = 'refunded' and (r->>'promoted')::int = 1, 'mark refunded: ' || r::text;
  r := public.mark_refunded(ra1, 'pay_P4SVCA00001', 'rfnd_P4SVCA00001', 19900, 'webhook', 'evt_P4SVC0000005');
  assert r->>'outcome' = 'already_refunded', 'webhook after refund api: ' || r::text;
  r := public.mark_refunded(ra1, 'pay_P4SVCA00001', 'rfnd_P4SVCA00001', 19900, 'webhook', 'evt_P4SVC0000005');
  assert r->>'outcome' = 'duplicate_event', 'refund webhook redelivery: ' || r::text;
  r := public.mark_refunded(ra1, 'pay_P4SVCA0DUP1', 'rfnd_P4SVCA0DUP1', 19900, 'refund_api');
  assert r->>'outcome' = 'ledger_refund' and r->>'status' = 'refunded', 'duplicate payment refund: ' || r::text;
  r := public.mark_refunded(ra1, 'pay_UNRELATED001', 'rfnd_UNRELATED001', 19900, 'webhook', 'evt_P4SVC0000006');
  assert r->>'outcome' = 'unknown_payment', 'unrelated refund: ' || r::text;
  r := public.mark_refunded(gen_random_uuid(), 'pay_UNRELATED001', 'rfnd_UNRELATED002', 19900, 'webhook', 'evt_P4SVC0000008');
  assert r->>'outcome' = 'unknown_registration', 'unknown registration: ' || r::text;
  begin
    perform public.claim_refund(ra1);
    assert false, 'refunded row claimable';
  exception when others then if sqlerrm <> 'not_refundable' then raise; end if; end;

  -- refund_needed (B): lease can be re-taken once it lapses; refunding frees nothing more (seat already released)
  r := public.claim_refund(rb2);
  assert r->>'payment_id' = 'pay_P4SVCB00002', 'claim refund_needed: ' || r::text;
  reset role;
  update public.registrations set refund_claimed_until = now() - interval '1 second' where id = rb2;
  set local role service_role;
  r := public.claim_refund(rb2);
  assert r->>'payment_id' = 'pay_P4SVCB00002', 'lapsed lease not re-claimable: ' || r::text;
  r := public.mark_refunded(rb2, 'pay_P4SVCB00002', 'rfnd_P4SVCB00002', 19900, 'webhook', 'evt_P4SVC0000009');
  assert r->>'outcome' = 'refunded' and (r->>'promoted')::int = 0, 'refund_needed refunded: ' || r::text;
  reset role;

  select * into reg from public.registrations where id = ra1;
  assert reg.status = 'refunded' and reg.razorpay_refund_id = 'rfnd_P4SVCA00001' and reg.refunded_at is not null
     and reg.refund_claimed_until is null and reg.cancelled_at is not null, 'A refund row shape';
  select * into reg from public.registrations where id = rb2;
  assert reg.status = 'refunded' and reg.refund_claimed_until is null and reg.razorpay_refund_id = 'rfnd_P4SVCB00002', 'B refund row shape';
  assert (select status from public.registrations where id = ra2) = 'pending_payment', 'waitlisted c2 not given the freed seat';
  assert (select status = 'refunded' and razorpay_refund_id = 'rfnd_P4SVCA00001' from private.payment_orders
          where razorpay_order_id = 'order_P4SVCA00001'), 'ledger not refunded';
  assert (select count(*) from private.payment_events where registration_id = ra1 and outcome = 'refunded') = 1
     and (select count(*) from private.payment_events where registration_id = ra1 and outcome = 'already_refunded') = 1
     and (select count(*) from private.payment_events where registration_id = ra1 and outcome = 'ledger_refund') = 1,
    'refund outcomes not logged exactly once';
  assert not exists (select 1 from private.payment_events where razorpay_event_id in ('evt_P4SVC0000006', 'evt_P4SVC0000008')),
    'unknown refunds logged';
  select count(*) into n from private.payment_events where registration_id in (ra1, rb2, rc3, rd1);
  -- A: 4 confirm-side + 3 refund-side; B: 3 mismatches + refund_needed + retry + refunded; C: late + retry; D: 1
  assert n = 7 + 6 + 2 + 1, format('unexpected payment_events count %s', n);

  -- capacity under pending holds: never more confirmed + live holds than capacity; waitlist positions consistent
  set constraints all immediate;
  assert not exists (select 1 from public.events e where e.slug like 'p4-svc-%'
                     and (select count(*) from public.registrations x where x.event_id = e.id
                          and (x.status = 'confirmed' or (x.status = 'pending_payment' and x.hold_expires_at > now()))) > e.capacity),
    'an event is over capacity';
end $$;

-- anon and signed-in users cannot call any of it
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.confirm_payment(gen_random_uuid(), 'order_P4SVCX00001', 'pay_P4SVCX00001', 100, 'INR', 'webhook');
    assert false, 'anon executed confirm_payment';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000004c1', 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.confirm_payment(gen_random_uuid(), 'order_P4SVCX00001', 'pay_P4SVCX00001', 100, 'INR', 'webhook');
    assert false, 'a user executed confirm_payment';
  exception when insufficient_privilege then null; end;
  begin
    perform private.confirm_payment(gen_random_uuid(), 'order_P4SVCX00001', 'pay_P4SVCX00001', 100, 'INR', 'webhook');
    assert false, 'a user executed the confirm_payment body';
  exception when insufficient_privilege then null; end;
  begin
    perform public.expire_holds(50);
    assert false, 'a user executed expire_holds';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_refund(gen_random_uuid());
    assert false, 'a user executed claim_refund';
  exception when insufficient_privilege then null; end;
  begin
    perform public.mark_refunded(gen_random_uuid(), 'pay_P4SVCX00001', 'rfnd_P4SVCX00001', 100, 'webhook');
    assert false, 'a user executed mark_refunded';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

rollback;
select 'payments-service: all assertions passed' as result;
