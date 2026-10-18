-- Phase 6 Task 2: community requests (validator, anon-callable submit RPC, rate limits, RLS, audit). ONE execute_sql call; rolls back.
-- Users c701 super admin, c702 society admin, c703 plain user, c704 second user, c705 third user.
-- A failing assertion aborts the call: the final 'all assertions passed' row is the sentinel.
begin;

create function pg_temp.uid(n int) returns text language sql as $$ select '00000000-0000-0000-0000-00000000c7' || lpad(n::text, 2, '0') $$;
create function pg_temp.cl(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when n = 0 then '{"role":"anon"}'
         else jsonb_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text end, true);
end $$;
-- thin caller: kind, anonymous, name, email, subject, message, details, ip, hp
create function pg_temp.sub(p_kind public.community_kind, p_anon boolean, p_email text, p_details jsonb,
  p_subject text default 'A valid subject', p_message text default 'A valid message that is long enough.',
  p_ip text default null, p_hp text default null, p_name text default 'Test Person', p_phone text default null, p_org text default null)
returns jsonb language sql as $$
  select public.submit_community_request(p_kind, p_anon, p_name, p_email, p_phone, p_org,
                                          p_subject, p_message, p_details, p_ip, p_hp) $$;

insert into auth.users (id, email, aud, role, raw_user_meta_data)
select pg_temp.uid(n)::uuid, 'c7u' || lpad(n::text, 2, '0') || '@test.local', 'authenticated', 'authenticated',
       jsonb_build_object('full_name', 'C7 User ' || n)
from generate_series(1, 5) n;
insert into public.admin_roles (user_id, role, society_id)
select pg_temp.uid(1)::uuid, 'super_admin'::public.admin_role, null::uuid
union all select pg_temp.uid(2)::uuid, 'society_admin', s.id from public.societies s where s.slug = 'ras';

-- ───────── grants: anon cannot touch the table; the RPC is the only door ─────────
do $$
declare r text;
begin
  assert has_function_privilege('anon', 'public.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text)', 'execute'),
    'anon cannot execute the wrapper (positive twin)';
  assert has_function_privilege('authenticated', 'public.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text)', 'execute'),
    'authenticated cannot execute the wrapper';
  assert not has_function_privilege('service_role', 'public.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text)', 'execute'),
    'service_role can execute the wrapper';
  assert not (select prosecdef from pg_proc where oid = 'public.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text)'::regprocedure),
    'public wrapper must be SECURITY INVOKER';
  assert (select prosecdef from pg_proc where oid = 'private.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text)'::regprocedure),
    'private body should be SECURITY DEFINER (positive twin)';
  foreach r in array array['anon', 'service_role'] loop
    assert not has_function_privilege(r, 'private.community_details_valid(public.community_kind, jsonb)', 'execute'), r || ' can run the validator';
  end loop;
  assert has_function_privilege('authenticated', 'private.community_details_valid(public.community_kind, jsonb)', 'execute'),
    'authenticated needs the validator for CHECK evaluation on UPDATE (positive twin)';
  assert not has_table_privilege('anon', 'public.community_requests', 'select'), 'anon can select requests';
  assert not has_table_privilege('anon', 'public.community_requests', 'insert'), 'anon can insert requests';
  assert not has_table_privilege('authenticated', 'public.community_requests', 'insert'), 'authenticated can insert requests directly';
  assert not has_table_privilege('authenticated', 'public.community_requests', 'delete'), 'authenticated can delete requests';
  assert has_table_privilege('authenticated', 'public.community_requests', 'select'), 'authenticated cannot select (positive twin; RLS filters)';
end $$;

