-- Phase 6 Task 1: IEEE membership (roster, claims, decisions, guard, prescreen, proof bucket). ONE execute_sql call; rolls back.
-- Users c601 super, c602 society admin, c603 "Asha Nair", c604 "Asha Nair", c605 "Ravi K", c606 "Dev Menon", c607 not onboarded,
-- c608 "Dev Menon", c609 rate-limit, c610 live holder, c611 reject, c612 guard, c613 prescreen, c614 cap, c615 storage.
-- A failing assertion aborts the call: the final 'all assertions passed' row is the sentinel.
begin;

create function pg_temp.uid(n int) returns text language sql as $$ select '00000000-0000-0000-0000-00000000c6' || lpad(n::text, 2, '0') $$;
create function pg_temp.cl(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when n = 0 then '{"role":"authenticated"}'
         else jsonb_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text end, true);
end $$;

insert into auth.users (id, email, aud, role, raw_user_meta_data)
select pg_temp.uid(n)::uuid, 'c6u' || lpad(n::text, 2, '0') || '@test.local', 'authenticated', 'authenticated',
       jsonb_build_object('full_name', (array['C6 Super','C6 Society','Asha Nair','Asha Nair','Ravi K','Dev Menon','Not Onboarded',
         'Dev Menon','Rate Limit','Holder Live','Reject Me','Guard Test','Prescreen One','Prescreen Cap','Storage Test','Mira Das','Prince'])[n])
from generate_series(1, 17) n;
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true,
       name_changed_at = case when id = pg_temp.uid(16)::uuid then now() else now() - interval '10 days' end
 where id::text like '00000000-0000-0000-0000-00000000c6%' and id <> pg_temp.uid(7)::uuid;
insert into public.admin_roles (user_id, role, society_id)
select pg_temp.uid(1)::uuid, 'super_admin'::public.admin_role, null::uuid
union all select pg_temp.uid(2)::uuid, 'society_admin', s.id from public.societies s where s.slug = 'ras';
-- fake proof objects (bucket ieee-proof exists after the migration)
insert into storage.objects (bucket_id, name)
select 'ieee-proof', pg_temp.uid(n) || '/' || f from (values (6, 'proofproof2.png'), (8, 'proofproof3.png'), (4, 'proofproof4.png'),
  (5, 'proofproof5.png'), (11, 'proofproof6.png'), (12, 'proofproof7.png'), (13, 'proofproof8.png'), (14, 'proofproof9.png')) v(n, f);

-- ───────── hashing + secret isolation ─────────
do $$
declare r text;
begin
  assert private.ieee_hash('12345678') = private.ieee_hash('12345678'), 'hash not deterministic';
  assert private.ieee_hash('12345678') ~ '^[0-9a-f]{64}$', 'hash not 64 hex';
  assert private.ieee_hash('12345678') <> private.ieee_hash('12345679'), 'hash identical for different inputs';
  assert private.ieee_hash('12345678') <> private.ieee_hash('n:12345678'), 'hash ignores prefix';
  assert (select count(*) from private.app_secrets where name = 'ieee_pepper' and octet_length(value) = 32) = 1, 'pepper missing (positive twin)';
  assert has_function_privilege('postgres', 'private.ieee_hash(text)', 'execute'), 'owner cannot hash (positive twin)';
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_function_privilege(r, 'private.ieee_hash(text)', 'execute'), r || ' can execute ieee_hash';
    assert not has_function_privilege(r, 'private.name_token_hashes(text)', 'execute'), r || ' can execute name_token_hashes';
    assert not has_table_privilege(r, 'private.app_secrets', 'select'), r || ' can select app_secrets';
    assert not has_table_privilege(r, 'private.ieee_roster', 'select'), r || ' can select ieee_roster';
    assert not has_table_privilege(r, 'private.ieee_attempts', 'select'), r || ' can select ieee_attempts';
  end loop;
  -- the pepper table is referenced by exactly one function: ieee_hash
  assert (select array_agg(p.proname::text order by p.proname) from pg_proc p
           where p.prosrc ilike '%app_secrets%' and p.pronamespace::regnamespace::text in ('private', 'public')) = array['ieee_hash'],
    'another function reads app_secrets';
  -- really invoked as each API role: permission denied
  perform pg_temp.cl(3);
  set local role authenticated;
  begin perform private.ieee_hash('x'); assert false, 'authenticated hashed';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform 1 from private.app_secrets; assert false, 'authenticated read secrets';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform 1 from private.ieee_roster; assert false, 'authenticated read roster';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  set local role anon;
  begin perform 1 from private.app_secrets; assert false, 'anon read secrets';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform private.ieee_hash('x'); assert false, 'anon hashed';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  set local role service_role;
  begin perform 1 from private.app_secrets; assert false, 'service_role read secrets';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform private.ieee_hash('x'); assert false, 'service_role hashed';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
end $$;

