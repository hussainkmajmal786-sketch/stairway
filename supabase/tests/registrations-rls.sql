-- Phase 3 Task 1: registrations grants, RLS, seat counts and attendee view. Run as ONE execute_sql call; rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'p3-owner@test.local',     'authenticated', 'authenticated', '{"full_name":"Reg Owner"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'p3-other@test.local',     'authenticated', 'authenticated', '{"full_name":"Reg Other"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'p3-cs-admin@test.local',  'authenticated', 'authenticated', '{"full_name":"Cs Admin"}'),
  ('00000000-0000-0000-0000-0000000000e4', 'p3-ras-admin@test.local', 'authenticated', 'authenticated', '{"full_name":"Ras Admin"}'),
  ('00000000-0000-0000-0000-0000000000e5', 'p3-spare@test.local',     'authenticated', 'authenticated', '{"full_name":"Reg Spare"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2',
               '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4');
insert into public.admin_roles (user_id, role, society_id)
  select '00000000-0000-0000-0000-0000000000e3', 'society_admin', id from public.societies where slug = 'cs';
insert into public.admin_roles (user_id, role, society_id)
  select '00000000-0000-0000-0000-0000000000e4', 'society_admin', id from public.societies where slug = 'ras';

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix)
  select id, 90, 'p3-rls-event', 'P3 RLS event', now() + interval '10 days', now() + interval '10 days 6 hours', 'published', 10, 'RAS-90'
  from public.societies where slug = 'ras';
insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix)
  select id, 91, 'p3-rls-draft', 'P3 RLS draft', now() + interval '10 days', now() + interval '10 days 6 hours', 'draft', 10, 'RAS-91'
  from public.societies where slug = 'ras';

-- rows written as the table owner (users cannot write registrations)
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
  select id, '00000000-0000-0000-0000-0000000000e1', 'confirmed', 'AAAAAAAAAAAAAAAAAAAAAAAAAA', 1, now()
  from public.events where slug = 'p3-rls-event';
insert into public.registrations (event_id, user_id, status, ticket_code, waitlist_position)
  select id, '00000000-0000-0000-0000-0000000000e2', 'waitlisted', 'BBBBBBBBBBBBBBBBBBBBBBBBBB', 1
  from public.events where slug = 'p3-rls-event';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
  select id, '00000000-0000-0000-0000-0000000000e2', 'confirmed', 'CCCCCCCCCCCCCCCCCCCCCCCCCC', 1, now()
  from public.events where slug = 'p3-rls-draft';
-- an expired payment hold (must not take a seat) and a cancelled registrant (must not be listed as attending)
insert into public.registrations (event_id, user_id, status, ticket_code, hold_expires_at)
  select id, '00000000-0000-0000-0000-0000000000e5', 'pending_payment', 'HHHHHHHHHHHHHHHHHHHHHHHHHH', now() - interval '1 minute'
  from public.events where slug = 'p3-rls-event';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at, cancelled_at)
  select id, '00000000-0000-0000-0000-0000000000e4', 'cancelled', 'IIIIIIIIIIIIIIIIIIIIIIIIII', 2, now(), now()
  from public.events where slug = 'p3-rls-event';

