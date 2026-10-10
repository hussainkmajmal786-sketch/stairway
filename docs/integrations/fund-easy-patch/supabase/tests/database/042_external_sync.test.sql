-- PROPOSED — NOT APPLIED (sketch; adjust ids and the plan count when applying). Run: supabase test db
begin;
select plan(12);

insert into auth.users (id, email) values
  ('f4200001-0000-0000-0000-000000000001', 'admin42@test.com'),
  ('f4200001-0000-0000-0000-000000000002', 'buyer42@test.com');
insert into profiles (id, name, email, phone, role) values
  ('f4200001-0000-0000-0000-000000000001', 'Admin 42', 'admin42@test.com', '1', 'super_admin'),
  ('f4200001-0000-0000-0000-000000000002', 'Buyer 42', 'buyer42@test.com', '2', 'student')
on conflict (id) do update set role = excluded.role;

create temp table env as select jsonb_build_object(
  'contract_version', 1, 'id', '00000000-0000-4000-8000-000000000001', 'idempotency_key', 'k-confirm-1',
  'type', 'registration.confirmed', 'occurred_at', now(), 'source', 'stairway',
  'data', jsonb_build_object(
    'registration', jsonb_build_object('id', 'reg-42', 'status', 'confirmed', 'ticket_code', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'amount_paise', 19900, 'currency', 'INR', 'receipt_number', 'STW-2026-000042',
      'razorpay_order_id', 'order_FE42TEST0001', 'razorpay_payment_id', 'pay_FE42TEST0001', 'confirmed_at', now(), 'paid_at', now()),
    'event', jsonb_build_object('id', 'evt-42', 'slug', 'seeing-machines', 'title', 'Seeing Machines',
      'starts_at', now() + interval '10 days', 'ends_at', now() + interval '10 days 6 hours', 'venue', 'Lab 2',
      'capacity', 60, 'price_paise', 19900),
    'attendee', jsonb_build_object('email', 'buyer42@test.com', 'full_name', 'Buyer 42'))) as e;

-- 1-5: import creates the event, an inactive tier, a paid order, the ticket with st(AI)rway's code and the receipt
select is((select import_external_ticket(e, 'f4200001-0000-0000-0000-000000000002')->>'result' from env), 'imported', 'confirmed imports');
select is((select count(*)::int from events where external_ref = 'evt-42' and slug = 'stw-seeing-machines'), 1, 'event upserted by external_ref');
select is((select active from ticket_tiers t join events ev on ev.id = t.event_id where ev.external_ref = 'evt-42'), false, 'tier is never sold on Fund Easy');
select is((select code from tickets t join ticket_orders o on o.id = t.order_id where o.external_id = 'reg-42'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'ticket code = st(AI)rway code');
select is((select r.receipt_number from receipts r join ticket_orders o on o.receipt_id = r.id where o.external_id = 'reg-42'), 'STW-2026-000042', 'receipt imported');

-- 6: a replay returns the stored result
select is((select (import_external_ticket(e, 'f4200001-0000-0000-0000-000000000002')->>'replayed')::boolean from env), true, 'replay is not re-applied');

-- 7: no Fund Easy confirmation email was queued for the synced ticket
select is((select count(*)::int from notifications where type = 'ticket_confirmed' and user_id = 'f4200001-0000-0000-0000-000000000002'), 0, 'no duplicate confirmation');

-- 8-9: refunds of synced orders are refused here; the st(AI)rway refund message applies
select set_config('request.jwt.claims', '{"sub":"f4200001-0000-0000-0000-000000000001"}', true);
select throws_like(
  $$ select create_ticket_refund((select id from ticket_orders where external_id = 'reg-42'), 'test') $$,
  '%sold on st(AI)rway%', 'Fund Easy cannot refund a synced order');
select is((select import_external_ticket(jsonb_build_object('contract_version', 1, 'idempotency_key', 'k-refund-1',
  'type', 'payment.refunded', 'data', jsonb_build_object(
    'registration', jsonb_build_object('id', 'reg-42', 'status', 'refunded', 'razorpay_refund_id', 'rfnd_FE42TEST0001', 'refunded_at', now()),
    'event', jsonb_build_object('id', 'evt-42'))), null)->>'result'), 'refunded', 'refund message applies');

-- 10: a cancel for an unknown registration is ignored
select is((select import_external_ticket(jsonb_build_object('contract_version', 1, 'idempotency_key', 'k-cancel-x',
  'type', 'registration.cancelled', 'data', jsonb_build_object(
    'registration', jsonb_build_object('id', 'reg-unknown', 'status', 'cancelled'),
    'event', jsonb_build_object('id', 'evt-42'))), null)->>'result'), 'ignored', 'unknown registration ignored');

-- 11-12: only service_role may call the import
select ok(not has_function_privilege('authenticated', 'import_external_ticket(jsonb, uuid)', 'execute'), 'authenticated cannot import');
select ok(not has_function_privilege('anon', 'external_find_user(text)', 'execute'), 'anon cannot look up users');

select * from finish();
rollback;
