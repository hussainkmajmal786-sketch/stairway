-- Phase 6 (part 2): community requests (host an event / partner / suggestions & complaints). Additive.
-- Written only through public.submit_community_request (SECURITY INVOKER wrapper) -> private definer body.
create type public.community_kind as enum ('host_event', 'partner', 'feedback');
create type public.community_status as enum ('new', 'in_review', 'resolved', 'closed');

-- Whitelist validator for the `details` jsonb. Sequential ifs on purpose: a NULL comparison must never read as "valid"
-- (CHECK constraints accept NULL), and casts only run after the regex guard passed.
create or replace function private.community_details_valid(p_kind public.community_kind, d jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  allowed text[];
  url_re constant text := '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[^\s<>"'']*)?$';
begin
  if d is null or jsonb_typeof(d) <> 'object' then return false; end if;
  allowed := case p_kind when 'host_event' then array['event_title', 'expected_attendees', 'preferred_date', 'venue', 'website']
                         when 'partner' then array['partnership_type', 'website'] else array['category'] end;
  for k in select jsonb_object_keys(d) loop
    if not (k = any (allowed)) then return false; end if;
  end loop;
  if d ? 'website' then
    if jsonb_typeof(d -> 'website') <> 'string' or char_length(d ->> 'website') > 300 or (d ->> 'website') !~ url_re then return false; end if;
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
-- CHECK constraints are re-evaluated on every UPDATE under the updater's privileges (the super admin's status/note edits),
-- so `authenticated` needs EXECUTE; the validator is pure and `private` is not exposed through the API.
revoke execute on function private.community_details_valid(public.community_kind, jsonb) from public, anon, service_role;
grant execute on function private.community_details_valid(public.community_kind, jsonb) to authenticated;

create table public.community_requests (
  id uuid primary key default gen_random_uuid(),
  kind public.community_kind not null,
  status public.community_status not null default 'new',
  user_id uuid references auth.users(id) on delete set null,
  is_anonymous boolean not null default false,
  name text, email text, phone text, organisation text,
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 2048),
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  admin_note text not null default '' check (char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cr_name check (name is null or char_length(btrim(name)) between 2 and 80),
  constraint cr_email check (email is null or (email = lower(btrim(email)) and char_length(email) <= 254
                                               and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  constraint cr_phone check (phone is null or phone ~ '^\+?[0-9][0-9 -]{6,18}$'),
  constraint cr_org check (organisation is null or char_length(organisation) <= 120),
  constraint cr_anon_feedback_only check (not is_anonymous or (kind = 'feedback' and user_id is null
                                          and name is null and email is null and phone is null and organisation is null)),
  constraint cr_contact check (is_anonymous or (name is not null and email is not null)),
  constraint cr_no_markup check ((coalesce(name, '') || coalesce(organisation, '') || subject || message) !~ '[<>]'),
  constraint cr_no_control check (translate(coalesce(name, '') || coalesce(organisation, '') || subject || message,
                                            E'\n\r\t', '') !~ '[[:cntrl:]]'),
  constraint cr_details check (private.community_details_valid(kind, details)));
create index community_requests_inbox_idx on public.community_requests (status, created_at desc);
create index community_requests_email_idx on public.community_requests (email, created_at desc);
create index community_requests_ip_idx on public.community_requests (ip_hash, created_at desc);
create index community_requests_user_idx on public.community_requests (user_id);
create trigger community_requests_touch before update on public.community_requests
  for each row execute function public.touch_updated_at();
create trigger community_requests_audit after insert or update or delete on public.community_requests
  for each row execute function private.audit_content_change();     -- fires only for admin actors; submitters are never logged

alter table public.community_requests enable row level security;
revoke all on public.community_requests from public, anon, authenticated, service_role;
grant select on public.community_requests to authenticated;
grant update (status, admin_note) on public.community_requests to authenticated;
create policy "super admin reads requests" on public.community_requests for select to authenticated
  using ((select private.is_super_admin()));
create policy "super admin updates requests" on public.community_requests for update to authenticated
  using ((select private.is_super_admin())) with check ((select private.is_super_admin()));

create or replace function private.submit_community_request(
  p_kind public.community_kind, p_anonymous boolean, p_name text, p_email text, p_phone text, p_organisation text,
  p_subject text, p_message text, p_details jsonb, p_ip_hash text, p_hp text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_anon boolean := coalesce(p_anonymous, false);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if coalesce(p_hp, '') <> '' then return jsonb_build_object('ok', true); end if;      -- honeypot: store nothing, look successful
  if v_anon and p_kind <> 'feedback' then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cr:' || coalesce(v_email, p_ip_hash, v_uid::text, 'any'), 0));
  if (select count(*) from public.community_requests r where r.created_at > now() - interval '24 hours'
        and ((v_email is not null and r.email = v_email) or (p_ip_hash is not null and r.ip_hash = p_ip_hash)
             or (v_uid is not null and r.user_id = v_uid))) >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.community_requests r where r.kind = p_kind and r.created_at > now() - interval '24 hours') >= 200 then
    raise exception 'busy' using errcode = 'P0001';                                      -- global backstop against distributed spam
  end if;
  insert into public.community_requests (kind, user_id, is_anonymous, name, email, phone, organisation, subject, message, details, ip_hash)
  values (p_kind, case when v_anon then null else v_uid end, v_anon,
          case when v_anon then null else nullif(btrim(p_name), '') end, case when v_anon then null else v_email end,
          case when v_anon then null else nullif(btrim(p_phone), '') end,
          case when v_anon then null else nullif(btrim(p_organisation), '') end,
          btrim(p_subject), btrim(p_message), coalesce(p_details, '{}'::jsonb), p_ip_hash);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function private.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text)
  from public, service_role;
grant execute on function private.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text)
  to anon, authenticated;

create function public.submit_community_request(
  p_kind public.community_kind, p_anonymous boolean, p_name text, p_email text, p_phone text, p_organisation text,
  p_subject text, p_message text, p_details jsonb, p_ip_hash text, p_hp text) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.submit_community_request(p_kind, p_anonymous, p_name, p_email, p_phone, p_organisation, p_subject, p_message,
                                          p_details, p_ip_hash, p_hp) $$;
revoke execute on function public.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text)
  from public, service_role;
grant execute on function public.submit_community_request(public.community_kind, boolean, text, text, text, text, text, text, jsonb, text, text)
  to anon, authenticated;