-- ───────── roster import ─────────
do $$
declare t date := private.ist_today(); res jsonb; big jsonb;
begin
  -- negative: non-super (and signed-out) cannot import; positive twin follows
  perform pg_temp.cl(3); set local role authenticated;
  begin perform public.import_ieee_roster('[]'::jsonb, false); assert false, 'student imported roster';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(2); set local role authenticated;
  begin perform public.import_ieee_roster('[]'::jsonb, false); assert false, 'society admin imported roster';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  set local role anon;
  begin perform public.import_ieee_roster('[]'::jsonb, false); assert false, 'anon imported roster';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;

  perform pg_temp.cl(1); set local role authenticated;
  res := public.import_ieee_roster(jsonb_build_array(
    jsonb_build_object('n', '20000001', 'e', (t + 300)::text, 'name', 'Asha Nair'),
    jsonb_build_object('n', '20000002', 'e', (t + 100)::text, 'name', 'Ravi K'),
    jsonb_build_object('n', '20000003', 'e', (t - 5)::text, 'name', 'Dev Menon'),
    jsonb_build_object('n', '1234', 'e', (t + 100)::text, 'name', 'Short Number'),        -- invalid number: skipped
    jsonb_build_object('n', '20000009', 'e', '2027-02-31', 'name', 'Impossible Date'),     -- invalid date: skipped, no error
    jsonb_build_object('n', '20000008', 'e', 'garbage', 'name', 'Garbage Date'),
    '"just a string"'::jsonb), true);
  reset role;
  assert (res ->> 'rows')::int = 3, 'import should store 3 valid rows: ' || res::text;
  assert (select count(*) from private.ieee_roster) = 3, 'roster should hold exactly 3 rows after replace=true';
  assert not exists (select 1 from private.ieee_roster r where r::text ~ '2000000[0-9]' or r::text ilike '%nair%' or r::text ilike '%asha%'),
    'roster stores readable number or name';
  assert exists (select 1 from private.ieee_roster r where r.member_hash = private.ieee_hash('20000001') and r.expires_on = t + 300
                   and cardinality(r.name_hashes) = 2), 'hash row for 20000001 missing';

  perform pg_temp.cl(1); set local role authenticated;
  res := public.import_ieee_roster(jsonb_build_array(jsonb_build_object('n', '20000005', 'e', (t + 200)::text, 'name', 'Priya Menon')), false);
  reset role;
  assert (select count(*) from private.ieee_roster) = 4, 'replace=false must append';

  -- replace=true empties first; duplicates inside a chunk keep the later expiry
  perform pg_temp.cl(1); set local role authenticated;
  res := public.import_ieee_roster(jsonb_build_array(
    jsonb_build_object('n', '20000002', 'e', (t + 10)::text, 'name', 'Ravi K'),
    jsonb_build_object('n', '20000002', 'e', (t + 100)::text, 'name', 'Ravi K')), true);
  reset role;
  assert (select count(*) from private.ieee_roster) = 1, 'replace=true did not empty the roster first';
  assert (select expires_on from private.ieee_roster) = t + 100, 'duplicate number should keep the later expiry';
  perform pg_temp.cl(1); set local role authenticated;
  perform public.import_ieee_roster(jsonb_build_array(
    jsonb_build_object('n', '20000001', 'e', (t + 300)::text, 'name', 'Asha Nair'),
    jsonb_build_object('n', '20000002', 'e', (t + 100)::text, 'name', 'Ravi K'),
    jsonb_build_object('n', '20000003', 'e', (t - 5)::text, 'name', 'Dev Menon'),
    jsonb_build_object('n', '20000005', 'e', (t + 200)::text, 'name', 'Priya Menon')), true);
  reset role;
  assert (select count(*) from private.ieee_roster) = 4, 'full roster reload failed';

  -- > 1000 rows: invalid_input (positive twin: exactly 1000 rows pass)
  select jsonb_agg(jsonb_build_object('n', (30000000 + g)::text, 'e', (t + 50)::text, 'name', 'Bulk Row')) into big from generate_series(1, 1001) g;
  perform pg_temp.cl(1); set local role authenticated;
  begin perform public.import_ieee_roster(big, false); assert false, '1001 rows accepted';
  exception when others then if sqlerrm <> 'invalid_input' then raise; end if; end;
  reset role;
  select jsonb_agg(jsonb_build_object('n', (30000000 + g)::text, 'e', (t + 50)::text, 'name', 'Bulk Row')) into big from generate_series(1, 1000) g;
  perform pg_temp.cl(1); set local role authenticated;
  res := public.import_ieee_roster(big, false);
  reset role;
  assert (res ->> 'rows')::int = 1000, '1000 rows should be accepted';
  perform pg_temp.cl(1); set local role authenticated;
  perform public.import_ieee_roster(jsonb_build_array(
    jsonb_build_object('n', '20000001', 'e', (t + 300)::text, 'name', 'Asha Nair'),
    jsonb_build_object('n', '20000002', 'e', (t + 100)::text, 'name', 'Ravi K'),
    jsonb_build_object('n', '20000003', 'e', (t - 5)::text, 'name', 'Dev Menon'),
    jsonb_build_object('n', '20000005', 'e', (t + 200)::text, 'name', 'Priya Menon')), true);
  assert (public.admin_roster_status() ->> 'rows')::int = 4, 'roster status rows';
  reset role;
  perform pg_temp.cl(3); set local role authenticated;
  begin perform public.admin_roster_status(); assert false, 'student read roster status';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
end $$;

