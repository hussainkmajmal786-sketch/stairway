-- Corrective: the proof upload quota subquery on storage.objects inside its own INSERT policy recursed (42P17).
-- Move the count into a definer helper; the policy semantics (max 10 objects per user in ieee-proof) are unchanged.
create or replace function private.proof_object_count(p_uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from storage.objects o where o.bucket_id = 'ieee-proof' and (storage.foldername(o.name))[1] = p_uid::text
$$;
revoke execute on function private.proof_object_count(uuid) from public, anon, service_role;
grant execute on function private.proof_object_count(uuid) to authenticated;
drop policy "members upload own proof" on storage.objects;
create policy "members upload own proof" on storage.objects for insert to authenticated
  with check (bucket_id = 'ieee-proof' and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.proof_object_count((select auth.uid())) < 10);
