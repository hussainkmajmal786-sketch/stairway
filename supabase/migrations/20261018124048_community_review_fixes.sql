-- Phase 6 review fixes for Tasks 1-3 (I1 rate-limit bypass, I2 claim lockout, I3 anonymity, I4 proof purge, M1, M6).
-- Deferred (documented in the plan): M2 oracle cap, M3 super-admin storage read, M4 orphan/verified proof purge,
-- M5 chat DELETE broadcast + column exposure, M7 request subject / logged-out email scrub.

-- ───────── I1: community requests are written by the server only ─────────
drop function public.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text);
drop function private.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text);

-- Unlinkable per-day counters: key = HMAC(pepper, 'rl:<i|u>:<value>:<day>'), no request id, no readable ip/user id.
create table private.community_rate (
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  day date not null,
  n int not null default 0 check (n >= 0),
  primary key (key, day));
alter table private.community_rate enable row level security;
revoke all on private.community_rate from public, anon, authenticated, service_role;
create policy "deny api access" on private.community_rate for all to anon, authenticated using (false) with check (false);

-- Anonymous rows never carry an ip hash (it would link them to named requests from the same address).
alter table public.community_requests add constraint cr_anon_no_ip check (not is_anonymous or ip_hash is null);
-- Only admin updates/deletes are audited; an INSERT by an admin must never tie an actor to an anonymous request (I3).
drop trigger community_requests_audit on public.community_requests;
create trigger community_requests_audit after update or delete on public.community_requests
  for each row execute function private.audit_content_change();

create or replace function private.submit_community_request(
  p_kind public.community_kind, p_anonymous boolean, p_name text, p_email text, p_phone text, p_organisation text,
  p_subject text, p_message text, p_details jsonb, p_ip_hash text, p_hp text, p_user_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := p_user_id;                        -- trusted: only the server (service_role) can call this
  v_anon boolean := coalesce(p_anonymous, false);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_day date := private.ist_today();
  v_ipk text;
  v_uk text;
begin
  if coalesce(p_hp, '') <> '' then return jsonb_build_object('ok', true); end if;      -- honeypot: store nothing, look successful
  if v_anon and p_kind <> 'feedback' then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cr:all', 0));
  if p_ip_hash is not null then v_ipk := private.ieee_hash('rl:i:' || p_ip_hash || ':' || v_day::text); end if;
  if v_uid is not null then v_uk := private.ieee_hash('rl:u:' || v_uid::text || ':' || v_day::text); end if;
  if (v_ipk is not null and coalesce((select c.n from private.community_rate c where c.key = v_ipk and c.day = v_day), 0) >= 5)
     or (v_uk is not null and coalesce((select c.n from private.community_rate c where c.key = v_uk and c.day = v_day), 0) >= 5)
     or (v_email is not null and (select count(*) from public.community_requests r
                                   where r.created_at > now() - interval '24 hours' and r.email = v_email) >= 5) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  -- global backstop against distributed spam; signed-in submitters are exempt so anonymous floods cannot lock them out
  if v_uid is null and (select count(*) from public.community_requests r
                         where r.kind = p_kind and r.user_id is null and r.created_at > now() - interval '24 hours') >= 200 then
    raise exception 'busy' using errcode = 'P0001';
  end if;
  insert into public.community_requests (kind, user_id, is_anonymous, name, email, phone, organisation, subject, message, details, ip_hash)
  values (p_kind, case when v_anon then null else v_uid end, v_anon,
          case when v_anon then null else nullif(btrim(p_name), '') end, case when v_anon then null else v_email end,
          case when v_anon then null else nullif(btrim(p_phone), '') end,
          case when v_anon then null else nullif(btrim(p_organisation), '') end,
          btrim(p_subject), btrim(p_message), coalesce(p_details, '{}'::jsonb), case when v_anon then null else p_ip_hash end);
  if v_ipk is not null then
    insert into private.community_rate (key, day, n) values (v_ipk, v_day, 1) on conflict (key, day) do update set n = private.community_rate.n + 1;
  end if;
  if v_uk is not null then
    insert into private.community_rate (key, day, n) values (v_uk, v_day, 1) on conflict (key, day) do update set n = private.community_rate.n + 1;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function private.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text, uuid)
  to service_role;

create function public.submit_community_request(
  p_kind public.community_kind, p_anonymous boolean, p_name text, p_email text, p_phone text, p_organisation text,
  p_subject text, p_message text, p_details jsonb, p_ip_hash text, p_hp text, p_user_id uuid default null) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.submit_community_request(p_kind, p_anonymous, p_name, p_email, p_phone, p_organisation, p_subject, p_message,
                                          p_details, p_ip_hash, p_hp, p_user_id) $$;
