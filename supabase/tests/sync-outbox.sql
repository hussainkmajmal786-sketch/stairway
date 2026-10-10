-- Phase 4 Task 4: Fund Easy outbox. Run as ONE execute_sql call; rolls back.
begin;

update private.feature_flags set enabled = true where key = 'payments';
-- Isolate this script's rows from anything already queued on the live database.
update private.external_sync_outbox set locked_until = now() + interval '1 hour' where status in ('pending', 'failed');

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004d1', 'p4-d1@test.local', 'authenticated', 'authenticated', '{"full_name":"Dee One"}'),
  ('00000000-0000-0000-0000-0000000004d2', 'p4-d2@test.local', 'authenticated', 'authenticated', '{"full_name":"Dee Two"}'),
  ('00000000-0000-0000-0000-0000000004d3', 'p4-d3@test.local', 'authenticated', 'authenticated', '{"full_name":"Dee Three"}'),
  ('00000000-0000-0000-0000-0000000004d4', 'p4-d4@test.local', 'authenticated', 'authenticated', '{"full_name":"Dee Four"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id::text like '00000000-0000-0000-0000-0000000004d%';

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix, price_paise)
select s.id, v.step, v.slug, v.slug, now() + interval '10 days', now() + interval '10 days 6 hours', 'published', 5,
       'RAS-' || v.step, v.price
from public.societies s, (values (87, 'p4-sync-free', 0), (88, 'p4-sync-paid', 19900)) as v(step, slug, price)
where s.slug = 'ras';

do $$
declare
  ef uuid;
  ep uuid;
  d1 constant uuid := '00000000-0000-0000-0000-0000000004d1';
  d2 constant uuid := '00000000-0000-0000-0000-0000000004d2';
  d3 constant uuid := '00000000-0000-0000-0000-0000000004d3';
  d4 constant uuid := '00000000-0000-0000-0000-0000000004d4';
  rf uuid;
  rp uuid;
  rq uuid;
  r4 uuid;
  o record;
  b jsonb;
  s text;
  first_d1 uuid;
  first_d2 uuid;
  old_id uuid;
  asserts_on boolean := false;
