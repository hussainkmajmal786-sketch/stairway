-- Phase 3 Task 1 review fixes: explicit grants on event_seat_counts, trimmed question values, service_role on questions_valid.

-- 1. `create or replace view` kept the Phase 1 ACL (anon=rm, authenticated=arwdm). Read-only, explicitly.
revoke all on public.event_seat_counts from anon, authenticated;
grant select on public.event_seat_counts to anon, authenticated;

-- 2. Question values must already be trimmed so the DB and the zod mirror (lib/registration/questions.ts) agree:
--    zod trims label and options with JS String.prototype.trim(), so a stored value is valid only if trimming
--    would not change it. `help` is not trimmed by zod (max 300 only), so it keeps its length check only.
--    Options must be unique (case-sensitive, like zod's Set check).
create or replace function private.questions_valid(q jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  opts jsonb;
  kind text;
  ids text[] := '{}';
  -- JS trim() whitespace: \s plus NBSP, Ogham space, U+2000-200A, line/para separators, narrow NBSP, MMSP, ideographic space, BOM.
  untrimmed constant text :=
    '^[\s   -     　﻿]|[\s   -     　﻿]$';
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
    if jsonb_typeof(item->'label') <> 'string' or char_length(item->>'label') not between 1 and 200
       or (item->>'label') ~ untrimmed then
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
                 where jsonb_typeof(o.value) <> 'string'
                    or char_length(o.value #>> '{}') not between 1 and 100
                    or (o.value #>> '{}') ~ untrimmed) then
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
-- CHECK constraints run with the writer's privileges: admins write events as `authenticated`, scripts as `service_role`.
grant execute on function private.questions_valid(jsonb) to authenticated, service_role;
