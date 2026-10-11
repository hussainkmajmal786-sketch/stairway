-- Phase 5 Task 2: admin registration operations. Run as ONE execute_sql call; rolls back.
-- Users a601..a613 registrants, a614 super admin, a615 ras admin, a616 cs admin, a617 plain; a7xx fillers.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data)
select ('00000000-0000-0000-0000-00000000a6' || lpad(n::text, 2, '0'))::uuid, 'a6u' || lpad(n::text, 2, '0') || '@test.local',
       'authenticated', 'authenticated', jsonb_build_object('full_name', 'A6 User ' || lpad(n::text, 2, '0'))
from generate_series(1, 17) n;
insert into auth.users (id, email, aud, role, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000a7' || lpad(n::text, 3, '0'))::uuid, 'a7f' || n || '@test.local',
       'authenticated', 'authenticated', '{}'
from generate_series(1, 205) n;
update public.profile_private set phone = '9876543210'
 where user_id in ('00000000-0000-0000-0000-00000000a601', '00000000-0000-0000-0000-00000000a603');

insert into public.admin_roles (user_id, role, society_id)
select '00000000-0000-0000-0000-00000000a614'::uuid, 'super_admin'::public.admin_role, null::uuid
union all select '00000000-0000-0000-0000-00000000a615', 'society_admin', s.id from public.societies s where s.slug = 'ras'
union all select '00000000-0000-0000-0000-00000000a616', 'society_admin', s.id from public.societies s where s.slug = 'cs';

-- EV1 free, starts in 2h (inside the check-in window, promotion allowed), capacity 3
-- EVP paid; EVC starts in 3 days (outside window), EVD draft, EVW capacity 1, EVF filler
insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, price_paise, token_prefix)
select s.id, v.step, v.slug, v.slug, now() + v.st, now() + v.st + interval '6 hours', v.status::public.event_status,
       v.cap, v.price, 'A6'
from public.societies s,
  (values (9201, 'a6-ev1', interval '2 hours', 'published', 3, 0),
          (9202, 'a6-evp', interval '2 hours', 'published', 5, 9900),
          (9203, 'a6-evc', interval '3 days',  'published', 5, 9900),
          (9204, 'a6-evd', interval '2 hours', 'draft',     5, 0),
          (9205, 'a6-evw', interval '5 days',  'published', 1, 0),
          (9206, 'a6-evf', interval '5 days',  'published', 5, 0)) as v(step, slug, st, status, cap, price)
where s.slug = 'ras';

-- registrations (as table owner)
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, waitlist_position, confirmed_at)
select e.id, ('00000000-0000-0000-0000-00000000a6' || lpad(u.n::text, 2, '0'))::uuid, u.st::public.registration_status,
       private.new_ticket_code(), u.tok, u.pos, case when u.st = 'confirmed' then now() end
from public.events e,
  (values (1, 'confirmed', 1, null::int), (2, 'confirmed', 2, null), (3, 'confirmed', 3, null),
          (4, 'waitlisted', null, 1), (5, 'waitlisted', null, 2)) as u(n, st, tok, pos)
where e.slug = 'a6-ev1';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at, amount_paise,
                                  razorpay_payment_id, paid_at)
select e.id, '00000000-0000-0000-0000-00000000a606', 'confirmed', private.new_ticket_code(), 1, now(), 9900,
       'pay_a6fixture0001', now()
from public.events e where e.slug = 'a6-evp';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at, amount_paise, razorpay_payment_id, paid_at)
select e.id, '00000000-0000-0000-0000-00000000a607', 'confirmed', private.new_ticket_code(), 1, now(), 9900, 'pay_a6fixture0002', now()
from public.events e where e.slug = 'a6-evc';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
select e.id, '00000000-0000-0000-0000-00000000a608', 'confirmed', private.new_ticket_code(), 2, now()
from public.events e where e.slug = 'a6-evc';
insert into public.registrations (event_id, user_id, status, ticket_code, waitlist_position)
select e.id, '00000000-0000-0000-0000-00000000a609', 'waitlisted', private.new_ticket_code(), 1
from public.events e where e.slug = 'a6-evc';
insert into public.registrations (event_id, user_id, status, ticket_code, amount_paise, hold_expires_at)
select e.id, '00000000-0000-0000-0000-00000000a610', 'pending_payment', private.new_ticket_code(), 9900, now() + interval '10 minutes'
from public.events e where e.slug = 'a6-evc';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
select e.id, '00000000-0000-0000-0000-00000000a611', 'confirmed', private.new_ticket_code(), 1, now()
from public.events e where e.slug = 'a6-evw';
insert into public.registrations (event_id, user_id, status, ticket_code, waitlist_position)
select e.id, ('00000000-0000-0000-0000-00000000a6' || lpad(u.n::text, 2, '0'))::uuid, 'waitlisted', private.new_ticket_code(), u.pos
from public.events e, (values (12, 1), (13, 2)) as u(n, pos) where e.slug = 'a6-evw';
insert into public.registrations (event_id, user_id, status, ticket_code)
select e.id, ('00000000-0000-0000-0000-0000000a7' || lpad(n::text, 3, '0'))::uuid, 'cancelled', private.new_ticket_code()
from public.events e, generate_series(1, 205) n where e.slug = 'a6-evf';