-- structure and privileges
do $$ begin
  assert not has_table_privilege('anon', 'public.registrations', 'select'), 'anon can select registrations';
  assert has_table_privilege('authenticated', 'public.registrations', 'select'), 'authenticated lost select on registrations';
  assert not has_any_column_privilege('authenticated', 'public.registrations', 'insert'), 'authenticated can insert registrations';
  assert not has_any_column_privilege('authenticated', 'public.registrations', 'update'), 'authenticated can update registrations';
  assert not has_table_privilege('authenticated', 'public.registrations', 'delete'), 'authenticated can delete registrations';
  assert not has_table_privilege('authenticated', 'public.registrations', 'truncate'), 'authenticated can truncate registrations';
  assert not has_any_column_privilege('anon', 'public.registrations', 'insert'), 'anon can insert registrations';
  assert not has_table_privilege('anon', 'public.event_attendees', 'select'), 'anon can select event_attendees';
  assert has_table_privilege('authenticated', 'public.event_attendees', 'select'), 'authenticated cannot select event_attendees';
  assert has_table_privilege('anon', 'public.event_seat_counts', 'select'), 'anon lost select on event_seat_counts';
  assert has_table_privilege('authenticated', 'public.event_seat_counts', 'select'), 'authenticated lost select on event_seat_counts';
  assert not has_table_privilege('authenticated', 'public.event_seat_counts', 'insert'), 'authenticated can insert into event_seat_counts';
  assert not has_table_privilege('authenticated', 'public.event_seat_counts', 'update'), 'authenticated can update event_seat_counts';
  assert not has_table_privilege('authenticated', 'public.event_seat_counts', 'delete'), 'authenticated can delete from event_seat_counts';
  assert not has_table_privilege('anon', 'public.event_seat_counts', 'insert'), 'anon can insert into event_seat_counts';
  assert not has_table_privilege('anon', 'public.event_seat_counts', 'update'), 'anon can update event_seat_counts';
  assert not has_table_privilege('anon', 'public.event_seat_counts', 'delete'), 'anon can delete from event_seat_counts';
  assert not has_any_column_privilege('authenticated', 'public.event_seat_counts', 'update'), 'authenticated has column update on event_seat_counts';
  assert not has_any_column_privilege('anon', 'public.event_seat_counts', 'update'), 'anon has column update on event_seat_counts';
  assert (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'event_attendees')
         = array['event_id', 'handle', 'full_name', 'avatar_url', 'headline'],
    'event_attendees exposes unexpected columns';
  assert (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'event_seat_counts')
         = array['event_id', 'seats_taken', 'waitlisted'],
    'event_seat_counts columns changed';
  assert not has_function_privilege('anon', 'private.event_attendees()', 'execute'), 'anon can execute private.event_attendees';
  assert not has_function_privilege('anon', 'private.questions_valid(jsonb)', 'execute'), 'anon can execute questions_valid';
  assert has_function_privilege('authenticated', 'private.questions_valid(jsonb)', 'execute'), 'authenticated cannot execute questions_valid';
  assert has_function_privilege('service_role', 'private.questions_valid(jsonb)', 'execute'), 'service_role cannot execute questions_valid';

  -- question schema checks
  assert private.questions_valid('[]'), 'empty question list rejected';
  assert private.questions_valid('[{"id":"laptop","label":"Laptop?","type":"single_choice","options":["Yes","No"],"required":true},{"id":"goal","label":"Goal","help":"h","type":"textarea","required":false}]'),
    'valid questions rejected';
  assert not private.questions_valid('{}'), 'object accepted as question list';
  assert not private.questions_valid('[{"id":"laptop","label":"Laptop?","type":"single_choice","options":["Yes"],"required":true}]'), 'one-option choice accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"single_choice","options":["X","X"],"required":true}]'), 'duplicate options accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"text","required":true},{"id":"a","label":"B","type":"text","required":false}]'), 'duplicate ids accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"file","required":true}]'), 'file type accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"text","required":true,"extra":1}]'), 'unknown key accepted';
  assert not private.questions_valid('[{"id":"A b","label":"A","type":"text","required":true}]'), 'bad id accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"text","required":true,"options":["x","y"]}]'), 'options on a text question accepted';
  assert not private.questions_valid('[{"id":"a","label":" ","type":"text","required":true}]'), 'blank label accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"text","required":"yes"}]'), 'non-boolean required accepted';
  -- stored values must already be trimmed (the zod mirror trims label and options)
  assert not private.questions_valid('[{"id":"a","label":"A","type":"single_choice","options":["Yes ","No"],"required":true}]'), 'padded option accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"single_choice","options":["Yes","Yes "],"required":true}]'), 'option equal after trim accepted';
  assert not private.questions_valid('[{"id":"a","label":" Padded","type":"text","required":true}]'), 'padded label accepted';
  assert not private.questions_valid('[{"id":"a","label":"Tab\t","type":"text","required":true}]'), 'label with trailing tab accepted';
  assert not private.questions_valid(jsonb_build_array(jsonb_build_object('id', 'a', 'label', 'A' || chr(160), 'type', 'text', 'required', true))),
    'label with trailing no-break space accepted';
  assert not private.questions_valid(jsonb_build_array(jsonb_build_object('id', 'a', 'label', repeat(' ', 5000) || 'A', 'type', 'text', 'required', true))),
    'whitespace-padded oversized label accepted';
  assert private.questions_valid('[{"id":"a","label":"Two words","help":" free-form help ","type":"single_choice","options":["Yes, sure","No"],"required":true}]'),
    'inner spaces / untrimmed help rejected (zod does not trim help)';
