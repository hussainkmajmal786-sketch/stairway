-- Phase 5 Task 1: admin audit log, event guard, last-super-admin guard, invites. Run as ONE execute_sql call; rolls back.
-- Fixtures are scoped by fixed uuids / 'a5f-' slugs; the live super admin row is only touched inside the rolled-back txn.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a501', 'a5f-s1@test.local', 'authenticated', 'authenticated', '{"full_name":"A5 Super One"}'),
  ('00000000-0000-0000-0000-00000000a502', 'a5f-r1@test.local', 'authenticated', 'authenticated', '{"full_name":"A5 Ras Admin"}'),
  ('00000000-0000-0000-0000-00000000a503', 'a5f-c1@test.local', 'authenticated', 'authenticated', '{"full_name":"A5 Cs Admin"}'),
  ('00000000-0000-0000-0000-00000000a504', 'a5f-p1@test.local', 'authenticated', 'authenticated', '{"full_name":"A5 Plain"}'),
  ('00000000-0000-0000-0000-00000000a505', 'a5f-s2@test.local', 'authenticated', 'authenticated', '{"full_name":"A5 Super Two"}'),
  ('00000000-0000-0000-0000-00000000a506', 'a5f-u6@test.local', 'authenticated', 'authenticated', '{"full_name":"A5 U6"}'),
  ('00000000-0000-0000-0000-00000000a507', 'a5f-u7@test.local', 'authenticated', 'authenticated', '{"full_name":"A5 U7"}'),
  ('00000000-0000-0000-0000-00000000a508', 'a5f-u8@test.local', 'authenticated', 'authenticated', '{"full_name":"A5 U8"}'),
  ('00000000-0000-0000-0000-00000000a509', 'a5f-u9@test.local', 'authenticated', 'authenticated', '{"full_name":"A5 U9"}');

insert into public.admin_roles (user_id, role, society_id)
select '00000000-0000-0000-0000-00000000a501'::uuid, 'super_admin'::public.admin_role, null::uuid
union all select '00000000-0000-0000-0000-00000000a505', 'super_admin', null
union all select '00000000-0000-0000-0000-00000000a502', 'society_admin', s.id from public.societies s where s.slug = 'ras'
union all select '00000000-0000-0000-0000-00000000a503', 'society_admin', s.id from public.societies s where s.slug = 'cs';

-- E1 published free (3 confirmed, tokens 1..3), E2 draft, E4 published paid (1 paid confirmed). All society ras.
insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, price_paise, token_prefix)
select s.id, v.step, v.slug, v.slug, now() + interval '10 days', now() + interval '10 days 6 hours',
       v.status::public.event_status, v.cap, v.price, 'A5F'
from public.societies s,
  (values (9101, 'a5f-ev', 'published', 5, 0), (9102, 'a5f-draft', 'draft', 5, 0), (9104, 'a5f-paid', 'published', 5, 9900))
  as v(step, slug, status, cap, price)
where s.slug = 'ras';

insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
select e.id, u.id, 'confirmed', private.new_ticket_code(), u.n, now()
from public.events e,
  (values ('00000000-0000-0000-0000-00000000a506'::uuid, 1), ('00000000-0000-0000-0000-00000000a507'::uuid, 2),
          ('00000000-0000-0000-0000-00000000a508'::uuid, 3)) as u(id, n)
where e.slug = 'a5f-ev';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at, amount_paise,
                                  razorpay_payment_id, paid_at)
select e.id, '00000000-0000-0000-0000-00000000a509', 'confirmed', private.new_ticket_code(), 1, now(), 9900,
       'pay_a5fixture0001', now()
from public.events e where e.slug = 'a5f-paid';

-- ───────── audit log ─────────
do $$
declare
  ev uuid; cs uuid; n int; cols jsonb;
