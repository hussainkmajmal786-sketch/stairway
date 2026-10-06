-- Phase 3 Task 2: register_for_event / cancel_registration. Run as ONE execute_sql call; rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'p3-f1@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay One"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'p3-f2@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Two"}'),
  ('00000000-0000-0000-0000-0000000000f3', 'p3-f3@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Three"}'),
  ('00000000-0000-0000-0000-0000000000f4', 'p3-f4@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Four"}'),
  ('00000000-0000-0000-0000-0000000000f5', 'p3-f5@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Five"}'),
  ('00000000-0000-0000-0000-0000000000f6', 'p3-f6@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Six"}'),
  ('00000000-0000-0000-0000-0000000000f7', 'p3-f7@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Seven"}');
-- f1..f6 finish onboarding; f7 does not
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3',
               '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f6');

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix,
                           questions, price_paise, registration_opens_at, registration_closes_at)
select s.id, v.step, v.slug, v.slug, now() + v.starts, now() + v.starts + interval '6 hours', v.status::public.event_status,
       v.capacity, 'RAS-' || v.step, v.questions::jsonb, v.price, now() + v.opens, now() + v.closes
from public.societies s,
  (values
    (92, 'p3-cap',    interval '10 days', 'published', 3,
       '[{"id":"laptop","label":"Laptop?","type":"single_choice","options":["Yes","No"],"required":true},{"id":"note","label":"Note","type":"text","required":false}]',
       0, null::interval, null::interval),
    (93, 'p3-past',   interval '-1 day',  'published', 10, '[]', 0,    null, null),
    (94, 'p3-window', interval '10 days', 'published', 10, '[]', 0,    null, interval '-1 hour'),
    (95, 'p3-soon',   interval '10 days', 'published', 10, '[]', 0,    interval '1 day', null),
    (96, 'p3-draft',  interval '10 days', 'draft',     10, '[]', 0,    null, null),
    (97, 'p3-paid',   interval '10 days', 'published', 10, '[]', 9900, null, null)
  ) as v(step, slug, starts, status, capacity, questions, price, opens, closes)
where s.slug = 'ras';

-- pure helpers
do $$
declare
  q constant jsonb := '[{"id":"fw","label":"F","type":"multi_choice","options":["A","B","C"],"required":true},{"id":"ok","label":"OK","type":"checkbox","required":true},{"id":"bio","label":"Bio","type":"textarea","required":false}]';
begin
  assert private.validate_answers(q, '{"fw":["A","C"],"ok":true}'), 'valid multi/checkbox answers rejected';
  assert private.validate_answers(q, '{"fw":["B"],"ok":true,"bio":""}'), 'empty optional textarea rejected';
  assert not private.validate_answers(q, '{"fw":[],"ok":true}'), 'empty required multi accepted';
  assert not private.validate_answers(q, '{"fw":["A","A"],"ok":true}'), 'duplicate choices accepted';
  assert not private.validate_answers(q, '{"fw":["D"],"ok":true}'), 'unknown choice accepted';
  assert not private.validate_answers(q, '{"fw":["A"],"ok":false}'), 'unticked required checkbox accepted';
  assert not private.validate_answers(q, '{"fw":["A"],"ok":"true"}'), 'string checkbox accepted';
  assert not private.validate_answers(q, jsonb_build_object('fw', jsonb_build_array('A'), 'ok', true, 'bio', repeat('x', 2001))),
    'over-long textarea accepted';
  assert private.validate_answers('[]', '{}'), 'empty questions with empty answers rejected';
  assert not private.validate_answers('[]', '[]'), 'array answers accepted';
  assert private.new_ticket_code() ~ '^[A-Z2-7]{26}$', 'ticket code is not 26-char base32';
  assert private.new_ticket_code() <> private.new_ticket_code(), 'ticket codes repeat';
end $$;

-- sequential saturation: capacity 3, five sign-ups → 3 confirmed (tokens 1..3) + waitlist #1, #2
do $$
declare
  cap uuid;
  r jsonb;
  n int;
  ans constant jsonb := '{"laptop":"Yes","note":""}';
