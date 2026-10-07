-- Phase 3 (part 2): registration RPCs for free events, waitlist promotion and ticket codes.
-- Every write locks the event row first (FOR UPDATE), so capacity, token numbers and waitlist order
-- are serialised per event. Lock order everywhere: events row, then registrations rows.

-- 128 random bits as 26 RFC 4648 base32 characters (no padding). Opaque: QR codes carry only this.
create or replace function private.new_ticket_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  raw bytea := extensions.gen_random_bytes(16);
  code text := '';
  buf int := 0;
  bits int := 0;
begin
  for i in 0..15 loop
    buf := (buf << 8) | get_byte(raw, i);
    bits := bits + 8;
    while bits >= 5 loop
      code := code || substr(alphabet, ((buf >> (bits - 5)) & 31) + 1, 1);
      bits := bits - 5;
    end loop;
    buf := buf & ((1 << bits) - 1);
  end loop;
  if bits > 0 then
    code := code || substr(alphabet, ((buf << (5 - bits)) & 31) + 1, 1);
  end if;
  return code;
end $$;

-- Seats in use: confirmed + unexpired payment holds (holds arrive in Phase 4).
create or replace function private.seats_taken(p_event_id uuid) returns int
language sql stable set search_path = '' as $$
  select count(*)::int from public.registrations r
  where r.event_id = p_event_id
    and (r.status = 'confirmed' or (r.status = 'pending_payment' and r.hold_expires_at > now()));
$$;

