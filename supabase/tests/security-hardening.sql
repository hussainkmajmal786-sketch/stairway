-- Run through the Supabase MCP execute_sql as a single call. Everything is rolled back.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'cs-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'super@test.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'nobody@test.local',   'authenticated', 'authenticated');
insert into public.admin_roles (user_id, role, society_id)
  select '00000000-0000-0000-0000-0000000000a1', 'society_admin', id from public.societies where slug = 'cs';
insert into public.admin_roles (user_id, role)
  values ('00000000-0000-0000-0000-0000000000a2', 'super_admin');

-- structure
do $$ begin
  assert (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'is\_%admin') = 0,
    'public.is_* helpers still exist';
  assert has_table_privilege('anon', 'public.events', 'select'),   'anon lost select on events';
  assert not has_table_privilege('anon', 'public.events', 'insert'),   'anon can insert events';
  assert not has_table_privilege('anon', 'public.events', 'truncate'), 'anon can truncate events';
  assert not has_table_privilege('authenticated', 'public.events', 'truncate'), 'authenticated can truncate events';
end $$;

-- society admin of CS
do $$ declare n int; cs uuid; ras uuid; begin
  select id into cs  from public.societies where slug = 'cs';
  select id into ras from public.societies where slug = 'ras';
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  set local role authenticated;

  update public.societies set description = 'cs ok' where id = cs;
  get diagnostics n = row_count;  assert n = 1, 'cs admin cannot edit own society description';

  update public.societies set description = 'hacked' where id = ras;
  get diagnostics n = row_count;  assert n = 0, 'cs admin edited another society';

  begin
    update public.societies set slug = 'hacked' where id = cs;
    assert false, 'cs admin changed own society slug';
  exception when others then
    if sqlerrm not like '%identity fields%' then raise; end if;
  end;

  update public.speakers set bio = 'hacked' where society_id is null;
  get diagnostics n = row_count;  assert n = 0, 'society admin edited a society-less speaker';

  update public.events set title = 'hacked' where society_id = ras;
  get diagnostics n = row_count;  assert n = 0, 'cs admin edited a ras event';

  assert private.can_manage_media('societies/' || cs  || '/poster.png'), 'cs admin cannot manage own media folder';
  assert not private.can_manage_media('societies/' || ras || '/poster.png'), 'cs admin can manage ras media';
  assert not private.can_manage_media('site/hero.png'),                       'cs admin can manage site media';
  assert not private.can_manage_media('societies/not-a-uuid/x.png'),          'bad folder not rejected cleanly';
  reset role;
end $$;

-- non-admin user
do $$ declare n int; begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
  set local role authenticated;
  update public.events set title = 'hacked';
  get diagnostics n = row_count;  assert n = 0, 'non-admin edited events';
  assert not private.can_manage_media('societies/x/y.png'), 'non-admin can manage media';
  reset role;
end $$;

-- super admin + integrity triggers
do $$ declare n int; ras_event uuid; cs_track uuid; begin
  select e.id into ras_event from public.events e join public.societies s on s.id = e.society_id where s.slug = 'ras' limit 1;
  select t.id into cs_track  from public.tracks t join public.societies s on s.id = t.society_id where s.slug = 'cs' limit 1;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  set local role authenticated;

  update public.speakers set bio = bio where society_id is null;
  get diagnostics n = row_count;  assert n > 0, 'super admin cannot edit speakers';

  begin
    update public.events set track_id = cs_track where id = ras_event;
    assert false, 'event accepted another society''s track';
  exception when others then
    if sqlerrm not like '%Track does not belong%' then raise; end if;
  end;

  assert private.can_manage_media('site/hero.png'), 'super admin cannot manage site media';
  reset role;
end $$;

rollback;
select 'security-hardening: all assertions passed' as result;
