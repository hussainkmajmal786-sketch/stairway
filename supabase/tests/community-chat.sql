-- Phase 6 Task 3: admin chat (eligibility, RPC, RLS/Realtime isolation, lifecycle, admin ops, retention, anonymisation).
-- ONE execute_sql call; rolls back. Users c801 super, c802 society admin, c803 member, c804 attendee (live event), c805 attendee of an
-- event that ended, c806 plain, c807 lapsed member, c808 cancelled registration, c809 draft-event registrant, c810 member 2,
-- c811 purge (100-day thread), c812 purge (10-day thread), c813 purge claims, c814 anonymise target.
-- A failing assertion aborts the call: the final 'all assertions passed' row is the sentinel.
begin;

create function pg_temp.uid(n int) returns text language sql as $$ select '00000000-0000-0000-0000-00000000c8' || lpad(n::text, 2, '0') $$;
create function pg_temp.cl(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when n < 0 then '{}'
         when n = 0 then '{"role":"authenticated"}'
         else jsonb_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text end, true);
end $$;
create function pg_temp.msgs(n int) returns int language sql as $$
  select count(*)::int from public.chat_messages m join public.chat_threads t on t.id = m.thread_id where t.user_id = pg_temp.uid(n)::uuid $$;
create function pg_temp.tid(n int) returns uuid language sql as $$ select id from public.chat_threads where user_id = pg_temp.uid(n)::uuid $$;

insert into auth.users (id, email, aud, role, raw_user_meta_data)
select pg_temp.uid(n)::uuid, 'c8u' || lpad(n::text, 2, '0') || '@test.local', 'authenticated', 'authenticated',
       jsonb_build_object('full_name', 'C8 User ' || n)
from generate_series(1, 14) n;
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
 where id::text like '00000000-0000-0000-0000-00000000c8%';
insert into public.admin_roles (user_id, role, society_id)
select pg_temp.uid(1)::uuid, 'super_admin'::public.admin_role, null::uuid
union all select pg_temp.uid(2)::uuid, 'society_admin', s.id from public.societies s where s.slug = 'ras';

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, price_paise, token_prefix)
select s.id, v.step, v.slug, v.slug, now() + v.st, now() + v.en, v.status::public.event_status, 50, 0, 'C8'
from public.societies s join (values
    ('ras', 9801, 'c8-live',  interval '-1 hour', interval '3 days',   'published'),
    ('ras', 9802, 'c8-ended', interval '-3 hours', interval '-1 hour', 'published'),
    ('ras', 9803, 'c8-draft', interval '1 day',   interval '2 days',   'draft')) as v(soc, step, slug, st, en, status) on v.soc = s.slug;
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
select e.id, pg_temp.uid(v.u)::uuid, v.st::public.registration_status, private.new_ticket_code(), v.tok, now()
from (values (4, 'c8-live', 'confirmed', 1), (8, 'c8-live', 'cancelled', 2), (5, 'c8-ended', 'confirmed', 1), (9, 'c8-draft', 'confirmed', 1)) v(u, slug, st, tok)
join public.events e on e.slug = v.slug;
-- verified members: 3 live, 10 live, 7 lapsed (distinct numbers)
insert into public.ieee_claims (user_id, member_number, status, method, verified_until) values
  (pg_temp.uid(3)::uuid, '40000003', 'verified', 'admin', private.ist_today() + 100),
  (pg_temp.uid(10)::uuid, '40000010', 'verified', 'admin', private.ist_today() + 100),
  (pg_temp.uid(7)::uuid, '40000007', 'verified', 'admin', private.ist_today() - 1);