-- ───────── anon submits each kind (positive) ─────────
do $$
declare r jsonb; n int;
begin
  set local role anon; perform pg_temp.cl(0);
  r := pg_temp.sub('host_event', false, 'host@example.org', '{"event_title":"Intro to FPGAs","expected_attendees":80,"preferred_date":"2027-03-04","venue":"CEK Hall","website":"https://example.org/fpga"}'::jsonb, p_phone => '+91 98765 43210', p_org => 'Some Club');
  assert r = '{"ok": true}'::jsonb, 'host_event anon submit: ' || r::text;
  r := pg_temp.sub('partner', false, 'partner@example.org', '{"partnership_type":"sponsor","website":"https://example.org"}'::jsonb);
  assert r = '{"ok": true}'::jsonb, 'partner anon submit';
  r := pg_temp.sub('feedback', false, 'fb@example.org', '{"category":"complaint"}'::jsonb);
  assert r = '{"ok": true}'::jsonb, 'feedback anon submit with contact';
  r := pg_temp.sub('feedback', true, null, '{"category":"suggestion"}'::jsonb, p_ip => repeat('a', 64));
  assert r = '{"ok": true}'::jsonb, 'anonymous feedback submit';
  reset role;
  assert (select count(*) from public.community_requests) = 4, 'four rows expected';
  assert (select is_anonymous and name is null and email is null and phone is null and organisation is null and user_id is null and ip_hash = repeat('a', 64)
            from public.community_requests where kind = 'feedback' and is_anonymous), 'anonymous feedback stores identity';
  assert (select email = 'host@example.org' and name = 'Test Person' and status = 'new' from public.community_requests where kind = 'host_event'), 'host row';
  assert (select count(*) from public.audit_log where action like 'community_requests.%') = 0, 'a submitter insert was audited';
end $$;

-- ───────── anon / users cannot read or write the table directly ─────────
do $$
declare n int;
begin
  set local role anon;
  begin perform 1 from public.community_requests; assert false, 'anon selected requests';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin insert into public.community_requests (kind, subject, message, name, email) values ('feedback', 'abc', 'abcdefghij', 'Nn', 'a@b.co'); assert false, 'anon inserted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin update public.community_requests set status = 'closed'; assert false, 'anon updated';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  -- ordinary user and society admin: RLS hides every row, update touches nothing, no direct insert
  perform pg_temp.cl(3); set local role authenticated;
  select count(*) into n from public.community_requests;
  assert n = 0, 'ordinary user reads requests';
  update public.community_requests set status = 'closed'; get diagnostics n = row_count;
  assert n = 0, 'ordinary user updated requests';
  begin insert into public.community_requests (kind, subject, message, name, email) values ('feedback', 'abc', 'abcdefghij', 'Nn', 'a@b.co'); assert false, 'user inserted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin delete from public.community_requests; assert false, 'user deleted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(2); set local role authenticated;
  select count(*) into n from public.community_requests;
  assert n = 0, 'society admin reads requests';
  update public.community_requests set admin_note = 'x'; get diagnostics n = row_count;
  assert n = 0, 'society admin updated requests';
  reset role;
  -- super admin reads (positive twin), may set status/admin_note but no other column
  perform pg_temp.cl(1); set local role authenticated;
  select count(*) into n from public.community_requests;
  assert n = 4, 'super admin should read the 4 rows, got ' || n;
  begin update public.community_requests set name = 'hacked'; assert false, 'super admin updated name';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin update public.community_requests set message = 'hacked message here'; assert false, 'super admin updated message';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin delete from public.community_requests; assert false, 'super admin deleted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
end $$;

-- ───────── audit: admin status change = one row, columns + status only, never the note text ─────────
do $$
declare s jsonb; n int;
begin
  perform pg_temp.cl(1); set local role authenticated;
  update public.community_requests set status = 'in_review', admin_note = 'SECRET NOTE TEXT' where kind = 'partner';
  get diagnostics n = row_count;
  reset role;
  assert n = 1, 'super admin status change should touch 1 row';
  assert (select count(*) from public.audit_log where action = 'community_requests.update') = 1, 'status change audit row count';
  select summary into s from public.audit_log where action = 'community_requests.update';
  assert s -> 'columns' = '["admin_note","status"]'::jsonb and s -> 'status' = '{"from":"new","to":"in_review"}'::jsonb, 'audit summary shape: ' || s::text;
  assert not (s::text ilike '%secret%'), 'audit leaked the admin note';
  assert (select status = 'in_review' and admin_note = 'SECRET NOTE TEXT' from public.community_requests where kind = 'partner'), 'status/note not stored';
  -- over-long note (1001) -> 23514
  perform pg_temp.cl(1); set local role authenticated;
  begin update public.community_requests set admin_note = repeat('x', 1001); assert false, 'long note accepted';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  update public.community_requests set admin_note = repeat('x', 1000) where kind = 'partner';   -- positive twin: 1000 is fine
  reset role;
