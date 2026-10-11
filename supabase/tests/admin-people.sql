-- Phase 5 Task 3: invite acceptance, anonymisation, payments-flag probe, overview. ONE execute_sql call; rolls back.
-- Users a801 super, a802 ras admin, a803 cs admin, a804 invitee, a805 stranger, a806 super invitee,
-- a807 anonymise target, a808 target with a live seat, a809 plain/registrant, a810 unconfirmed invitee.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data, email_confirmed_at)
select ('00000000-0000-0000-0000-00000000a8' || lpad(n::text, 2, '0'))::uuid, 'a8u' || lpad(n::text, 2, '0') || '@test.local',
       'authenticated', 'authenticated', jsonb_build_object('full_name', 'A8 User ' || lpad(n::text, 2, '0')),
       case when n = 10 then null else now() end
from generate_series(1, 11) n;

insert into public.admin_roles (user_id, role, society_id)
select '00000000-0000-0000-0000-00000000a801'::uuid, 'super_admin'::public.admin_role, null::uuid
union all select '00000000-0000-0000-0000-00000000a802', 'society_admin', s.id from public.societies s where s.slug = 'ras'
union all select '00000000-0000-0000-0000-00000000a803', 'society_admin', s.id from public.societies s where s.slug = 'cs';

-- invites (written as the service): valid society + super invites, wrong-account, expired, revoked, unconfirmed
insert into public.admin_invites (email, role, society_id, token_hash, created_by, created_at, expires_at, revoked_at)
select v.email, v.role::public.admin_role, case when v.soc then s.id end, repeat(v.h, 64),
       '00000000-0000-0000-0000-00000000a801', now() - v.age, now() + v.ttl, v.rev
from public.societies s,
  (values ('a8u04@test.local', 'society_admin', true,  '1', interval '1 hour', interval '6 days',  null::timestamptz),
          ('a8u06@test.local', 'super_admin',   false, '2', interval '1 hour', interval '6 days',  null),
          ('a8u04@test.local', 'society_admin', true,  '3', interval '1 hour', interval '6 days',  null),   -- wrong account
          ('a8u09@test.local', 'society_admin', true,  '4', interval '10 days', interval '-4 days', null),   -- expired
          ('a8u09@test.local', 'society_admin', true,  '5', interval '1 hour', interval '6 days',  now()), -- revoked
          ('a8u10@test.local', 'society_admin', true,  '6', interval '1 hour', interval '6 days',  null))  -- unconfirmed
    as v(email, role, soc, h, age, ttl, rev)
where s.slug = 'ras';

-- anonymisation target a807: full profile, private data, projects, experience, paid past seat + cancelled seat
update public.profiles set full_name = 'Target Person', headline = 'Builder', bio = 'bio text', college = 'CEK', branch = 'Civil',
       year = '3rd year', skills = array['SQL'], links = '{"github":"https://github.com/x"}',
       avatar_url = 'https://example.supabase.co/storage/v1/object/public/avatars/x.webp', onboarded = true
 where id = '00000000-0000-0000-0000-00000000a807';
update public.profile_private set phone = '9876543210', ieee_member_id = '12345678'
 where user_id = '00000000-0000-0000-0000-00000000a807';
insert into public.profile_projects (user_id, title) values ('00000000-0000-0000-0000-00000000a807', 'Project');
insert into public.profile_experience (user_id, title, organization, start_date)
  values ('00000000-0000-0000-0000-00000000a807', 'Intern', 'Acme', '2026-01-01');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000a807', 'a807', 'email', '{"sub":"a807"}', now(), now(), now());

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, price_paise, token_prefix)
select s.id, v.step, v.slug, v.slug, now() + v.st, now() + v.st + interval '6 hours', 'published', 10, v.price, 'A8'
from public.societies s join (values
    ('ras', 9301, 'a8-past',  interval '-3 days', 9900),
    ('ras', 9302, 'a8-fut',   interval '5 days',  9900),
    ('ras', 9303, 'a8-fut2',  interval '6 days',  0),
    ('cs',  9304, 'a8-cs',    interval '5 days',  5000)) as v(soc, step, slug, st, price) on v.soc = s.slug;

insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at, amount_paise,
                                  razorpay_order_id, razorpay_payment_id, paid_at, receipt_number, answers)
select e.id, '00000000-0000-0000-0000-00000000a807', 'confirmed', private.new_ticket_code(), 1, now(), 9900,
       'order_a8fixture0001', 'pay_a8fixture0001', now(), 'STW-2026-900001', '{"q":"secret answer"}'
from public.events e where e.slug = 'a8-past';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, answers)
select e.id, '00000000-0000-0000-0000-00000000a807', 'cancelled', private.new_ticket_code(), 1, '{"q":"other"}'
from public.events e where e.slug = 'a8-fut2';
insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000a807', 'confirmation_token', 'a8fixturetokenhash0001', 'a8u07@test.local');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-00000000a807', 'a8 factor', 'totp', 'unverified', now(), now());
insert into private.payment_orders (razorpay_order_id, registration_id, amount_paise, status, razorpay_payment_id, receipt_number, paid_at)
select 'order_a8fixture0001', r.id, 9900, 'paid', 'pay_a8fixture0001', 'STW-2026-900001', now()
from public.registrations r where r.razorpay_payment_id = 'pay_a8fixture0001';

-- a811: a past-event hold with a still-open ledger order (could be captured later)
insert into public.registrations (event_id, user_id, status, ticket_code, amount_paise, hold_expires_at, razorpay_order_id)
select e.id, '00000000-0000-0000-0000-00000000a811', 'pending_payment', private.new_ticket_code(), 9900,
       now() - interval '1 hour', 'order_a8fixture0005'
from public.events e where e.slug = 'a8-past';
insert into private.payment_orders (razorpay_order_id, registration_id, amount_paise)
select 'order_a8fixture0005', r.id, 9900 from public.registrations r where r.razorpay_order_id = 'order_a8fixture0005';

-- a808: a live future seat; overview fixtures on a8-fut (ras) and a8-cs
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
select e.id, '00000000-0000-0000-0000-00000000a808', 'confirmed', private.new_ticket_code(), 2, now()
from public.events e where e.slug = 'a8-fut2';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at, amount_paise,
                                  razorpay_payment_id, paid_at, checked_in_at)
select e.id, '00000000-0000-0000-0000-00000000a809', 'confirmed', private.new_ticket_code(), 1, now(), 9900,
       'pay_a8fixture0002', now(), now()
from public.events e where e.slug = 'a8-fut';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at, amount_paise)
select e.id, '00000000-0000-0000-0000-00000000a805', 'confirmed', private.new_ticket_code(), 2, now(), 7700   -- confirmed, never paid
from public.events e where e.slug = 'a8-fut';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at, amount_paise,
                                  razorpay_payment_id, paid_at, cancelled_at)
select e.id, '00000000-0000-0000-0000-00000000a806', 'refund_needed', private.new_ticket_code(), 3, now(), 9900,
       'pay_a8fixture0003', now(), now()
from public.events e where e.slug = 'a8-fut';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at, amount_paise,
                                  razorpay_payment_id, paid_at)
select e.id, '00000000-0000-0000-0000-00000000a809', 'confirmed', private.new_ticket_code(), 1, now(), 5000,
       'pay_a8fixture0004', now()
from public.events e where e.slug = 'a8-cs';