-- ───────── structure, grants, publication ─────────
do $$
declare r text;
begin
  assert (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
            and tablename in ('chat_messages', 'chat_threads')) = 2, 'chat tables not in the supabase_realtime publication';
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_blocks'), 'chat_blocks published';
  assert (select relrowsecurity from pg_class where oid = 'public.chat_messages'::regclass) and
         (select relrowsecurity from pg_class where oid = 'public.chat_threads'::regclass), 'RLS off on chat tables';
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_table_privilege(r, 'public.chat_messages', 'insert') and not has_table_privilege(r, 'public.chat_messages', 'update')
       and not has_table_privilege(r, 'public.chat_messages', 'delete'), r || ' can write chat_messages';
    assert not has_table_privilege(r, 'public.chat_threads', 'insert') and not has_table_privilege(r, 'public.chat_threads', 'update')
       and not has_table_privilege(r, 'public.chat_threads', 'delete'), r || ' can write chat_threads';
    assert not has_table_privilege(r, 'public.chat_blocks', 'select'), r || ' can read chat_blocks';
  end loop;
  assert has_table_privilege('authenticated', 'public.chat_messages', 'select'), 'authenticated cannot select messages (positive twin)';
  assert not has_table_privilege('anon', 'public.chat_messages', 'select'), 'anon can select messages';
  assert not has_function_privilege('authenticated', 'private.chat_access(uuid)', 'execute'), 'authenticated can run chat_access';
  assert not has_function_privilege('authenticated', 'public.purge_community()', 'execute'), 'authenticated can purge';
  assert not has_function_privilege('anon', 'public.purge_community()', 'execute'), 'anon can purge';
  assert has_function_privilege('service_role', 'public.purge_community()', 'execute'), 'service_role cannot purge (positive twin)';
  assert not has_function_privilege('anon', 'public.chat_send(uuid, text)', 'execute'), 'anon can chat_send';
  assert has_function_privilege('authenticated', 'public.chat_send(uuid, text)', 'execute'), 'authenticated cannot chat_send (positive twin)';
  assert not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
                      and p.proname in ('chat_send', 'chat_state', 'chat_mark_read', 'admin_chat_threads', 'admin_chat_close',
                                        'admin_chat_block', 'admin_chat_unblock', 'admin_chat_flag', 'admin_inbox_counts', 'purge_community')),
    'a public chat wrapper is SECURITY DEFINER';
end $$;

-- ───────── chat_access ─────────
do $$
begin
  assert private.chat_access(pg_temp.uid(3)::uuid) = 'member', 'verified member';
  assert private.chat_access(pg_temp.uid(4)::uuid) = 'attendee', 'attendee of a live event';
  assert private.chat_access(pg_temp.uid(5)::uuid) = 'none', 'attendee of an ended event';
  assert private.chat_access(pg_temp.uid(6)::uuid) = 'none', 'plain user';
  assert private.chat_access(pg_temp.uid(7)::uuid) = 'none', 'lapsed member';
  assert private.chat_access(pg_temp.uid(8)::uuid) = 'none', 'cancelled registration';
  assert private.chat_access(pg_temp.uid(9)::uuid) = 'none', 'draft event registrant';
  assert private.chat_access(null) = 'none', 'null uid';
  insert into public.chat_blocks (user_id, reason) values (pg_temp.uid(3)::uuid, 'spam');
  assert private.chat_access(pg_temp.uid(3)::uuid) = 'blocked', 'blocked member';
  delete from public.chat_blocks where user_id = pg_temp.uid(3)::uuid;
  assert private.chat_access(pg_temp.uid(3)::uuid) = 'member', 'unblocked member (positive twin)';
end $$;

-- ───────── chat_state ─────────
do $$
declare s jsonb;
begin
  perform pg_temp.cl(3); set local role authenticated;
  s := public.chat_state();
  assert s ->> 'access' = 'member' and s -> 'access_until' = 'null'::jsonb and s -> 'thread_id' = 'null'::jsonb, 'member state: ' || s::text;
  perform pg_temp.cl(4);
  s := public.chat_state();
  assert s ->> 'access' = 'attendee' and (s ->> 'access_until') is not null, 'attendee state: ' || s::text;
  perform pg_temp.cl(6);
  s := public.chat_state();
  assert s ->> 'access' = 'none' and s -> 'thread_id' = 'null'::jsonb, 'plain state: ' || s::text;
  reset role;
  set local role anon;
  begin perform public.chat_state(); assert false, 'anon chat_state';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
end $$;