end $$;

-- ───────── honeypot, anonymous rules, ip hash ─────────
do $$
declare r jsonb; before_n int;
begin
  select count(*) into before_n from public.community_requests;
  set local role anon; perform pg_temp.cl(0);
  r := pg_temp.sub('feedback', false, 'bot@example.org', '{"category":"other"}'::jsonb, p_hp => 'http://spam');
  reset role;
  assert r = '{"ok": true}'::jsonb, 'honeypot should look successful';
  assert (select count(*) from public.community_requests) = before_n, 'honeypot row stored';
  set local role anon;
  begin perform pg_temp.sub('partner', true, null, '{"partnership_type":"sponsor"}'::jsonb); assert false, 'anonymous partner accepted';
  exception when others then if sqlerrm <> 'invalid_input' then raise; end if; end;
  begin perform pg_temp.sub('host_event', true, null, '{"event_title":"Anonymous event"}'::jsonb); assert false, 'anonymous host_event accepted';
  exception when others then if sqlerrm <> 'invalid_input' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, 'ip@example.org', '{"category":"other"}'::jsonb, p_ip => 'not-a-hash'); assert false, 'bad ip hash accepted';
  exception when others then if sqlerrm <> 'invalid_input' then raise; end if; end;
  reset role;
  -- a signed-in caller marking feedback anonymous still stores no identity
  perform pg_temp.cl(4); set local role authenticated;
  r := pg_temp.sub('feedback', true, 'me@example.org', '{"category":"suggestion"}'::jsonb, p_name => 'Me Myself', p_phone => '+91 9876543210', p_org => 'Org');
  reset role;
  assert r = '{"ok": true}'::jsonb, 'signed-in anonymous feedback';
  assert (select count(*) from public.community_requests where is_anonymous and user_id is null and name is null and email is null
            and phone is null and organisation is null) = 2, 'anonymous feedback leaked identity';
  -- signed-in non-anonymous stores the user id (positive twin)
  perform pg_temp.cl(4); set local role authenticated;
  r := pg_temp.sub('feedback', false, 'me@example.org', '{"category":"other"}'::jsonb);
  reset role;
  assert (select user_id = pg_temp.uid(4)::uuid from public.community_requests where email = 'me@example.org'), 'user id not stored';
end $$;