-- ───────── submit ─────────
do $$
declare t date := private.ist_today(); r1 jsonb; r2 jsonb; uid6 text := pg_temp.uid(6); uid4 text := pg_temp.uid(4);
begin
  -- signed out / anon
  perform pg_temp.cl(0); set local role authenticated;
  begin perform public.submit_ieee_claim('20000001', null); assert false, 'signed-out submit accepted';
  exception when others then if sqlerrm <> 'not_signed_in' then raise; end if; end;
  reset role;
  set local role anon;
  begin perform public.submit_ieee_claim('20000001', null); assert false, 'anon submit accepted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;

  perform pg_temp.cl(3); set local role authenticated;
  begin perform public.submit_ieee_claim('12345', null); assert false, 'short number accepted';
  exception when others then if sqlerrm <> 'invalid_number' then raise; end if; end;
  begin perform public.submit_ieee_claim('20000001', uid4 || '/proofproof4.png'); assert false, 'foreign proof path accepted';
  exception when others then if sqlerrm <> 'invalid_proof' then raise; end if; end;
  begin perform public.submit_ieee_claim('20000001', pg_temp.uid(3) || '/doesnotexist.png'); assert false, 'missing proof object accepted';
  exception when others then if sqlerrm <> 'invalid_proof' then raise; end if; end;
  reset role;
  perform pg_temp.cl(7); set local role authenticated;
  begin perform public.submit_ieee_claim('20000001', null); assert false, 'not onboarded accepted';
  exception when others then if sqlerrm <> 'not_onboarded' then raise; end if; end;
  reset role;
  assert (select count(*) from private.ieee_attempts where user_id in (pg_temp.uid(3)::uuid, pg_temp.uid(7)::uuid)) = 0,
    'malformed input must not count as an attempt';

  -- roster number + matching name -> verified
  perform pg_temp.cl(3); set local role authenticated;
  r1 := public.submit_ieee_claim('20000001', null);
  reset role;
  assert r1 ->> 'status' = 'verified', 'roster match not verified: ' || r1::text;
  assert (r1 ->> 'verified_until')::date = t + 300, 'verified_until should equal the roster expiry';
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(3)::uuid) = '20000001', 'profile_private not synced';
  assert (select roster_matched and method = 'roster' from public.ieee_claims where id = (r1 ->> 'claim_id')::uuid), 'claim flags';

  -- roster number + DIFFERENT name == number not on the roster (no oracle)
  perform pg_temp.cl(6); set local role authenticated;
  r1 := public.submit_ieee_claim('20000005', null);
  r2 := public.submit_ieee_claim('29999999', null);
  reset role;
  assert r1 ->> 'status' = 'pending_review' and r2 ->> 'status' = 'pending_review' and r1 ->> 'verified_until' is null and r2 ->> 'verified_until' is null,
    'name mismatch vs not-on-roster differ: ' || r1::text || ' / ' || r2::text;
  assert (select proof_path is null from public.ieee_claims where id = (r2 ->> 'claim_id')::uuid), 'number-only claim stored a proof path';
  -- with proof -> pending_review
  perform pg_temp.cl(6); set local role authenticated;
  r1 := public.submit_ieee_claim('20000005', uid6 || '/proofproof2.png');
  reset role;
  assert r1 ->> 'status' = 'pending_review' and r1 ->> 'verified_until' is null, 'proof submit not pending: ' || r1::text;
  assert (select proof_path from public.ieee_claims where id = (r1 ->> 'claim_id')::uuid) = uid6 || '/proofproof2.png', 'proof path not stored';
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(6)::uuid) = '20000005', 'pending claim not synced';
  -- a new pending claim withdraws the previous pending one
  perform pg_temp.cl(6); set local role authenticated;
  r2 := public.submit_ieee_claim('20000005', uid6 || '/proofproof2.png');
  reset role;
  assert (select count(*) from public.ieee_claims where user_id = pg_temp.uid(6)::uuid and status = 'pending_review') = 1, 'two pending claims';
  assert (select count(*) from public.ieee_claims where user_id = pg_temp.uid(6)::uuid and status = 'withdrawn') = 3, 'old pending not withdrawn';

  -- expired roster row: pending without proof (an officer checks the Validator), pending with proof; the import then auto-verifies it
  perform pg_temp.cl(8); set local role authenticated;
  r1 := public.submit_ieee_claim('20000003', null);
  assert r1 ->> 'status' = 'pending_review' and r1 ->> 'verified_until' is null, 'expired roster row verified: ' || r1::text;
  r1 := public.submit_ieee_claim('20000003', pg_temp.uid(8) || '/proofproof3.png');
  reset role;
  assert r1 ->> 'status' = 'pending_review', 'expired roster + proof not pending';
  perform pg_temp.cl(1); set local role authenticated;
  r2 := public.import_ieee_roster(jsonb_build_array(jsonb_build_object('n', '20000003', 'e', (t + 50)::text, 'name', 'Dev Menon')), false);
  reset role;
  assert (r2 ->> 'auto_verified')::int = 1, 'import should auto-verify the pending claim: ' || r2::text;
  assert (select status = 'verified' and method = 'roster' and verified_until = t + 50 and roster_matched
            from public.ieee_claims where id = (r1 ->> 'claim_id')::uuid), 'auto-verified claim fields';

  -- uniqueness: a second account cannot claim a verified number (positive twin: c603 verified above)
  perform pg_temp.cl(4); set local role authenticated;
  r1 := public.submit_ieee_claim('20000001', null);
  reset role;
  assert r1 ->> 'status' = 'proof_required', 'a held number without proof must require proof: ' || r1::text;
  assert (select count(*) from public.ieee_claims where user_id = pg_temp.uid(4)::uuid) = 0, 'refused held-number claim left a row';
  perform pg_temp.cl(4); set local role authenticated;
  r1 := public.submit_ieee_claim('20000001', uid4 || '/proofproof4.png');
  reset role;
  assert r1 ->> 'status' = 'pending_review', 'real member locked out of a held number even with proof: ' || r1::text;
  assert (select status from public.ieee_claims where user_id = pg_temp.uid(3)::uuid and method = 'roster') = 'verified', 'dispute claim displaced the holder';

  -- extend, never shorten
  perform pg_temp.cl(1); set local role authenticated;
  r1 := public.import_ieee_roster(jsonb_build_array(jsonb_build_object('n', '20000001', 'e', (t + 400)::text, 'name', 'Asha Nair')), false);
  reset role;
  assert (r1 ->> 'extended')::int = 1, 'later expiry should extend: ' || r1::text;
  assert (select verified_until from public.ieee_claims where user_id = pg_temp.uid(3)::uuid and status = 'verified') = t + 400, 'not extended';
  perform pg_temp.cl(1); set local role authenticated;
  r1 := public.import_ieee_roster(jsonb_build_array(jsonb_build_object('n', '20000001', 'e', (t + 100)::text, 'name', 'Asha Nair')), false);
  reset role;
  assert (r1 ->> 'extended')::int = 0, 'earlier expiry must not extend';
  assert (select verified_until from public.ieee_claims where user_id = pg_temp.uid(3)::uuid and status = 'verified') = t + 400, 'verified_until was shortened';
  -- and a roster without the member never demotes
  perform pg_temp.cl(1); set local role authenticated;
  perform public.import_ieee_roster(jsonb_build_array(jsonb_build_object('n', '20000002', 'e', (t + 100)::text, 'name', 'Ravi K')), true);
  reset role;
  assert (select status from public.ieee_claims where user_id = pg_temp.uid(3)::uuid and method = 'roster') = 'verified', 'roster replace demoted a member';
  perform pg_temp.cl(1); set local role authenticated;
  perform public.import_ieee_roster(jsonb_build_array(
    jsonb_build_object('n', '20000001', 'e', (t + 100)::text, 'name', 'Asha Nair'),
    jsonb_build_object('n', '20000002', 'e', (t + 100)::text, 'name', 'Ravi K'),
    jsonb_build_object('n', '20000005', 'e', (t + 200)::text, 'name', 'Priya Menon')), true);
  reset role;
end $$;