-- ───────── sending ─────────
do $$
declare r jsonb; i int; big text := repeat('b', 1000); t4 uuid;
begin
  -- signed out
  perform pg_temp.cl(0); set local role authenticated;
  begin perform public.chat_send(null, 'hello'); assert false, 'signed-out send';
  exception when others then if sqlerrm <> 'not_signed_in' then raise; end if; end;
  reset role;
  set local role anon;
  begin perform public.chat_send(null, 'hello'); assert false, 'anon send';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  -- eligible users succeed and get a thread (m, t); ineligible raise not_eligible
  perform pg_temp.cl(3); set local role authenticated;
  r := public.chat_send(null, 'hello from the member');
  reset role;
  assert (r ->> 'id') is not null and pg_temp.msgs(3) = 1, 'member send';
  assert (select admin_unread = 1 and user_unread = 0 and status = 'open' from public.chat_threads where user_id = pg_temp.uid(3)::uuid), 'unread after user message';
  perform pg_temp.cl(4); set local role authenticated;
  r := public.chat_send(null, 'hello from the attendee');
  reset role;
  assert pg_temp.msgs(4) = 1, 'attendee send';
  for i in 5..9 loop
    perform pg_temp.cl(i); set local role authenticated;
    begin perform public.chat_send(null, 'let me in'); assert false, 'ineligible user ' || i || ' sent';
    exception when others then if sqlerrm <> 'not_eligible' then raise; end if; end;
    reset role;
  end loop;
  assert not exists (select 1 from public.chat_threads where user_id in (select pg_temp.uid(n)::uuid from generate_series(5, 9) n)), 'ineligible user got a thread';
  -- society admin is not staff for chat: same eligibility rules as a student
  perform pg_temp.cl(2); set local role authenticated;
  begin perform public.chat_send(null, 'society admin hello'); assert false, 'society admin sent without eligibility';
  exception when others then if sqlerrm <> 'not_eligible' then raise; end if; end;
  reset role;
  -- body rules (member 10): empty / 1001 / control char refused, exactly 1000 accepted
  perform pg_temp.cl(10); set local role authenticated;
  begin perform public.chat_send(null, '   '); assert false, 'blank body';
  exception when others then if sqlerrm <> 'invalid_body' then raise; end if; end;
  begin perform public.chat_send(null, repeat('x', 1001)); assert false, '1001 chars';
  exception when others then if sqlerrm <> 'invalid_body' then raise; end if; end;
  begin perform public.chat_send(null, 'bell' || E'\u0007' || 'char'); assert false, 'control char';
  exception when others then if sqlerrm <> 'invalid_body' then raise; end if; end;
  r := public.chat_send(null, big);                      -- message 1 of 20
  r := public.chat_send(null, E'two lines\nare fine');   -- message 2
  for i in 3..20 loop r := public.chat_send(null, 'message ' || i); end loop;
  begin perform public.chat_send(null, 'message 21'); assert false, '21st message accepted';
  exception when others then if sqlerrm <> 'rate_limited' then raise; end if; end;
  reset role;
  assert pg_temp.msgs(10) = 20, 'exactly 20 messages expected for member 10';
  -- the sender role and thread cannot be forged: member 3 naming member 4's thread writes to its own thread
  t4 := pg_temp.tid(4);
  perform pg_temp.cl(3); set local role authenticated;
  r := public.chat_send(t4, 'I am pretending');
  reset role;
  assert pg_temp.msgs(4) = 1 and pg_temp.msgs(3) = 2, 'a user wrote into another user''s thread';
  assert not exists (select 1 from public.chat_messages where body = 'I am pretending' and from_admin), 'user message flagged as admin';
  -- admin: bad thread id -> not_found; real thread works and is marked from_admin
  perform pg_temp.cl(1); set local role authenticated;
  begin perform public.chat_send(gen_random_uuid(), 'hello'); assert false, 'admin sent to a missing thread';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  r := public.chat_send(pg_temp.tid(3), 'staff reply');
  reset role;
  assert (select from_admin and sender_id = pg_temp.uid(1)::uuid from public.chat_messages where id = (r ->> 'id')::bigint), 'admin message flags';
  assert (select user_unread = 1 from public.chat_threads where user_id = pg_temp.uid(3)::uuid), 'user_unread after staff reply';
end $$;

-- staff rate limit: 120 per 10 minutes (positive twin: the 120th passes)
do $$
declare n int; r jsonb;
begin
  select count(*) into n from public.chat_messages where sender_id = pg_temp.uid(1)::uuid and created_at > now() - interval '10 minutes';
  insert into public.chat_messages (thread_id, sender_id, from_admin, body)
    select pg_temp.tid(3), pg_temp.uid(1)::uuid, true, 'filler ' || g from generate_series(1, 119 - n) g;
  perform pg_temp.cl(1); set local role authenticated;
  r := public.chat_send(pg_temp.tid(3), 'the 120th');
  begin perform public.chat_send(pg_temp.tid(3), 'the 121st'); assert false, '121st staff message accepted';
  exception when others then if sqlerrm <> 'rate_limited' then raise; end if; end;
  reset role;
  delete from public.chat_messages where body like 'filler %' or body = 'the 120th';
end $$;