begin
  select id into ev from public.events where slug = 'a5f-ev';
  select id into cs from public.societies where slug = 'cs';

  -- positive: an admin write is logged exactly once with the changed column names
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a502","role":"authenticated"}', true);
  update public.events set title = 'a5f-ev retitled' where id = ev;
  reset role;
  select count(*)::int, (array_agg(summary -> 'columns'))[1] into n, cols from public.audit_log
   where action = 'events.update' and target_id = ev::text;
  assert n = 1, 'admin event update should write exactly one audit row, got ' || n;
  assert cols ? 'title', 'audit columns should contain title: ' || cols::text;
  assert (select actor_id from public.audit_log where target_id = ev::text) = '00000000-0000-0000-0000-00000000a502',
    'audit actor should be the ras admin';
  assert (select society_id from public.audit_log where target_id = ev::text) = (select society_id from public.events where id = ev),
    'audit society should be the event society';

  -- negative: no claims (service role / SQL editor style) writes nothing, although the update really happened
  perform set_config('request.jwt.claims', '', true);  -- service-style: no caller identity
  update public.events set title = 'a5f-ev by service' where id = ev;
  assert (select title from public.events where id = ev) = 'a5f-ev by service', 'service-style update did not apply';
  assert (select count(*) from public.audit_log where action = 'events.update' and target_id = ev::text) = 1,
    'service-style update must not be audited';

  -- negative: a plain user's own profile update writes nothing (positive twin: the update applied)
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a504","role":"authenticated"}', true);
  update public.profiles set headline = 'plain user headline' where id = '00000000-0000-0000-0000-00000000a504';
  reset role;
  assert (select headline from public.profiles where id = '00000000-0000-0000-0000-00000000a504') = 'plain user headline',
    'plain profile update did not apply';
  assert not exists (select 1 from public.audit_log where actor_id = '00000000-0000-0000-0000-00000000a504'),
    'a plain user must never be an audit actor';

  -- unchanged-row update (only updated_at moves) writes no extra row
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a502","role":"authenticated"}', true);
  update public.events set title = title where id = ev;
  reset role;
  assert (select count(*) from public.audit_log where action = 'events.update' and target_id = ev::text) = 1,
    'no-op update must not be audited';

  -- log_admin_event: whitelist, scope, positive twin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a502","role":"authenticated"}', true);
  begin
    perform public.log_admin_event('role.granted', 'misc', 'x', (select society_id from public.events where id = ev));
    assert false, 'non-whitelisted action accepted';
  exception when others then if sqlerrm <> 'invalid_action' then raise; end if; end;
  begin
    perform public.log_admin_event('registrations.export', 'event', ev::text, cs);
    assert false, 'foreign society log accepted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin
    perform public.log_admin_event('registrations.export', 'event', ev::text, null);
    assert false, 'society admin logged a site-wide entry';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  perform public.log_admin_event('registrations.export', 'event', ev::text,
                                 (select society_id from public.events where id = ev), '{"rows":3}');
  begin
    perform public.log_admin_event('registrations.export', 'event', ev::text,
                                   (select society_id from public.events where id = ev), '{"note":"free text"}');
    assert false, 'free-text audit summary accepted';
  exception when others then if sqlerrm <> 'invalid_summary' then raise; end if; end;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a504","role":"authenticated"}', true);
  begin
    perform public.log_admin_event('registrations.export', 'event', ev::text, null);
    assert false, 'plain user logged an event';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  assert (select count(*) from public.audit_log where action = 'registrations.export' and target_id = ev::text) = 1,
    'exactly the own-society export should be logged';
  assert (select actor_label from public.audit_log where action = 'registrations.export' and target_id = ev::text)
         = (select handle from public.profiles where id = '00000000-0000-0000-0000-00000000a502'), 'actor label is the handle';

  -- append-only
  begin
    update public.audit_log set summary = '{}'::jsonb where target_id = ev::text;
    assert false, 'audit update accepted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin
    delete from public.audit_log where target_id = ev::text;
    assert false, 'audit delete accepted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin
    truncate public.audit_log;
    assert false, 'audit truncate accepted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;

  -- reads: super admin sees rows, society admin and plain user see none (positive twin first)
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a501","role":"authenticated"}', true);
  select count(*)::int into n from public.audit_log where target_id = ev::text;
  assert n >= 2, 'super admin should read the audit rows, got ' || n;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a502","role":"authenticated"}', true);
  select count(*)::int into n from public.audit_log;
  assert n = 0, 'society admin must read 0 audit rows, got ' || n;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a504","role":"authenticated"}', true);
  select count(*)::int into n from public.audit_log;
  assert n = 0, 'plain user must read 0 audit rows, got ' || n;
  reset role;