-- I2 / M1: name stability, single-token names, name lock
do $$
declare t date := private.ist_today(); r jsonb; n int;
begin
  perform pg_temp.cl(1); set local role authenticated;
  perform public.import_ieee_roster(jsonb_build_array(
    jsonb_build_object('n', '20000016', 'e', (t + 200)::text, 'name', 'Mira Das'),
    jsonb_build_object('n', '20000017', 'e', (t + 200)::text, 'name', 'Prince')), false);
  reset role;
  -- name changed just now: roster match alone does not verify (twin: same call verifies after 8 quiet days)
  perform pg_temp.cl(16); set local role authenticated;
  r := public.submit_ieee_claim('20000016', null);
  reset role;
  assert r ->> 'status' = 'pending_review', 'fresh name auto-verified: ' || r::text;
  update public.profiles set name_changed_at = now() - interval '8 days' where id = pg_temp.uid(16)::uuid;
  perform pg_temp.cl(16); set local role authenticated;
  r := public.submit_ieee_claim('20000016', null);
  reset role;
  assert r ->> 'status' = 'verified', 'stable name did not verify: ' || r::text;
  -- verified members cannot rename (positive twin below: an unverified user can, and the change is stamped)
  perform pg_temp.cl(16); set local role authenticated;
  begin update public.profiles set full_name = 'Someone Else' where id = pg_temp.uid(16)::uuid; assert false, 'verified member renamed';
  exception when others then if sqlerrm <> 'name_locked' then raise; end if; end;
  reset role;
  assert (select full_name from public.profiles where id = pg_temp.uid(16)::uuid) = 'Mira Das', 'name changed despite lock';
  -- M1: a one-token name never auto-verifies, even on an exact roster match
  perform pg_temp.cl(17); set local role authenticated;
  r := public.submit_ieee_claim('20000017', null);
  reset role;
  assert r ->> 'status' = 'pending_review', 'single-token name auto-verified: ' || r::text;
  perform pg_temp.cl(17); set local role authenticated;
  update public.profiles set full_name = 'Prince Rogers' where id = pg_temp.uid(17)::uuid;
  reset role;
  assert (select name_changed_at > now() - interval '1 minute' from public.profiles where id = pg_temp.uid(17)::uuid), 'rename not stamped';
  assert not private.names_overlap(private.name_token_hashes('Prince'), private.name_token_hashes('Prince')), 'single tokens overlap';
  assert private.names_overlap(private.name_token_hashes('Asha Nair'), private.name_token_hashes('Nair Asha')), 'two-token reorder should overlap (positive twin)';
end $$;

-- rate limit: ten calls pass (and persist), the eleventh is refused; the attempts survive the refusal
do $$
declare i int; r jsonb;
begin
  perform pg_temp.cl(9); set local role authenticated;
  for i in 1..10 loop
    r := public.submit_ieee_claim('29999999', null);
    assert r ->> 'status' = 'pending_review', 'call ' || i || ' should not be limited: ' || r::text;
  end loop;
  r := public.submit_ieee_claim('29999999', null);
  reset role;
  assert r ->> 'status' = 'rate_limited', '11th call should be rate_limited: ' || r::text;
  assert (select count(*) from private.ieee_attempts where user_id = pg_temp.uid(9)::uuid) = 10, 'attempt rows did not persist after refusal';
  -- another user is unaffected
  perform pg_temp.cl(5); set local role authenticated;
  r := public.submit_ieee_claim('29999999', null);
  reset role;
  assert r ->> 'status' = 'pending_review', 'rate limit leaked to another user';
end $$;

-- ───────── state, lapse, release ─────────
do $$
declare t date := private.ist_today(); r jsonb; n int;
begin
  perform pg_temp.cl(3); set local role authenticated;
  r := public.my_membership();
  assert (r ->> 'verified')::boolean and not (r ->> 'expired')::boolean, 'live member should be verified: ' || r::text;
  assert (public.profile_verified(pg_temp.uid(3)::uuid)), 'profile_verified false for a live member';
  -- owner reads own row, but not roster_matched / prescreen
  assert (select count(*) from public.ieee_claims) = 1, 'owner should see exactly their own claim';
  begin perform roster_matched from public.ieee_claims; assert false, 'owner read roster_matched';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform prescreen from public.ieee_claims; assert false, 'owner read prescreen';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin insert into public.ieee_claims (user_id, member_number, status) values (pg_temp.uid(3)::uuid, '55555555', 'pending_review');
    assert false, 'owner inserted a claim';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin update public.ieee_claims set verified_until = verified_until + 100; assert false, 'owner updated a claim';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin delete from public.ieee_claims; assert false, 'owner deleted a claim';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  -- other users see nothing (c607 has no claims; positive twin: owner saw 1)
  perform pg_temp.cl(7); set local role authenticated;
  select count(*) into n from public.ieee_claims;
  reset role;
  assert n = 0, 'a stranger sees claims';
  -- signed-in only: no auth -> false, anon cannot even execute
  perform pg_temp.cl(0); set local role authenticated;
  assert not public.profile_verified(pg_temp.uid(3)::uuid), 'profile_verified true without a session';
  reset role;
  set local role anon;
  begin perform public.profile_verified(pg_temp.uid(3)::uuid); assert false, 'anon executed profile_verified';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(5); set local role authenticated;
  assert public.profile_verified(pg_temp.uid(3)::uuid), 'another signed-in user cannot see the badge';
  assert not public.profile_verified(pg_temp.uid(5)::uuid), 'non-member shown as verified';
  reset role;

  -- lapse: verified_until yesterday
  update public.ieee_claims set verified_until = t - 1 where user_id = pg_temp.uid(3)::uuid and status = 'verified';
  perform pg_temp.cl(3); set local role authenticated;
  r := public.my_membership();
  assert not (r ->> 'verified')::boolean and (r ->> 'expired')::boolean, 'lapsed claim must read as expired: ' || r::text;
  assert not public.profile_verified(pg_temp.uid(3)::uuid), 'lapsed member shown as verified';
  reset role;
  -- a lapsed claim releases its number to another account (roster match for c604)
  perform pg_temp.cl(4); set local role authenticated;
  r := public.submit_ieee_claim('20000001', null);
  reset role;
  assert r ->> 'status' = 'verified', 'lapsed number not released: ' || r::text;
  assert (select status from public.ieee_claims where user_id = pg_temp.uid(3)::uuid order by created_at desc limit 1) = 'withdrawn',
    'lapsed claim not withdrawn';
end $$;