end $$;

-- table constraints (as owner)
do $$ declare ev uuid; begin
  select id into ev from public.events where slug = 'p3-rls-event';
  begin
    update public.events set questions = '[{"id":"a","label":"A","type":"file","required":true}]' where id = ev;
    assert false, 'invalid questions stored on an event';
  exception when check_violation then null; end;
  begin
    update public.events set token_prefix = 'bad prefix!' where id = ev;
    assert false, 'bad token_prefix accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code)
      values (ev, '00000000-0000-0000-0000-0000000000e3', 'waitlisted', 'DDDDDDDDDDDDDDDDDDDDDDDDDD');
    assert false, 'waitlisted row without a position accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code)
      values (ev, '00000000-0000-0000-0000-0000000000e3', 'confirmed', 'DDDDDDDDDDDDDDDDDDDDDDDDDD');
    assert false, 'confirmed row without a token accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, token_number)
      values (ev, '00000000-0000-0000-0000-0000000000e3', 'confirmed', 'lowercase-not-base32-00000', 7);
    assert false, 'malformed ticket code accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, token_number)
      values (ev, '00000000-0000-0000-0000-0000000000e1', 'confirmed', 'EEEEEEEEEEEEEEEEEEEEEEEEEE', 9);
    assert false, 'second registration for the same user and event accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, token_number)
      values (ev, '00000000-0000-0000-0000-0000000000e3', 'confirmed', 'FFFFFFFFFFFFFFFFFFFFFFFFFF', 1);
    assert false, 'duplicate token number accepted';
  exception when unique_violation then null; end;
end $$;

-- owner e1: own row only, no direct writes, attendee view, seat counts, profile_private still private
do $$ declare n int; ev uuid; draft uuid; begin
  select id into ev from public.events where slug = 'p3-rls-event';
  select id into draft from public.events where slug = 'p3-rls-draft';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
  set local role authenticated;

  select count(*) into n from public.registrations;
  assert n = 1, 'owner should see exactly their own registration, saw ' || n;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, token_number)
      values (ev, '00000000-0000-0000-0000-0000000000e1', 'confirmed', 'GGGGGGGGGGGGGGGGGGGGGGGGGG', 5);
    assert false, 'user inserted a registration directly';
  exception when insufficient_privilege then null; end;
  begin
    update public.registrations set status = 'cancelled' where user_id = '00000000-0000-0000-0000-0000000000e1';
    assert false, 'user updated a registration directly';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.registrations where user_id = '00000000-0000-0000-0000-0000000000e1';
    assert false, 'user deleted a registration directly';
  exception when insufficient_privilege then null; end;

  -- e2 (waitlisted), e4 (cancelled) and e5 (expired hold) are not attending
  select count(*) into n from public.event_attendees where event_id = ev;
  assert n = 1, 'attendee list should show only the 1 confirmed registrant, got ' || n;
  assert not exists (select 1 from public.event_attendees a join public.profiles p on p.handle = a.handle
                     where a.event_id = ev and p.id = '00000000-0000-0000-0000-0000000000e4'),
    'cancelled registrant listed as attending';
  assert (select handle from public.event_attendees where event_id = ev)
         = (select handle from public.profiles where id = '00000000-0000-0000-0000-0000000000e1'),
    'attendee list shows the wrong person';
  select count(*) into n from public.event_attendees where event_id = draft;
  assert n = 0, 'attendees of a draft event leaked';

  assert (select seats_taken from public.event_seat_counts where event_id = ev) = 1,
    'seats_taken should be 1 (expired hold and cancelled seat must not count)';
  assert (select waitlisted from public.event_seat_counts where event_id = ev) = 1, 'waitlisted should be 1';
  select count(*) into n from public.event_seat_counts where event_id = draft;
  assert n = 0, 'seat counts of a draft event leaked';

  select count(*) into n from public.profile_private where user_id <> '00000000-0000-0000-0000-0000000000e1';
  assert n = 0, 'profile_private of other users leaked';
  reset role;