revoke execute on function public.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text, uuid)
  to service_role;

-- ───────── M6: control characters in URLs; the same validator otherwise unchanged ─────────
create or replace function private.community_details_valid(p_kind public.community_kind, d jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  allowed text[];
  url_re constant text := '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[^[:cntrl:][:space:]<>"'']*)?$';
begin
  if d is null or jsonb_typeof(d) <> 'object' then return false; end if;
  allowed := case p_kind when 'host_event' then array['event_title', 'expected_attendees', 'preferred_date', 'venue', 'website']
                         when 'partner' then array['partnership_type', 'website'] else array['category'] end;
  for k in select jsonb_object_keys(d) loop
    if not (k = any (allowed)) then return false; end if;
  end loop;
  if d ? 'website' then
    if jsonb_typeof(d -> 'website') <> 'string' or char_length(d ->> 'website') > 300 or (d ->> 'website') !~ url_re
       or (d ->> 'website') ~ '[[:cntrl:]]' then return false; end if;
  end if;
  if p_kind = 'host_event' then
    if jsonb_typeof(d -> 'event_title') is distinct from 'string' then return false; end if;
    if char_length(btrim(d ->> 'event_title')) not between 3 and 120 or (d ->> 'event_title') ~ '[<>]'
       or translate(d ->> 'event_title', E'\n\r\t', '') ~ '[[:cntrl:]]' then return false; end if;
    if d ? 'expected_attendees' then
      if jsonb_typeof(d -> 'expected_attendees') <> 'number' or (d ->> 'expected_attendees') !~ '^\d{1,5}$' then return false; end if;
      if (d ->> 'expected_attendees')::int not between 1 and 10000 then return false; end if;
    end if;
    if d ? 'preferred_date' then
      if jsonb_typeof(d -> 'preferred_date') <> 'string' or (d ->> 'preferred_date') !~ '^\d{4}-\d{2}-\d{2}$'
         or private.safe_date(d ->> 'preferred_date') is null then return false; end if;
    end if;
    if d ? 'venue' then
      if jsonb_typeof(d -> 'venue') <> 'string' or char_length(d ->> 'venue') > 120 or (d ->> 'venue') ~ '[<>]'
         or translate(d ->> 'venue', E'\n\r\t', '') ~ '[[:cntrl:]]' then return false; end if;
    end if;
    return true;
  elsif p_kind = 'partner' then
    return coalesce(jsonb_typeof(d -> 'partnership_type') = 'string'
                    and (d ->> 'partnership_type') in ('sponsor', 'venue', 'media', 'community', 'other'), false);
  else
    return coalesce(jsonb_typeof(d -> 'category') = 'string'
                    and (d ->> 'category') in ('suggestion', 'complaint', 'other'), false);
  end if;
end $$;

-- ───────── M1: names must share >= 2 tokens and BOTH sides need >= 2 tokens (single-token names go to review) ─────────
create or replace function private.names_overlap(a text[], b text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(a) >= 2 and cardinality(b) >= 2 and (select count(*) from unnest(a) x where x = any (b)) >= 2
$$;

-- ───────── I2: name stability + claim recourse ─────────
-- name_changed_at: existing profiles get the migration time (default), i.e. they need 7 quiet days before auto-verification.
alter table public.profiles add column name_changed_at timestamptz not null default now();
create or replace function private.profiles_name_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.full_name is distinct from old.full_name then
    if private.is_verified_member(new.id) then raise exception 'name_locked' using errcode = 'P0001'; end if;   -- locked while verified
    new.name_changed_at := now();
  end if;
  return new;
end $$;
revoke execute on function private.profiles_name_guard() from public, anon, authenticated, service_role;
create trigger profiles_name_guard before update of full_name on public.profiles
  for each row execute function private.profiles_name_guard();

create or replace function private.submit_ieee_claim(p_member_number text, p_proof_path text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_num text := btrim(coalesce(p_member_number, ''));
  v_today date := private.ist_today();
  v_name text;
  v_name_at timestamptz;
  v_ros private.ieee_roster%rowtype;
  v_held boolean;
  v_auto boolean;
  v_status public.ieee_claim_status;
  v_until date;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if v_num !~ '^\d{8,9}$' then raise exception 'invalid_number' using errcode = 'P0001'; end if;
  if p_proof_path is not null and (p_proof_path !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{8,80}$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'ieee-proof' and o.name = p_proof_path)) then
    raise exception 'invalid_proof' using errcode = 'P0001';
  end if;
  select p.full_name, p.name_changed_at into v_name, v_name_at from public.profiles p where p.id = v_uid and p.onboarded;
  if not found then raise exception 'not_onboarded' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ieee:' || v_uid::text, 0));
  if (select count(*) from private.ieee_attempts a where a.user_id = v_uid and a.at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into private.ieee_attempts (user_id) values (v_uid);

  update public.ieee_claims c set status = 'withdrawn'                      -- a lapsed verification no longer holds its number
   where c.member_number = v_num and c.status = 'verified' and c.verified_until < v_today and c.user_id <> v_uid;
  v_held := exists (select 1 from public.ieee_claims c where c.member_number = v_num and c.status = 'verified' and c.user_id <> v_uid);

  select * into v_ros from private.ieee_roster r where r.member_hash = private.ieee_hash(v_num);
  -- auto-verify only: not held by another live account, on the roster and unexpired, profile name stable for 7 days and matching
  v_auto := not v_held and found and v_ros.expires_on >= v_today and v_name_at <= now() - interval '7 days'
            and private.names_overlap(v_ros.name_hashes, private.name_token_hashes(v_name));
  if v_auto then v_status := 'verified'; v_until := v_ros.expires_on;
  elsif p_proof_path is null then return jsonb_build_object('status', 'proof_required');   -- same answer for every non-verified outcome (incl. "held")
  else v_status := 'pending_review'; end if;                                                -- a held number with proof goes to a human

  update public.ieee_claims c set status = 'withdrawn'
   where c.user_id = v_uid and (c.status = 'pending_review' or (v_status = 'verified' and c.status = 'verified'));
  insert into public.ieee_claims (user_id, member_number, proof_path, status, method, roster_matched, verified_until, decided_at)
  values (v_uid, v_num, case when v_status = 'pending_review' then p_proof_path end, v_status,
          case when v_auto then 'roster' end, v_auto, v_until, case when v_auto then now() end)
  returning id into v_id;
  if v_status = 'verified' or not exists (select 1 from public.ieee_claims c
       where c.user_id = v_uid and c.status = 'verified' and c.verified_until >= v_today) then
    perform set_config('stairway.ieee_sync', 'on', true);
    update public.profile_private set ieee_member_id = v_num where user_id = v_uid;
    perform set_config('stairway.ieee_sync', 'off', true);
  end if;
  return jsonb_build_object('status', v_status, 'claim_id', v_id, 'verified_until', v_until);
end $$;

-- roster import: pending claims are auto-verified only under the same name-stability rule
create or replace function private.import_ieee_roster(p_rows jsonb, p_replace boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_n int; v_ext int; v_auto int := 0; v_today date := private.ist_today(); r record;
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if p_replace then delete from private.ieee_roster where true; end if;
  insert into private.ieee_roster (member_hash, expires_on, name_hashes)
  select distinct on (s.h) s.h, s.e, private.name_token_hashes(s.nm)
    from (select private.ieee_hash(x ->> 'n') as h, private.safe_date(x ->> 'e') as e, x ->> 'name' as nm
            from jsonb_array_elements(p_rows) x
           where jsonb_typeof(x) = 'object' and (x ->> 'n') ~ '^\d{8,9}$' and (x ->> 'e') ~ '^\d{4}-\d{2}-\d{2}$') s
   where s.e is not null
   order by s.h, s.e desc
  on conflict (member_hash) do update set expires_on = excluded.expires_on, name_hashes = excluded.name_hashes, imported_at = now();
  get diagnostics v_n = row_count;
  update public.ieee_claims c set verified_until = ro.expires_on                -- extend, never shorten, never demote
    from private.ieee_roster ro
   where c.status = 'verified' and c.method = 'roster' and ro.member_hash = private.ieee_hash(c.member_number)
     and ro.expires_on > c.verified_until;
  get diagnostics v_ext = row_count;
  for r in select c.id, c.user_id, c.member_number, ro.expires_on
             from public.ieee_claims c
             join private.ieee_roster ro on ro.member_hash = private.ieee_hash(c.member_number)
             join public.profiles p on p.id = c.user_id
            where c.status = 'pending_review' and ro.expires_on >= v_today
              and p.name_changed_at <= now() - interval '7 days'
              and private.names_overlap(ro.name_hashes, private.name_token_hashes(p.full_name))
              and not exists (select 1 from public.ieee_claims o where o.member_number = c.member_number
                               and o.status = 'verified' and o.user_id <> c.user_id and o.verified_until >= v_today) loop
    update public.ieee_claims o set status = 'withdrawn'
     where (o.user_id = r.user_id and o.status = 'verified')
        or (o.member_number = r.member_number and o.status = 'verified' and o.verified_until < v_today);
    update public.ieee_claims o set status = 'verified', method = 'roster', roster_matched = true,
           verified_until = r.expires_on, decided_at = now() where o.id = r.id;
    perform set_config('stairway.ieee_sync', 'on', true);
    update public.profile_private set ieee_member_id = r.member_number where user_id = r.user_id;
    perform set_config('stairway.ieee_sync', 'off', true);
    v_auto := v_auto + 1;
  end loop;
  perform private.write_audit('membership.roster_imported', 'ieee_roster', null, null,
    jsonb_build_object('rows', v_n, 'replaced', coalesce(p_replace, false), 'extended', v_ext, 'auto_verified', v_auto));
  return jsonb_build_object('rows', v_n, 'extended', v_ext, 'auto_verified', v_auto);
end $$;

-- ───────── I4: proof paths of anonymised users reach the purge job ─────────
create table private.storage_purge_queue (
  path text primary key,
  queued_at timestamptz not null default now());
alter table private.storage_purge_queue enable row level security;
revoke all on private.storage_purge_queue from public, anon, authenticated, service_role;
create policy "deny api access" on private.storage_purge_queue for all to anon, authenticated using (false) with check (false);

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
  if exists (select 1 from private.payment_orders o join public.registrations r on r.id = o.registration_id
              where r.user_id = p_user_id and o.status = 'created' and r.status = 'pending_payment') then
    raise exception 'open_registrations' using errcode = 'P0001';
  end if;

  -- community data (phase 6): proof objects (verified claims included) are queued for deletion BEFORE the paths are cleared
  insert into private.storage_purge_queue (path)
    select c.proof_path from public.ieee_claims c where c.user_id = p_user_id and c.proof_path is not null
    on conflict (path) do nothing;
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
  update auth.users u
     set email = v_tomb || '@anonymised.invalid', phone = null, raw_user_meta_data = '{}'::jsonb,
         banned_until = 'infinity', encrypted_password = null
   where u.id = p_user_id;
  delete from auth.identities where user_id = p_user_id;
  delete from auth.one_time_tokens where user_id = p_user_id;
  delete from auth.mfa_factors where user_id = p_user_id;
  update private.external_sync_outbox o set payload = o.payload - 'attendee'
   where o.status <> 'sent' and o.payload ? 'attendee'
     and o.registration_id in (select r.id from public.registrations r where r.user_id = p_user_id);
  delete from auth.sessions where user_id = p_user_id;

  select count(*)::int into v_kept from public.registrations r where r.user_id = p_user_id;
  perform private.write_audit('user.anonymised', 'profile', p_user_id::text, null, jsonb_build_object('registrations_kept', v_kept));
  return jsonb_build_object('registrations_kept', v_kept);
end $$;

create or replace function private.purge_community() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_threads int; v_ips int; v_requests int; v_claims int; v_attempts int; v_paths text[]; v_queued text[];
begin
  delete from public.chat_threads t where t.last_message_at < now() - interval '90 days';
  get diagnostics v_threads = row_count;
  update public.community_requests r set ip_hash = null where r.ip_hash is not null and r.created_at < now() - interval '30 days';
  get diagnostics v_ips = row_count;
  delete from public.community_requests r where r.status in ('resolved', 'closed') and r.created_at < now() - interval '365 days';
  get diagnostics v_requests = row_count;
  delete from public.ieee_claims c
   where c.status in ('rejected', 'withdrawn') and c.proof_path is null and coalesce(c.decided_at, c.created_at) < now() - interval '90 days';
  get diagnostics v_claims = row_count;
  with picked as (
    select c.id, c.proof_path from public.ieee_claims c
     where c.status in ('rejected', 'withdrawn') and c.proof_path is not null and coalesce(c.decided_at, c.created_at) < now() - interval '90 days'
     order by c.created_at limit 200 for update),
  cleared as (update public.ieee_claims c set proof_path = null from picked where c.id = picked.id returning picked.proof_path as pp)
  select coalesce(array_agg(pp), '{}') into v_paths from cleared;
  -- queue (anonymised users' proofs, verified ones included), sharing the 200-path cap of this run
  with q as (select p.path from private.storage_purge_queue p order by p.queued_at, p.path limit greatest(200 - cardinality(v_paths), 0) for update),
  gone as (delete from private.storage_purge_queue p using q where p.path = q.path returning p.path)
  select coalesce(array_agg(path), '{}') into v_queued from gone;
  v_paths := v_paths || v_queued;
  delete from private.ieee_attempts a where a.at < now() - interval '2 days';
  get diagnostics v_attempts = row_count;
  delete from private.community_rate c where c.day < private.ist_today() - 2;
  return jsonb_build_object('threads', v_threads, 'ip_hashes', v_ips, 'requests', v_requests, 'claims', v_claims,
                            'attempts', v_attempts, 'proof_paths', to_jsonb(v_paths));
end $$;