-- ───────── isolation (the same RLS Realtime applies per subscriber) ─────────
do $$
declare n int; mid bigint;
begin
  select id into mid from public.chat_messages m where m.thread_id = pg_temp.tid(4) limit 1;
  assert mid is not null, 'fixture: message in thread 4';
  -- no direct writes for anyone
  perform pg_temp.cl(3); set local role authenticated;
  begin insert into public.chat_threads (user_id) values (pg_temp.uid(3)::uuid); assert false, 'inserted a thread';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin insert into public.chat_messages (thread_id, sender_id, from_admin, body) values (pg_temp.tid(3), pg_temp.uid(3)::uuid, true, 'forged admin');
    assert false, 'inserted a message';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin update public.chat_messages set body = 'edited'; assert false, 'updated a message';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin delete from public.chat_messages; assert false, 'deleted messages';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin update public.chat_threads set status = 'open'; assert false, 'updated a thread';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin insert into public.chat_blocks (user_id) values (pg_temp.uid(6)::uuid); assert false, 'inserted a block';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform 1 from public.chat_blocks; assert false, 'read blocks';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  -- own data visible (positive twin), another user's invisible
  select count(*) into n from public.chat_messages where thread_id = pg_temp.tid(3);
  assert n = 3, 'member should read its own 3 messages (2 own + 1 staff), got ' || n;
  select count(*) into n from public.chat_messages where id = mid;
  assert n = 0, 'member reads another user''s message by id';
  select count(*) into n from public.chat_threads where user_id = pg_temp.uid(4)::uuid;
  assert n = 0, 'member reads another user''s thread';
  select count(*) into n from public.chat_threads;
  assert n = 1, 'member should see exactly 1 thread, got ' || n;
  reset role;
  -- a plain user and a society admin see nothing
  perform pg_temp.cl(6); set local role authenticated;
  select count(*) into n from public.chat_messages; assert n = 0, 'plain user reads messages';
  reset role;
  perform pg_temp.cl(2); set local role authenticated;
  select count(*) into n from public.chat_messages; assert n = 0, 'society admin reads messages';
  select count(*) into n from public.chat_threads; assert n = 0, 'society admin reads threads';
  reset role;
  -- the super admin reads all; anon cannot touch the tables
  perform pg_temp.cl(1); set local role authenticated;
  select count(*) into n from public.chat_threads where user_id in (pg_temp.uid(3)::uuid, pg_temp.uid(4)::uuid, pg_temp.uid(10)::uuid);
  assert n = 3, 'super admin should read all 3 threads, got ' || n;
  select count(*) into n from public.chat_messages where id = mid; assert n = 1, 'super admin cannot read the message';
  reset role;
  set local role anon;
  begin perform 1 from public.chat_messages; assert false, 'anon read messages';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
end $$;

-- ───────── eligibility ends -> reads and sends stop, history returns when it returns ─────────
do $$
declare n int; live_id uuid;
begin
  select id into live_id from public.events where slug = 'c8-live';
  perform pg_temp.cl(-1);
  update public.events set starts_at = now() - interval '5 hours', ends_at = now() - interval '1 hour' where id = live_id;
  assert private.chat_access(pg_temp.uid(4)::uuid) = 'none', 'access should end with the event';
  perform pg_temp.cl(4); set local role authenticated;
  begin perform public.chat_send(null, 'too late'); assert false, 'sent after the event ended';
  exception when others then if sqlerrm <> 'not_eligible' then raise; end if; end;
  select count(*) into n from public.chat_threads; assert n = 0, 'ended attendee still reads the thread';
  select count(*) into n from public.chat_messages; assert n = 0, 'ended attendee still reads messages';
  assert public.chat_state() ->> 'access' = 'none', 'state after event end';
  begin perform public.chat_mark_read(pg_temp.tid(4)); assert false, 'ended attendee marked read';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  assert (select count(*) from public.chat_messages where thread_id = pg_temp.tid(4)) = 1, 'history was deleted';
  perform pg_temp.cl(1); set local role authenticated;
  select count(*) into n from public.chat_messages where thread_id = pg_temp.tid(4); assert n = 1, 'super admin lost the history';
  reset role;
  perform pg_temp.cl(-1);
  update public.events set starts_at = now() - interval '1 hour', ends_at = now() + interval '3 days' where id = live_id;
  perform pg_temp.cl(4); set local role authenticated;
  select count(*) into n from public.chat_messages; assert n = 1, 'history did not return with eligibility';
  reset role;
  -- member lapse: verified_until yesterday also closes the door
  update public.ieee_claims set verified_until = private.ist_today() - 1 where user_id = pg_temp.uid(10)::uuid;
  perform pg_temp.cl(10); set local role authenticated;
  select count(*) into n from public.chat_messages; assert n = 0, 'lapsed member reads messages';
  begin perform public.chat_send(null, 'lapsed'); assert false, 'lapsed member sent';
  exception when others then if sqlerrm <> 'not_eligible' then raise; end if; end;
  reset role;
  update public.ieee_claims set verified_until = private.ist_today() + 100 where user_id = pg_temp.uid(10)::uuid;
