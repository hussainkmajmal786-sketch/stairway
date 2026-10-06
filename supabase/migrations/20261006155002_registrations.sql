-- Phase 3 (part 1): registrations table, custom questions, seat counts and the attendee list.
-- Users never write registrations directly: part 2 (registration_rpcs) adds the security-definer RPCs.

create type public.registration_status as enum
  ('pending_payment', 'confirmed', 'waitlisted', 'cancelled', 'refunded', 'refund_needed');

-- 1. Per-event custom questions: a jsonb array checked here and mirrored by zod in lib/registration/questions.ts.
create or replace function private.questions_valid(q jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  opts jsonb;
  kind text;
  ids text[] := '{}';
begin
  if q is null or jsonb_typeof(q) <> 'array' or jsonb_array_length(q) > 20 or octet_length(q::text) > 16384 then
    return false;
  end if;
  for item in select t.value from jsonb_array_elements(q) as t(value) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['id', 'label', 'type', 'required']) then
      return false;
    end if;
    if exists (select 1 from jsonb_object_keys(item) as k(key)
               where k.key not in ('id', 'label', 'help', 'type', 'options', 'required')) then
      return false;
    end if;
    if jsonb_typeof(item->'id') <> 'string' or (item->>'id') !~ '^[a-z][a-z0-9_]{0,39}$' or (item->>'id') = any(ids) then
      return false;
    end if;
    ids := ids || (item->>'id');
    if jsonb_typeof(item->'label') <> 'string' or char_length(btrim(item->>'label')) not between 1 and 200 then
      return false;
    end if;
    if item ? 'help' and (jsonb_typeof(item->'help') <> 'string' or char_length(item->>'help') > 300) then
      return false;
    end if;
    if jsonb_typeof(item->'required') <> 'boolean' then
      return false;
    end if;
    kind := item->>'type';
    opts := item->'options';
    if kind in ('single_choice', 'multi_choice') then
      if opts is null or jsonb_typeof(opts) <> 'array' or jsonb_array_length(opts) not between 2 and 20 then
        return false;
      end if;
      if exists (select 1 from jsonb_array_elements(opts) as o(value)
                 where jsonb_typeof(o.value) <> 'string' or char_length(btrim(o.value #>> '{}')) not between 1 and 100) then
        return false;
      end if;
      if (select count(distinct o.value #>> '{}') from jsonb_array_elements(opts) as o(value)) <> jsonb_array_length(opts) then
        return false;
      end if;
    elsif kind in ('text', 'textarea', 'checkbox') then
      if opts is not null then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;
revoke execute on function private.questions_valid(jsonb) from public, anon;
-- CHECK constraints are evaluated with the writer's privileges, and admins write events as `authenticated`.
grant execute on function private.questions_valid(jsonb) to authenticated;

alter table public.events
  add column questions jsonb not null default '[]'::jsonb,
  add constraint events_questions_valid check (private.questions_valid(questions)),
  add constraint events_token_prefix_shape check (token_prefix ~ '^[A-Z0-9-]{0,16}$');

-- 2. Registrations. Phase 4 payment columns/statuses are included now so Phase 4 needs no table change.
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.registration_status not null,
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 32768),
  ticket_code text not null unique check (ticket_code ~ '^[A-Z2-7]{26}$'),
  token_number int check (token_number > 0),
  amount_paise int not null default 0 check (amount_paise >= 0),
  hold_expires_at timestamptz,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  waitlist_position int check (waitlist_position > 0),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_one_per_user unique (event_id, user_id),
  constraint registrations_token_unique unique (event_id, token_number),
  constraint registrations_waitlist_unique unique (event_id, waitlist_position) deferrable initially deferred,
  constraint registrations_waitlist_shape check ((status = 'waitlisted') = (waitlist_position is not null)),
  constraint registrations_confirmed_token check (status <> 'confirmed' or token_number is not null),
  constraint registrations_hold_shape check (status <> 'pending_payment' or hold_expires_at is not null)
);
create index registrations_event_status_idx on public.registrations (event_id, status);
create index registrations_user_idx on public.registrations (user_id, created_at desc);
create index registrations_checked_in_by_idx on public.registrations (checked_in_by);
create trigger registrations_touch before update on public.registrations
  for each row execute function public.touch_updated_at();

-- 3. Privileges: read-only for signed-in users, nothing for anon. Writes only via the part-2 RPCs.
alter table public.registrations enable row level security;
revoke all on public.registrations from anon, authenticated;
grant select on public.registrations to authenticated;

create policy "owners read own registrations" on public.registrations for select to authenticated
  using (user_id = (select auth.uid()));
create policy "society admins read registrations" on public.registrations for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and private.is_society_admin(e.society_id)));

-- 4. Seat counts (replaces the Phase 1 placeholder; same name and first two columns).
create or replace function private.event_seat_counts()
returns table (event_id uuid, seats_taken int, waitlisted int)
language sql stable security definer set search_path = '' as $$
  select e.id,
         (count(r.id) filter (where r.status = 'confirmed'
                                 or (r.status = 'pending_payment' and r.hold_expires_at > now())))::int,
         (count(r.id) filter (where r.status = 'waitlisted'))::int
  from public.events e
  left join public.registrations r on r.event_id = e.id
  where e.status = 'published' or private.is_society_admin(e.society_id)
  group by e.id;
$$;
revoke execute on function private.event_seat_counts() from public;
grant execute on function private.event_seat_counts() to anon, authenticated;

create or replace view public.event_seat_counts with (security_invoker = true) as
  select c.event_id, c.seats_taken, c.waitlisted from private.event_seat_counts() as c;

-- 5. Attendee list: confirmed registrants' public profile fields, signed-in users only.
create or replace function private.event_attendees()
returns table (event_id uuid, handle text, full_name text, avatar_url text, headline text)
language sql stable security definer set search_path = '' as $$
  select r.event_id, p.handle, p.full_name, p.avatar_url, p.headline
  from public.registrations r
  join public.events e on e.id = r.event_id
  join public.profiles p on p.id = r.user_id
  where (select auth.uid()) is not null
    and r.status = 'confirmed'
    and p.onboarded
    and (e.status = 'published' or private.is_society_admin(e.society_id));
$$;
revoke execute on function private.event_attendees() from public, anon;
grant execute on function private.event_attendees() to authenticated;

create view public.event_attendees with (security_invoker = true) as
  select a.event_id, a.handle, a.full_name, a.avatar_url, a.headline from private.event_attendees() as a;
revoke all on public.event_attendees from anon, authenticated;
grant select on public.event_attendees to authenticated;