do $$
declare
  ev1 uuid; evp uuid; evc uuid; evd uuid; evw uuid; evf uuid;
  s1 constant text := '{"sub":"00000000-0000-0000-0000-00000000a614","role":"authenticated"}';
  r1 constant text := '{"sub":"00000000-0000-0000-0000-00000000a615","role":"authenticated"}';
  c1 constant text := '{"sub":"00000000-0000-0000-0000-00000000a616","role":"authenticated"}';
  p1 constant text := '{"sub":"00000000-0000-0000-0000-00000000a617","role":"authenticated"}';
  reg1 uuid; reg2 uuid; reg3 uuid; reg4 uuid; reg5 uuid; regp uuid; reg7 uuid; reg8 uuid; reg9 uuid; reg10 uuid;
  code1 text; code8 text;
  r jsonb; n int; t timestamptz; old_t timestamptz;
begin
  select id into ev1 from public.events where slug = 'a6-ev1';
  select id into evp from public.events where slug = 'a6-evp';
  select id into evc from public.events where slug = 'a6-evc';
  select id into evd from public.events where slug = 'a6-evd';
  select id into evw from public.events where slug = 'a6-evw';
  select id into evf from public.events where slug = 'a6-evf';
  select id into reg1 from public.registrations where event_id = ev1 and user_id = '00000000-0000-0000-0000-00000000a601';
  select id into reg2 from public.registrations where event_id = ev1 and user_id = '00000000-0000-0000-0000-00000000a602';
  select id into reg3 from public.registrations where event_id = ev1 and user_id = '00000000-0000-0000-0000-00000000a603';
  select id into reg4 from public.registrations where event_id = ev1 and user_id = '00000000-0000-0000-0000-00000000a604';
  select id into reg5 from public.registrations where event_id = ev1 and user_id = '00000000-0000-0000-0000-00000000a605';
  select id into regp from public.registrations where event_id = evp;
  select id, ticket_code into reg8, code8 from public.registrations where event_id = evc and user_id = '00000000-0000-0000-0000-00000000a608';
  select ticket_code into code1 from public.registrations where id = reg1;

  -- ═══ scope: a cs admin and a plain user are refused by every function (random uuid refused identically) ═══
  set local role authenticated;
  perform set_config('request.jwt.claims', c1, true);
  begin perform public.admin_event_registrants(ev1); assert false, 'cs admin listed ras registrants';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_check_in(ev1, code1); assert false, 'cs admin checked in at a ras event';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_undo_check_in(reg1); assert false, 'cs admin undid a ras check-in';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_cancel_registration(reg1); assert false, 'cs admin cancelled a ras registration';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_promote_waitlist(ev1); assert false, 'cs admin promoted a ras waitlist';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_cancel_event(ev1); assert false, 'cs admin cancelled a ras event';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_event_registrants(gen_random_uuid()); assert false, 'random event id accepted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_cancel_registration(gen_random_uuid()); assert false, 'random registration id accepted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  perform set_config('request.jwt.claims', p1, true);
  begin perform public.admin_event_registrants(ev1); assert false, 'plain user listed registrants';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  assert (select count(*) from public.registrations where event_id = ev1 and status = 'confirmed') = 3,
    'a refused call changed registrations';

  -- ═══ registrants listing ═══
  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  r := public.admin_event_registrants(ev1);
  assert (r->>'total')::int = 5 and jsonb_array_length(r->'rows') = 5, 'ras admin registrants: ' || r::text;
  assert (select (x->>'email') from jsonb_array_elements(r->'rows') x where (x->>'registration_id')::uuid = reg3) = 'a6u03@test.local'
     and (select (x->>'phone') from jsonb_array_elements(r->'rows') x where (x->>'registration_id')::uuid = reg3) = '9876543210',
    'confirmed registrant lacks email/phone';
  assert not exists (select 1 from jsonb_array_elements(r->'rows') x where x ? 'ieee_member_id'), 'ieee id exposed';
  assert (public.admin_event_registrants(ev1, 'waitlisted')->>'total')::int = 2, 'status filter';
  assert (public.admin_event_registrants(ev1, null, 'User 03')->>'total')::int = 1, 'name search';
  assert (public.admin_event_registrants(ev1, null, '%')->>'total')::int = 0, 'LIKE wildcard % not escaped';
  assert (public.admin_event_registrants(ev1, null, '_')->>'total')::int = 0, 'LIKE wildcard _ not escaped';
  assert (public.admin_event_registrants(ev1, null, '2')->>'total')::int = 1, 'token search';
  assert jsonb_array_length(public.admin_event_registrants(ev1, null, null, 0, 0)->'rows') = 1, 'limit lower clamp';
  -- payment id: hidden from society admins, visible to super admins
  r := public.admin_event_registrants(evp);
  assert (r->'rows'->0->>'razorpay_payment_id') is null and (r->'rows'->0->>'receipt_number') is null
         and (r->'rows'->0->>'amount_paise')::int = 9900, 'society admin saw the payment id: ' || r::text;
  perform set_config('request.jwt.claims', s1, true);
  r := public.admin_event_registrants(evp);
  assert r->'rows'->0->>'razorpay_payment_id' = 'pay_a6fixture0001', 'super admin cannot see the payment id';
  -- limit clamp (205 fillers): 1000 -> 200 rows, total 205; offset reaches the rest
  r := public.admin_event_registrants(evf, null, null, 1000, 0);
  assert (r->>'total')::int = 205 and jsonb_array_length(r->'rows') = 200, 'limit not clamped to 200: ' || jsonb_array_length(r->'rows');
  assert jsonb_array_length(public.admin_event_registrants(evf, null, null, 1000, 200)->'rows') = 5, 'offset page';
  -- contact is withheld for dead statuses (cancelled filler)
  assert (public.admin_event_registrants(evf, null, null, 1, 0)->'rows'->0->>'email') is null, 'cancelled registrant contact leaked';
  reset role;

  -- ═══ check-in ═══
  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  r := public.admin_check_in(ev1, code1);
  assert r->>'result' = 'checked_in' and r->'attendee'->>'full_name' = 'A6 User 01', 'qr check-in: ' || r::text;
  reset role;
  assert (select checked_in_by from public.registrations where id = reg1) = '00000000-0000-0000-0000-00000000a615',
    'checked_in_by is not the admin';
  select checked_in_at into old_t from public.registrations where id = reg1;
  update public.registrations set checked_in_at = old_t - interval '1 hour' where id = reg1;
  select checked_in_at into old_t from public.registrations where id = reg1;
  set local role authenticated;
  r := public.admin_check_in(ev1, code1);
  assert r->>'result' = 'already_checked_in' and (r->>'checked_in_at')::timestamptz = old_t, 'rescan: ' || r::text;
  reset role;
  assert (select checked_in_at from public.registrations where id = reg1) = old_t, 'second scan overwrote the first check-in';
  set local role authenticated;
  -- typed token: confirm step first (row unchanged), then confirmed; wrong prefix refused, right prefix accepted
  r := public.admin_check_in(ev1, '2');
  assert r->>'result' = 'confirm_identity' and r->'attendee'->>'full_name' = 'A6 User 02', 'typed token: ' || r::text;
  reset role;
  assert (select checked_in_at from public.registrations where id = reg2) is null, 'confirm_identity changed the row';
  set local role authenticated;
  assert public.admin_check_in(ev1, 'ZZ-2')->>'result' = 'not_found', 'wrong-prefix token accepted';
  assert public.admin_check_in(ev1, 'a6-2')->>'result' = 'confirm_identity', 'correct-prefix token refused';
  r := public.admin_check_in(ev1, '2', null, true);
  assert r->>'result' = 'checked_in', 'confirmed token: ' || r::text;
  -- not confirmed, wrong event, window, draft, garbage
  assert public.admin_check_in(ev1, null, reg5)->>'result' = 'not_confirmed', 'waitlisted row checked in';
  assert public.admin_check_in(ev1, code8)->>'result' = 'not_found', 'qr of another event accepted';
  assert public.admin_check_in(evc, code8)->>'result' = 'outside_window', 'event in 3 days accepted';
  assert public.admin_check_in(evd, code1)->>'result' = 'event_not_open', 'draft event accepted';
  assert public.admin_check_in(ev1, 'hello!')->>'result' = 'invalid_code', 'garbage accepted';
  -- undo then re-check-in
  r := public.admin_undo_check_in(reg2);
  assert (r->>'registration_id')::uuid = reg2, 'undo: ' || r::text;
  begin perform public.admin_undo_check_in(reg2); assert false, 'undo of an open ticket accepted';
  exception when others then if sqlerrm <> 'not_checked_in' then raise; end if; end;
  assert public.admin_check_in(ev1, null, reg2)->>'result' = 'checked_in', 'manual check-in after undo';
  -- undo reaches only own society
  perform set_config('request.jwt.claims', c1, true);
  begin perform public.admin_undo_check_in(reg2); assert false, 'cs admin undid a check-in';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;

  -- ═══ cancel registration ═══
  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  begin perform public.admin_cancel_registration(reg1); assert false, 'cancelled a checked-in ticket';
  exception when others then if sqlerrm <> 'already_checked_in' then raise; end if; end;
  r := public.admin_cancel_registration(reg3);          -- free confirmed seat: cancelled, waitlist head promoted
  assert r->>'status' = 'cancelled' and (r->>'promoted')::int = 1, 'free cancel: ' || r::text;
  begin perform public.admin_cancel_registration(reg3); assert false, 'cancelled twice';
  exception when others then if sqlerrm <> 'not_cancellable' then raise; end if; end;
  -- same row: contact visible while confirmed (asserted above), gone once cancelled
  assert (select (x->>'email') from jsonb_array_elements(public.admin_event_registrants(ev1)->'rows') x
           where (x->>'registration_id')::uuid = reg3) is null, 'cancelled registrant contact leaked';
  r := public.admin_cancel_registration(regp);          -- paid confirmed seat: refund_needed
  assert r->>'status' = 'refund_needed', 'paid cancel: ' || r::text;
  reset role;
  assert (select status from public.registrations where id = reg4) = 'confirmed'
     and (select waitlist_position from public.registrations where id = reg5) = 1, 'waitlist head not promoted / compacted';
  assert (select cancel_reason from public.registrations where id = reg3) = 'admin'
     and (select cancel_reason from public.registrations where id = regp) = 'admin', 'cancel reason not admin';
  assert (select razorpay_payment_id from public.registrations where id = regp) = 'pay_a6fixture0001', 'refund_needed lost its payment id';

  -- ═══ answers only for live rows; an admin-cancelled hold is never revived by a late payment ═══
  update public.registrations set answers = '{"q":"x"}' where id in (reg2, reg3);
  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  r := public.admin_event_registrants(ev1);
  assert (select x->'answers' from jsonb_array_elements(r->'rows') x where (x->>'registration_id')::uuid = reg2) = '{"q":"x"}'::jsonb,
    'live registrant answers missing';
  assert (select x->'answers' from jsonb_array_elements(r->'rows') x where (x->>'registration_id')::uuid = reg3) = 'null'::jsonb,
    'cancelled registrant answers leaked';
  reset role;
  insert into public.registrations (id, event_id, user_id, status, ticket_code, amount_paise, hold_expires_at, razorpay_order_id)
    values ('00000000-0000-0000-0000-00000000a6c1', evp, '00000000-0000-0000-0000-00000000a612', 'pending_payment',
            private.new_ticket_code(), 9900, now() + interval '10 minutes', 'order_a6fixture0009');
  insert into private.payment_orders (razorpay_order_id, registration_id, amount_paise)
    values ('order_a6fixture0009', '00000000-0000-0000-0000-00000000a6c1', 9900);
  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  r := public.admin_cancel_registration('00000000-0000-0000-0000-00000000a6c1');
  assert r->>'status' = 'cancelled', 'admin cancel of a hold: ' || r::text;
  reset role;
  set local role service_role;
  r := public.confirm_payment('00000000-0000-0000-0000-00000000a6c1', 'order_a6fixture0009', 'pay_a6fixture0009', 9900, 'INR', 'client_verify');
  reset role;
  assert r->>'outcome' = 'refund_needed' and r->>'status' = 'refund_needed', 'late payment revived an admin-cancelled hold: ' || r::text;
  assert (select cancel_reason from public.registrations where id = '00000000-0000-0000-0000-00000000a6c1') = 'admin',
    'admin cancel reason lost';

  -- ═══ promote waitlist after a capacity raise ═══
  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  assert (public.admin_promote_waitlist(evw)->>'promoted')::int = 0, 'promoted with no free seat';
  reset role;
  update public.events set capacity = 3 where id = evw;
  set local role authenticated;
  assert (public.admin_promote_waitlist(evw)->>'promoted')::int = 2, 'capacity raise did not promote 2';
  assert (public.admin_promote_waitlist(evw)->>'promoted')::int = 0, 'second promote not a no-op';
  reset role;
  assert (select count(*) from public.registrations where event_id = evw and status = 'confirmed' and token_number is not null) = 3,
    'promoted rows lack tokens';

  -- ═══ cancel event ═══
  set local role authenticated;
  perform set_config('request.jwt.claims', r1, true);
  begin
    update public.events set status = 'cancelled' where id = ev1;
    assert false, 'plain update cancelled an event';
  exception when others then if sqlerrm <> 'use_cancel_event' then raise; end if; end;
  r := public.admin_cancel_event(evc);
  assert (r->>'cancelled')::int = 4 and (r->>'refund_needed')::int = 1 and (r->>'waitlisted')::int = 1, 'cancel event: ' || r::text;
  begin perform public.admin_cancel_event(evc); assert false, 'event cancelled twice';
  exception when others then if sqlerrm <> 'event_cancelled' then raise; end if; end;
  reset role;
  assert (select status from public.events where id = evc) = 'cancelled', 'event not cancelled';
  assert (select status from public.registrations where event_id = evc and user_id = '00000000-0000-0000-0000-00000000a607') = 'refund_needed'
     and (select count(*) from public.registrations where event_id = evc and status = 'cancelled'
            and cancel_reason = 'event_cancelled' and waitlist_position is null) = 3
     and (select count(*) from public.registrations where event_id = evc and status in ('confirmed', 'waitlisted', 'pending_payment')) = 0,
    'event cancellation row states wrong';
  assert (select status from public.events where id = ev1) = 'published', 'refused plain update changed the event';

  -- ═══ audit: one row per admin operation, none for check-ins ═══
  assert (select count(*) from public.audit_log where action = 'registration.cancelled' and target_id in (reg3::text, regp::text)) = 2,
    'registration cancellations not audited';
  assert exists (select 1 from public.audit_log where action = 'waitlist.promoted' and target_id = evw::text
                   and (summary->>'promoted')::int = 2), 'waitlist promotion not audited';
  assert exists (select 1 from public.audit_log where action = 'checkin.undone' and target_id = reg2::text), 'undo not audited';
  assert exists (select 1 from public.audit_log where action = 'event.cancelled' and target_id = evc::text
                   and (summary->>'refund_needed')::int = 1), 'event cancellation not audited';
  assert not exists (select 1 from public.audit_log where target_id = reg1::text), 'a check-in was audited';
  assert not exists (select 1 from public.audit_log where action like 'checkin%' and action <> 'checkin.undone'), 'check-in audit action exists';

  -- ═══ grants and shape ═══
  assert not has_function_privilege('anon', 'public.admin_check_in(uuid, text, uuid, boolean)', 'execute'), 'anon runs admin_check_in';
  assert not has_function_privilege('service_role', 'public.admin_cancel_event(uuid)', 'execute'), 'service_role runs admin_cancel_event';
  assert has_function_privilege('authenticated', 'public.admin_cancel_event(uuid)', 'execute'), 'authenticated lost admin_cancel_event';
  assert not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_%' and p.prosecdef),
    'a public admin wrapper is security definer';
  assert not exists (select 1 from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
                       and p.proname in ('admin_scope', 'admin_event_registrants', 'admin_check_in', 'admin_undo_check_in',
                                         'admin_cancel_registration', 'admin_promote_waitlist', 'admin_cancel_event')
                       and not coalesce(p.proconfig @> array['search_path=""'], false)), 'admin function lacks search_path';
end $$;

-- anon cannot call any of it
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.admin_event_registrants(gen_random_uuid()); assert false, 'anon listed registrants';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

rollback;
select 'admin-registrations: all assertions passed' as result;