-- ───────── guard on profile_private.ieee_member_id ─────────
do $$
declare t date := private.ist_today(); r jsonb;
begin
  -- verified (c604): locked
  perform pg_temp.cl(4); set local role authenticated;
  update public.profile_private set ieee_member_id = '30000001' where user_id = pg_temp.uid(4)::uuid;
  reset role;
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(4)::uuid) = '20000001', 'verified member changed the locked number';
  -- positive twin: unverified user (c607) can change it
  perform pg_temp.cl(7); set local role authenticated;
  update public.profile_private set ieee_member_id = '30000001' where user_id = pg_temp.uid(7)::uuid;
  reset role;
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(7)::uuid) = '30000001', 'unverified user blocked from editing';
  -- after lapse (c608: roster-verified above, then lapsed) the value changes
  update public.ieee_claims set verified_until = t - 1 where user_id = pg_temp.uid(8)::uuid and status = 'verified';
  perform pg_temp.cl(8); set local role authenticated;
  update public.profile_private set ieee_member_id = '30000003' where user_id = pg_temp.uid(8)::uuid;
  reset role;
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(8)::uuid) = '30000003', 'lapsed member still locked';
  -- pending claim with another number is withdrawn; same number keeps it
  perform pg_temp.cl(12); set local role authenticated;
  r := public.submit_ieee_claim('20000010', pg_temp.uid(12) || '/proofproof7.png');
  update public.profile_private set ieee_member_id = '20000010' where user_id = pg_temp.uid(12)::uuid;
  reset role;
  assert (select status from public.ieee_claims where id = (r ->> 'claim_id')::uuid) = 'pending_review', 'same number withdrew the pending claim';
  perform pg_temp.cl(12); set local role authenticated;
  update public.profile_private set ieee_member_id = '30000002' where user_id = pg_temp.uid(12)::uuid;
  reset role;
  assert (select status from public.ieee_claims where id = (r ->> 'claim_id')::uuid) = 'withdrawn', 'changed number kept the pending claim';
end $$;

-- ───────── decisions ─────────
do $$
declare t date := private.ist_today(); cid6 uuid; cid4 uuid; cid5 uuid; cid11 uuid; r jsonb; q jsonb; n int;
begin
  select id into cid6 from public.ieee_claims where user_id = pg_temp.uid(6)::uuid and status = 'pending_review';
  assert cid6 is not null, 'fixture: c606 pending claim';
  -- negatives: non-super and society admin
  perform pg_temp.cl(3); set local role authenticated;
  begin perform public.admin_decide_claim(cid6, true, t + 30, null); assert false, 'student decided';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_revoke_claim(cid6); assert false, 'student revoked';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_membership_queue(10, 0); assert false, 'student read queue';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_verified_members(10, 0); assert false, 'student read verified list';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_claim_proof(cid6); assert false, 'student read proof path';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(2); set local role authenticated;
  begin perform public.admin_decide_claim(cid6, true, t + 30, null); assert false, 'society admin decided';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;

  perform pg_temp.cl(1); set local role authenticated;
  -- queue shows the pending claim with number + name (super admin only), limit is clamped
  q := public.admin_membership_queue(10000, 0);
  assert (q ->> 'total')::int >= 1 and jsonb_array_length(q -> 'rows') >= 1, 'queue empty';
  assert exists (select 1 from jsonb_array_elements(q -> 'rows') x where x ->> 'id' = cid6::text and x ->> 'member_number' = '20000005'
                   and x ->> 'full_name' = 'Dev Menon' and (x ->> 'has_proof')::boolean), 'queue row shape';
  assert public.admin_claim_proof(cid6) = pg_temp.uid(6) || '/proofproof2.png', 'admin_claim_proof';
  -- date validation
  begin perform public.admin_decide_claim(cid6, true, t + 741, null); assert false, 'date too far';
  exception when others then if sqlerrm <> 'invalid_date' then raise; end if; end;
  begin perform public.admin_decide_claim(cid6, true, t - 1, null); assert false, 'past date';
  exception when others then if sqlerrm <> 'invalid_date' then raise; end if; end;
  begin perform public.admin_decide_claim(cid6, true, null, null); assert false, 'null date';
  exception when others then if sqlerrm <> 'invalid_date' then raise; end if; end;
  begin perform public.admin_decide_claim(cid6, false, null, null); assert false, 'reject without reason';
  exception when others then if sqlerrm <> 'invalid_reason' then raise; end if; end;
  begin perform public.admin_decide_claim(cid6, false, null, 'because'); assert false, 'reject bad reason';
  exception when others then if sqlerrm <> 'invalid_reason' then raise; end if; end;
  begin perform public.admin_decide_claim(gen_random_uuid(), true, t + 30, null); assert false, 'unknown claim';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  -- positive: boundary date t+740 would also pass; approve c606 for 30 days
  perform public.admin_decide_claim(cid6, true, t + 30, null);
  reset role;
  assert (select status = 'verified' and method = 'admin' and verified_until = t + 30 and decided_by = pg_temp.uid(1)::uuid
            from public.ieee_claims where id = cid6), 'approve fields';
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(6)::uuid) = '20000005', 'approve did not sync number';
  assert (select count(*) from public.audit_log where action = 'membership.approved' and target_id = cid6::text) = 1, 'approve audit row count';
  assert not exists (select 1 from public.audit_log a, jsonb_each(a.summary) e where a.target_id = cid6::text and jsonb_typeof(e.value) = 'string'),
    'approve audit summary has strings';
  assert (select (summary ->> 'days')::int from public.audit_log where action = 'membership.approved' and target_id = cid6::text) = 30, 'audit days';

  -- approve withdraws the user's previous verified claim: c604 (verified 20000001) submits 20000006 with proof
  perform pg_temp.cl(4); set local role authenticated;
  r := public.submit_ieee_claim('20000006', pg_temp.uid(4) || '/proofproof4.png');
  reset role;
  cid4 := (r ->> 'claim_id')::uuid;
  assert r ->> 'status' = 'pending_review', 'renewal with other number not pending';
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(4)::uuid) = '20000001', 'pending claim overwrote a live verified number';
  assert exists (select 1 from public.ieee_claims where user_id = pg_temp.uid(4)::uuid and status = 'verified'), 'old verified claim vanished early';
  perform pg_temp.cl(1); set local role authenticated;
  perform public.admin_decide_claim(cid4, true, t + 60, null);
  reset role;
  assert (select count(*) from public.ieee_claims where user_id = pg_temp.uid(4)::uuid and status = 'verified') = 1, 'two verified claims';
  assert (select member_number from public.ieee_claims where user_id = pg_temp.uid(4)::uuid and status = 'verified') = '20000006', 'new claim not the verified one';
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(4)::uuid) = '20000006', 'number not re-synced';

  -- approving a number held by another LIVE account raises 23505 (positive twin: approve above worked)
  perform pg_temp.cl(5); set local role authenticated;
  r := public.submit_ieee_claim('20000007', pg_temp.uid(5) || '/proofproof5.png');
  reset role;
  cid5 := (r ->> 'claim_id')::uuid;
  assert r ->> 'status' = 'pending_review', 'c605 not pending';
  insert into public.ieee_claims (user_id, member_number, status, method, verified_until)
    values (pg_temp.uid(10)::uuid, '20000007', 'verified', 'admin', t + 100);
  perform pg_temp.cl(1); set local role authenticated;
  begin perform public.admin_decide_claim(cid5, true, t + 30, null); assert false, 'approved a number held by a live account';
  exception when others then if sqlstate <> '23505' then raise; end if; end;
  reset role;
  assert (select status from public.ieee_claims where id = cid5) = 'pending_review', 'failed approval changed the claim';
  -- and the submit side says unavailable for a third account
  perform pg_temp.cl(11); set local role authenticated;
  r := public.submit_ieee_claim('20000007', pg_temp.uid(11) || '/proofproof6.png');
  reset role;
  assert r ->> 'status' = 'pending_review', 'held number with proof must go to review: ' || r::text;

  -- reject (c611): reason recorded, one audit row
  perform pg_temp.cl(11); set local role authenticated;
  r := public.submit_ieee_claim('20000011', pg_temp.uid(11) || '/proofproof6.png');
  reset role;
  cid11 := (r ->> 'claim_id')::uuid;
  perform pg_temp.cl(1); set local role authenticated;
  perform public.admin_decide_claim(cid11, false, null, 'unreadable');
  reset role;
  assert (select status = 'rejected' and reject_reason = 'unreadable' from public.ieee_claims where id = cid11), 'reject fields';
  assert (select count(*) from public.audit_log where action = 'membership.rejected' and target_id = cid11::text) = 1, 'reject audit row count';
  perform pg_temp.cl(11); set local role authenticated;
  r := public.my_membership();
  reset role;
  assert r ->> 'status' = 'rejected' and r ->> 'reject_reason' = 'unreadable' and not (r ->> 'verified')::boolean, 'rejected state: ' || r::text;
  -- an already-decided claim cannot be decided again
  perform pg_temp.cl(1); set local role authenticated;
  begin perform public.admin_decide_claim(cid11, true, t + 30, null); assert false, 'decided twice';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  -- verified list: last4 only
  q := public.admin_verified_members(10, 0);
  assert exists (select 1 from jsonb_array_elements(q -> 'rows') x where x ->> 'id' = cid6::text and x ->> 'last4' = '0005'), 'verified list last4';
  assert not (q::text ~ '2000000[0-9]'), 'verified list leaks the full number';

  -- revoke c606: badge gone, one audit row, second revoke not_found
  perform public.admin_revoke_claim(cid6);
  reset role;
  perform pg_temp.cl(5); set local role authenticated;
  assert not public.profile_verified(pg_temp.uid(6)::uuid), 'revoked member still verified';
  reset role;
  assert (select count(*) from public.audit_log where action = 'membership.revoked' and target_id = cid6::text) = 1, 'revoke audit row count';
  perform pg_temp.cl(1); set local role authenticated;
  begin perform public.admin_revoke_claim(cid6); assert false, 'revoked twice';
  exception when others then if sqlerrm <> 'not_found' then raise; end if; end;
  reset role;
  -- every membership audit row carries only numbers/booleans
  assert not exists (select 1 from public.audit_log a, jsonb_each(a.summary) e
                      where a.action like 'membership.%' and jsonb_typeof(e.value) not in ('number', 'boolean')), 'membership audit has non-scalar/strings';
  assert (select count(*) from public.audit_log where action = 'membership.roster_imported') >= 8, 'roster imports not audited';
