-- Phase 6 (part 3): admin chat, retention, anonymisation. Additive (anonymise_user is re-created with the phase-5 body plus the new scrubs).
-- Messages are inserted ONLY by chat_send (definer); Realtime only reads, and RLS applies to what it pushes.

-- 1. Tables.
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  user_unread int not null default 0 check (user_unread >= 0),
  admin_unread int not null default 0 check (admin_unread >= 0),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now());
create index chat_threads_inbox_idx on public.chat_threads (status, last_message_at desc);
create table public.chat_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  from_admin boolean not null,
  body text not null check (char_length(body) between 1 and 1000 and translate(body, E'\n\r\t', '') !~ '[[:cntrl:]]'),
  flagged_at timestamptz,
  created_at timestamptz not null default now());
create index chat_messages_thread_idx on public.chat_messages (thread_id, id);
create index chat_messages_sender_idx on public.chat_messages (sender_id, created_at desc);
create table public.chat_blocks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  blocked_by uuid references auth.users(id) on delete set null,
  reason text not null default 'abuse' check (reason in ('abuse', 'spam', 'other')),
  created_at timestamptz not null default now());
create index chat_blocks_blocked_by_idx on public.chat_blocks (blocked_by);

-- 2. Eligibility (blocked beats everything; verified IEEE member always; else a confirmed seat at a live published event).
create or replace function private.chat_access(p_uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_uid is null then 'none'
    when exists (select 1 from public.chat_blocks b where b.user_id = p_uid) then 'blocked'
    when private.is_verified_member(p_uid) then 'member'
    when exists (select 1 from public.registrations r join public.events e on e.id = r.event_id
                  where r.user_id = p_uid and r.status = 'confirmed' and e.status = 'published' and e.ends_at > now()) then 'attendee'
    else 'none' end
$$;
create or replace function private.chat_can_read(p_thread_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_super_admin() or exists (
    select 1 from public.chat_threads t where t.id = p_thread_id and t.user_id = (select auth.uid())
       and private.chat_access(t.user_id) in ('member', 'attendee'))
$$;
revoke execute on function private.chat_access(uuid), private.chat_can_read(uuid) from public, anon, authenticated, service_role;
grant execute on function private.chat_can_read(uuid) to authenticated;     -- referenced by the RLS policies

-- 3. RLS: read-only for the API; owner (while eligible) or super admin. No insert/update/delete grants at all.
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_blocks enable row level security;
revoke all on public.chat_threads, public.chat_messages, public.chat_blocks from public, anon, authenticated, service_role;
grant select on public.chat_threads, public.chat_messages to authenticated;
create policy "thread owner or super admin reads" on public.chat_threads for select to authenticated
  using (private.chat_can_read(id));
create policy "message reader reads" on public.chat_messages for select to authenticated
  using (private.chat_can_read(thread_id));
-- chat_blocks: RLS on, no policy and no grant (definer functions only); explicit deny keeps the advisor quiet.
create policy "deny api access" on public.chat_blocks for all to anon, authenticated using (false) with check (false);
alter publication supabase_realtime add table public.chat_messages, public.chat_threads;

-- 4. Sending (user and staff share one door; the role comes from the database, never from the client).
create or replace function private.chat_send(p_thread_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_admin boolean;
  v_t public.chat_threads%rowtype;
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if char_length(v_body) not between 1 and 1000 or translate(v_body, E'\n\r\t', '') ~ '[[:cntrl:]]' then
    raise exception 'invalid_body' using errcode = 'P0001'; end if;
  v_admin := private.is_super_admin();
  perform pg_advisory_xact_lock(hashtextextended('chat:' || v_uid::text, 0));
  if v_admin then
    select * into v_t from public.chat_threads t where t.id = p_thread_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
    if v_t.status = 'closed' then raise exception 'thread_closed' using errcode = 'P0001'; end if;
    if (select count(*) from public.chat_messages m where m.sender_id = v_uid and m.created_at > now() - interval '10 minutes') >= 120 then
      raise exception 'rate_limited' using errcode = 'P0001'; end if;
  else
    case private.chat_access(v_uid)
      when 'blocked' then raise exception 'blocked' using errcode = 'P0001';
      when 'none' then raise exception 'not_eligible' using errcode = 'P0001';
      else null; end case;
    if (select count(*) from public.chat_messages m where m.sender_id = v_uid and m.created_at > now() - interval '10 minutes') >= 20 then
      raise exception 'rate_limited' using errcode = 'P0001'; end if;
    insert into public.chat_threads (user_id) values (v_uid) on conflict (user_id) do nothing;
    select * into v_t from public.chat_threads t where t.user_id = v_uid for update;
  end if;
  insert into public.chat_messages (thread_id, sender_id, from_admin, body) values (v_t.id, v_uid, v_admin, v_body) returning id into v_id;
  update public.chat_threads t set status = 'open', last_message_at = now(),
         user_unread = t.user_unread + case when v_admin then 1 else 0 end,
         admin_unread = t.admin_unread + case when v_admin then 0 else 1 end where t.id = v_t.id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function private.chat_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_acc text := private.chat_access((select auth.uid()));
  v_until timestamptz;
  v_t public.chat_threads%rowtype;
begin
  if v_acc = 'attendee' then
    select max(e.ends_at) into v_until from public.registrations r join public.events e on e.id = r.event_id
     where r.user_id = v_uid and r.status = 'confirmed' and e.status = 'published' and e.ends_at > now();
  end if;
  if v_acc in ('member', 'attendee') then
    select * into v_t from public.chat_threads t where t.user_id = v_uid;
  end if;
  return jsonb_build_object('access', v_acc, 'access_until', v_until, 'thread_id', v_t.id, 'status', v_t.status,
                            'user_unread', coalesce(v_t.user_unread, 0));
end $$;

create or replace function private.chat_mark_read(p_thread_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if private.is_super_admin() then
    update public.chat_threads t set admin_unread = 0 where t.id = p_thread_id;
  elsif private.chat_access(v_uid) in ('member', 'attendee') then
    update public.chat_threads t set user_unread = 0 where t.id = p_thread_id and t.user_id = v_uid;
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- 5. Super-admin operations (each re-checks the role itself; audit summaries carry numbers only).
create or replace function private.admin_chat_threads(p_status text, p_limit int, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_total int; v_rows jsonb; v_status text := coalesce(p_status, 'all');
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_status not in ('open', 'closed', 'all') then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  select count(*)::int into v_total from public.chat_threads t where v_status = 'all' or t.status = v_status;
  select coalesce(jsonb_agg(to_jsonb(g) - 'ord' order by g.ord), '[]'::jsonb) into v_rows from (
    select t.id, t.user_id, p.handle, p.full_name, t.status, t.admin_unread, t.last_message_at,
           exists (select 1 from public.chat_blocks b where b.user_id = t.user_id) as blocked,
           row_number() over (order by t.last_message_at desc, t.id) as ord
      from public.chat_threads t join public.profiles p on p.id = t.user_id
     where v_status = 'all' or t.status = v_status
     order by t.last_message_at desc, t.id
     limit least(greatest(coalesce(p_limit, 50), 1), 50) offset greatest(coalesce(p_offset, 0), 0)) g;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function private.admin_chat_close(p_thread_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.chat_threads t set status = 'closed' where t.id = p_thread_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select count(*)::int into v_n from public.chat_messages m where m.thread_id = p_thread_id;
  perform private.write_audit('chat.close', 'chat_thread', p_thread_id::text, null, jsonb_build_object('messages', v_n));
end $$;

create or replace function private.admin_chat_block(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n int := 0; v_ins int := 0; v_reason text := coalesce(p_reason, 'abuse');
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason not in ('abuse', 'spam', 'other') then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if p_user_id = (select auth.uid()) or exists (select 1 from public.admin_roles r where r.user_id = p_user_id) then
    raise exception 'admin_account' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.chat_blocks (user_id, blocked_by, reason) values (p_user_id, (select auth.uid()), v_reason)
    on conflict (user_id) do nothing;
  get diagnostics v_ins = row_count;
  update public.chat_threads t set status = 'closed' where t.user_id = p_user_id;
  if v_ins = 1 then                                                                   -- idempotent: a repeat block logs nothing
    select count(*)::int into v_n from public.chat_messages m join public.chat_threads t on t.id = m.thread_id where t.user_id = p_user_id;
    perform private.write_audit('chat.block', 'profile', p_user_id::text, null, jsonb_build_object('messages', v_n));
  end if;
end $$;

create or replace function private.admin_chat_unblock(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.chat_blocks b where b.user_id = p_user_id;
  if found then
    perform private.write_audit('chat.unblock', 'profile', p_user_id::text, null, '{}'::jsonb);
  end if;
end $$;

create or replace function private.admin_chat_flag(p_message_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.chat_messages m set flagged_at = coalesce(m.flagged_at, now()) where m.id = p_message_id and not m.from_admin;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.write_audit('chat.flag', 'chat_message', p_message_id::text, null, '{}'::jsonb);
end $$;

create or replace function private.admin_inbox_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'requests_new', (select count(*) from public.community_requests r where r.status = 'new'),
    'chat_unread', (select count(*) from public.chat_threads t where t.status = 'open' and t.admin_unread > 0),
    'claims_pending', (select count(*) from public.ieee_claims c where c.status = 'pending_review'));
end $$;

-- 6. Retention. Run daily by the Phase 4 cron tick (service role) or by hand in the SQL editor.
create or replace function private.purge_community() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_threads int; v_ips int; v_requests int; v_claims int; v_attempts int; v_paths text[];
begin
  delete from public.chat_threads t where t.last_message_at < now() - interval '90 days';
  get diagnostics v_threads = row_count;
  update public.community_requests r set ip_hash = null where r.ip_hash is not null and r.created_at < now() - interval '30 days';
  get diagnostics v_ips = row_count;
  delete from public.community_requests r where r.status in ('resolved', 'closed') and r.created_at < now() - interval '365 days';
  get diagnostics v_requests = row_count;
  -- claims: rows whose proof object was already handed out (proof_path null) go first; the rest are released for storage cleanup
  delete from public.ieee_claims c
   where c.status in ('rejected', 'withdrawn') and c.proof_path is null and coalesce(c.decided_at, c.created_at) < now() - interval '90 days';
  get diagnostics v_claims = row_count;
  with picked as (
    select c.id, c.proof_path from public.ieee_claims c
     where c.status in ('rejected', 'withdrawn') and c.proof_path is not null and coalesce(c.decided_at, c.created_at) < now() - interval '90 days'
     order by c.created_at limit 200 for update),
  cleared as (update public.ieee_claims c set proof_path = null from picked where c.id = picked.id returning picked.proof_path as pp)
  select coalesce(array_agg(pp), '{}') into v_paths from cleared;
  delete from private.ieee_attempts a where a.at < now() - interval '2 days';
  get diagnostics v_attempts = row_count;
  return jsonb_build_object('threads', v_threads, 'ip_hashes', v_ips, 'requests', v_requests, 'claims', v_claims,
                            'attempts', v_attempts, 'proof_paths', to_jsonb(v_paths));
end $$;

-- 7. Grants + invoker wrappers.
revoke execute on function private.chat_send(uuid, text), private.chat_state(), private.chat_mark_read(uuid),
  private.admin_chat_threads(text, int, int), private.admin_chat_close(uuid), private.admin_chat_block(uuid, text),
  private.admin_chat_unblock(uuid), private.admin_chat_flag(bigint), private.admin_inbox_counts(), private.purge_community()
  from public, anon, authenticated, service_role;
grant execute on function private.chat_send(uuid, text), private.chat_state(), private.chat_mark_read(uuid),
  private.admin_chat_threads(text, int, int), private.admin_chat_close(uuid), private.admin_chat_block(uuid, text),
  private.admin_chat_unblock(uuid), private.admin_chat_flag(bigint), private.admin_inbox_counts() to authenticated;
grant execute on function private.purge_community() to service_role;

create function public.chat_send(p_thread_id uuid, p_body text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.chat_send(p_thread_id, p_body) $$;
create function public.chat_state() returns jsonb
language sql security invoker set search_path = '' as $$ select private.chat_state() $$;
create function public.chat_mark_read(p_thread_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.chat_mark_read(p_thread_id) $$;
create function public.admin_chat_threads(p_status text, p_limit int, p_offset int) returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_chat_threads(p_status, p_limit, p_offset) $$;
create function public.admin_chat_close(p_thread_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.admin_chat_close(p_thread_id) $$;
create function public.admin_chat_block(p_user_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select private.admin_chat_block(p_user_id, p_reason) $$;
create function public.admin_chat_unblock(p_user_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.admin_chat_unblock(p_user_id) $$;
create function public.admin_chat_flag(p_message_id bigint) returns void
language sql security invoker set search_path = '' as $$ select private.admin_chat_flag(p_message_id) $$;
create function public.admin_inbox_counts() returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_inbox_counts() $$;
create function public.purge_community() returns jsonb
language sql security invoker set search_path = '' as $$ select private.purge_community() $$;

revoke execute on function public.chat_send(uuid, text), public.chat_state(), public.chat_mark_read(uuid),
  public.admin_chat_threads(text, int, int), public.admin_chat_close(uuid), public.admin_chat_block(uuid, text),
  public.admin_chat_unblock(uuid), public.admin_chat_flag(bigint), public.admin_inbox_counts(), public.purge_community()
  from public, anon, authenticated, service_role;
grant execute on function public.chat_send(uuid, text), public.chat_state(), public.chat_mark_read(uuid),
  public.admin_chat_threads(text, int, int), public.admin_chat_close(uuid), public.admin_chat_block(uuid, text),
  public.admin_chat_unblock(uuid), public.admin_chat_flag(bigint), public.admin_inbox_counts() to authenticated;
grant execute on function public.purge_community() to service_role;

-- 8. anonymise_user: the phase-5 body plus the community scrubs. The claim scrub runs BEFORE the profile_private update so the
--    ieee_member_id guard (which keeps a live verified number) sees no verified claim and lets the clearing through.
create or replace function private.anonymise_user(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_tomb text := 'deleted-' || substr(replace(p_user_id::text, '-', ''), 1, 12);
  v_kept int;
begin
  if v_uid is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user_id = v_uid or exists (select 1 from public.admin_roles r where r.user_id = p_user_id) then
    raise exception 'admin_account' using errcode = 'P0001';
  end if;
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registrations r join public.events e on e.id = r.event_id
              where r.user_id = p_user_id
                and (r.status = 'refund_needed'
                     or (r.status in ('confirmed', 'waitlisted', 'pending_payment') and e.ends_at > now()))) then
    raise exception 'open_registrations' using errcode = 'P0001';
  end if;
  -- an unpaid order that could still be captured (past-event hold with an open ledger order) blocks as well
  if exists (select 1 from private.payment_orders o join public.registrations r on r.id = o.registration_id
              where r.user_id = p_user_id and o.status = 'created' and r.status = 'pending_payment') then
    raise exception 'open_registrations' using errcode = 'P0001';
  end if;

  -- community data (phase 6)
  update public.ieee_claims c set status = 'withdrawn', member_number = '', proof_path = null, prescreen = '{}'::jsonb
   where c.user_id = p_user_id;
  update public.community_requests q
     set name = 'Deleted user', email = 'deleted@anonymised.invalid', phone = null, organisation = null,
         message = '[removed by anonymisation]', details = q.details - 'website', user_id = null
   where q.user_id = p_user_id;
  delete from public.chat_threads where user_id = p_user_id;
  delete from public.chat_blocks where user_id = p_user_id;

  update public.profiles p
     set onboarded = false, handle = v_tomb, full_name = 'Deleted user', avatar_url = null, headline = '', bio = '',
         college = '', branch = '', year = '', skills = '{}', links = '{}'::jsonb
   where p.id = p_user_id;
  update public.profile_private pp set email = '', phone = '', ieee_member_id = '' where pp.user_id = p_user_id;
  delete from public.profile_projects where user_id = p_user_id;
  delete from public.profile_experience where user_id = p_user_id;
  update public.registrations r set answers = '{}'::jsonb where r.user_id = p_user_id;
  -- Sign-in is closed for good: renamed (frees the real address), banned, identities + sessions removed.
  update auth.users u
     set email = v_tomb || '@anonymised.invalid', phone = null, raw_user_meta_data = '{}'::jsonb,
         banned_until = 'infinity', encrypted_password = null
   where u.id = p_user_id;
  delete from auth.identities where user_id = p_user_id;
  delete from auth.one_time_tokens where user_id = p_user_id;
  delete from auth.mfa_factors where user_id = p_user_id;
  -- queued Fund Easy payloads must not carry the attendee's name / email any more
  update private.external_sync_outbox o set payload = o.payload - 'attendee'
   where o.status <> 'sent' and o.payload ? 'attendee'
     and o.registration_id in (select r.id from public.registrations r where r.user_id = p_user_id);
  delete from auth.sessions where user_id = p_user_id;

  select count(*)::int into v_kept from public.registrations r where r.user_id = p_user_id;
  perform private.write_audit('user.anonymised', 'profile', p_user_id::text, null, jsonb_build_object('registrations_kept', v_kept));
  return jsonb_build_object('registrations_kept', v_kept);
end $$;