-- Answers must match the event's questions exactly (mirrors answersSchema() in lib/registration/questions.ts).
create or replace function private.validate_answers(p_questions jsonb, p_answers jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  q jsonb;
  v jsonb;
  kind text;
  req boolean;
  ids text[];
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return false;
  end if;
  select coalesce(array_agg(t.x->>'id'), '{}') into ids from jsonb_array_elements(p_questions) as t(x);
  if exists (select 1 from jsonb_object_keys(p_answers) as k(key) where not (k.key = any(ids))) then
    return false;
  end if;
  for q in select t.x from jsonb_array_elements(p_questions) as t(x) loop
    kind := q->>'type';
    req := (q->>'required')::boolean;
    v := p_answers->(q->>'id');
    if v is null or v = 'null'::jsonb then
      if req then return false; end if;
      continue;
    end if;
    case kind
      when 'text', 'textarea' then
        if jsonb_typeof(v) <> 'string'
           or char_length(v #>> '{}') > (case when kind = 'text' then 500 else 2000 end) then
          return false;
        end if;
        if req and btrim(v #>> '{}') = '' then return false; end if;
      when 'single_choice' then
        if jsonb_typeof(v) <> 'string' then return false; end if;
        if (v #>> '{}') = '' then
          if req then return false; end if;
        elsif not ((q->'options') @> jsonb_build_array(v)) then
          return false;
        end if;
      when 'multi_choice' then
        if jsonb_typeof(v) <> 'array' then return false; end if;
        if exists (select 1 from jsonb_array_elements(v) as o(value)
                   where jsonb_typeof(o.value) <> 'string' or not ((q->'options') @> jsonb_build_array(o.value))) then
          return false;
        end if;
        if (select count(distinct o.value #>> '{}') from jsonb_array_elements(v) as o(value)) <> jsonb_array_length(v) then
          return false;
        end if;
        if req and jsonb_array_length(v) = 0 then return false; end if;
      when 'checkbox' then
        if jsonb_typeof(v) <> 'boolean' then return false; end if;
        if req and v <> 'true'::jsonb then return false; end if;
      else
        return false;
    end case;
  end loop;
  return true;
end $$;

-- Renumber the waitlist densely (1..n) in join order. Positions are unique-deferred, so this is safe mid-transaction.
create or replace function private.compact_waitlist(p_event_id uuid) returns void
language sql set search_path = '' as $$
  update public.registrations r
     set waitlist_position = s.pos
    from (select w.id, (row_number() over (order by w.waitlist_position, w.created_at))::int as pos
            from public.registrations w
           where w.event_id = p_event_id and w.status = 'waitlisted') s
   where r.id = s.id and r.waitlist_position is distinct from s.pos;
$$;

-- Fill free seats from the head of the waitlist. CALLER MUST HOLD the event row lock.
-- Free events only: Phase 4 gives paid events a 15-minute pending_payment hold instead.
-- Returns the promoted registration ids (Phase 4 sends "you're in" emails for them).
create or replace function private.promote_waitlist(p_event_id uuid) returns setof uuid
language plpgsql set search_path = '' as $$
declare
  cap int;
  price int;
  head_id uuid;
  head_token int;
  next_token int;
begin
  -- Only published free events fill seats from the waitlist (a draft/cancelled event keeps its queue frozen).
  select e.capacity, e.price_paise into cap, price from public.events e where e.id = p_event_id and e.status = 'published';
  if not found or price > 0 then
    return;
  end if;
  loop
    exit when private.seats_taken(p_event_id) >= cap;
    select r.id, r.token_number into head_id, head_token
      from public.registrations r
     where r.event_id = p_event_id and r.status = 'waitlisted'
     order by r.waitlist_position
     limit 1
     for update;
    exit when not found;
    select coalesce(max(r.token_number), 0) + 1 into next_token from public.registrations r where r.event_id = p_event_id;
    update public.registrations r
       set status = 'confirmed', waitlist_position = null, confirmed_at = now(),
           token_number = coalesce(head_token, next_token)
     where r.id = head_id;
    perform private.compact_waitlist(p_event_id);
    return next head_id;
  end loop;
end $$;

create or replace function public.register_for_event(p_event_id uuid, p_answers jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  ev public.events%rowtype;
  existing public.registrations%rowtype;
  had_row boolean;
  new_status public.registration_status;
  pos int;
  tok int;
  rid uuid;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.onboarded) then
    raise exception 'not_onboarded' using errcode = 'P0001';
  end if;

  select e.* into ev from public.events e where e.id = p_event_id for update;
  if not found or ev.status <> 'published' then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  if ev.price_paise > 0 then
    raise exception 'paid_event' using errcode = 'P0001';
  end if;
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then
    raise exception 'not_open_yet' using errcode = 'P0001';
  end if;
  if now() >= least(coalesce(ev.registration_closes_at, ev.starts_at), ev.starts_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if octet_length(v_answers::text) > 32768 or not private.validate_answers(ev.questions, v_answers) then
    raise exception 'invalid_answers' using errcode = 'P0001';
  end if;

  select r.* into existing from public.registrations r where r.event_id = ev.id and r.user_id = uid for update;
  had_row := found;
  if had_row and existing.status <> 'cancelled' then
    raise exception 'already_registered' using errcode = 'P0001';
  end if;

  -- Anyone already waiting goes first if seats have freed up (e.g. capacity was raised).
  perform private.promote_waitlist(ev.id);

  if private.seats_taken(ev.id) < ev.capacity then
    new_status := 'confirmed';
    pos := null;
    if had_row and existing.token_number is not null then
      tok := existing.token_number;
    else
      select coalesce(max(r.token_number), 0) + 1 into tok from public.registrations r where r.event_id = ev.id;
    end if;
  else
    new_status := 'waitlisted';
    tok := case when had_row then existing.token_number end;
    select coalesce(max(r.waitlist_position), 0) + 1 into pos
      from public.registrations r where r.event_id = ev.id and r.status = 'waitlisted';
  end if;

  if had_row then
    update public.registrations r
       set status = new_status, answers = v_answers, ticket_code = private.new_ticket_code(),
           token_number = tok, waitlist_position = pos, amount_paise = 0,
           confirmed_at = case when new_status = 'confirmed' then now() end,
           cancelled_at = null, checked_in_at = null, checked_in_by = null
     where r.id = existing.id
     returning r.id into rid;
  else
    insert into public.registrations (event_id, user_id, status, answers, ticket_code, token_number, waitlist_position, confirmed_at)
    values (ev.id, uid, new_status, v_answers, private.new_ticket_code(), tok, pos,
            case when new_status = 'confirmed' then now() end)
    returning id into rid;
  end if;

  return jsonb_build_object('registration_id', rid, 'status', new_status, 'waitlist_position', pos);
end $$;

create or replace function public.cancel_registration(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_event_id uuid;
  ev public.events%rowtype;
  reg public.registrations%rowtype;
  promoted int;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select r.event_id into v_event_id from public.registrations r where r.id = p_registration_id and r.user_id = uid;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;

  select e.* into ev from public.events e where e.id = v_event_id for update;
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;

  if reg.status not in ('confirmed', 'waitlisted') or reg.checked_in_at is not null then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  if reg.amount_paise > 0 then
    raise exception 'paid_cancel_not_supported' using errcode = 'P0001';
  end if;
  if now() >= ev.starts_at then
    raise exception 'event_started' using errcode = 'P0001';
  end if;

  update public.registrations r
     set status = 'cancelled', cancelled_at = now(), waitlist_position = null
   where r.id = reg.id;
  if reg.status = 'waitlisted' then
    perform private.compact_waitlist(ev.id);
  end if;
  select count(*)::int into promoted from private.promote_waitlist(ev.id);

  return jsonb_build_object('registration_id', reg.id, 'event_id', ev.id, 'promoted', promoted);
end $$;

revoke execute on function
  private.new_ticket_code(),
  private.seats_taken(uuid),
  private.validate_answers(jsonb, jsonb),
  private.compact_waitlist(uuid),
  private.promote_waitlist(uuid)
from public, anon, authenticated, service_role;
-- The RPCs act as auth.uid(): only signed-in users may call them (service_role would only ever get not_signed_in).
revoke execute on function public.register_for_event(uuid, jsonb), public.cancel_registration(uuid)
  from public, anon, service_role;
grant execute on function public.register_for_event(uuid, jsonb), public.cancel_registration(uuid) to authenticated;