end $$;

-- ───────── event guard ─────────
do $$
declare
  ev uuid; dr uuid; pd uuid; cs uuid; ras uuid;
begin
  select id into ev from public.events where slug = 'a5f-ev';
  select id into dr from public.events where slug = 'a5f-draft';
  select id into pd from public.events where slug = 'a5f-paid';
  select id into cs from public.societies where slug = 'cs';
  select id into ras from public.societies where slug = 'ras';

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a502","role":"authenticated"}', true);

  -- society_locked (positive twin: super admin below)
  begin
    update public.events set society_id = cs where id = dr;
    assert false, 'society admin moved an event';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  -- insert as cancelled refused; draft insert allowed
  begin
    insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status)
    values (ras, 9150, 'a5f-ins-cancelled', 'x', now() + interval '5 days', now() + interval '6 days', 'cancelled');
    assert false, 'inserted a cancelled event';
  exception when others then if sqlerrm <> 'use_cancel_event' then raise; end if; end;
  insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status)
  values (ras, 9151, 'a5f-ins-draft', 'x', now() + interval '5 days', now() + interval '6 days', 'draft');
  -- cancel via plain update refused
  begin
    update public.events set status = 'cancelled' where id = ev;
    assert false, 'cancelled through a plain update';
  exception when others then if sqlerrm <> 'use_cancel_event' then raise; end if; end;
  -- draft -> published allowed
  update public.events set status = 'published' where id = dr;
  assert (select status from public.events where id = dr) = 'published', 'publish did not apply';
  -- published -> draft with confirmed registrations refused; without registrations allowed
  begin
    update public.events set status = 'draft' where id = ev;
    assert false, 'unpublished an event with registrations';
  exception when others then if sqlerrm <> 'has_registrations' then raise; end if; end;
  update public.events set status = 'draft' where id = dr;
  assert (select status from public.events where id = dr) = 'draft', 'unpublish without registrations did not apply';
  -- slug: locked once published, free while draft
  begin
    update public.events set slug = 'a5f-ev-renamed' where id = ev;
    assert false, 'slug of a published event changed';
  exception when others then if sqlerrm <> 'slug_locked' then raise; end if; end;
  update public.events set slug = 'a5f-draft-renamed' where id = dr;
  assert (select slug from public.events where id = dr) = 'a5f-draft-renamed', 'draft slug change did not apply';
  -- price: locked with a paid confirmed row; free to change when only free registrations exist
  begin
    update public.events set price_paise = 5000 where id = pd;
    assert false, 'price changed under a paid registration';
  exception when others then if sqlerrm <> 'price_locked' then raise; end if; end;
  update public.events set price_paise = 5000 where id = ev;
  assert (select price_paise from public.events where id = ev) = 5000, 'price change without paid rows did not apply';
  -- capacity: cannot go under seats taken (3), may equal it
  begin
    update public.events set capacity = 2 where id = ev;
    assert false, 'capacity lowered under seats taken';
  exception when others then if sqlerrm <> 'capacity_below_taken' then raise; end if; end;
  update public.events set capacity = 3 where id = ev;
  assert (select capacity from public.events where id = ev) = 3, 'capacity = taken did not apply';
  -- ticket type / prefix locked once a token exists, free otherwise
  begin
    update public.events set token_prefix = 'ZZZ' where id = ev;
    assert false, 'token prefix changed after tokens were issued';
  exception when others then if sqlerrm <> 'ticket_locked' then raise; end if; end;
  update public.events set ticket_type = 'token', token_prefix = 'DRF' where id = dr;
  assert (select token_prefix from public.events where id = dr) = 'DRF', 'ticket change without tokens did not apply';

  -- super admin may move an event between societies (positive twin of society_locked)
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a501","role":"authenticated"}', true);
  update public.events set society_id = cs where id = dr;
  assert (select society_id from public.events where id = dr) = cs, 'super admin could not move the event';
  reset role;

  -- service-style (no claims) updates are not guarded: the guard targets admin sessions
  perform set_config('request.jwt.claims', '', true);  -- service-style: no caller identity
  update public.events set slug = 'a5f-ev-service' where id = ev;
  assert (select slug from public.events where id = ev) = 'a5f-ev-service', 'service-style slug change blocked';
  update public.events set slug = 'a5f-ev' where id = ev;
  -- a session whose claims belong to a plain user is not held to admin rules (RLS already keeps them out of events);
  -- positive twin of the guard assertions above: the very same slug change by the ras admin raises slug_locked
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a504","role":"authenticated"}', true);
  update public.events set slug = 'a5f-ev-plain' where id = ev;
  assert (select slug from public.events where id = ev) = 'a5f-ev-plain', 'non-admin claims were held to the admin guard';
  update public.events set slug = 'a5f-ev' where id = ev;
