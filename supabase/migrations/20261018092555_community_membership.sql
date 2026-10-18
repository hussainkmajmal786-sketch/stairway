-- Phase 6 (part 1): IEEE membership verification. Additive; nothing existing is dropped.
-- Pattern (as Phases 3-5): SECURITY DEFINER bodies in `private` (search_path = '', explicit grants), thin SECURITY INVOKER
-- wrappers in `public`. Refusals of submit_ieee_claim are RETURNED (not raised) so the attempt row commits.

-- 1. Secrets, hashing, helpers. No role can read app_secrets; only private.ieee_hash (definer) does.
create table private.app_secrets (name text primary key, value bytea not null);
alter table private.app_secrets enable row level security;
revoke all on private.app_secrets from public, anon, authenticated, service_role;
insert into private.app_secrets values ('ieee_pepper', extensions.gen_random_bytes(32));

create or replace function private.ieee_hash(p_value text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(convert_to(p_value, 'utf8'),
           (select s.value from private.app_secrets s where s.name = 'ieee_pepper'), 'sha256'), 'hex')
$$;
create or replace function private.ist_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
create or replace function private.safe_date(p_value text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  return p_value::date;
exception when others then
  return null;
end $$;
create or replace function private.name_token_hashes(p_name text) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct private.ieee_hash('n:' || t)), '{}'::text[])
    from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(p_name, ''), '[^A-Za-z ]+', ' ', 'g')), '\s+')) as t
   where char_length(t) >= 2