end $$;

-- e2 sees both own rows (including the draft event's), nothing of e1
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.registrations;
  assert n = 2, 'e2 should see their 2 registrations, saw ' || n;
  select count(*) into n from public.registrations where user_id = '00000000-0000-0000-0000-0000000000e1';
  assert n = 0, 'e2 read e1''s registration';
  reset role;
end $$;

-- society admins: CS admin sees nothing of RAS; RAS admin sees all RAS rows and can still update events
-- (proves the events CHECK constraint's function is executable by `authenticated`)
-- Counts are scoped to the fixture events (or to rows the CS admin does not own), so real registrations
-- in the live tables cannot make this script fail.
do $$ declare n int; draft uuid; cs uuid; fx uuid[]; cs_events uuid[]; begin
  select id into draft from public.events where slug = 'p3-rls-draft';
  select id into cs from public.societies where slug = 'cs';
  -- fixture ids looked up as owner (the CS admin cannot see the RAS draft, which would make the check vacuous)
  select array_agg(id) into fx from public.events where slug like 'p3-rls-%';
  assert cardinality(fx) = 2, 'fixture events missing';
  select coalesce(array_agg(id), '{}') into cs_events from public.events where society_id = cs;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.registrations r
    where r.event_id = any(fx);
  assert n = 0, 'CS admin read the RAS fixture registrations: ' || n;
  select count(*) into n from public.registrations r
    where not (r.event_id = any(cs_events)) and r.user_id <> '00000000-0000-0000-0000-0000000000e3';
  assert n = 0, 'CS admin read another society''s registrations: ' || n;
  reset role;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.registrations r
    where r.event_id = any(fx);
  assert n = 5, 'RAS admin should read all 5 RAS fixture registrations, saw ' || n;
  select count(*) into n from public.event_attendees where event_id = draft;
  assert n = 1, 'RAS admin should see attendees of own draft event';
  update public.events set summary = 'checked' where slug = 'p3-rls-event';
  get diagnostics n = row_count;
  assert n = 1, 'RAS admin could not update an event (questions CHECK not executable?)';
  begin
    update public.registrations set status = 'cancelled';
    assert false, 'society admin updated registrations directly (Phase 5 adds an RPC for that)';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- a signed-in role without a user id sees no attendees (defence in depth)
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.event_attendees;
  assert n = 0, 'attendees visible without a user id';
  reset role;
end $$;

-- anonymous visitors: no registrations, no attendees, but seat counts work
do $$ declare n int; ev uuid; draft uuid; begin
  select id into ev from public.events where slug = 'p3-rls-event';
  select id into draft from public.events where slug = 'p3-rls-draft';  -- looked up as owner: anon cannot see drafts
  assert draft is not null, 'draft fixture missing';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform 1 from public.registrations;
    assert false, 'anon read registrations';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.event_attendees;
    assert false, 'anon read the attendee list';
  exception when insufficient_privilege then null; end;
  select seats_taken into n from public.event_seat_counts where event_id = ev;
  assert n = 1, 'anon seat count wrong: ' || coalesce(n::text, 'null');
  select count(*) into n from public.event_seat_counts where event_id = draft;
  assert n = 0, 'anon saw seat counts of a draft event';
  begin
    perform 1 from public.profile_private;
    assert false, 'anon read profile_private';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

rollback;
select 'registrations-rls: all assertions passed' as result;