end $$;

-- ───────── pre-screen bookkeeping ─────────
do $$
declare cid uuid; cid14 uuid; r jsonb; p jsonb;
begin
  perform pg_temp.cl(13); set local role authenticated;
  r := public.submit_ieee_claim('20000013', pg_temp.uid(13) || '/proofproof8.png');
  begin perform public.begin_prescreen((r ->> 'claim_id')::uuid); assert false, 'authenticated began prescreen';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.record_prescreen((r ->> 'claim_id')::uuid, true, '{}'::jsonb); assert false, 'authenticated recorded prescreen';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  cid := (r ->> 'claim_id')::uuid;
  assert not has_function_privilege('authenticated', 'private.begin_prescreen(uuid)', 'execute'), 'private begin_prescreen exposed';
  assert not has_function_privilege('anon', 'public.begin_prescreen(uuid)', 'execute'), 'anon begin_prescreen';

  set local role service_role;
  p := public.begin_prescreen(cid);
  assert p ->> 'proof_path' = pg_temp.uid(13) || '/proofproof8.png' and p ->> 'member_number' = '20000013' and p ->> 'full_name' = 'Prescreen One', 'begin payload';
  assert public.begin_prescreen(cid) is null, 'second begin while running (positive twin: first returned a payload)';
  perform public.record_prescreen(cid, false, '{}'::jsonb);
  p := public.begin_prescreen(cid);
  assert p is not null, 'second attempt after failure should run';
  perform public.record_prescreen(cid, true, '{"readable":true,"number_match":true,"name_match":false,"expiry":"2099-01-01","extra":"x"}'::jsonb);
  assert public.begin_prescreen(cid) is null, 'third attempt must return null (attempts = 2)';
  reset role;
  assert (select status = 'pending_review' and prescreen_status = 'done' and prescreen_attempts = 2
            and prescreen = '{"readable":true,"number_match":true,"name_match":false,"expiry":"2099-01-01"}'::jsonb
            from public.ieee_claims where id = cid), 'prescreen result must only fill prescreen fields and keep pending_review';

  -- global cap: 100 runs in 24 h -> the next begin returns null (positive twin after the seed is removed)
  perform pg_temp.cl(14); set local role authenticated;
  r := public.submit_ieee_claim('20000014', pg_temp.uid(14) || '/proofproof9.png');
  reset role;
  cid14 := (r ->> 'claim_id')::uuid;
  insert into public.ieee_claims (user_id, member_number, status, prescreen_attempts, prescreen_status, reject_reason)
    select pg_temp.uid(1)::uuid, '88888888', 'rejected', 1, 'done', 'other' from generate_series(1, 100);
  set local role service_role;
  assert public.begin_prescreen(cid14) is null, 'cap of 100 runs/day not enforced';
  reset role;
  delete from public.ieee_claims where member_number = '88888888';
  set local role service_role;
  assert public.begin_prescreen(cid14) is not null, 'begin should work once the cap is clear';
  reset role;