end $$;

-- ───────── lifecycle: close/reopen, unread counters, mark read ─────────
do $$
declare t3 uuid := pg_temp.tid(3); r jsonb;
begin
  -- mark read: each side resets only its own counter; strangers are refused
  perform pg_temp.cl(6); set local role authenticated;
  begin perform public.chat_mark_read(t3); assert false, 'stranger marked read';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(4); set local role authenticated;                                  -- eligible, but not the owner
  begin perform public.chat_mark_read(t3); assert false, 'another eligible user marked read';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(3); set local role authenticated;
  perform public.chat_mark_read(t3);
  assert (public.chat_state() ->> 'user_unread')::int = 0, 'user_unread not reset';
  reset role;
  assert (select user_unread = 0 and admin_unread > 0 from public.chat_threads where id = t3), 'user mark-read touched the admin counter';
  perform pg_temp.cl(1); set local role authenticated;
  perform public.chat_mark_read(t3);
  reset role;
  assert (select admin_unread = 0 from public.chat_threads where id = t3), 'admin_unread not reset';
  -- close: staff cannot post, the user posting reopens
  perform pg_temp.cl(1); set local role authenticated;
  perform public.admin_chat_close(t3);
  begin perform public.chat_send(t3, 'into a closed thread'); assert false, 'staff posted in a closed thread';
  exception when others then if sqlerrm <> 'thread_closed' then raise; end if; end;
  reset role;
  assert (select status = 'closed' from public.chat_threads where id = t3), 'thread not closed';
  perform pg_temp.cl(3); set local role authenticated;
  r := public.chat_send(null, 'reopening');
  reset role;
  assert (select status = 'open' from public.chat_threads where id = t3), 'user message did not reopen the thread';
  perform pg_temp.cl(1); set local role authenticated;
  r := public.chat_send(t3, 'staff can post again');
  reset role;
end $$;