begin
  select id into cap from public.events where slug = 'p3-cap';
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
  r := public.register_for_event(cap, ans);
  assert r->>'status' = 'confirmed', 'f1: ' || r::text;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
  r := public.register_for_event(cap, '{"laptop":"No"}');
  assert r->>'status' = 'confirmed', 'f2: ' || r::text;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
  r := public.register_for_event(cap, '{"laptop":"Yes"}');
  assert r->>'status' = 'confirmed', 'f3: ' || r::text;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true);
  r := public.register_for_event(cap, '{"laptop":"Yes"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 1, 'f4: ' || r::text;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f5","role":"authenticated"}', true);
  r := public.register_for_event(cap, '{"laptop":"No"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 2, 'f5: ' || r::text;
  reset role;

  select count(*) into n from public.registrations where event_id = cap and status = 'confirmed';
  assert n = 3, 'confirmed count should equal capacity (3), got ' || n;
  assert (select array_agg(token_number order by token_number) from public.registrations
          where event_id = cap and status = 'confirmed') = array[1, 2, 3], 'tokens are not 1..3';
  assert (select count(distinct ticket_code) from public.registrations where event_id = cap) = 5, 'ticket codes not unique';
  assert not exists (select 1 from public.registrations where event_id = cap and ticket_code !~ '^[A-Z2-7]{26}$'),
    'ticket code shape';
  assert (select answers from public.registrations where event_id = cap and user_id = '00000000-0000-0000-0000-0000000000f1') = ans,
    'answers not stored';
  assert (select seats_taken from public.event_seat_counts where event_id = cap) = 3, 'seat count view wrong';
  assert (select waitlisted from public.event_seat_counts where event_id = cap) = 2, 'waitlist count view wrong';
end $$;

-- rejections
do $$
declare
  cap uuid; past uuid; win uuid; soon uuid; draft uuid; paid uuid;
  n int;
begin
  select id into cap   from public.events where slug = 'p3-cap';
  select id into past  from public.events where slug = 'p3-past';
  select id into win   from public.events where slug = 'p3-window';
  select id into soon  from public.events where slug = 'p3-soon';
  select id into draft from public.events where slug = 'p3-draft';
  select id into paid  from public.events where slug = 'p3-paid';
  set local role authenticated;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes"}');
    assert false, 'duplicate registration accepted';
  exception when others then if sqlerrm <> 'already_registered' then raise; end if; end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes"}');
    assert false, 'waitlisted user registered twice';
  exception when others then if sqlerrm <> 'already_registered' then raise; end if; end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f6","role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{}');
    assert false, 'missing required answer accepted';
  exception when others then if sqlerrm <> 'invalid_answers' then raise; end if; end;
  begin
    perform public.register_for_event(cap, '{"laptop":"Maybe"}');
    assert false, 'unknown option accepted';
  exception when others then if sqlerrm <> 'invalid_answers' then raise; end if; end;
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes","extra":"x"}');
    assert false, 'answer to an unknown question accepted';
  exception when others then if sqlerrm <> 'invalid_answers' then raise; end if; end;
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes","note":5}');
    assert false, 'non-string text answer accepted';
  exception when others then if sqlerrm <> 'invalid_answers' then raise; end if; end;
  begin
    perform public.register_for_event(cap, '[{"laptop":"Yes"}]');
    assert false, 'non-object answers accepted';
  exception when others then if sqlerrm <> 'invalid_answers' then raise; end if; end;
  begin
    perform public.register_for_event(past, '{}');
    assert false, 'registration for a started event accepted';
  exception when others then if sqlerrm <> 'registration_closed' then raise; end if; end;
  begin
    perform public.register_for_event(win, '{}');
    assert false, 'registration after the closing time accepted';
  exception when others then if sqlerrm <> 'registration_closed' then raise; end if; end;
  begin
    perform public.register_for_event(soon, '{}');
    assert false, 'registration before the opening time accepted';
  exception when others then if sqlerrm <> 'not_open_yet' then raise; end if; end;
  begin
    perform public.register_for_event(draft, '{}');
    assert false, 'registration for a draft event accepted';
  exception when others then if sqlerrm <> 'event_not_found' then raise; end if; end;
  begin
    perform public.register_for_event(paid, '{}');
    assert false, 'paid event accepted on the free path';
  exception when others then if sqlerrm <> 'paid_event' then raise; end if; end;
  begin
    perform public.register_for_event(gen_random_uuid(), '{}');
    assert false, 'unknown event accepted';
  exception when others then if sqlerrm <> 'event_not_found' then raise; end if; end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f7","role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes"}');
    assert false, 'user without onboarding registered';
  exception when others then if sqlerrm <> 'not_onboarded' then raise; end if; end;

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes"}');
    assert false, 'registration without a user id accepted';
  exception when others then if sqlerrm <> 'not_signed_in' then raise; end if; end;
  reset role;

  select count(*) into n from public.registrations where event_id in (past, win, soon, draft, paid);
  assert n = 0, 'a rejected registration left a row';
  select count(*) into n from public.registrations where user_id in ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f7');
  assert n = 0, 'rejected users have rows';

  assert not has_function_privilege('anon', 'public.register_for_event(uuid, jsonb)', 'execute'), 'anon can execute register_for_event';
  assert not has_function_privilege('anon', 'public.cancel_registration(uuid)', 'execute'), 'anon can execute cancel_registration';
  assert has_function_privilege('authenticated', 'public.register_for_event(uuid, jsonb)', 'execute'), 'authenticated cannot register';
  assert has_function_privilege('authenticated', 'public.cancel_registration(uuid)', 'execute'), 'authenticated cannot cancel';
  assert not has_function_privilege('authenticated', 'private.promote_waitlist(uuid)', 'execute'), 'promote_waitlist is callable';
  assert not has_function_privilege('authenticated', 'private.compact_waitlist(uuid)', 'execute'), 'compact_waitlist is callable';
  assert not has_function_privilege('authenticated', 'private.seats_taken(uuid)', 'execute'), 'seats_taken is callable';
  assert not has_function_privilege('authenticated', 'private.validate_answers(jsonb, jsonb)', 'execute'), 'validate_answers is callable';
  assert not has_function_privilege('authenticated', 'private.new_ticket_code()', 'execute'), 'new_ticket_code is callable';
  assert not has_function_privilege('service_role', 'public.register_for_event(uuid, jsonb)', 'execute'), 'service_role can register';
  assert not has_function_privilege('service_role', 'public.cancel_registration(uuid)', 'execute'), 'service_role can cancel';
  -- The definer bodies live in the unexposed private schema; the public RPCs are invoker wrappers (advisor lint 0029).
  assert has_function_privilege('authenticated', 'private.register_for_event(uuid, jsonb)', 'execute'), 'wrapper target not executable';
  assert has_function_privilege('authenticated', 'private.cancel_registration(uuid)', 'execute'), 'wrapper target not executable';
  assert not has_function_privilege('anon', 'private.register_for_event(uuid, jsonb)', 'execute'), 'anon can run the register body';
  assert not has_function_privilege('anon', 'private.cancel_registration(uuid)', 'execute'), 'anon can run the cancel body';
  assert not has_function_privilege('service_role', 'private.register_for_event(uuid, jsonb)', 'execute'), 'service_role can run the register body';
  assert not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                       and p.proname in ('register_for_event', 'cancel_registration') and p.prosecdef),
    'a public RPC is security definer';
  assert (select count(*) from pg_proc p where p.pronamespace = 'private'::regnamespace
            and p.proname in ('register_for_event', 'cancel_registration') and p.prosecdef) = 2,
    'private RPC bodies are not security definer';
  assert not exists (select 1 from pg_proc p
                     where p.proname in ('register_for_event', 'cancel_registration', 'new_ticket_code', 'seats_taken',
                                         'validate_answers', 'compact_waitlist', 'promote_waitlist')
                       and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
                       and not coalesce(p.proconfig @> array['search_path=""'], false)),
    'a registration function lacks search_path=''''';
  assert not exists (select 1 from pg_proc p
                     where p.proname in ('new_ticket_code', 'seats_taken', 'validate_answers', 'compact_waitlist', 'promote_waitlist')
                       and p.pronamespace = 'private'::regnamespace
                       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute'))),
    'a private helper is executable by anon or service_role';
end $$;

-- anon cannot even call the RPC
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.register_for_event(gen_random_uuid(), '{}');
    assert false, 'anon executed register_for_event';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- cancel rules and waitlist promotion order
do $$
declare
  cap uuid; past uuid;
  f1 constant uuid := '00000000-0000-0000-0000-0000000000f1';
  f2 constant uuid := '00000000-0000-0000-0000-0000000000f2';
  f3 constant uuid := '00000000-0000-0000-0000-0000000000f3';
  f4 constant uuid := '00000000-0000-0000-0000-0000000000f4';
  f5 constant uuid := '00000000-0000-0000-0000-0000000000f5';
  f6 constant uuid := '00000000-0000-0000-0000-0000000000f6';
  reg_f1 uuid; reg_f2 uuid; reg_f3 uuid; reg_f5 uuid; reg_past uuid;
  old_code text;
  r jsonb;
begin
  select id into cap  from public.events where slug = 'p3-cap';
  select id into past from public.events where slug = 'p3-past';
  select id into reg_f1 from public.registrations where event_id = cap and user_id = f1;
  select id into reg_f2 from public.registrations where event_id = cap and user_id = f2;
  select id into reg_f3 from public.registrations where event_id = cap and user_id = f3;
  select id into reg_f5 from public.registrations where event_id = cap and user_id = f5;

  -- f2 cancels a confirmed seat → f4 (#1) is promoted, f5 moves up to #1
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  r := public.cancel_registration(reg_f2);
  assert (r->>'promoted')::int = 1, 'cancelling a confirmed seat did not promote: ' || r::text;
  assert (select status from public.registrations where id = reg_f2) = 'cancelled', 'f2 not cancelled';
  begin
    perform public.cancel_registration(reg_f2);
    assert false, 'a registration was cancelled twice';
  exception when others then if sqlerrm <> 'not_cancellable' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  begin
    perform public.cancel_registration(reg_f3);
    assert false, 'cancelled someone else''s registration';
  exception when others then if sqlerrm <> 'registration_not_found' then raise; end if; end;
  reset role;

  assert (select status from public.registrations where event_id = cap and user_id = f4) = 'confirmed', 'f4 (#1) not promoted';
  assert (select token_number from public.registrations where event_id = cap and user_id = f4) = 4,
    'promoted seat should get the next token (4); tokens are never reused';
  assert (select waitlist_position from public.registrations where event_id = cap and user_id = f4) is null, 'promoted row kept a position';
  assert (select waitlist_position from public.registrations where event_id = cap and user_id = f5) = 1, 'f5 should move up to #1';
  assert (select count(*) from public.registrations where event_id = cap and status = 'confirmed') = 3, 'capacity broken after promotion';

  -- f5 leaves the waitlist (no promotion); f6 joins at #1; f2 re-registers at #2 with a fresh ticket code
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f5, 'role', 'authenticated')::text, true);
  r := public.cancel_registration(reg_f5);
  assert (r->>'promoted')::int = 0, 'leaving the waitlist promoted someone: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', f6, 'role', 'authenticated')::text, true);
  r := public.register_for_event(cap, '{"laptop":"Yes"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 1, 'f6: ' || r::text;
  reset role;
  select ticket_code into old_code from public.registrations where id = reg_f2;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  r := public.register_for_event(cap, '{"laptop":"No"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 2, 'f2 re-register: ' || r::text;
  assert (r->>'registration_id')::uuid = reg_f2, 're-registration should reuse the cancelled row';

  -- f3 cancels → f6 (#1) is promoted before f2 (#2)
  perform set_config('request.jwt.claims', json_build_object('sub', f3, 'role', 'authenticated')::text, true);
  r := public.cancel_registration(reg_f3);
  assert (r->>'promoted')::int = 1, 'f3 cancel did not promote: ' || r::text;
  reset role;
  assert (select status from public.registrations where event_id = cap and user_id = f6) = 'confirmed',
    'waitlist order not respected: f6 (#1) should be promoted first';
  assert (select token_number from public.registrations where event_id = cap and user_id = f6) = 5, 'f6 should get token 5';
  assert (select status from public.registrations where id = reg_f2) = 'waitlisted', 'f2 should still be waiting';
  assert (select waitlist_position from public.registrations where id = reg_f2) = 1, 'f2 should now be #1';
  assert (select ticket_code from public.registrations where id = reg_f2) <> old_code, 're-registration kept the old ticket code';

  -- capacity raised by an admin: the next sign-up first promotes the waitlist head (f2 keeps token 2), then queues
  update public.events set capacity = 4 where id = cap;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f5, 'role', 'authenticated')::text, true);
  r := public.register_for_event(cap, '{"laptop":"Yes"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 1, 'f5 after capacity raise: ' || r::text;
  reset role;
  assert (select status from public.registrations where id = reg_f2) = 'confirmed', 'waiting f2 not promoted before a newcomer';
  assert (select token_number from public.registrations where id = reg_f2) = 2, 'returning f2 should keep token 2';
  assert (select count(*) from public.registrations where event_id = cap and status = 'confirmed') = 4, 'capacity 4 not filled exactly';

  -- started event and checked-in ticket cannot be cancelled
  insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
    values (past, f1, 'confirmed', 'PPPPPPPPPPPPPPPPPPPPPPPPPP', 1, now())
    returning id into reg_past;
  update public.registrations set checked_in_at = now() where id = reg_f1;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  begin
    perform public.cancel_registration(reg_past);
    assert false, 'cancelled after the event started';
  exception when others then if sqlerrm <> 'event_started' then raise; end if; end;
  begin
    perform public.cancel_registration(reg_f1);
    assert false, 'cancelled a checked-in ticket';
  exception when others then if sqlerrm <> 'not_cancellable' then raise; end if; end;
  reset role;

  -- deferred uniqueness (waitlist positions) holds at commit time
  set constraints all immediate;
  assert not exists (select 1 from public.events e
                     where e.slug in ('p3-cap', 'p3-past', 'p3-window', 'p3-soon', 'p3-draft', 'p3-paid')
                       and (select count(*) from public.registrations x where x.event_id = e.id and x.status = 'confirmed') > e.capacity),
    'an event is over capacity';
  -- waitlist positions on the fixture event are dense 1..n
  assert (select coalesce(array_agg(waitlist_position order by waitlist_position), '{}') from public.registrations
          where event_id = cap and status = 'waitlisted') = array[1], 'waitlist is not dense 1..n';
  -- tokens on the fixture event were never reused: every non-null token is distinct and the max is 5
  assert (select count(token_number) = count(distinct token_number) and max(token_number) = 5
          from public.registrations where event_id = cap), 'token numbers reused';
end $$;

rollback;
select 'registrations-rpc: all assertions passed' as result;