begin
  -- sentinel: ASSERT must be enabled, or every check below would pass vacuously
  begin
    assert false, 'sentinel';
  exception when assert_failure then asserts_on := true; end;
  if not asserts_on then
    raise exception 'plpgsql.check_asserts is off';
  end if;

  select id into ef from public.events where slug = 'p4-sync-free';
  select id into ep from public.events where slug = 'p4-sync-paid';
  assert ef is not null and ep is not null, 'fixture events missing';

  -- free: confirm -> cancel -> confirm again
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rf := (public.register_for_event(ef, '{}')->>'registration_id')::uuid;
  perform public.cancel_registration(rf);
  perform public.register_for_event(ef, '{}');
  reset role;
  assert rf is not null, 'free registration failed';
  assert (select array_agg(event_type order by seq) from private.external_sync_outbox where registration_id = rf)
       = array['registration.confirmed', 'registration.cancelled', 'registration.confirmed'], 'free transitions not queued in order';
  select * into o from private.external_sync_outbox where registration_id = rf order by seq limit 1;
  assert o.status = 'pending' and o.attempts = 0 and o.idempotency_key ~ ('^' || rf::text || ':registration\.confirmed:[0-9]+$'),
    'new row shape: ' || row_to_json(o)::text;
  assert o.payload #>> '{attendee,email}' = 'p4-d1@test.local' and o.payload #>> '{attendee,full_name}' = 'Dee One',
    'confirmed payload lacks the attendee';
  assert (select array_agg(k order by k) from jsonb_object_keys(o.payload->'attendee') k) = array['email', 'full_name'],
    'attendee carries more than email + full name';
  assert (select array_agg(k order by k) from jsonb_object_keys(o.payload) k) = array['attendee', 'event', 'registration'],
    'unexpected top-level payload keys: ' || o.payload::text;
  assert o.payload #>> '{registration,ticket_code}' ~ '^[A-Z2-7]{26}$' and o.payload #>> '{registration,token}' ~ '^RAS-87-[0-9]{4}$',
    'confirmed payload lacks ticket code/token: ' || o.payload::text;
  assert o.payload #>> '{event,slug}' = 'p4-sync-free' and (o.payload #>> '{registration,amount_paise}')::int = 0
     and o.payload #>> '{registration,currency}' = 'INR' and (o.payload #>> '{event,capacity}')::int = 5, 'event block wrong';
  assert not (o.payload->'registration' ? 'answers') and not (o.payload->'registration' ? 'user_id')
     and not (o.payload->'registration' ? 'razorpay_order_id'), 'payload carries extra data / nulls not stripped';
  assert o.payload::text !~* '(phone|ieee)', 'payload mentions phone / IEEE data';
  select * into o from private.external_sync_outbox where registration_id = rf order by seq offset 1 limit 1;
  assert not (o.payload ? 'attendee') and not (o.payload->'registration' ? 'ticket_code')
     and not (o.payload->'registration' ? 'token'), 'cancel payload carries personal data';
  assert o.payload #>> '{registration,cancel_reason}' = 'user' and o.payload #>> '{registration,status}' = 'cancelled',
    'cancel reason missing';

  -- paid: hold (nothing queued) -> confirm -> cancel (refund_needed) -> refunded
  perform set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rp := (public.register_for_event(ep, '{}')->>'registration_id')::uuid;
  reset role;
  set local role service_role;
  perform public.attach_payment_order(d2, rp, 'order_P4SYNC00001', 19900);
  reset role;
  assert (select status from public.registrations where id = rp) = 'pending_payment', 'paid hold not created';
  assert not exists (select 1 from private.external_sync_outbox where registration_id = rp), 'a hold was queued';
  set local role service_role;
  perform public.confirm_payment(rp, 'order_P4SYNC00001', 'pay_P4SYNC00001', 19900, 'INR', 'client_verify');
  reset role;
  set local role authenticated;
  perform public.cancel_registration(rp);
  reset role;
  assert (select status from public.registrations where id = rp) = 'refund_needed', 'paid cancel not refund_needed';
  set local role service_role;
  perform public.mark_refunded(rp, 'pay_P4SYNC00001', 'rfnd_P4SYNC00001', 19900, 'refund_api');
  reset role;
  assert (select array_agg(event_type order by seq) from private.external_sync_outbox where registration_id = rp)
       = array['registration.confirmed', 'registration.cancelled', 'payment.refunded'], 'paid transitions not queued in order';
  select * into o from private.external_sync_outbox where registration_id = rp order by seq limit 1;
  assert o.payload #>> '{registration,receipt_number}' ~ '^STW-' and o.payload #>> '{registration,razorpay_payment_id}' = 'pay_P4SYNC00001'
     and o.payload #>> '{registration,razorpay_order_id}' = 'order_P4SYNC00001'
     and (o.payload #>> '{registration,amount_paise}')::int = 19900 and o.payload #>> '{registration,paid_at}' is not null,
    'paid confirm payload incomplete: ' || o.payload::text;
  assert o.payload #>> '{attendee,email}' = 'p4-d2@test.local', 'paid confirm lacks attendee';
  select * into o from private.external_sync_outbox where registration_id = rp order by seq offset 1 limit 1;
  assert o.payload #>> '{registration,status}' = 'refund_needed' and not (o.payload ? 'attendee'), 'refund_needed cancel payload';
  select * into o from private.external_sync_outbox where registration_id = rp order by seq desc limit 1;
  assert o.payload #>> '{registration,razorpay_refund_id}' = 'rfnd_P4SYNC00001' and o.payload #>> '{registration,status}' = 'refunded'
     and o.payload #>> '{registration,refunded_at}' is not null and not (o.payload ? 'attendee'), 'refund payload incomplete';

  -- paid confirmed seat refunded directly: one payment.refunded, cancel_reason 'refunded' passed through
  perform set_config('request.jwt.claims', json_build_object('sub', d3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rq := (public.register_for_event(ep, '{}')->>'registration_id')::uuid;
  reset role;
  set local role service_role;
  perform public.attach_payment_order(d3, rq, 'order_P4SYNC00002', 19900);
  perform public.confirm_payment(rq, 'order_P4SYNC00002', 'pay_P4SYNC00002', 19900, 'INR', 'webhook');
  perform public.mark_refunded(rq, 'pay_P4SYNC00002', 'rfnd_P4SYNC00002', 19900, 'refund_api');
  reset role;
  assert (select array_agg(event_type order by seq) from private.external_sync_outbox where registration_id = rq)
       = array['registration.confirmed', 'payment.refunded'], 'confirmed -> refunded not queued';
  select * into o from private.external_sync_outbox where registration_id = rq order by seq desc limit 1;
  assert o.payload #>> '{registration,cancel_reason}' = 'refunded', 'refunded cancel_reason not passed through: ' || o.payload::text;

  -- deleting a confirmed free row (account deletion cascade) queues a cancellation
  delete from public.registrations where id = rf;
  select * into o from private.external_sync_outbox where registration_id = rf order by seq desc limit 1;
  assert o.event_type = 'registration.cancelled' and o.payload #>> '{registration,cancel_reason}' = 'account_deleted'
     and o.payload #>> '{registration,status}' = 'cancelled' and not (o.payload ? 'attendee'), 'delete not queued';
  assert (select count(*) from private.external_sync_outbox where registration_id = rf) = 4, 'delete queued twice';

  -- claim: oldest first, one row per registration (head-of-line), leased
  set local role service_role;
  b := public.claim_sync_batch(10);
  reset role;
  assert jsonb_array_length(b) = 3, 'expected the head row of each registration: ' || b::text;
  first_d1 := (select (x->>'id')::uuid from jsonb_array_elements(b) x where x->>'idempotency_key' like rf::text || ':%');
  first_d2 := (select (x->>'id')::uuid from jsonb_array_elements(b) x where x->>'idempotency_key' like rp::text || ':%');
  assert first_d1 is not null and first_d2 is not null, 'head rows missing from the batch';
  assert first_d1 = (select id from private.external_sync_outbox where registration_id = rf order by seq limit 1), 'not the oldest row';
  assert (b->0->>'attempts')::int = 1 and b->0->>'event_type' = 'registration.confirmed'
     and (b->0->>'id')::uuid = first_d1 and b->0 ? 'payload' and b->0 ? 'created_at', 'claim shape: ' || b::text;
  assert (select bool_and(locked_until > now() + interval '119 seconds' and locked_until <= now() + interval '2 minutes')
            from private.external_sync_outbox where id in (select (x->>'id')::uuid from jsonb_array_elements(b) x)),
    'claimed rows not leased for 2 minutes';
  set local role service_role;
  assert jsonb_array_length(public.claim_sync_batch(10)) = 0, 'leased or blocked rows claimed again';
  assert jsonb_array_length(public.claim_sync_batch(0)) = 0, 'limit 0 misbehaves';

  -- success, transient failure (backoff), permanent failure (dead)
  s := public.complete_sync(first_d1, true);
  assert s = 'sent', 'sent: ' || s;
  s := public.complete_sync(first_d2, false, false, repeat('x', 900));
  assert s = 'failed', 'failed: ' || s;
  reset role;
  select * into o from private.external_sync_outbox where id = first_d1;
  assert o.sent_at is not null and o.locked_until is null and o.last_error is null, 'sent row shape';
  select * into o from private.external_sync_outbox where id = first_d2;
  assert o.next_attempt_at between now() + interval '59 seconds' and now() + interval '61 seconds', 'first retry not in 1 minute';
  assert char_length(o.last_error) = 500 and o.locked_until is null, 'error not truncated / lease kept';
  -- the lease on d3's head row expires: it is claimable again
  update private.external_sync_outbox set locked_until = now() - interval '1 second'
   where registration_id = rq and status = 'pending' and seq = (select min(seq) from private.external_sync_outbox where registration_id = rq);
  set local role service_role;
  b := public.claim_sync_batch(10);
  assert jsonb_array_length(b) = 2, 'd1 second row + d3 expired lease expected, d2 waits for its retry: ' || b::text;
  assert exists (select 1 from jsonb_array_elements(b) x where x->>'idempotency_key' like rf::text || ':registration.cancelled:%'),
    'd1 second row should be next: ' || b::text;
  assert exists (select 1 from jsonb_array_elements(b) x where x->>'idempotency_key' like rq::text || ':registration.confirmed:%'
                 and (x->>'attempts')::int = 2), 'expired lease not reclaimed: ' || b::text;
  s := public.complete_sync((select (x->>'id')::uuid from jsonb_array_elements(b) x
                             where x->>'idempotency_key' like rf::text || ':%'), false, true, 'HTTP 422 conflict');
  assert s = 'dead', 'permanent failure not dead: ' || s;
  -- backoff doubles: 3rd attempt waits 4 minutes, capped at 6 hours
  reset role;
  update private.external_sync_outbox set attempts = 3 where id = first_d2;
  set local role service_role;
  s := public.complete_sync(first_d2, false);
  reset role;
  select * into o from private.external_sync_outbox where id = first_d2;
  assert s = 'failed' and o.next_attempt_at between now() + interval '239 seconds' and now() + interval '241 seconds'
     and o.last_error = 'error', 'backoff not doubling';
  update private.external_sync_outbox set attempts = 9, status = 'failed' where id = first_d2;
  set local role service_role;
  s := public.complete_sync(first_d2, false, false, 'HTTP 503');
  reset role;
  select * into o from private.external_sync_outbox where id = first_d2;
  -- 9th attempt: 1 min x 2^8 = 256 min (the 6 h cap is a guard; dead at 10 attempts comes first)
  assert s = 'failed' and o.next_attempt_at between now() + interval '256 minutes' - interval '1 second'
                                                 and now() + interval '256 minutes' + interval '1 second', 'backoff at attempt 9 wrong';
  update private.external_sync_outbox set attempts = 9, next_attempt_at = now() where id = first_d2;
  set local role service_role;
  b := public.claim_sync_batch(10);
  assert exists (select 1 from jsonb_array_elements(b) x where (x->>'id')::uuid = first_d2 and (x->>'attempts')::int = 10),
    'retry not claimed';
  s := public.complete_sync(first_d2, false, false, 'HTTP 503');
  assert s = 'dead', 'not dead after 10 attempts: ' || s;
  begin
    perform public.complete_sync(first_d1, true);
    assert false, 'completed a sent row twice';
  exception when others then if sqlerrm <> 'outbox_row_not_found' then raise; end if; end;
  begin
    perform public.complete_sync(gen_random_uuid(), true);
    assert false, 'completed an unknown row';
  exception when others then if sqlerrm <> 'outbox_row_not_found' then raise; end if; end;
  -- dead rows do not block their registration's next row
  b := public.claim_sync_batch(25);
  assert exists (select 1 from jsonb_array_elements(b) x where x->>'idempotency_key' like rp::text || ':registration.cancelled:%'),
    'dead head blocks the queue: ' || b::text;
  reset role;

  -- retention: payloads of rows sent > 30 days ago are emptied on the next claim; recent ones are kept
  update private.external_sync_outbox set sent_at = now() - interval '31 days' where id = first_d1;
  set local role service_role;
  perform public.claim_sync_batch(1);
  reset role;
  assert (select payload from private.external_sync_outbox where id = first_d1) = '{}'::jsonb, 'old sent payload not purged';
  assert (select payload from private.external_sync_outbox where id = first_d2) <> '{}'::jsonb, 'dead payload purged';

  -- no client access, no PostgREST exposure
  assert not has_table_privilege('authenticated', 'private.external_sync_outbox', 'select'), 'users read the outbox';
  assert not has_table_privilege('anon', 'private.external_sync_outbox', 'insert'), 'anon writes the outbox';
  assert not has_table_privilege('service_role', 'private.external_sync_outbox', 'select'), 'service_role reads the outbox directly';
  assert not has_table_privilege('service_role', 'private.external_sync_outbox', 'update'), 'service_role writes the outbox directly';
  assert not has_function_privilege('authenticated', 'public.claim_sync_batch(integer)', 'execute'), 'users claim the outbox';
  assert not has_function_privilege('anon', 'public.claim_sync_batch(integer)', 'execute'), 'anon claims the outbox';
  assert not has_function_privilege('authenticated', 'public.complete_sync(uuid, boolean, boolean, text)', 'execute'), 'users complete rows';
  assert not has_function_privilege('anon', 'public.complete_sync(uuid, boolean, boolean, text)', 'execute'), 'anon completes rows';
  assert not has_function_privilege('authenticated', 'private.claim_sync_batch(integer)', 'execute'), 'users reach the private claim';
  assert not has_function_privilege('authenticated', 'private.enqueue_registration_sync()', 'execute'), 'users run the enqueue';
  assert not has_function_privilege('service_role', 'private.enqueue_registration_sync()', 'execute'), 'service_role runs the enqueue';
  assert has_function_privilege('service_role', 'public.claim_sync_batch(integer)', 'execute'), 'service_role cannot claim';
  assert has_function_privilege('service_role', 'public.complete_sync(uuid, boolean, boolean, text)', 'execute'), 'service_role cannot complete';
  assert (select prosecdef from pg_proc where oid = 'public.claim_sync_batch(integer)'::regprocedure) = false
     and (select prosecdef from pg_proc where oid = 'private.claim_sync_batch(integer)'::regprocedure), 'definer/invoker split wrong';
  assert not exists (select 1 from private.external_sync_outbox where octet_length(payload::text) > 8192), 'oversized payload';

  -- exception safety: a broken outbox never blocks a registration (fault injected, rolled back with the script)
  old_id := (select id from private.external_sync_outbox order by seq desc limit 1);
  execute 'alter table private.external_sync_outbox add constraint p4_sync_fault check (event_type = ''never'') not valid';
  perform set_config('request.jwt.claims', json_build_object('sub', d4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r4 := (public.register_for_event(ef, '{}')->>'registration_id')::uuid;
  perform public.cancel_registration(r4);
  reset role;
  assert r4 is not null and (select status from public.registrations where id = r4) = 'cancelled',
    'registration failed because the outbox is broken';
  assert not exists (select 1 from private.external_sync_outbox where registration_id = r4), 'fault injection did not fault';
  assert (select id from private.external_sync_outbox order by seq desc limit 1) = old_id, 'unexpected outbox row';
end $$;

rollback;
select 'sync-outbox: all assertions passed' as result;
