-- Phase 4 (part 1): payment data model. Nothing here charges anyone: the 'payments' flag starts OFF.
-- New tables live in the unexposed `private` schema: no client can reach them; service-role access goes
-- through security-definer functions added in parts 3-4.

grant usage on schema private to service_role;

-- 1. Feature flags, flipped by the project owner with SQL only (README "Enabling payments").
create table private.feature_flags (
  key text primary key check (key in ('payments')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.feature_flags (key, enabled) values ('payments', false);
revoke all on private.feature_flags from public, anon, authenticated, service_role;

create or replace function private.flag_enabled(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select f.enabled from private.feature_flags f where f.key = p_key), false);
$$;
revoke execute on function private.flag_enabled(text) from public, anon, authenticated, service_role;

-- 2. Token numbers are never reused (a cascaded account deletion used to free its number):
--    one counter per event, bumped only while the caller holds the event row lock.
create table private.event_token_counters (
  event_id uuid primary key references public.events(id) on delete cascade,
  last_token int not null check (last_token >= 0)
);
revoke all on private.event_token_counters from public, anon, authenticated, service_role;
insert into private.event_token_counters (event_id, last_token)
  select r.event_id, max(r.token_number) from public.registrations r
  where r.token_number is not null
  group by r.event_id;

create or replace function private.next_token(p_event_id uuid) returns int
language sql volatile set search_path = '' as $$
  insert into private.event_token_counters as c (event_id, last_token)
  values (p_event_id, coalesce((select max(r.token_number) from public.registrations r where r.event_id = p_event_id), 0) + 1)
  on conflict (event_id) do update set last_token = c.last_token + 1
  returning c.last_token;
$$;
revoke execute on function private.next_token(uuid) from public, anon, authenticated, service_role;

-- 3. Receipt numbers for accepted payments: STW-<IST year>-<6+ digits>.
create sequence private.receipt_seq;
revoke all on sequence private.receipt_seq from public, anon, authenticated, service_role;

create or replace function private.next_receipt_number() returns text
language sql volatile set search_path = '' as $$
  select 'STW-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-'
         || lpad(s.n::text, greatest(6, length(s.n::text)), '0')
  from (select nextval('private.receipt_seq') as n) s;
$$;
revoke execute on function private.next_receipt_number() from public, anon, authenticated, service_role;

-- 4. Registration payment fields (Phase 3 already added amount_paise, hold_expires_at and the Razorpay ids).
alter table public.registrations
  add column paid_at timestamptz,
  add column receipt_number text unique check (receipt_number ~ '^STW-[0-9]{4}-[0-9]{6,}$'),
  add column razorpay_refund_id text unique check (razorpay_refund_id ~ '^rfnd_[A-Za-z0-9]{6,40}$'),
  add column refunded_at timestamptz,
  add column refund_claimed_until timestamptz,
  add column cancel_reason text check (cancel_reason in ('user', 'hold_expired', 'late_payment_no_seat')),
  add constraint registrations_money_shape
    check (status not in ('refund_needed', 'refunded') or razorpay_payment_id is not null),
  add constraint registrations_order_shape
    check (razorpay_order_id is null or razorpay_order_id ~ '^order_[A-Za-z0-9]{6,40}$'),
  add constraint registrations_payment_shape
    check (razorpay_payment_id is null or razorpay_payment_id ~ '^pay_[A-Za-z0-9]{6,40}$');

-- 5. Payment ledger: one row per Razorpay order we created. Survives re-registration (the registration row only
--    shows the current attempt). ON DELETE RESTRICT: an account that ever created an order cannot vanish by cascade.
create table private.payment_orders (
  razorpay_order_id text primary key check (razorpay_order_id ~ '^order_[A-Za-z0-9]{6,40}$'),
  registration_id uuid not null references public.registrations(id) on delete restrict,
  amount_paise int not null check (amount_paise > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'refunded')),
  razorpay_payment_id text unique check (razorpay_payment_id ~ '^pay_[A-Za-z0-9]{6,40}$'),
  receipt_number text unique,
  razorpay_refund_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);
create index payment_orders_registration_idx on private.payment_orders (registration_id, created_at desc);
revoke all on private.payment_orders from public, anon, authenticated, service_role;

-- 6. Append-only log of every payment signal we acted on. razorpay_event_id (x-razorpay-event-id) makes webhook
--    deliveries idempotent. `details` holds a whitelisted subset only (status, method): never card/contact data.
create table private.payment_events (
  id bigint generated always as identity primary key,
  registration_id uuid references public.registrations(id) on delete restrict,
  source text not null check (source in ('client_verify', 'webhook', 'refund_api')),
  razorpay_event_id text unique check (char_length(razorpay_event_id) <= 100),
  razorpay_event text check (char_length(razorpay_event) <= 60),
  razorpay_order_id text check (char_length(razorpay_order_id) <= 60),
  razorpay_payment_id text check (char_length(razorpay_payment_id) <= 60),
  razorpay_refund_id text check (char_length(razorpay_refund_id) <= 60),
  amount_paise int,
  currency text check (currency ~ '^[A-Z]{3}$'),
  outcome text not null check (outcome in ('confirmed', 'late_confirmed', 'refund_needed', 'already_processed',
    'duplicate_payment', 'amount_mismatch', 'refunded', 'already_refunded', 'ledger_refund')),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 2048),
  received_at timestamptz not null default now()
);
create index payment_events_registration_idx on private.payment_events (registration_id, received_at desc);
-- Phase 5 admin "needs attention" list: payments we kept but could not attach to a seat.
create index payment_events_attention_idx on private.payment_events (received_at desc)
  where outcome in ('duplicate_payment', 'amount_mismatch');
revoke all on private.payment_events from public, anon, authenticated, service_role;

create or replace function private.payment_events_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'payment_events is append-only' using errcode = '42501';
end $$;
revoke execute on function private.payment_events_append_only() from public, anon, authenticated, service_role;
create trigger payment_events_no_change before update or delete on private.payment_events
  for each row execute function private.payment_events_append_only();
create trigger payment_events_no_truncate before truncate on private.payment_events
  for each statement execute function private.payment_events_append_only();

-- 7. Seat counts gain `attending` (confirmed only). seats_taken still counts live holds, so capacity is never oversold.
drop view public.event_seat_counts;
drop function private.event_seat_counts();
create function private.event_seat_counts()
returns table (event_id uuid, seats_taken int, waitlisted int, attending int)
language sql stable security definer set search_path = '' as $$
  select e.id,
         (count(r.id) filter (where r.status = 'confirmed'
                                 or (r.status = 'pending_payment' and r.hold_expires_at > now())))::int,
         (count(r.id) filter (where r.status = 'waitlisted'))::int,
         (count(r.id) filter (where r.status = 'confirmed'))::int
  from public.events e
  left join public.registrations r on r.event_id = e.id
  where e.status = 'published' or private.is_society_admin(e.society_id)
  group by e.id;
$$;
revoke execute on function private.event_seat_counts() from public;
grant execute on function private.event_seat_counts() to anon, authenticated;

create view public.event_seat_counts with (security_invoker = true) as
  select c.event_id, c.seats_taken, c.waitlisted, c.attending from private.event_seat_counts() as c;
revoke all on public.event_seat_counts from anon, authenticated;
grant select on public.event_seat_counts to anon, authenticated;