-- ───────── CHECK constraints surface as 23514 (each with a passing twin) ─────────
do $$
declare r jsonb;
begin
  set local role anon; perform pg_temp.cl(0);
  -- markup
  begin perform pg_temp.sub('feedback', false, 'v1@example.org', '{"category":"other"}'::jsonb, p_subject => '<script>alert(1)</script>'); assert false, 'markup in subject';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, 'v2@example.org', '{"category":"other"}'::jsonb, p_message => 'hello <b>bold</b> message'); assert false, 'markup in message';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, 'v3@example.org', '{"category":"other"}'::jsonb, p_name => 'Evil <img>'); assert false, 'markup in name';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('host_event', false, 'v4@example.org', '{"event_title":"Bad <title>"}'::jsonb); assert false, 'markup in event_title';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  -- control characters: bell rejected, newline accepted
  begin perform pg_temp.sub('feedback', false, 'v5@example.org', '{"category":"other"}'::jsonb, p_message => 'a message with a bell' || E'\u0007' || ' char'); assert false, 'control char';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  r := pg_temp.sub('feedback', false, 'v6@example.org', '{"category":"other"}'::jsonb, p_message => E'two lines\nof a valid message');
  assert r = '{"ok": true}'::jsonb, 'newline should pass';
  -- website: javascript:/http:/ftp: rejected, https accepted
  begin perform pg_temp.sub('partner', false, 'v7@example.org', '{"partnership_type":"media","website":"javascript:alert(1)"}'::jsonb); assert false, 'javascript url';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('partner', false, 'v8@example.org', '{"partnership_type":"media","website":"http://example.org"}'::jsonb); assert false, 'http url';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('partner', false, 'v9@example.org', '{"partnership_type":"media","website":"ftp://example.org/x"}'::jsonb); assert false, 'ftp url';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  r := pg_temp.sub('partner', false, 'v10@example.org', '{"partnership_type":"media","website":"https://example.org/path?a=1"}'::jsonb);
  assert r = '{"ok": true}'::jsonb, 'https url should pass';
  -- details: unknown key, missing required key per kind, wrong enum, wrong types
  begin perform pg_temp.sub('feedback', false, 'v11@example.org', '{"category":"other","extra":"x"}'::jsonb); assert false, 'unknown details key';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('host_event', false, 'v12@example.org', '{}'::jsonb); assert false, 'host_event without title';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('partner', false, 'v13@example.org', '{}'::jsonb); assert false, 'partner without type';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, 'v14@example.org', '{}'::jsonb); assert false, 'feedback without category';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('partner', false, 'v15@example.org', '{"partnership_type":"bribe"}'::jsonb); assert false, 'bad partnership type';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('host_event', false, 'v16@example.org', '{"event_title":"Valid title","expected_attendees":"many"}'::jsonb); assert false, 'attendees not a number';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('host_event', false, 'v17@example.org', '{"event_title":"Valid title","expected_attendees":10001}'::jsonb); assert false, 'attendees > 10000';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('host_event', false, 'v18@example.org', '{"event_title":"Valid title","preferred_date":"2027-02-31"}'::jsonb); assert false, 'impossible date';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('host_event', false, 'v19@example.org', '{"event_title":"ab"}'::jsonb); assert false, 'title too short';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  r := pg_temp.sub('host_event', false, 'v20@example.org', '{"event_title":"Valid title","expected_attendees":10000,"preferred_date":"2027-02-28"}'::jsonb);
  assert r = '{"ok": true}'::jsonb, 'boundary host_event should pass';
  -- lengths: subject 3..120, message 10..2000
  begin perform pg_temp.sub('feedback', false, 'v21@example.org', '{"category":"other"}'::jsonb, p_subject => repeat('s', 121)); assert false, 'subject 121';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, 'v22@example.org', '{"category":"other"}'::jsonb, p_message => repeat('m', 2001)); assert false, 'message 2001';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, 'v23@example.org', '{"category":"other"}'::jsonb, p_message => 'too short'); assert false, 'message 9 chars';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, 'v24@example.org', '{"category":"other"}'::jsonb, p_subject => 'ab'); assert false, 'subject 2 chars';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  r := pg_temp.sub('feedback', false, 'v25@example.org', '{"category":"other"}'::jsonb, p_subject => repeat('s', 120), p_message => repeat('m', 2000));
  assert r = '{"ok": true}'::jsonb, 'max lengths should pass';
  -- email / phone / name
  begin perform pg_temp.sub('feedback', false, 'not-an-email', '{"category":"other"}'::jsonb); assert false, 'bad email';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, 'v26@example.org', '{"category":"other"}'::jsonb, p_phone => 'abc'); assert false, 'bad phone';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, 'v27@example.org', '{"category":"other"}'::jsonb, p_name => 'X'); assert false, 'name 1 char';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin perform pg_temp.sub('feedback', false, null, '{"category":"other"}'::jsonb); assert false, 'non-anonymous without email';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  r := pg_temp.sub('feedback', false, '  V28@Example.ORG ', '{"category":"other"}'::jsonb, p_phone => '+919876543210');
  assert r = '{"ok": true}'::jsonb, 'email is trimmed/lowercased and phone accepted';
  reset role;
  assert exists (select 1 from public.community_requests where email = 'v28@example.org'), 'email not normalised';