end $$;

-- ───────── proof bucket ─────────
do $$
declare i int; n int;
begin
  perform pg_temp.cl(15); set local role authenticated;
  for i in 1..10 loop
    insert into storage.objects (bucket_id, name) values ('ieee-proof', pg_temp.uid(15) || '/file' || lpad(i::text, 2, '0') || '.png');
  end loop;
  begin insert into storage.objects (bucket_id, name) values ('ieee-proof', pg_temp.uid(15) || '/file11.png'); assert false, '11th object accepted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin insert into storage.objects (bucket_id, name) values ('ieee-proof', pg_temp.uid(5) || '/intruder.png'); assert false, 'wrote into another folder';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  select count(*) into n from storage.objects where bucket_id = 'ieee-proof' and name like pg_temp.uid(15) || '/%';
  assert n = 10, 'owner should read their 10 objects, got ' || n;
  reset role;
  perform pg_temp.cl(5); set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'ieee-proof' and name like pg_temp.uid(15) || '/%';
  reset role;
  assert n = 0, 'another user reads proofs';
  perform pg_temp.cl(1); set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'ieee-proof' and name like pg_temp.uid(15) || '/%';
  reset role;
  assert n = 10, 'super admin cannot read proofs';
  perform pg_temp.cl(2); set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'ieee-proof' and name like pg_temp.uid(15) || '/%';
  reset role;
  assert n = 0, 'society admin reads proofs';
  set local role anon;
  begin
    select count(*) into n from storage.objects where bucket_id = 'ieee-proof';
    assert n = 0, 'anon reads proofs';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  -- owner may delete own object, not another's
  perform pg_temp.cl(15); set local role authenticated;
  perform set_config('storage.allow_delete_query', 'true', true);   -- the Storage API sets this; direct deletes are otherwise blocked by storage.protect_delete
  delete from storage.objects where bucket_id = 'ieee-proof' and name = pg_temp.uid(15) || '/file10.png';
  get diagnostics n = row_count;
  assert n = 1, 'owner could not delete own proof';
  delete from storage.objects where bucket_id = 'ieee-proof' and name = pg_temp.uid(5) || '/proofproof5.png';
  get diagnostics n = row_count;
  reset role;
  assert n = 0, 'deleted another user''s proof';
  assert (select not public and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] from storage.buckets where id = 'ieee-proof'),
    'bucket must be private with the 5 MB / image-only limits';
end $$;

-- ───────── log_admin_event whitelist ─────────
do $$
begin
  perform pg_temp.cl(1); set local role authenticated;
  perform public.log_admin_event('requests.export', 'community_requests', null, null, '{"rows":3}'::jsonb);
  perform public.log_admin_event('membership.proof_view', 'ieee_claim', 'x', null, '{"ok":true}'::jsonb);
  begin perform public.log_admin_event('x.y', 'misc', null, null, '{}'::jsonb); assert false, 'unknown action accepted';
  exception when others then if sqlerrm <> 'invalid_action' then raise; end if; end;
  begin perform public.log_admin_event('requests.export', 'community_requests', null, null, '{"note":"text"}'::jsonb); assert false, 'string summary accepted';
  exception when others then if sqlerrm <> 'invalid_summary' then raise; end if; end;
  reset role;
  assert (select count(*) from public.audit_log where action in ('requests.export', 'membership.proof_view')) = 2, 'whitelisted events not logged';
  perform pg_temp.cl(2); set local role authenticated;
  begin perform public.log_admin_event('requests.export', 'community_requests', null, null, '{"rows":3}'::jsonb); assert false, 'society admin exported';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(3); set local role authenticated;
  begin perform public.log_admin_event('requests.export', 'community_requests', null, null, '{"rows":3}'::jsonb); assert false, 'student logged an admin event';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
end $$;