-- ───────── admin operations ─────────
do $$
declare t3 uuid := pg_temp.tid(3); t4 uuid := pg_temp.tid(4); mid_user bigint; mid_admin bigint; q jsonb; c jsonb; n int;
begin
  select id into mid_user from public.chat_messages where thread_id = t3 and not from_admin limit 1;
  select id into mid_admin from public.chat_messages where thread_id = t3 and from_admin limit 1;
  -- everything admin raises 42501 for a student and a society admin
  for n in 3..3 loop
    perform pg_temp.cl(3); set local role authenticated;
    begin perform public.admin_chat_threads('all', 10, 0); assert false, 'student listed threads';
    exception when others then if sqlstate <> '42501' then raise; end if; end;
    begin perform public.admin_chat_close(t3); assert false, 'student closed';
    exception when others then if sqlstate <> '42501' then raise; end if; end;
    begin perform public.admin_chat_block(pg_temp.uid(4)::uuid, 'abuse'); assert false, 'student blocked';
    exception when others then if sqlstate <> '42501' then raise; end if; end;
    begin perform public.admin_chat_unblock(pg_temp.uid(4)::uuid); assert false, 'student unblocked';
    exception when others then if sqlstate <> '42501' then raise; end if; end;
    begin perform public.admin_chat_flag(mid_user); assert false, 'student flagged';
    exception when others then if sqlstate <> '42501' then raise; end if; end;
    begin perform public.admin_inbox_counts(); assert false, 'student read inbox counts';
    exception when others then if sqlstate <> '42501' then raise; end if; end;
    reset role;
  end loop;
  perform pg_temp.cl(2); set local role authenticated;
  begin perform public.admin_chat_threads('all', 10, 0); assert false, 'society admin listed threads';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_chat_block(pg_temp.uid(4)::uuid, 'abuse'); assert false, 'society admin blocked';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_inbox_counts(); assert false, 'society admin read inbox counts';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  set local role anon;
  begin perform public.admin_inbox_counts(); assert false, 'anon read inbox counts';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;

  -- super admin: list, counts
  perform pg_temp.cl(1); set local role authenticated;
  q := public.admin_chat_threads('all', 10000, 0);
  assert (q ->> 'total')::int >= 3 and jsonb_array_length(q -> 'rows') >= 3, 'thread list: ' || q::text;
  assert exists (select 1 from jsonb_array_elements(q -> 'rows') x where x ->> 'id' = t3::text and x ->> 'handle' is not null
                   and (x ->> 'blocked')::boolean = false), 'thread row shape';
  begin perform public.admin_chat_threads('weird', 10, 0); assert false, 'bad status filter';
  exception when others then if sqlerrm <> 'invalid_input' then raise; end if; end;
  c := public.admin_inbox_counts();
  assert (c ->> 'chat_unread')::int >= 1 and jsonb_typeof(c -> 'requests_new') = 'number' and jsonb_typeof(c -> 'claims_pending') = 'number', 'inbox counts: ' || c::text;
  -- flag: user message ok, admin message refused (positive twin first)
  perform public.admin_chat_flag(mid_user);
  begin perform public.admin_chat_flag(mid_admin); assert false, 'flagged an admin message';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  begin perform public.admin_chat_flag(-1); assert false, 'flagged a missing message';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  -- close a missing thread
  begin perform public.admin_chat_close(gen_random_uuid()); assert false, 'closed a missing thread';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  -- block rules: admins and self refused, bad reason refused
  begin perform public.admin_chat_block(pg_temp.uid(2)::uuid, 'abuse'); assert false, 'blocked a society admin';
  exception when others then if sqlerrm <> 'admin_account' then raise; end if; end;
  begin perform public.admin_chat_block(pg_temp.uid(1)::uuid, 'abuse'); assert false, 'blocked self';
  exception when others then if sqlerrm <> 'admin_account' then raise; end if; end;
  begin perform public.admin_chat_block(pg_temp.uid(4)::uuid, 'because'); assert false, 'bad block reason';
  exception when others then if sqlerrm <> 'invalid_input' then raise; end if; end;
  begin perform public.admin_chat_block(gen_random_uuid(), 'abuse'); assert false, 'blocked a missing user';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  perform public.admin_chat_block(pg_temp.uid(4)::uuid, 'spam');
  perform public.admin_chat_block(pg_temp.uid(4)::uuid, 'spam');                      -- idempotent
  reset role;
  assert (select status = 'closed' from public.chat_threads where id = t4), 'block did not close the thread';
  assert (select count(*) from public.chat_blocks where user_id = pg_temp.uid(4)::uuid) = 1, 'block row';
  -- the blocked user is out: cannot send, cannot read, state says blocked
  perform pg_temp.cl(4); set local role authenticated;
  begin perform public.chat_send(null, 'blocked hello'); assert false, 'blocked user sent';
  exception when others then if sqlerrm <> 'blocked' then raise; end if; end;
  select count(*) into n from public.chat_threads; assert n = 0, 'blocked user reads the thread';
  select count(*) into n from public.chat_messages; assert n = 0, 'blocked user reads messages';
  assert public.chat_state() ->> 'access' = 'blocked', 'blocked state';
  reset role;
  -- unblock restores access (positive twin of the block), and the user's next message reopens the thread
  perform pg_temp.cl(1); set local role authenticated;
  perform public.admin_chat_unblock(pg_temp.uid(4)::uuid);
  perform public.admin_chat_unblock(pg_temp.uid(4)::uuid);                           -- no-op, no second audit row
  reset role;
  perform pg_temp.cl(4); set local role authenticated;
  select count(*) into n from public.chat_messages; assert n = 1, 'unblocked user does not see history';
  perform public.chat_send(null, 'back again');
  reset role;
  assert (select status = 'open' from public.chat_threads where id = t4), 'thread not reopened after unblock';
  -- audits: exactly one row each, numbers/booleans only, no message text
  assert (select count(*) from public.audit_log where action = 'chat.close' and target_id = t3::text) = 1, 'chat.close audit count';
  assert (select count(*) from public.audit_log where action = 'chat.block' and target_id = pg_temp.uid(4)) = 1, 'chat.block audit count (repeat block logs once)';
  assert (select count(*) from public.audit_log where action = 'chat.unblock' and target_id = pg_temp.uid(4)) = 1, 'chat.unblock audit count';
  assert (select count(*) from public.audit_log where action = 'chat.flag' and target_id = mid_user::text) = 1, 'chat.flag audit count';
  assert not exists (select 1 from public.audit_log a, jsonb_each(a.summary) e
                      where a.action like 'chat.%' and jsonb_typeof(e.value) not in ('number', 'boolean')), 'chat audit summary has non-scalars';
  assert not exists (select 1 from public.audit_log a where a.action like 'chat.%' and (a.summary::text ilike '%hello%' or a.summary::text ilike '%reopening%')),
    'chat audit leaked message text';
  assert (select flagged_at is not null from public.chat_messages where id = mid_user), 'message not flagged';
