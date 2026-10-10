-- Phase 4 (part 4): one-way outbound sync of registrations to Fund Easy. A trigger snapshots each transition into
-- a private outbox; the Worker's cron drains it (service_role only). Registration and payment never wait for it:
-- the enqueue trigger is exception-safe (a failure to enqueue is logged as a WARNING and the registration proceeds).
-- No backfill: only transitions after this migration are queued.

create table private.external_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  registration_id uuid not null,  -- no FK: a deleted free registration still owes Fund Easy a cancellation
  event_type text not null
    check (event_type in ('registration.confirmed', 'registration.cancelled', 'payment.refunded')),
  idempotency_key text not null unique check (char_length(idempotency_key) <= 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8192),
  status text not null default 'pending' check (status in ('pending', 'failed', 'sent', 'dead')),
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index external_sync_outbox_due_idx on private.external_sync_outbox (next_attempt_at)
  where status in ('pending', 'failed');
create index external_sync_outbox_registration_idx on private.external_sync_outbox (registration_id, seq);
revoke all on private.external_sync_outbox from public, anon, authenticated, service_role;

-- Snapshot of one transition. Minimal personal data: email + full name only when a seat is confirmed (Fund Easy
-- needs them to find or create the attendee's account); never phone, answers or IEEE id (profile_private is never read).
create or replace function private.enqueue_registration_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations%rowtype;
  kind text;
  ev public.events%rowtype;
  v_email text;
  v_name text;
  v_token text;
  v_payload jsonb;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'confirmed' then
      return null;
    end if;
    r := old;
    kind := 'registration.cancelled';
  else
    r := new;
    if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
      kind := 'registration.confirmed';
    elsif tg_op = 'UPDATE' and old.status = 'confirmed' and new.status in ('cancelled', 'refund_needed') then
      kind := 'registration.cancelled';
    elsif tg_op = 'UPDATE' and new.status = 'refunded' and old.status is distinct from 'refunded' then
      kind := 'payment.refunded';
    else
      return null;
    end if;
  end if;

  -- Never let the outbox block or fail a registration / payment: any error below is swallowed (subtransaction
  -- rolled back, WARNING with the SQLSTATE only, no personal data) and the caller's statement goes on.
  begin
    select e.* into ev from public.events e where e.id = r.event_id;
    v_token := case when r.token_number is null then null
                    when coalesce(ev.token_prefix, '') = '' then lpad(r.token_number::text, greatest(4, length(r.token_number::text)), '0')
                    else ev.token_prefix || '-' || lpad(r.token_number::text, greatest(4, length(r.token_number::text)), '0') end;
    if kind = 'registration.confirmed' then
      select u.email into v_email from auth.users u where u.id = r.user_id;
      select p.full_name into v_name from public.profiles p where p.id = r.user_id;
    end if;

    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'registration', jsonb_build_object(
        'id', r.id,
        'status', case when tg_op = 'DELETE' then 'cancelled' else r.status::text end,
        'ticket_code', case when kind = 'registration.confirmed' then r.ticket_code end,
        'token', case when kind = 'registration.confirmed' then v_token end,
        'amount_paise', r.amount_paise,
        'currency', 'INR',
        'receipt_number', r.receipt_number,
        'razorpay_order_id', r.razorpay_order_id,
        'razorpay_payment_id', r.razorpay_payment_id,
        'razorpay_refund_id', r.razorpay_refund_id,
        'confirmed_at', r.confirmed_at,
        'paid_at', r.paid_at,
        'cancelled_at', case when tg_op = 'DELETE' then now() else r.cancelled_at end,
        'refunded_at', r.refunded_at,
        'cancel_reason', case when tg_op = 'DELETE' then 'account_deleted' else r.cancel_reason end),
      'event', jsonb_build_object(
        'id', ev.id, 'slug', ev.slug, 'title', left(ev.title, 200), 'starts_at', ev.starts_at, 'ends_at', ev.ends_at,
        'venue', left(ev.venue, 200), 'capacity', ev.capacity, 'price_paise', ev.price_paise),
      'attendee', case when kind = 'registration.confirmed'
                       then jsonb_build_object('email', left(v_email, 320), 'full_name', left(v_name, 200)) end));

    insert into private.external_sync_outbox (registration_id, event_type, idempotency_key, payload)
    values (r.id, kind,
            r.id::text || ':' || kind || ':' || ((extract(epoch from clock_timestamp()) * 1000000)::bigint)::text,
            v_payload)
    on conflict (idempotency_key) do nothing;
  exception when others then
    raise warning 'external_sync_outbox enqueue skipped (sqlstate %)', sqlstate;
  end;
  return null;