end $$;

-- ───────── rate limits: 5/day per email, per ip hash, per user; 6th is refused ─────────
do $$
declare i int; r jsonb; ip1 constant text := repeat('b', 64); ip2 constant text := repeat('c', 64);
begin
  -- same email
  set local role anon; perform pg_temp.cl(0);
  for i in 1..5 loop
    r := pg_temp.sub('feedback', false, 'limit@example.org', '{"category":"other"}'::jsonb);
    assert r = '{"ok": true}'::jsonb, 'email call ' || i || ' should pass';
  end loop;
  begin perform pg_temp.sub('feedback', false, 'limit@example.org', '{"category":"other"}'::jsonb); assert false, '6th email request accepted';
  exception when others then if sqlerrm <> 'rate_limited' then raise; end if; end;
  r := pg_temp.sub('feedback', false, 'other-person@example.org', '{"category":"other"}'::jsonb);   -- positive twin: another email is unaffected
  assert r = '{"ok": true}'::jsonb, 'rate limit leaked to another email';
  -- same ip hash, different emails
  for i in 1..5 loop
    r := pg_temp.sub('feedback', false, 'ipuser' || i || '@example.org', '{"category":"other"}'::jsonb, p_ip => ip1);
  end loop;
  begin perform pg_temp.sub('feedback', false, 'ipuser6@example.org', '{"category":"other"}'::jsonb, p_ip => ip1); assert false, '6th ip request accepted';
  exception when others then if sqlerrm <> 'rate_limited' then raise; end if; end;
  r := pg_temp.sub('feedback', false, 'ipuser7@example.org', '{"category":"other"}'::jsonb, p_ip => ip2);
  assert r = '{"ok": true}'::jsonb, 'rate limit leaked to another ip hash';
  reset role;
  -- same signed-in user, different emails and no ip
  perform pg_temp.cl(5); set local role authenticated;
  for i in 1..5 loop
    r := pg_temp.sub('feedback', false, 'userlimit' || i || '@example.org', '{"category":"other"}'::jsonb);
  end loop;
  begin perform pg_temp.sub('feedback', false, 'userlimit6@example.org', '{"category":"other"}'::jsonb); assert false, '6th user request accepted';
  exception when others then if sqlerrm <> 'rate_limited' then raise; end if; end;
  reset role;
  perform pg_temp.cl(3); set local role authenticated;
  r := pg_temp.sub('feedback', false, 'userlimit-other@example.org', '{"category":"other"}'::jsonb);   -- another user is unaffected
  reset role;
  assert r = '{"ok": true}'::jsonb, 'rate limit leaked to another user';
end $$;

-- ───────── global backstop: 200 rows per kind per day -> busy; other kinds unaffected ─────────
do $$
declare r jsonb;
begin
  insert into public.community_requests (kind, is_anonymous, name, email, subject, message, details)
  select 'partner', false, 'Seed Person', 'seed' || g || '@example.org', 'seed subject', 'seed message long enough', '{"partnership_type":"other"}'::jsonb
    from generate_series(1, 200) g;
  assert (select count(*) from public.community_requests where kind = 'partner' and created_at > now() - interval '24 hours') >= 200, 'seed failed';
  set local role anon; perform pg_temp.cl(0);
  begin perform pg_temp.sub('partner', false, 'busy@example.org', '{"partnership_type":"sponsor"}'::jsonb); assert false, 'busy not enforced';
  exception when others then if sqlerrm <> 'busy' then raise; end if; end;
  r := pg_temp.sub('host_event', false, 'busy2@example.org', '{"event_title":"Still open kind"}'::jsonb);   -- positive twin
  reset role;
  assert r = '{"ok": true}'::jsonb, 'busy leaked to another kind';
end $$;

rollback;
select 'community-requests: all assertions passed' as result;