end $$;

-- ───────── retention ─────────
do $$
declare r jsonb; ip1 constant text := repeat('d', 64);
begin
  -- fixtures (as postgres): a 100-day thread, a 10-day thread, old ip hash, old resolved request, old rejected claims
  insert into public.chat_threads (user_id, last_message_at) values (pg_temp.uid(11)::uuid, now() - interval '100 days'), (pg_temp.uid(12)::uuid, now() - interval '10 days');
  insert into public.chat_messages (thread_id, sender_id, from_admin, body, created_at)
    select t.id, t.user_id, false, 'old message', t.last_message_at from public.chat_threads t where t.user_id in (pg_temp.uid(11)::uuid, pg_temp.uid(12)::uuid);
  insert into public.community_requests (kind, name, email, subject, message, details, ip_hash, status, created_at) values
    ('feedback', 'Old Person', 'old1@example.org', 'old ip hash', 'a message long enough', '{"category":"other"}', ip1, 'new', now() - interval '40 days'),
    ('feedback', 'Fresh Person', 'old2@example.org', 'fresh ip hash', 'a message long enough', '{"category":"other"}', ip1, 'new', now() - interval '5 days'),
    ('feedback', 'Done Person', 'old3@example.org', 'old resolved one', 'a message long enough', '{"category":"other"}', null, 'resolved', now() - interval '400 days'),
    ('feedback', 'Open Person', 'old4@example.org', 'old but unresolved', 'a message long enough', '{"category":"other"}', null, 'in_review', now() - interval '400 days');
  insert into public.ieee_claims (user_id, member_number, status, proof_path, decided_at, created_at, reject_reason) values
    (pg_temp.uid(13)::uuid, '40000013', 'rejected', pg_temp.uid(13) || '/oldproofproof.png', now() - interval '100 days', now() - interval '101 days', 'unreadable'),
    (pg_temp.uid(13)::uuid, '40000113', 'withdrawn', null, null, now() - interval '100 days', null),
    (pg_temp.uid(13)::uuid, '40000213', 'rejected', pg_temp.uid(13) || '/freshproof01.png', now() - interval '5 days', now() - interval '6 days', 'other');
  insert into private.ieee_attempts (user_id, at) values (pg_temp.uid(13)::uuid, now() - interval '3 days'), (pg_temp.uid(13)::uuid, now());

  perform pg_temp.cl(3); set local role authenticated;
  begin perform public.purge_community(); assert false, 'authenticated purged';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  set local role anon;
  begin perform public.purge_community(); assert false, 'anon purged';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;

  set local role service_role;
  r := public.purge_community();
  reset role;
  assert (r ->> 'threads')::int >= 1 and (r ->> 'ip_hashes')::int >= 1 and (r ->> 'requests')::int >= 1 and (r ->> 'claims')::int >= 1
     and (r ->> 'attempts')::int >= 1, 'purge counts: ' || r::text;
  assert not exists (select 1 from public.chat_threads where user_id = pg_temp.uid(11)::uuid), '100-day thread survived';
  assert not exists (select 1 from public.chat_messages where body = 'old message' and sender_id = pg_temp.uid(11)::uuid), 'old messages survived (cascade)';
  assert exists (select 1 from public.chat_threads where user_id = pg_temp.uid(12)::uuid), '10-day thread purged';
  assert exists (select 1 from public.chat_messages where body = 'old message' and sender_id = pg_temp.uid(12)::uuid), '10-day messages purged';
  assert (select ip_hash is null from public.community_requests where email = 'old1@example.org'), '40-day ip hash kept';
  assert (select ip_hash = ip1 from public.community_requests where email = 'old2@example.org'), '5-day ip hash purged';
  assert not exists (select 1 from public.community_requests where email = 'old3@example.org'), 'old resolved request kept';
  assert exists (select 1 from public.community_requests where email = 'old4@example.org'), 'old unresolved request purged';
  assert (r -> 'proof_paths') @> to_jsonb(pg_temp.uid(13) || '/oldproofproof.png') and not ((r -> 'proof_paths') @> to_jsonb(pg_temp.uid(13) || '/freshproof01.png')),
    'proof_paths: ' || (r -> 'proof_paths')::text;
  assert (select proof_path is null from public.ieee_claims where member_number = '40000013'), 'listed proof path not cleared';
  assert (select proof_path is not null from public.ieee_claims where member_number = '40000213'), 'fresh proof path cleared';
  assert not exists (select 1 from public.ieee_claims where member_number = '40000113'), 'old withdrawn claim without proof kept';
  assert not exists (select 1 from private.ieee_attempts where user_id = pg_temp.uid(13)::uuid and at < now() - interval '2 days'), 'old attempt kept';
  assert exists (select 1 from private.ieee_attempts where user_id = pg_temp.uid(13)::uuid and at > now() - interval '1 day'), 'fresh attempt purged';
  -- second run deletes the claim whose path was just handed out
  set local role service_role;
  r := public.purge_community();
  reset role;
  assert not exists (select 1 from public.ieee_claims where member_number = '40000013'), 'rejected claim not deleted on the second run';
  assert (r -> 'proof_paths') = '[]'::jsonb or not ((r -> 'proof_paths') @> to_jsonb(pg_temp.uid(13) || '/oldproofproof.png')), 'path listed twice';
