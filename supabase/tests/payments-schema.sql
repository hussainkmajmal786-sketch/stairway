-- Phase 4 Task 1: payment data model. Run as ONE execute_sql call; rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004a1', 'p4-a1@test.local', 'authenticated', 'authenticated', '{"full_name":"Pay One"}'),
  ('00000000-0000-0000-0000-0000000004a2', 'p4-a2@test.local', 'authenticated', 'authenticated', '{"full_name":"Pay Two"}'),
  ('00000000-0000-0000-0000-0000000004a3', 'p4-a3@test.local', 'authenticated', 'authenticated', '{"full_name":"Pay Three"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id in ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004a2',
               '00000000-0000-0000-0000-0000000004a3');

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix, price_paise)
select s.id, 81, 'p4-schema', 'p4-schema', now() + interval '10 days', now() + interval '10 days 6 hours',
       'published', 5, 'RAS-81', 19900
from public.societies s where s.slug = 'ras';

do $$
declare
  ev uuid;
  a1 constant uuid := '00000000-0000-0000-0000-0000000004a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000004a2';
  a3 constant uuid := '00000000-0000-0000-0000-0000000004a3';
  t1 int;
  t2 int;
  t3 int;
  r2 uuid;
  r3 uuid;
  rc text;
  c record;