-- ───────── Validator flow: padding, number-only claims, approve-with-confirmation, queue email ─────────
do $$
declare t date := private.ist_today(); r jsonb; q jsonb; cid uuid; a jsonb;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (pg_temp.uid(18)::uuid, 'c6u18@test.local', 'authenticated', 'authenticated', jsonb_build_object('full_name', 'Val Idator'));
  update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true where id = pg_temp.uid(18)::uuid;

  -- a 7-digit number is padded to the 8-digit form; no proof photo is needed for a number nobody holds
  perform pg_temp.cl(18); set local role authenticated;
  r := public.submit_ieee_claim('3000001', null);
  reset role;
  assert r ->> 'status' = 'pending_review', 'number-only claim not pending: ' || r::text;
  cid := (r ->> 'claim_id')::uuid;
  assert (select member_number from public.ieee_claims where id = cid) = '03000001', 'number not padded';
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(18)::uuid) = '03000001', 'padded number not synced';
  perform pg_temp.cl(18); set local role authenticated;
  begin perform public.submit_ieee_claim('300000', null); assert false, '6 digit number accepted';
  exception when others then if sqlerrm <> 'invalid_number' then raise; end if; end;
  reset role;

  -- the queue shows the number and the email the member used (positive twin: super admin; negatives: society admin, student)
  perform pg_temp.cl(1); set local role authenticated;
  q := public.admin_membership_queue(50, 0);
  reset role;
  assert exists (select 1 from jsonb_array_elements(q -> 'rows') x
                  where x ->> 'member_number' = '03000001' and x ->> 'email' = 'c6u18@test.local' and (x ->> 'has_proof')::boolean = false),
    'queue row missing email / number';
  perform pg_temp.cl(2); set local role authenticated;
  begin perform public.admin_membership_queue(50, 0); assert false, 'society admin read the queue';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(18); set local role authenticated;
  begin perform public.admin_membership_queue(50, 0); assert false, 'student read the queue';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin perform public.admin_approve_claim(cid, t + 30, true); assert false, 'student approved';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  perform pg_temp.cl(2); set local role authenticated;
  begin perform public.admin_approve_claim(cid, t + 30, true); assert false, 'society admin approved';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;

  -- approving requires the Validator confirmation and a sane date; nothing changes on refusal
  perform pg_temp.cl(1); set local role authenticated;
  begin perform public.admin_approve_claim(cid, t + 30, false); assert false, 'approved without confirmation';
  exception when others then if sqlerrm <> 'validator_unconfirmed' then raise; end if; end;
  begin perform public.admin_approve_claim(cid, t + 30, null); assert false, 'approved with null confirmation';
  exception when others then if sqlerrm <> 'validator_unconfirmed' then raise; end if; end;
  begin perform public.admin_approve_claim(cid, t - 1, true); assert false, 'approved with a past date';
  exception when others then if sqlerrm <> 'invalid_date' then raise; end if; end;
  begin perform public.admin_approve_claim(cid, t + 741, true); assert false, 'approved more than 740 days ahead';
  exception when others then if sqlerrm <> 'invalid_date' then raise; end if; end;
  reset role;
  assert (select status from public.ieee_claims where id = cid) = 'pending_review', 'refused approval changed the claim';
  assert not exists (select 1 from public.audit_log where action = 'membership.approved' and target_id = cid::text), 'refused approval was audited';

  perform pg_temp.cl(1); set local role authenticated;
  perform public.admin_approve_claim(cid, t + 365, true);
  reset role;
  assert (select status = 'verified' and method = 'admin' and verified_until = t + 365 from public.ieee_claims where id = cid), 'approve fields';
  select summary into a from public.audit_log where action = 'membership.approved' and target_id = cid::text;
  assert a is not null and jsonb_typeof(a -> 'validator_confirmed') = 'boolean' and (a ->> 'validator_confirmed')::boolean, 'audit lacks validator_confirmed=true: ' || a::text;
  assert not exists (select 1 from jsonb_each(a) e where jsonb_typeof(e.value) not in ('number', 'boolean')), 'audit summary has non-number/boolean values';
  -- the older direct path stays available and records false (c606 was approved through it above)
  assert exists (select 1 from public.audit_log where action = 'membership.approved' and (summary ->> 'validator_confirmed')::boolean = false), 'direct approval should record false';

  -- grants: only authenticated can call the new wrapper
  assert has_function_privilege('authenticated', 'public.admin_approve_claim(uuid,date,boolean)', 'execute'), 'authenticated cannot approve (positive twin)';
  assert not has_function_privilege('anon', 'public.admin_approve_claim(uuid,date,boolean)', 'execute'), 'anon can approve';
  assert not has_function_privilege('service_role', 'public.admin_approve_claim(uuid,date,boolean)', 'execute'), 'service_role can approve';
  assert not has_function_privilege('anon', 'private.admin_approve_claim(uuid,date,boolean)', 'execute'), 'anon can call the private approve';
end $$;

-- ───────── 9-digit and 7-digit member numbers (IEEE issues both 8 and 9 digit numbers) ─────────
do $$
declare res jsonb; r1 jsonb; t date := (now() at time zone 'Asia/Kolkata')::date; hn text;
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  select pg_temp.uid(n)::uuid, 'c6u' || n || '@test.local', 'authenticated', 'authenticated', jsonb_build_object('full_name', 'Kiran Joseph')
    from generate_series(18, 19) n;
  update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true, name_changed_at = now() - interval '10 days'
   where id in (pg_temp.uid(18)::uuid, pg_temp.uid(19)::uuid);
  perform pg_temp.cl(1); set local role authenticated;
  res := public.import_ieee_roster(jsonb_build_array(
    jsonb_build_object('n', '101809133', 'e', (t + 120)::text, 'name', 'Kiran Joseph'),
    jsonb_build_object('n', '1234567890', 'e', (t + 120)::text, 'name', 'Too Long'),       -- 10 digits: skipped
    jsonb_build_object('n', '12ab5678', 'e', (t + 120)::text, 'name', 'Not Digits')), false);
  reset role;
  assert (res ->> 'rows')::int = 1, 'only the 9-digit row should import: ' || res::text;
  assert exists (select 1 from private.ieee_roster r where r.member_hash = private.ieee_hash('101809133')), '9-digit roster hash missing';
  assert not exists (select 1 from private.ieee_roster r where r.member_hash = private.ieee_hash('1234567890')), '10-digit row imported';

  -- a 9-digit claim hashes the same value as the 9-digit roster row -> verified, stored unpadded
  perform pg_temp.cl(18); set local role authenticated;
  r1 := public.submit_ieee_claim('101809133', null);
  reset role;
  assert r1 ->> 'status' = 'verified', '9-digit roster claim not verified: ' || r1::text;
  assert (select member_number from public.ieee_claims where id = (r1 ->> 'claim_id')::uuid) = '101809133', '9-digit number was altered';
  assert (select ieee_member_id from public.profile_private where user_id = pg_temp.uid(18)::uuid) = '101809133', 'profile_private not synced with the 9-digit number';

  -- invalid shapes are refused; a 7-digit input is padded to 8
  perform pg_temp.cl(19); set local role authenticated;
  begin perform public.submit_ieee_claim('1234567890', null); assert false, '10-digit number accepted';
  exception when others then if sqlerrm <> 'invalid_number' then raise; end if; end;
  begin perform public.submit_ieee_claim('12ab5678', null); assert false, 'non-digit number accepted';
  exception when others then if sqlerrm <> 'invalid_number' then raise; end if; end;
  r1 := public.submit_ieee_claim('1234567', null);
  reset role;
  assert (select member_number from public.ieee_claims where id = (r1 ->> 'claim_id')::uuid) = '01234567', '7-digit number not padded to 8';

  -- the column check accepts 8 and 9 digits, rejects 7 and 10
  update public.profile_private set ieee_member_id = '01234567' where user_id = pg_temp.uid(15)::uuid;
  update public.profile_private set ieee_member_id = '101809133' where user_id = pg_temp.uid(15)::uuid;
  begin update public.profile_private set ieee_member_id = '1234567' where user_id = pg_temp.uid(15)::uuid; assert false, '7-digit profile id accepted';
  exception when check_violation then null; end;
  begin update public.profile_private set ieee_member_id = '1234567890' where user_id = pg_temp.uid(15)::uuid; assert false, '10-digit profile id accepted';
  exception when check_violation then null; end;
end $$;

rollback;
select 'community-membership: all assertions passed' as result;
