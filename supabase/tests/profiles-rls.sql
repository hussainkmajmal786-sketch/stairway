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

-- column guards (20261006101500_profiles_column_guards)
do $$ declare n int; big jsonb; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  set local role authenticated;

  -- the exact column sets the client writes still work
  begin
    update public.profiles set onboarded = true where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'onboarded with blank college/branch/year accepted';
  exception when check_violation then null; end;
  begin
    update public.profiles set full_name = ' ', college = 'MIT', branch = 'Civil', year = '1st year', onboarded = true
      where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'onboarded with blank full_name accepted';
  exception when check_violation then null; end;
  update public.profiles set full_name = 'Ada Lovelace', handle = 'ada-l', college = 'MIT', branch = 'Civil', year = '1st year',
    avatar_url = 'https://example.supabase.co/storage/v1/object/public/avatars/x.webp', onboarded = true
    where id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;  assert n = 1, 'onboarding update (client column set) failed';
  update public.profiles set full_name = 'Ada L', headline = 'h', bio = 'b', college = 'MIT', branch = 'Civil', year = '2nd year',
    skills = array['SQL','Rust'], links = '{"github":"https://github.com/ada"}', avatar_url = null
    where id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;  assert n = 1, 'profile editor update (client column set) failed';
  begin
    update public.profiles set college = '' where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'onboarded profile could blank its college';
  exception when check_violation then null; end;

  -- read-only columns
  begin
    update public.profiles set created_at = now() - interval '1 year' where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'user changed profiles.created_at';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set updated_at = now() where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'user changed profiles.updated_at';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set id = '00000000-0000-0000-0000-0000000000c1' where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'user changed profiles.id';
  exception when insufficient_privilege then null; end;
  begin
    update public.profile_private set email = 'spoof@evil.local' where user_id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'user changed profile_private.email';
  exception when insufficient_privilege then null; end;
  update public.profile_private set phone = '', ieee_member_id = '12345678' where user_id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;  assert n = 1, 'settings update (client column set) failed';

  -- value checks
  select jsonb_build_object('website', 'https://example.com/' || repeat('a', 2100)) into big;
  begin
    update public.profiles set links = big where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'oversized links accepted';
  exception when check_violation then null; end;
  begin
    update public.profiles set links = '["https://x.com"]' where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'non-object links accepted';
  exception when check_violation then null; end;
  begin
    update public.profiles set avatar_url = 'http://example.com/a.png' where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'http avatar accepted';
  exception when check_violation then null; end;
  begin
    update public.profiles set avatar_url = 'https://example.com/' || repeat('a', 600) where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'over-long avatar accepted';
  exception when check_violation then null; end;
  update public.profiles set skills = array(select repeat('s', 29) || g from generate_series(0, 9) g union all
                                             select repeat('t', 29) || g from generate_series(0, 9) g union all
                                             select repeat('u', 29) || g from generate_series(0, 9) g)
    where id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;  assert n = 1, '30 skills x 30 chars rejected';
  begin
    update public.profiles set skills = array[repeat('x', 1000)] where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'oversized skills accepted';
  exception when check_violation then null; end;

  -- projects / experience: client payloads work, id/timestamps are not writable
  insert into public.profile_projects (user_id, title, description, url)
    values ('00000000-0000-0000-0000-0000000000b1', 'Guarded', '', 'https://x.dev');
  update public.profile_projects set title = 'Guarded 2', description = 'd', url = '' where title = 'Guarded';
  get diagnostics n = row_count;  assert n = 1, 'project update (client column set) failed';
  begin
    update public.profile_projects set created_at = now() where title = 'Guarded 2';
    assert false, 'user changed profile_projects.created_at';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.profile_projects (id, user_id, title) values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', 'Forced id');
    assert false, 'user chose profile_projects.id';
  exception when insufficient_privilege then null; end;
  update public.profile_experience set title = 'Intern 2', organization = 'Acme', start_date = '2026-01-01', end_date = null, description = ''
    where title = 'Intern';
  get diagnostics n = row_count;  assert n = 1, 'experience update (client column set) failed';
  begin
    update public.profile_experience set user_id = '00000000-0000-0000-0000-0000000000b2' where title = 'Intern 2';
    assert false, 'user moved an experience row';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- private functions: no PUBLIC execute on trigger fns / generate_handle; RLS helpers still callable
do $$ begin
  assert not has_function_privilege('authenticated', 'private.generate_handle(text)', 'execute'), 'authenticated can execute generate_handle';
  assert not has_function_privilege('anon', 'private.handle_new_user()', 'execute'), 'anon can execute handle_new_user';
  assert not has_function_privilege('authenticated', 'private.guard_society_update()', 'execute'), 'PUBLIC execute left on guard_society_update';
  assert has_function_privilege('authenticated', 'private.is_super_admin()', 'execute'), 'authenticated lost is_super_admin';
  assert has_function_privilege('anon', 'private.is_any_admin()', 'execute'), 'anon lost is_any_admin';
  assert has_function_privilege('authenticated', 'private.is_society_admin(uuid)', 'execute'), 'authenticated lost is_society_admin';
  assert has_function_privilege('authenticated', 'private.can_manage_media(text)', 'execute'), 'authenticated lost can_manage_media';
end $$;

-- the signup trigger fires even for a role without EXECUTE on it (triggers skip the EXECUTE check):
-- strip it from the owner too for this transaction; long provider avatars are dropped
revoke execute on function private.handle_new_user() from postgres;
do $$ begin
  assert not has_function_privilege('postgres', 'private.handle_new_user()', 'execute'), 'revoke from owner did not apply';
end $$;
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'grace@test.local', 'authenticated', 'authenticated',
   jsonb_build_object('name', 'Grace Hopper', 'picture', 'https://lh3.googleusercontent.com/' || repeat('a', 600)));
do $$ begin
  assert (select handle from public.profiles where id = '00000000-0000-0000-0000-0000000000d1') = 'grace', 'signup without EXECUTE missing profile';
  assert (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-0000000000d1') is null, 'over-long provider avatar kept';
  assert (select email from public.profile_private where user_id = '00000000-0000-0000-0000-0000000000d1') = 'grace@test.local', 'signup without EXECUTE missing private row';
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