do $$
declare
  s1 constant text := '{"sub":"00000000-0000-0000-0000-00000000a801","role":"authenticated"}';
  r1 constant text := '{"sub":"00000000-0000-0000-0000-00000000a802","role":"authenticated"}';
  u4 constant text := '{"sub":"00000000-0000-0000-0000-00000000a804","role":"authenticated"}';
  u5 constant text := '{"sub":"00000000-0000-0000-0000-00000000a805","role":"authenticated"}';
  u6 constant text := '{"sub":"00000000-0000-0000-0000-00000000a806","role":"authenticated"}';
  u9 constant text := '{"sub":"00000000-0000-0000-0000-00000000a809","role":"authenticated"}';
  u10 constant text := '{"sub":"00000000-0000-0000-0000-00000000a810","role":"authenticated"}';
  ras uuid; cs uuid; r jsonb; n int; base_rev bigint; base_ref int; base_all_rev bigint;
  e_fut uuid; e_cs uuid; fx uuid[]; v_flag boolean;
begin
  select id into ras from public.societies where slug = 'ras';
  select id into cs from public.societies where slug = 'cs';
  select id into e_fut from public.events where slug = 'a8-fut';
  select id into e_cs from public.events where slug = 'a8-cs';
  select array_agg(id) into fx from public.events where slug like 'a8-%';

  -- ═══ invites ═══
  -- the confirmed-seat insert queued a Fund Easy payload carrying the attendee; it is still unsent
  assert exists (select 1 from private.external_sync_outbox o join public.registrations r on r.id = o.registration_id
                  where r.user_id = '00000000-0000-0000-0000-00000000a807' and o.status = 'pending' and o.payload ? 'attendee'),
    'fixture outbox row missing (outbox scrub would be vacuous)';

  set local role authenticated;
  perform set_config('request.jwt.claims', u4, true);
  r := public.accept_admin_invite(repeat('1', 64));
  assert r->>'role' = 'society_admin' and (r->>'society_id')::uuid = ras, 'society invite: ' || r::text;
  reset role;
  assert (select count(*) from public.admin_roles where user_id = '00000000-0000-0000-0000-00000000a804'
            and role = 'society_admin' and society_id = ras) = 1, 'role row not created exactly once';
  assert (select accepted_at is not null and accepted_by = '00000000-0000-0000-0000-00000000a804'
            from public.admin_invites where token_hash = repeat('1', 64)), 'invite not marked accepted';
  set local role authenticated;
  begin perform public.accept_admin_invite(repeat('1', 64)); assert false, 'invite replayed';
  exception when others then if sqlerrm <> 'invalid_invite' then raise; end if; end;
  -- wrong account: a805 holds a valid link addressed to a804's address
  perform set_config('request.jwt.claims', u5, true);
  begin perform public.accept_admin_invite(repeat('3', 64)); assert false, 'invite accepted by the wrong account';
  exception when others then if sqlerrm <> 'invalid_invite' then raise; end if; end;
  reset role;
  assert (select accepted_at is null from public.admin_invites where token_hash = repeat('3', 64)), 'wrong-account attempt consumed the invite';
  assert not exists (select 1 from public.admin_roles where user_id = '00000000-0000-0000-0000-00000000a805'), 'wrong account got a role';
  set local role authenticated;
  -- expired / revoked (their addressee a809 is confirmed, so only expiry / revocation can be the reason)
  perform set_config('request.jwt.claims', u9, true);
  begin perform public.accept_admin_invite(repeat('4', 64)); assert false, 'expired invite accepted';
  exception when others then if sqlerrm <> 'invalid_invite' then raise; end if; end;
  begin perform public.accept_admin_invite(repeat('5', 64)); assert false, 'revoked invite accepted';
  exception when others then if sqlerrm <> 'invalid_invite' then raise; end if; end;
  -- unconfirmed email
  perform set_config('request.jwt.claims', u10, true);
  begin perform public.accept_admin_invite(repeat('6', 64)); assert false, 'unconfirmed email accepted an invite';
  exception when others then if sqlerrm <> 'invalid_invite' then raise; end if; end;
  -- malformed hash / not signed in
  begin perform public.accept_admin_invite('not-a-hash'); assert false, 'malformed hash accepted';
  exception when others then if sqlerrm <> 'invalid_invite' then raise; end if; end;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin perform public.accept_admin_invite(repeat('2', 64)); assert false, 'anonymous-claims accept';
  exception when others then if sqlerrm <> 'not_signed_in' then raise; end if; end;
  -- super invite: a806 (confirmed) becomes super_admin
  perform set_config('request.jwt.claims', u6, true);
  r := public.accept_admin_invite(repeat('2', 64));
  assert r->>'role' = 'super_admin' and r->'society_id' = 'null'::jsonb, 'super invite: ' || r::text;
  reset role;
  assert exists (select 1 from public.admin_roles where user_id = '00000000-0000-0000-0000-00000000a806'
                   and role = 'super_admin' and society_id is null), 'super role not created';
  assert (select count(*) from public.audit_log where action = 'invite.accepted' and target_type = 'admin_invites') = 2,
    'invite acceptances not audited';
  -- anon cannot call it
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.accept_admin_invite(repeat('1', 64)); assert false, 'anon accepted an invite';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ═══ anonymise ═══
  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  begin perform public.anonymise_user('00000000-0000-0000-0000-00000000a807'); assert false, 'society admin anonymised a user';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  perform set_config('request.jwt.claims', s1, true);
  begin perform public.anonymise_user('00000000-0000-0000-0000-00000000a801'); assert false, 'anonymised self';
  exception when others then if sqlerrm <> 'admin_account' then raise; end if; end;
  begin perform public.anonymise_user('00000000-0000-0000-0000-00000000a802'); assert false, 'anonymised an admin';
  exception when others then if sqlerrm <> 'admin_account' then raise; end if; end;
  begin perform public.anonymise_user('00000000-0000-0000-0000-00000000a808'); assert false, 'anonymised a user with a live seat';
  exception when others then if sqlerrm <> 'open_registrations' then raise; end if; end;
  begin perform public.anonymise_user('00000000-0000-0000-0000-00000000a811'); assert false, 'anonymised a user with an open order';
  exception when others then if sqlerrm <> 'open_registrations' then raise; end if; end;
  begin perform public.anonymise_user(gen_random_uuid()); assert false, 'anonymised a missing user';
  exception when others then if sqlerrm <> 'user_not_found' then raise; end if; end;
  assert (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000a807') = 'Target Person',
    'a refused call changed the profile';
  r := public.anonymise_user('00000000-0000-0000-0000-00000000a807');
  assert (r->>'registrations_kept')::int = 2, 'anonymise: ' || r::text;
  r := public.anonymise_user('00000000-0000-0000-0000-00000000a807');
  assert (r->>'registrations_kept')::int = 2, 'second call not idempotent: ' || r::text;
  reset role;
  assert (select handle ~ '^deleted-[0-9a-f]{12}$' and full_name = 'Deleted user' and not onboarded and avatar_url is null
                and headline = '' and bio = '' and college = '' and branch = '' and year = '' and skills = '{}' and links = '{}'::jsonb
            from public.profiles where id = '00000000-0000-0000-0000-00000000a807'), 'profile not erased';
  assert (select email = '' and phone = '' and ieee_member_id = '' from public.profile_private
           where user_id = '00000000-0000-0000-0000-00000000a807'), 'private data not erased';
  assert not exists (select 1 from public.profile_projects where user_id = '00000000-0000-0000-0000-00000000a807')
     and not exists (select 1 from public.profile_experience where user_id = '00000000-0000-0000-0000-00000000a807'),
    'projects / experience remain';
  assert (select count(*) from public.registrations where user_id = '00000000-0000-0000-0000-00000000a807') = 2
     and (select status = 'confirmed' and amount_paise = 9900 and receipt_number = 'STW-2026-900001'
                 and razorpay_order_id = 'order_a8fixture0001' and razorpay_payment_id = 'pay_a8fixture0001' and answers = '{}'::jsonb
            from public.registrations r where r.razorpay_payment_id = 'pay_a8fixture0001'),
    'financial registration data not kept / answers not erased';
  assert (select answers = '{}'::jsonb from public.registrations r join public.events e on e.id = r.event_id
           where r.user_id = '00000000-0000-0000-0000-00000000a807' and e.slug = 'a8-fut2'), 'cancelled row answers remain';
  assert (select status = 'paid' and razorpay_payment_id = 'pay_a8fixture0001' from private.payment_orders
           where razorpay_order_id = 'order_a8fixture0001'), 'payment ledger touched';
  assert (select email like 'deleted-%@anonymised.invalid' and banned_until is not null and raw_user_meta_data = '{}'::jsonb
            from auth.users where id = '00000000-0000-0000-0000-00000000a807'), 'auth user not closed';
  assert not exists (select 1 from auth.identities where user_id = '00000000-0000-0000-0000-00000000a807'), 'identities remain';
  assert not exists (select 1 from auth.one_time_tokens where user_id = '00000000-0000-0000-0000-00000000a807')
     and not exists (select 1 from auth.mfa_factors where user_id = '00000000-0000-0000-0000-00000000a807'),
    'one-time tokens / mfa factors remain';
  assert exists (select 1 from private.external_sync_outbox o join public.registrations r on r.id = o.registration_id
                  where r.user_id = '00000000-0000-0000-0000-00000000a807' and o.status = 'pending')
     and not exists (select 1 from private.external_sync_outbox o join public.registrations r on r.id = o.registration_id
                      where r.user_id = '00000000-0000-0000-0000-00000000a807' and o.payload ? 'attendee')
     and not exists (select 1 from private.external_sync_outbox where payload::text ilike '%a8u07%' or payload::text ilike '%Target Person%'),
    'queued outbox payloads still carry the attendee';
  assert exists (select 1 from public.audit_log where action = 'user.anonymised'
                   and target_id = '00000000-0000-0000-0000-00000000a807'
                   and (summary->>'registrations_kept')::int = 2), 'anonymisation not audited';
  assert not exists (select 1 from public.audit_log where summary::text ilike '%Target Person%' or summary::text ilike '%a8u07%'),
    'audit leaked personal data';

  -- ═══ payments flag probe ═══
  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  begin perform public.admin_payments_flag(); assert false, 'society admin read the payments flag';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  perform set_config('request.jwt.claims', s1, true);
  v_flag := public.admin_payments_flag();
  reset role;
  assert v_flag is not null and v_flag = private.flag_enabled('payments'), 'super admin flag probe wrong';

  -- ═══ overview ═══
  -- independent baselines over the live (non-fixture) data of each scope
  select coalesce(sum(r.amount_paise), 0) into base_rev from public.registrations r join public.events e on e.id = r.event_id
   where e.society_id = ras and r.status = 'confirmed' and r.paid_at is not null and not (e.id = any(fx));
  select count(*) into base_ref from public.registrations r join public.events e on e.id = r.event_id
   where e.society_id = ras and r.status = 'refund_needed' and not (e.id = any(fx));
  select coalesce(sum(r.amount_paise), 0) into base_all_rev from public.registrations r
   where r.status = 'confirmed' and r.paid_at is not null and not (r.event_id = any(fx));

  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  r := public.admin_overview();
  assert (r->>'revenue_paise')::bigint = base_rev + 9900 + 9900, 'ras revenue should count only paid-confirmed (a8-past 9900 + a8-fut 9900): ' || r::text;
  assert (r->>'refunds_pending')::int = base_ref + 1, 'ras refunds pending: ' || r::text;
  assert exists (select 1 from jsonb_array_elements(r->'upcoming') x where (x->>'id')::uuid = e_fut), 'own upcoming event missing';
  assert not exists (select 1 from jsonb_array_elements(r->'upcoming') x where (x->>'id')::uuid = e_cs), 'foreign society event listed';
  assert (r->>'fill_rate')::numeric > 0 and (r->>'fill_rate')::numeric <= 1, 'fill rate: ' || r->>'fill_rate';
  assert r->'recent_checkins'->0->>'full_name' = 'A8 User 09' and r->'recent_checkins'->0->>'event' = 'a8-fut',
    'recent check-in missing: ' || (r->'recent_checkins')::text;
  assert (r->>'registrations_7d')::int >= 4, 'registrations_7d: ' || r::text;
  -- a society id the admin does not run yields nothing of that society
  r := public.admin_overview(cs);
  assert (r->>'revenue_paise')::bigint = 0 and jsonb_array_length(r->'upcoming') = 0 and (r->>'refunds_pending')::int = 0,
    'foreign society overview leaked: ' || r::text;
  -- super admin: all societies, then one society
  perform set_config('request.jwt.claims', s1, true);
  r := public.admin_overview();
  assert (r->>'revenue_paise')::bigint = base_all_rev + 9900 + 9900 + 5000, 'super revenue: ' || r::text;
  r := public.admin_overview(cs);
  assert (r->>'revenue_paise')::bigint = (select coalesce(sum(x.amount_paise), 0) from public.registrations x join public.events e on e.id = x.event_id
                                           where e.society_id = cs and x.status = 'confirmed' and x.paid_at is not null)
     and exists (select 1 from jsonb_array_elements(r->'upcoming') x where (x->>'id')::uuid = e_cs)
     and not exists (select 1 from jsonb_array_elements(r->'upcoming') x where (x->>'id')::uuid = e_fut),
    'super admin society-scoped overview: ' || r::text;
  -- a plain user (who has own registrations) sees zeros and nothing
  perform set_config('request.jwt.claims', u9, true);
  r := public.admin_overview();
  assert (r->>'registrations_7d')::int = 0 and (r->>'revenue_paise')::bigint = 0 and (r->>'refunds_pending')::int = 0
     and (r->>'fill_rate')::numeric = 0 and r->'upcoming' = '[]'::jsonb and r->'recent_checkins' = '[]'::jsonb,
    'plain user overview: ' || r::text;
  reset role;
  assert (select count(*) from public.registrations where user_id = '00000000-0000-0000-0000-00000000a809') = 2,
    'plain-user fixture missing (overview zero would be vacuous)';

  -- ═══ grants ═══
  assert not has_function_privilege('anon', 'public.anonymise_user(uuid)', 'execute'), 'anon anonymises';
  assert not has_function_privilege('service_role', 'public.anonymise_user(uuid)', 'execute'), 'service_role anonymises via SQL';
  assert has_function_privilege('authenticated', 'public.admin_overview(uuid)', 'execute'), 'overview not callable';
  assert not has_function_privilege('anon', 'public.admin_overview(uuid)', 'execute'), 'anon reads the overview';
  assert not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                       and p.proname in ('accept_admin_invite', 'anonymise_user', 'admin_payments_flag', 'admin_overview') and p.prosecdef),
    'a public people function is security definer';
  assert not exists (select 1 from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
                       and p.proname in ('accept_admin_invite', 'anonymise_user', 'admin_payments_flag', 'admin_overview')
                       and not coalesce(p.proconfig @> array['search_path=""'], false)), 'people function lacks search_path';
end $$;

-- a super admin removing their own role (another super admin exists) is still audited
do $$ begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a801","role":"authenticated"}', true);
  delete from public.admin_roles where user_id = '00000000-0000-0000-0000-00000000a801';
  assert exists (select 1 from public.audit_log where action = 'admin_roles.delete'
                   and actor_id = '00000000-0000-0000-0000-00000000a801'), 'self role removal not audited';
end $$;

rollback;
select 'admin-people: all assertions passed' as result;
