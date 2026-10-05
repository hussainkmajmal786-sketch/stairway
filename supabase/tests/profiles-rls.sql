begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'ada.lovelace@test.local', 'authenticated', 'authenticated',
   '{"full_name":"Ada Lovelace","avatar_url":"https://example.com/a.png"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'ada.lovelace@other.local', 'authenticated', 'authenticated', '{}');

-- trigger output
do $$ declare ha text; hb text; begin
  select handle into ha from public.profiles where id = '00000000-0000-0000-0000-0000000000b1';
  select handle into hb from public.profiles where id = '00000000-0000-0000-0000-0000000000b2';
  assert ha = 'ada-lovelace', 'first handle should be ada-lovelace, got ' || coalesce(ha, 'null');
  assert hb like 'ada-lovelace-____', 'colliding handle should get a suffix, got ' || coalesce(hb, 'null');
  assert (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = 'Ada Lovelace', 'name not copied';
  assert (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = 'https://example.com/a.png', 'avatar not copied';
  assert (select onboarded from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = false, 'new profile should not be onboarded';
  assert (select email from public.profile_private where user_id = '00000000-0000-0000-0000-0000000000b1') = 'ada.lovelace@test.local', 'private email missing';
end $$;

-- user B1 (owner of the first profile)
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  set local role authenticated;

  update public.profiles set headline = 'Analyst' where id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;  assert n = 1, 'owner cannot update own profile';

  update public.profiles set headline = 'hacked' where id = '00000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count;  assert n = 0, 'user updated someone else''s profile';

  select count(*) into n from public.profiles;                 assert n >= 2, 'signed-in user should read all profiles';
  select count(*) into n from public.profile_private;          assert n = 1, 'user should only see own private row';

  update public.profile_private set phone = '9876543210' where user_id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;  assert n = 1, 'owner cannot update private row';

  begin
    update public.profiles set handle = 'AB' where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'bad handle accepted';
  exception when check_violation then null; end;

  begin
    update public.profiles set handle = (select handle from public.profiles where id = '00000000-0000-0000-0000-0000000000b2')
      where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'duplicate handle accepted';
  exception when unique_violation then null; end;

  insert into public.profile_projects (user_id, title) values ('00000000-0000-0000-0000-0000000000b1', 'My project');
  begin
    insert into public.profile_projects (user_id, title) values ('00000000-0000-0000-0000-0000000000b2', 'Forged');
    assert false, 'inserted a project for another user';
  exception when insufficient_privilege then null; end;

  insert into public.profile_experience (user_id, title, organization, start_date)
    values ('00000000-0000-0000-0000-0000000000b1', 'Intern', 'Acme', '2026-01-01');
  begin
    insert into public.profile_experience (user_id, title, organization, start_date, end_date)
      values ('00000000-0000-0000-0000-0000000000b1', 'Bad', 'Acme', '2026-02-01', '2026-01-01');
    assert false, 'end before start accepted';
  exception when check_violation then null; end;
  reset role;
end $$;

-- user B2 cannot see B1's private data or edit B1's rows
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.profile_private where user_id = '00000000-0000-0000-0000-0000000000b1';
  assert n = 0, 'user read another user''s private row';
  update public.profile_projects set title = 'hacked';
  get diagnostics n = row_count;  assert n = 0, 'user edited another user''s project';
  delete from public.profile_projects;
  get diagnostics n = row_count;  assert n = 0, 'user deleted another user''s project';
  reset role;
end $$;

-- anonymous visitors have no privileges on profile tables
do $$ begin
  assert not has_table_privilege('anon','public.profiles','select'), 'anon can select profiles';
  assert not has_table_privilege('anon','public.profile_private','select'), 'anon can select profile_private';
  assert not has_table_privilege('anon','public.profile_projects','select'), 'anon can select profile_projects';
  assert not has_table_privilege('anon','public.profile_experience','select'), 'anon can select profile_experience';
end $$;

-- trigger robustness: same local part, hostile avatar, null email
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'sam@x.local', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', 'sam@y.local', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', 'sam@z.local', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-0000-0000-0000000000c4', 'evil@x.local', 'authenticated', 'authenticated', '{"avatar_url":"javascript:alert(1)"}');
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c5', null, 'authenticated', 'authenticated', '{}');

do $$ declare n int; begin
  select count(distinct handle) into n from public.profiles where id in
    ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c3');
  assert n = 3, 'same-local-part users should get 3 distinct handles, got ' || n;
  assert (select count(*) from public.profiles where handle ~ '^sam(-[0-9a-f]{4})?$'
          and id in ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c3')) = 3,
    'handles not base+suffix shaped';
  assert (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-0000000000c4') is null, 'non-https avatar kept';
  assert (select handle from public.profiles where id = '00000000-0000-0000-0000-0000000000c5') ~ '^[a-z0-9][a-z0-9_-]{2,29}$',
    'null-email user missing or invalid handle';
  assert exists (select 1 from public.profile_private where user_id = '00000000-0000-0000-0000-0000000000c5'), 'null-email private row missing';
end $$;

-- storage avatar policies + other write restrictions
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  set local role authenticated;

  insert into storage.objects (bucket_id, name, owner_id)
    values ('avatars', '00000000-0000-0000-0000-0000000000b1/a.png', '00000000-0000-0000-0000-0000000000b1');
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000000b2/a.png');
    assert false, 'uploaded into another user''s avatar folder';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', 'root.png');
    assert false, 'uploaded a root-level avatar object';
  exception when insufficient_privilege then null; end;
  select count(*) into n from storage.objects where bucket_id = 'avatars';
  assert n = 1, 'user should see only own avatar objects, saw ' || n;

  begin
    insert into public.profile_private (user_id) values ('00000000-0000-0000-0000-0000000000b1');
    assert false, 'authenticated inserted profile_private';
  exception when insufficient_privilege then null; end;

  begin
    update public.profiles set id = '00000000-0000-0000-0000-0000000000c1' where id = '00000000-0000-0000-0000-0000000000b1';
    get diagnostics n = row_count;
    assert n = 0, 'user changed profiles.id';
  exception when insufficient_privilege or foreign_key_violation or unique_violation then null; end;
  reset role;
end $$;

-- B2 cannot list B1's avatar objects
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'avatars';
  assert n = 0, 'user listed another user''s avatar objects';
  reset role;
end $$;

rollback;
select 'profiles-rls: all assertions passed' as result;
