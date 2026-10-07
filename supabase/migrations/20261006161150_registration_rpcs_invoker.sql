-- Phase 3 (part 2b): keep the exposed API free of SECURITY DEFINER functions (security advisor lint 0029).
-- The definer bodies move to the unexposed `private` schema unchanged (body, search_path, ACL travel with them);
-- `public` keeps the same signatures as thin SECURITY INVOKER wrappers. Same pattern as the Task 1 views.

alter function public.register_for_event(uuid, jsonb) set schema private;
alter function public.cancel_registration(uuid) set schema private;

-- Belt and braces: the moved definer functions stay callable by signed-in users only.
revoke execute on function private.register_for_event(uuid, jsonb), private.cancel_registration(uuid)
  from public, anon, service_role;
grant execute on function private.register_for_event(uuid, jsonb), private.cancel_registration(uuid) to authenticated;

create function public.register_for_event(p_event_id uuid, p_answers jsonb default '{}'::jsonb) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.register_for_event(p_event_id, p_answers);
$$;

create function public.cancel_registration(p_registration_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.cancel_registration(p_registration_id);
$$;

revoke execute on function public.register_for_event(uuid, jsonb), public.cancel_registration(uuid)
  from public, anon, service_role;
grant execute on function public.register_for_event(uuid, jsonb), public.cancel_registration(uuid) to authenticated;