$$;
create or replace function private.names_overlap(a text[], b text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(a) > 0 and cardinality(b) > 0
     and (select count(*) from unnest(a) x where x = any (b)) >= least(2, cardinality(a), cardinality(b))
$$;
revoke execute on function private.ieee_hash(text), private.ist_today(), private.safe_date(text),
  private.name_token_hashes(text), private.names_overlap(text[], text[]) from public, anon, authenticated, service_role;

-- 2. Roster + attempt log (private schema: not reachable through the API at all).
create table private.ieee_roster (
  member_hash text primary key check (member_hash ~ '^[0-9a-f]{64}$'),
  expires_on date not null,
  name_hashes text[] not null default '{}',
  imported_at timestamptz not null default now());
create table private.ieee_attempts (user_id uuid not null, at timestamptz not null default now());
create index ieee_attempts_user_idx on private.ieee_attempts (user_id, at desc);
alter table private.ieee_roster enable row level security;
alter table private.ieee_attempts enable row level security;
revoke all on private.ieee_roster, private.ieee_attempts from public, anon, authenticated, service_role;

-- 3. Claims.
create type public.ieee_claim_status as enum ('pending_review', 'verified', 'rejected', 'revoked', 'withdrawn');
create table public.ieee_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_number text not null check (member_number ~ '^\d{8,9}$' or member_number = ''),   -- '' only after anonymisation
  proof_path text check (proof_path is null or proof_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{8,80}$'),
  status public.ieee_claim_status not null,
  method text check (method in ('roster', 'admin')),
  roster_matched boolean not null default false,
  verified_until date,
  prescreen_status text not null default 'none' check (prescreen_status in ('none', 'running', 'done', 'failed')),
  prescreen_attempts smallint not null default 0 check (prescreen_attempts between 0 and 2),
  prescreen jsonb not null default '{}'::jsonb check (jsonb_typeof(prescreen) = 'object' and octet_length(prescreen::text) <= 512),
  reject_reason text check (reject_reason in ('unreadable', 'mismatch', 'expired', 'not_member', 'other')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'verified' or verified_until is not null));
create unique index ieee_claims_one_pending on public.ieee_claims (user_id) where status = 'pending_review';
create unique index ieee_claims_one_verified on public.ieee_claims (user_id) where status = 'verified';
create unique index ieee_claims_number_verified on public.ieee_claims (member_number) where status = 'verified';
create index ieee_claims_user_idx on public.ieee_claims (user_id, created_at desc);
create index ieee_claims_queue_idx on public.ieee_claims (status, created_at);
create index ieee_claims_decided_by_idx on public.ieee_claims (decided_by);
create trigger ieee_claims_touch before update on public.ieee_claims for each row execute function public.touch_updated_at();
alter table public.ieee_claims enable row level security;
revoke all on public.ieee_claims from public, anon, authenticated, service_role;
-- owners see their own row minus roster_matched/prescreen (no roster oracle); the super admin uses the definer functions
grant select (id, user_id, member_number, status, method, verified_until, reject_reason, proof_path, created_at, decided_at)
  on public.ieee_claims to authenticated;
create policy "owner reads own claim" on public.ieee_claims for select to authenticated using (user_id = (select auth.uid()));

-- 4. Read helpers (verified = computed at read time; lapsed = not verified).
create or replace function private.is_verified_member(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ieee_claims c
                  where c.user_id = p_uid and c.status = 'verified' and c.verified_until >= private.ist_today())
$$;
create or replace function private.profile_verified(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and private.is_verified_member(p_user)
$$;
create or replace function private.membership_state(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('status', c.status, 'verified_until', c.verified_until, 'method', c.method,
             'reject_reason', c.reject_reason, 'member_number', c.member_number,
             'verified', c.status = 'verified' and c.verified_until >= private.ist_today(),
             'expired', c.status = 'verified' and c.verified_until < private.ist_today(),
             'days_left', case when c.status = 'verified' then c.verified_until - private.ist_today() end)
      from public.ieee_claims c
     where c.user_id = p_uid and c.status in ('pending_review', 'verified', 'rejected')
     order by (c.status = 'verified') desc, c.created_at desc limit 1),
    '{"status":"none","verified":false,"expired":false}'::jsonb)
  || jsonb_build_object('pending', exists (select 1 from public.ieee_claims x where x.user_id = p_uid and x.status = 'pending_review'))
$$;
create or replace function private.my_membership() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then '{"status":"none","verified":false,"expired":false,"pending":false}'::jsonb
              else private.membership_state((select auth.uid())) end
$$;
revoke execute on function private.is_verified_member(uuid), private.membership_state(uuid) from public, anon, authenticated, service_role;
revoke execute on function private.profile_verified(uuid), private.my_membership() from public, anon, service_role;
grant execute on function private.profile_verified(uuid), private.my_membership() to authenticated;

create function public.my_membership() returns jsonb language sql security invoker set search_path = '' as $$
  select private.my_membership() $$;
create function public.profile_verified(p_user uuid) returns boolean language sql security invoker set search_path = '' as $$
  select private.profile_verified(p_user) $$;
revoke execute on function public.my_membership(), public.profile_verified(uuid) from public, anon, service_role;
grant execute on function public.my_membership(), public.profile_verified(uuid) to authenticated;

-- 5. Student submit. Refusals are RETURNED (so the attempt row commits); only malformed input raises.
create or replace function private.submit_ieee_claim(p_member_number text, p_proof_path text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_num text := btrim(coalesce(p_member_number, ''));
  v_today date := private.ist_today();
  v_name text;
  v_ros private.ieee_roster%rowtype;
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
  select p.full_name into v_name from public.profiles p where p.id = v_uid and p.onboarded;
  if not found then raise exception 'not_onboarded' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ieee:' || v_uid::text, 0));
  if (select count(*) from private.ieee_attempts a where a.user_id = v_uid and a.at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into private.ieee_attempts (user_id) values (v_uid);

  update public.ieee_claims c set status = 'withdrawn'                      -- a lapsed verification no longer holds its number
   where c.member_number = v_num and c.status = 'verified' and c.verified_until < v_today and c.user_id <> v_uid;
  if exists (select 1 from public.ieee_claims c where c.member_number = v_num and c.status = 'verified' and c.user_id <> v_uid) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select * into v_ros from private.ieee_roster r where r.member_hash = private.ieee_hash(v_num);
  v_auto := found and v_ros.expires_on >= v_today
            and private.names_overlap(v_ros.name_hashes, private.name_token_hashes(v_name));
  if v_auto then v_status := 'verified'; v_until := v_ros.expires_on;
  elsif p_proof_path is null then return jsonb_build_object('status', 'proof_required');   -- same answer for "not on roster" and "name differs"
  else v_status := 'pending_review'; end if;

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

-- 6. profile_private.ieee_member_id guard (the registration and settings forms still write it; verification wins).
create or replace function private.guard_ieee_member_id() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.ieee_member_id is not distinct from old.ieee_member_id
     or coalesce(current_setting('stairway.ieee_sync', true), '') = 'on' then return new; end if;
  if exists (select 1 from public.ieee_claims c where c.user_id = new.user_id and c.status = 'verified'
              and c.verified_until >= private.ist_today()) then
    new.ieee_member_id := old.ieee_member_id; return new;                    -- locked while verified
  end if;
  update public.ieee_claims c set status = 'withdrawn'
   where c.user_id = new.user_id and c.status = 'pending_review' and c.member_number <> new.ieee_member_id;
  return new;
end $$;
create trigger profile_private_ieee_guard before update of ieee_member_id on public.profile_private
  for each row execute function private.guard_ieee_member_id();
revoke execute on function private.guard_ieee_member_id() from public, anon, authenticated, service_role;

-- 7. Super-admin decisions (audited with numbers/booleans only).
create or replace function private.admin_decide_claim(p_claim_id uuid, p_approve boolean, p_verified_until date, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_c public.ieee_claims%rowtype; v_today date := private.ist_today();
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_c from public.ieee_claims c where c.id = p_claim_id and c.status = 'pending_review' for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_approve then
    if p_verified_until is null or p_verified_until < v_today or p_verified_until > v_today + 740 then
      raise exception 'invalid_date' using errcode = 'P0001'; end if;
    update public.ieee_claims c set status = 'withdrawn'
     where (c.user_id = v_c.user_id and c.status = 'verified')
        or (c.member_number = v_c.member_number and c.status = 'verified' and c.verified_until < v_today);
    update public.ieee_claims c set status = 'verified', method = 'admin', verified_until = p_verified_until,
           decided_by = (select auth.uid()), decided_at = now() where c.id = p_claim_id;   -- 23505 if another live account holds the number
    perform set_config('stairway.ieee_sync', 'on', true);
    update public.profile_private set ieee_member_id = v_c.member_number where user_id = v_c.user_id;
    perform set_config('stairway.ieee_sync', 'off', true);
  else
    if p_reason is null or p_reason not in ('unreadable', 'mismatch', 'expired', 'not_member', 'other') then
      raise exception 'invalid_reason' using errcode = 'P0001'; end if;
    update public.ieee_claims c set status = 'rejected', reject_reason = p_reason,
           decided_by = (select auth.uid()), decided_at = now() where c.id = p_claim_id;
  end if;
  perform private.write_audit(case when p_approve then 'membership.approved' else 'membership.rejected' end, 'ieee_claim',
    p_claim_id::text, null, jsonb_build_object('days', case when p_approve then p_verified_until - v_today else 0 end,
    'prescreened', v_c.prescreen_status = 'done'));
end $$;

create or replace function private.admin_revoke_claim(p_claim_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.ieee_claims c set status = 'revoked', decided_by = (select auth.uid()), decided_at = now()
   where c.id = p_claim_id and c.status = 'verified';
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.write_audit('membership.revoked', 'ieee_claim', p_claim_id::text, null, '{}'::jsonb);
end $$;

-- 8. Roster import (chunks of <= 1000; hashing happens here, never in the app).
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

-- 9. Pre-screen bookkeeping: service_role only. Never touches status.
create or replace function private.begin_prescreen(p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_c public.ieee_claims%rowtype;
begin
  if (select count(*) from public.ieee_claims c where c.prescreen_attempts > 0 and c.updated_at > now() - interval '24 hours') >= 100 then
    return null;                                                             -- global daily cost cap
  end if;
  select * into v_c from public.ieee_claims c
   where c.id = p_claim_id and c.status = 'pending_review' and c.proof_path is not null and c.prescreen_attempts < 2
     and (c.prescreen_status <> 'running' or c.updated_at < now() - interval '5 minutes') for update;
  if not found then return null; end if;
  update public.ieee_claims c set prescreen_status = 'running', prescreen_attempts = c.prescreen_attempts + 1 where c.id = p_claim_id;
  return jsonb_build_object('proof_path', v_c.proof_path, 'member_number', v_c.member_number,
           'full_name', (select p.full_name from public.profiles p where p.id = v_c.user_id));
end $$;
create or replace function private.record_prescreen(p_claim_id uuid, p_ok boolean, p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.ieee_claims c
     set prescreen_status = case when p_ok then 'done' else 'failed' end,
         prescreen = case when p_ok then jsonb_build_object(
           'readable', coalesce((p_result ->> 'readable') = 'true', false),
           'number_match', coalesce((p_result ->> 'number_match') = 'true', false),
           'name_match', coalesce((p_result ->> 'name_match') = 'true', false),
           'expiry', case when (p_result ->> 'expiry') ~ '^\d{4}-\d{2}-\d{2}$' then p_result ->> 'expiry' end)
         else '{}'::jsonb end
   where c.id = p_claim_id and c.status = 'pending_review' and c.prescreen_status = 'running';
end $$;

-- 10. Super-admin read models (limit clamped to 50; the queue is the one place a number + name are shown).
create or replace function private.admin_membership_queue(p_limit int, p_offset int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_total int; v_rows jsonb;
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*)::int into v_total from public.ieee_claims c where c.status = 'pending_review';
  select coalesce(jsonb_agg(to_jsonb(g) - 'ord' order by g.ord), '[]'::jsonb) into v_rows from (
    select c.id, c.member_number, p.full_name, p.handle, c.created_at,
           c.prescreen || jsonb_build_object('status', c.prescreen_status) as prescreen,
           c.proof_path is not null as has_proof,
           row_number() over (order by c.created_at, c.id) as ord
      from public.ieee_claims c join public.profiles p on p.id = c.user_id
     where c.status = 'pending_review'
     order by c.created_at, c.id
     limit least(greatest(coalesce(p_limit, 50), 1), 50) offset greatest(coalesce(p_offset, 0), 0)) g;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;
create or replace function private.admin_verified_members(p_limit int, p_offset int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_total int; v_rows jsonb;
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*)::int into v_total from public.ieee_claims c where c.status = 'verified';
  select coalesce(jsonb_agg(to_jsonb(g) - 'ord' order by g.ord), '[]'::jsonb) into v_rows from (
    select c.id, p.full_name, p.handle, right(c.member_number, 4) as last4, c.verified_until, c.method,
           row_number() over (order by c.verified_until desc, c.id) as ord
      from public.ieee_claims c join public.profiles p on p.id = c.user_id
     where c.status = 'verified'
     order by c.verified_until desc, c.id
     limit least(greatest(coalesce(p_limit, 50), 1), 50) offset greatest(coalesce(p_offset, 0), 0)) g;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;
create or replace function private.admin_roster_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object('rows', count(*), 'last_imported_at', max(r.imported_at)) from private.ieee_roster r);
end $$;
create or replace function private.admin_claim_proof(p_claim_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select c.proof_path into v_path from public.ieee_claims c where c.id = p_claim_id and c.status = 'pending_review';
  if v_path is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  return v_path;
end $$;

-- 11. Grants + invoker wrappers.
revoke execute on function private.submit_ieee_claim(text, text), private.admin_decide_claim(uuid, boolean, date, text),
  private.admin_revoke_claim(uuid), private.import_ieee_roster(jsonb, boolean), private.admin_membership_queue(int, int),
  private.admin_verified_members(int, int), private.admin_roster_status(), private.admin_claim_proof(uuid),
  private.begin_prescreen(uuid), private.record_prescreen(uuid, boolean, jsonb) from public, anon, authenticated, service_role;
grant execute on function private.submit_ieee_claim(text, text), private.admin_decide_claim(uuid, boolean, date, text),
  private.admin_revoke_claim(uuid), private.import_ieee_roster(jsonb, boolean), private.admin_membership_queue(int, int),
  private.admin_verified_members(int, int), private.admin_roster_status(), private.admin_claim_proof(uuid) to authenticated;
grant execute on function private.begin_prescreen(uuid), private.record_prescreen(uuid, boolean, jsonb) to service_role;

create function public.submit_ieee_claim(p_member_number text, p_proof_path text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.submit_ieee_claim(p_member_number, p_proof_path) $$;
create function public.admin_decide_claim(p_claim_id uuid, p_approve boolean, p_verified_until date, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select private.admin_decide_claim(p_claim_id, p_approve, p_verified_until, p_reason) $$;
create function public.admin_revoke_claim(p_claim_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.admin_revoke_claim(p_claim_id) $$;
create function public.import_ieee_roster(p_rows jsonb, p_replace boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select private.import_ieee_roster(p_rows, p_replace) $$;
create function public.admin_membership_queue(p_limit int, p_offset int) returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_membership_queue(p_limit, p_offset) $$;
create function public.admin_verified_members(p_limit int, p_offset int) returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_verified_members(p_limit, p_offset) $$;
create function public.admin_roster_status() returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_roster_status() $$;
create function public.admin_claim_proof(p_claim_id uuid) returns text
language sql security invoker set search_path = '' as $$ select private.admin_claim_proof(p_claim_id) $$;
create function public.begin_prescreen(p_claim_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.begin_prescreen(p_claim_id) $$;
create function public.record_prescreen(p_claim_id uuid, p_ok boolean, p_result jsonb) returns void
language sql security invoker set search_path = '' as $$ select private.record_prescreen(p_claim_id, p_ok, p_result) $$;

revoke execute on function public.submit_ieee_claim(text, text), public.admin_decide_claim(uuid, boolean, date, text),
  public.admin_revoke_claim(uuid), public.import_ieee_roster(jsonb, boolean), public.admin_membership_queue(int, int),
  public.admin_verified_members(int, int), public.admin_roster_status(), public.admin_claim_proof(uuid),
  public.begin_prescreen(uuid), public.record_prescreen(uuid, boolean, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.submit_ieee_claim(text, text), public.admin_decide_claim(uuid, boolean, date, text),
  public.admin_revoke_claim(uuid), public.import_ieee_roster(jsonb, boolean), public.admin_membership_queue(int, int),
  public.admin_verified_members(int, int), public.admin_roster_status(), public.admin_claim_proof(uuid) to authenticated;
grant execute on function public.begin_prescreen(uuid), public.record_prescreen(uuid, boolean, jsonb) to service_role;

-- 12. Proof bucket: private; owner folder only; super admin may read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ieee-proof', 'ieee-proof', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']) on conflict (id) do nothing;
create policy "members upload own proof" on storage.objects for insert to authenticated
  with check (bucket_id = 'ieee-proof' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select count(*) from storage.objects o where o.bucket_id = 'ieee-proof'
          and (storage.foldername(o.name))[1] = (select auth.uid())::text) < 10);
create policy "owner or super admin reads proof" on storage.objects for select to authenticated
  using (bucket_id = 'ieee-proof' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_super_admin()));
create policy "owners delete own proof" on storage.objects for delete to authenticated
  using (bucket_id = 'ieee-proof' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 13. log_admin_event whitelist: current body (20261011015503) + 'requests.export', 'membership.proof_view'.
create or replace function private.log_admin_event(
  p_action text, p_target_type text, p_target_id text, p_society_id uuid, p_summary jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_any_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('registrations.export', 'refund.attempt', 'refund.result', 'media.upload', 'event.speakers',
                                          'requests.export', 'membership.proof_view') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_society_id is null then
    if not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not private.is_society_admin(p_society_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- counts and flags only: no free text can enter the audit log through this door
  if p_summary is not null and (jsonb_typeof(p_summary) <> 'object' or octet_length(p_summary::text) > 1024
       or exists (select 1 from jsonb_each(p_summary) e where jsonb_typeof(e.value) not in ('number', 'boolean'))) then
    raise exception 'invalid_summary' using errcode = 'P0001';
  end if;
  perform private.write_audit(p_action, left(coalesce(p_target_type, 'misc'), 40), left(p_target_id, 80), p_society_id, p_summary);
end $$;