end $$;
revoke execute on function private.enqueue_registration_sync() from public, anon, authenticated, service_role;

create trigger registrations_enqueue_sync
  after insert or update of status or delete on public.registrations
  for each row execute function private.enqueue_registration_sync();

-- Claim up to 25 due rows (oldest first). A row waits while an earlier row of the same registration is still
-- pending/failed, so Fund Easy sees confirm -> cancel -> refund in order. Claimed rows get a 2-minute lease.
create or replace function private.claim_sync_batch(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  batch jsonb;
begin
  -- Retention: payloads of rows sent more than 30 days ago (they carry an email) are emptied.
  update private.external_sync_outbox o set payload = '{}'::jsonb
   where o.status = 'sent' and o.sent_at < now() - interval '30 days' and o.payload <> '{}'::jsonb;

  with picked as (
    select o.id from private.external_sync_outbox o
     where o.status in ('pending', 'failed') and o.next_attempt_at <= now()
       and (o.locked_until is null or o.locked_until < now())
       and not exists (select 1 from private.external_sync_outbox p
                        where p.registration_id = o.registration_id and p.seq < o.seq
                          and p.status in ('pending', 'failed'))
     order by o.seq
     limit least(greatest(coalesce(p_limit, 10), 1), 25)
     for update skip locked
  ), claimed as (
    update private.external_sync_outbox o
       set locked_until = now() + interval '2 minutes', attempts = o.attempts + 1
      from picked
     where o.id = picked.id
    returning o.id, o.seq, o.event_type, o.idempotency_key, o.payload, o.attempts, o.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'event_type', c.event_type, 'idempotency_key', c.idempotency_key,
           'payload', c.payload, 'attempts', c.attempts, 'created_at', c.created_at) order by c.seq), '[]'::jsonb)
    into batch
    from claimed c;
  return batch;
end $$;

create or replace function private.complete_sync(p_id uuid, p_ok boolean, p_permanent boolean default false,
                                                 p_error text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  update private.external_sync_outbox o
     set status = case when p_ok then 'sent'
                       when coalesce(p_permanent, false) or o.attempts >= 10 then 'dead'
                       else 'failed' end,
         sent_at = case when p_ok then now() else o.sent_at end,
         locked_until = null,
         last_error = case when p_ok then null else left(coalesce(nullif(p_error, ''), 'error'), 500) end,
         next_attempt_at = case when p_ok then o.next_attempt_at
                                else now() + least(interval '1 minute' * power(2, greatest(o.attempts - 1, 0)),
                                                   interval '6 hours') end
   where o.id = p_id and o.status in ('pending', 'failed')
  returning o.status into v_status;
  if not found then
    raise exception 'outbox_row_not_found' using errcode = 'P0001';
  end if;
  return v_status;
end $$;

revoke execute on function private.claim_sync_batch(int), private.complete_sync(uuid, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function private.claim_sync_batch(int), private.complete_sync(uuid, boolean, boolean, text)
  to service_role;

create function public.claim_sync_batch(p_limit int default 10) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.claim_sync_batch(p_limit);
$$;
create function public.complete_sync(p_id uuid, p_ok boolean, p_permanent boolean default false, p_error text default null)
returns text language sql volatile security invoker set search_path = '' as $$
  select private.complete_sync(p_id, p_ok, p_permanent, p_error);
$$;
revoke execute on function public.claim_sync_batch(int), public.complete_sync(uuid, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.claim_sync_batch(int), public.complete_sync(uuid, boolean, boolean, text)
  to service_role;