end $$;

-- ───────── invites ─────────
do $$
declare
  n int; ras uuid; inv uuid;
begin
  select id into ras from public.societies where slug = 'ras';

  -- fixture invite written as the service (no claims)
  perform set_config('request.jwt.claims', '', true);  -- service-style: no caller identity
  insert into public.admin_invites (email, role, society_id, token_hash, created_by, expires_at)
  values ('invitee@example.com', 'society_admin', ras, repeat('a', 64), '00000000-0000-0000-0000-00000000a501',
          now() + interval '7 days')
  returning id into inv;

  -- positive: super admin sees it; negative: society admin / plain user see none
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a501","role":"authenticated"}', true);
  select count(*)::int into n from public.admin_invites where id = inv;
  assert n = 1, 'super admin should read the invite';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a502","role":"authenticated"}', true);
  select count(*)::int into n from public.admin_invites;
  assert n = 0, 'society admin must not read invites';
  begin
    insert into public.admin_invites (email, role, society_id, token_hash, created_by, expires_at)
    values ('x@example.com', 'society_admin', ras, repeat('b', 64), '00000000-0000-0000-0000-00000000a502', now() + interval '7 days');
    assert false, 'society admin created an invite';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a504","role":"authenticated"}', true);
  select count(*)::int into n from public.admin_invites;
  assert n = 0, 'plain user must not read invites';
  begin
    insert into public.admin_invites (email, role, society_id, token_hash, created_by, expires_at)
    values ('x@example.com', 'society_admin', ras, repeat('b', 64), '00000000-0000-0000-0000-00000000a504', now() + interval '7 days');
    assert false, 'plain user created an invite';
  exception when others then if sqlstate <> '42501' then raise; end if; end;

  -- super admin insert: own created_by works, forged created_by fails
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a501","role":"authenticated"}', true);
  insert into public.admin_invites (email, role, society_id, token_hash, created_by, expires_at)
  values ('ok@example.com', 'super_admin', null, repeat('c', 64), '00000000-0000-0000-0000-00000000a501', now() + interval '7 days');
  begin
    insert into public.admin_invites (email, role, society_id, token_hash, created_by, expires_at)
    values ('forged@example.com', 'super_admin', null, repeat('d', 64), '00000000-0000-0000-0000-00000000a505', now() + interval '7 days');
    assert false, 'forged created_by accepted';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  -- email must be lower-case, trimmed and shaped like an address
  begin
    insert into public.admin_invites (email, role, society_id, token_hash, created_by, expires_at)
    values ('Upper@Example.com', 'super_admin', null, repeat('e', 64), '00000000-0000-0000-0000-00000000a501', now() + interval '7 days');
    assert false, 'upper-case email accepted';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  begin
    insert into public.admin_invites (email, role, society_id, token_hash, created_by, expires_at)
    values ('   ', 'super_admin', null, repeat('e', 64), '00000000-0000-0000-0000-00000000a501', now() + interval '7 days');
    assert false, 'blank email accepted';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  -- token hash is never readable through the API; other columns are
  begin
    perform token_hash from public.admin_invites limit 1;
    assert false, 'token_hash readable';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  perform id, email, role from public.admin_invites limit 1;
  -- only revoked_at is updatable (positive twin: revoke works)
  begin
    update public.admin_invites set email = 'other@example.com' where id = inv;
    assert false, 'invite email updated';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin
    update public.admin_invites set accepted_at = now() where id = inv;
    assert false, 'invite accepted_at updated by client';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  begin
    insert into public.admin_invites (email, role, society_id, token_hash, created_by, expires_at)
    values ('long@example.com', 'super_admin', null, repeat('f', 64), '00000000-0000-0000-0000-00000000a501', now() + interval '8 days');
    assert false, 'invite valid for 8 days accepted';
  exception when others then if sqlstate <> '23514' then raise; end if; end;
  update public.admin_invites set revoked_at = now() where id = inv;
  begin
    update public.admin_invites set revoked_at = null where id = inv;
    assert false, 'revoked invite un-revoked';
  exception when others then if sqlstate <> '42501' then raise; end if; end;
  reset role;
  assert (select revoked_at from public.admin_invites where id = inv) is not null, 'revoke did not apply';
  assert (select count(*) from public.audit_log where target_type = 'admin_invites' and action = 'admin_invites.update'
            and summary -> 'columns' ? 'revoked_at') = 1, 'invite revoke should be audited';
  assert not exists (select 1 from public.audit_log where summary::text like '%' || repeat('a', 64) || '%'),
    'audit rows must never hold a token hash';