begin
  -- non-vacuous: ASSERT must actually fire in this session
  begin
    assert false, 'sentinel';
    raise exception 'plpgsql.check_asserts is off: assertions would be vacuous';
  exception when assert_failure then null; end;

  select id into ev from public.events where slug = 'p4-schema';
  assert ev is not null, 'fixture event missing';

  -- backfill: every event's counter is at least its highest existing token (live data preserved, never reused)
  assert not exists (
    select 1 from public.registrations r
    left join private.event_token_counters tc on tc.event_id = r.event_id
    where r.token_number is not null
    group by r.event_id, tc.last_token
    having tc.last_token is null or tc.last_token < max(r.token_number)), 'token counter backfill incomplete';

  -- flags start OFF
  assert (select count(*) from private.feature_flags) = 1, 'unexpected feature_flags rows';
  assert not private.flag_enabled('payments'), 'payments flag is on by default';
  assert not private.flag_enabled('nope'), 'unknown flag reads as on';

  -- token counter: monotonic, never reused after a delete
  t1 := private.next_token(ev);
  t2 := private.next_token(ev);
  assert t1 = 1 and t2 = 2, format('tokens %s %s', t1, t2);
  insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
    values (ev, a1, 'confirmed', private.new_ticket_code(), t1, now());
  insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
    values (ev, a2, 'confirmed', private.new_ticket_code(), t2, now()) returning id into r2;
  delete from public.registrations where id = r2;
  t3 := private.next_token(ev);
  assert t3 = 3, 'token number reused after a delete: ' || t3;

  -- receipts
  rc := private.next_receipt_number();
  assert rc ~ ('^STW-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-[0-9]{6,}$'), 'bad receipt ' || rc;
  assert private.next_receipt_number() <> rc, 'receipt numbers repeat';

  -- money shape: refund states need a payment id; ids must look like Razorpay ids
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, amount_paise)
      values (ev, a3, 'refund_needed', private.new_ticket_code(), 19900);
    assert false, 'refund_needed without a payment id accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, hold_expires_at, razorpay_order_id)
      values (ev, a3, 'pending_payment', private.new_ticket_code(), now() + interval '15 minutes', 'not-an-order');
    assert false, 'malformed order id accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, razorpay_payment_id, cancel_reason)
      values (ev, a3, 'cancelled', private.new_ticket_code(), 'pay_P4SCHEMA0001', 'because');
    assert false, 'unknown cancel_reason accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, razorpay_payment_id)
      values (ev, a3, 'refunded', private.new_ticket_code(), 'not-a-payment');
    assert false, 'malformed payment id accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, razorpay_payment_id, receipt_number)
      values (ev, a3, 'refunded', private.new_ticket_code(), 'pay_P4SCHEMA0001', 'RCPT-1');
    assert false, 'malformed receipt number accepted';
  exception when check_violation then null; end;
  begin
    insert into private.payment_events (source, outcome, details)
      values ('webhook', 'confirmed', jsonb_build_object('pad', repeat('x', 3000)));
    assert false, 'oversized payment_events.details accepted';
  exception when check_violation then null; end;

  -- a live hold counts toward capacity but not toward attending
  insert into public.registrations (event_id, user_id, status, ticket_code, amount_paise, hold_expires_at, razorpay_order_id)
    values (ev, a3, 'pending_payment', private.new_ticket_code(), 19900, now() + interval '15 minutes', 'order_P4SCHEMA0001')
    returning id into r3;
  select * into c from public.event_seat_counts where event_id = ev;
  assert c.seats_taken = 2 and c.attending = 1 and c.waitlisted = 0, format('counts %s', row_to_json(c));

  -- ledger: an order blocks deleting the account by cascade (ON DELETE RESTRICT)
  insert into private.payment_orders (razorpay_order_id, registration_id, amount_paise)
    values ('order_P4SCHEMA0001', r3, 19900);
  begin
    delete from auth.users where id = a3;
    assert false, 'account with a payment order was deleted by cascade';
  exception when foreign_key_violation then null; end;
  assert exists (select 1 from public.registrations where id = r3), 'held registration vanished';

  -- payment_events is append-only and webhook event ids are unique
  insert into private.payment_events (registration_id, source, razorpay_event_id, razorpay_order_id, outcome)
    values (r3, 'webhook', 'evt_P4SCHEMA0001', 'order_P4SCHEMA0001', 'confirmed');
  begin
    update private.payment_events set outcome = 'refunded' where razorpay_event_id = 'evt_P4SCHEMA0001';
    assert false, 'payment_events row updated';
  exception when insufficient_privilege then null; end;
  begin
    delete from private.payment_events where razorpay_event_id = 'evt_P4SCHEMA0001';
    assert false, 'payment_events row deleted';
  exception when insufficient_privilege then null; end;
  begin
    truncate private.payment_events;
    assert false, 'payment_events truncated';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from private.payment_events where razorpay_event_id = 'evt_P4SCHEMA0001') = 1,
    'payment_events row changed';
  begin
    insert into private.payment_events (source, razorpay_event_id, outcome) values ('webhook', 'evt_P4SCHEMA0001', 'confirmed');
    assert false, 'duplicate razorpay_event_id accepted';
  exception when unique_violation then null; end;

  -- no client (or service_role) privilege on the private tables and helpers
  assert not has_table_privilege('anon', 'private.payment_events', 'select'), 'anon reads payment_events';
  assert not has_table_privilege('authenticated', 'private.payment_events', 'select'), 'authenticated reads payment_events';
  assert not has_table_privilege('authenticated', 'private.payment_orders', 'select'), 'authenticated reads payment_orders';
  assert not has_table_privilege('authenticated', 'private.feature_flags', 'update'), 'authenticated can flip flags';
  assert not has_table_privilege('service_role', 'private.feature_flags', 'update'), 'service_role can flip flags';
  assert not has_function_privilege('authenticated', 'private.next_token(uuid)', 'execute'), 'authenticated runs next_token';
  assert not has_function_privilege('anon', 'private.next_receipt_number()', 'execute'), 'anon runs next_receipt_number';
  assert not has_function_privilege('authenticated', 'private.flag_enabled(text)', 'execute'), 'authenticated reads flags';
  assert not has_table_privilege('service_role', 'private.payment_orders', 'select'), 'service_role reads payment_orders directly';
  assert not has_table_privilege('service_role', 'private.payment_events', 'insert'), 'service_role writes payment_events directly';
  assert not has_table_privilege('anon', 'private.event_token_counters', 'select'), 'anon reads token counters';
  assert not has_sequence_privilege('authenticated', 'private.receipt_seq', 'usage'), 'authenticated uses receipt_seq';
  assert not has_function_privilege('service_role', 'private.next_token(uuid)', 'execute'), 'service_role runs next_token';
  assert not has_function_privilege('authenticated', 'private.payment_events_append_only()', 'execute'),
    'authenticated runs append-only trigger fn';
  assert has_table_privilege('anon', 'public.event_seat_counts', 'select'), 'anon lost seat counts';
  assert not has_table_privilege('anon', 'public.event_seat_counts', 'insert'), 'anon can write seat counts';
end $$;

rollback;
select 'payments-schema: all assertions passed' as result;