end $$;

-- ───────── anonymisation ─────────
do $$
declare r jsonb; t14 uuid;
begin
  -- fixture: target with a verified claim (the case the ieee_member_id guard protects), a request, a thread and a block
  update public.profile_private set ieee_member_id = '40000014', email = 'c814@test.local', phone = '9999999999' where user_id = pg_temp.uid(14)::uuid;
  insert into public.ieee_claims (user_id, member_number, status, method, verified_until, proof_path)
    values (pg_temp.uid(14)::uuid, '40000014', 'verified', 'admin', private.ist_today() + 100, pg_temp.uid(14) || '/someproof001.png');
  update public.profile_private set ieee_member_id = '40000014' where user_id = pg_temp.uid(14)::uuid;
  insert into public.community_requests (kind, user_id, name, email, phone, organisation, subject, message, details)
    values ('partner', pg_temp.uid(14)::uuid, 'Real Name', 'real@example.org', '+91 9876543210', 'Real Org', 'my partnership', 'a long message with personal text',
            '{"partnership_type":"sponsor","website":"https://real.example.org"}');
  insert into public.chat_threads (user_id) values (pg_temp.uid(14)::uuid);
  insert into public.chat_blocks (user_id) values (pg_temp.uid(14)::uuid);
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(14)::uuid) = '40000014', 'fixture: number set';

  -- refusals
  perform pg_temp.cl(3); set local role authenticated;
  begin perform public.anonymise_user(pg_temp.uid(14)::uuid); assert false, 'student anonymised';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(1); set local role authenticated;
  begin perform public.anonymise_user(pg_temp.uid(2)::uuid); assert false, 'anonymised an admin';
  exception when others then if sqlerrm <> 'admin_account' then raise; end if; end;
  r := public.anonymise_user(pg_temp.uid(14)::uuid);
  reset role;
  assert r ? 'registrations_kept', 'anonymise result: ' || r::text;
  assert (select ieee_member_id = '' and email = '' and phone = '' from public.profile_private where user_id = pg_temp.uid(14)::uuid),
    'profile_private not scrubbed (guard blocked the clearing?)';
  assert (select full_name = 'Deleted user' and not onboarded from public.profiles where id = pg_temp.uid(14)::uuid), 'profile not scrubbed';
  assert (select status = 'withdrawn' and member_number = '' and proof_path is null and prescreen = '{}'::jsonb
            from public.ieee_claims where user_id = pg_temp.uid(14)::uuid), 'claim not scrubbed';
  assert not private.is_verified_member(pg_temp.uid(14)::uuid), 'anonymised user still verified';
  assert (select name = 'Deleted user' and email = 'deleted@anonymised.invalid' and phone is null and organisation is null and user_id is null
            and message = '[removed by anonymisation]' and not (details ? 'website') and details ? 'partnership_type'
            from public.community_requests where subject = 'my partnership'), 'request not scrubbed';
  assert not exists (select 1 from public.chat_threads where user_id = pg_temp.uid(14)::uuid), 'thread kept';
  assert not exists (select 1 from public.chat_blocks where user_id = pg_temp.uid(14)::uuid), 'block kept';
  assert exists (select 1 from public.audit_log where action = 'user.anonymised' and target_id = pg_temp.uid(14)), 'anonymise not audited';
  -- second anonymise of the same user is harmless (positive twin: the first one worked)
  perform pg_temp.cl(1); set local role authenticated;
  r := public.anonymise_user(pg_temp.uid(14)::uuid);
  reset role;
end $$;

rollback;
select 'community-chat: all assertions passed' as result;