end $$;

-- ───────── last super admin (service-style, no claims) ─────────
do $$
begin
  -- positive: with fixtures a501 and a505 present every other super admin (the live one included) may go
  perform set_config('request.jwt.claims', '', true);  -- service-style: no caller identity
  delete from public.admin_roles where role = 'super_admin'
    and user_id not in ('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000a505');
  assert (select count(*) from public.admin_roles where role = 'super_admin') = 2, 'could not trim to two super admins';
  delete from public.admin_roles where user_id = '00000000-0000-0000-0000-00000000a501';
  assert (select count(*) from public.admin_roles where role = 'super_admin') = 1, 'second-to-last delete failed';
  -- negative: the sole super admin can be neither deleted nor demoted
  begin
    delete from public.admin_roles where user_id = '00000000-0000-0000-0000-00000000a505';
    assert false, 'deleted the last super admin';
  exception when others then if sqlerrm <> 'last_super_admin' then raise; end if; end;
  begin
    update public.admin_roles set role = 'society_admin', society_id = (select id from public.societies where slug = 'ras')
     where user_id = '00000000-0000-0000-0000-00000000a505';
    assert false, 'demoted the last super admin';
  exception when others then if sqlerrm <> 'last_super_admin' then raise; end if; end;
  -- an auth.users cascade is stopped as well
  begin
    delete from auth.users where id = '00000000-0000-0000-0000-00000000a505';
    assert false, 'cascade removed the last super admin';
  exception when others then if sqlerrm <> 'last_super_admin' then raise; end if; end;
  -- positive twin: a second super admin makes the delete legal again
  insert into public.admin_roles (user_id, role, society_id) values ('00000000-0000-0000-0000-00000000a509', 'super_admin', null);
  assert pg_get_functiondef('private.guard_last_super_admin()'::regprocedure) ilike '%for update%', 'guard does not serialise';
  -- a super admin removing their own role is still audited (actor decided before the change)
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a505","role":"authenticated"}', true);
  delete from public.admin_roles where user_id = '00000000-0000-0000-0000-00000000a505';
  assert exists (select 1 from public.audit_log where action = 'admin_roles.delete'
                   and actor_id = '00000000-0000-0000-0000-00000000a505'), 'self role removal not audited';
  assert (select count(*) from public.admin_roles where role = 'super_admin') = 1, 'delete with a spare super admin failed';
end $$;

rollback;
select 'admin-foundation: all assertions passed' as result;
