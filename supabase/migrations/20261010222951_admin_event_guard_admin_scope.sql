-- Phase 5 (part 1b): the event guard governs ADMIN sessions only. Non-admins cannot write events at all (RLS), and a
-- session whose claims belong to a plain user (e.g. a maintenance script that left request.jwt.claims set, or a
-- definer function running on behalf of a user) must not be held to admin rules. Behaviour for admins is unchanged.
create or replace function private.guard_event_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_any_admin() then return new; end if;   -- service role / cron / SQL editor / non-admin
  if tg_op = 'INSERT' then
    if new.status = 'cancelled' then raise exception 'use_cancel_event' using errcode = 'P0001'; end if;
    return new;
  end if;
  if new.society_id is distinct from old.society_id and not private.is_super_admin() then
    raise exception 'society_locked' using errcode = '42501';
  end if;
  if new.slug is distinct from old.slug and old.status <> 'draft' then
    raise exception 'slug_locked' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'cancelled' then raise exception 'event_cancelled' using errcode = 'P0001'; end if;
    if new.status = 'cancelled' and coalesce(current_setting('stairway.admin_cancel', true), '') <> 'on' then
      raise exception 'use_cancel_event' using errcode = 'P0001';
    end if;
    if new.status = 'draft' and exists (
         select 1 from public.registrations r where r.event_id = old.id
            and r.status in ('confirmed', 'waitlisted', 'pending_payment', 'refund_needed')) then
      raise exception 'has_registrations' using errcode = 'P0001';
    end if;
  end if;
  if new.price_paise is distinct from old.price_paise and exists (
       select 1 from public.registrations r where r.event_id = old.id and r.amount_paise > 0
          and r.status in ('pending_payment', 'confirmed', 'refund_needed')) then
    raise exception 'price_locked' using errcode = 'P0001';
  end if;
  if new.capacity < old.capacity and new.capacity < private.seats_taken(old.id) then
    raise exception 'capacity_below_taken' using errcode = 'P0001';
  end if;
  if (new.ticket_type is distinct from old.ticket_type or new.token_prefix is distinct from old.token_prefix)
     and exists (select 1 from public.registrations r where r.event_id = old.id and r.token_number is not null) then
    raise exception 'ticket_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function private.guard_event_write() from public, anon, authenticated, service_role;
