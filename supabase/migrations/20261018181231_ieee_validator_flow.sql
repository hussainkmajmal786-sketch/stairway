-- IEEE Membership Validator review flow. Additive: three create-or-replace bodies (same signatures) and one new function pair.
-- IEEE has no public API for third-party sites, so a branch officer confirms membership in the vTools Membership Validator
-- and the super admin records the expiry it shows. A claim for a number nobody else holds therefore no longer needs a photo.

-- 1. submit_ieee_claim: (a) 7-digit input is padded to the 8-digit form; (b) a number not held by another live account goes
--    to pending_review even without a proof photo; only a HELD number still requires proof (then a human decides).
create or replace function private.submit_ieee_claim(p_member_number text, p_proof_path text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_num text := btrim(coalesce(p_member_number, ''));
  v_today date := private.ist_today();
  v_name text;
  v_name_at timestamptz;
  v_ros private.ieee_roster%rowtype;
  v_held boolean;
  v_auto boolean;
  v_status public.ieee_claim_status;
  v_until date;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if v_num ~ '^\d{7}$' then v_num := lpad(v_num, 8, '0'); end if;
  if v_num !~ '^\d{8,9}$' then raise exception 'invalid_number' using errcode = 'P0001'; end if;
  if p_proof_path is not null and (p_proof_path !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{8,80}$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'ieee-proof' and o.name = p_proof_path)) then
    raise exception 'invalid_proof' using errcode = 'P0001';
  end if;
  select p.full_name, p.name_changed_at into v_name, v_name_at from public.profiles p where p.id = v_uid and p.onboarded;
  if not found then raise exception 'not_onboarded' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ieee:' || v_uid::text, 0));
  if (select count(*) from private.ieee_attempts a where a.user_id = v_uid and a.at > now() - interval '24 hours') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into private.ieee_attempts (user_id) values (v_uid);

  update public.ieee_claims c set status = 'withdrawn'                      -- a lapsed verification no longer holds its number
   where c.member_number = v_num and c.status = 'verified' and c.verified_until < v_today and c.user_id <> v_uid;
  v_held := exists (select 1 from public.ieee_claims c where c.member_number = v_num and c.status = 'verified' and c.user_id <> v_uid);

  select * into v_ros from private.ieee_roster r where r.member_hash = private.ieee_hash(v_num);
  -- auto-verify only: not held by another live account, on the roster and unexpired, profile name stable for 7 days and matching
  v_auto := not v_held and found and v_ros.expires_on >= v_today and v_name_at <= now() - interval '7 days'
            and private.names_overlap(v_ros.name_hashes, private.name_token_hashes(v_name));
  if v_auto then v_status := 'verified'; v_until := v_ros.expires_on;
  elsif p_proof_path is null and v_held then return jsonb_build_object('status', 'proof_required');   -- a held number needs evidence
  else v_status := 'pending_review'; end if;                                                          -- an officer checks it in the Validator

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

-- 2. Decision audit: the summary also records (boolean) whether the approver confirmed the Validator. Direct callers of
--    admin_decide_claim keep working and record false.
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
    'prescreened', v_c.prescreen_status = 'done',
    'validator_confirmed', coalesce(current_setting('stairway.validator_confirmed', true), '') = 'on'));
end $$;

-- 3. The approval the app uses: refuses unless the Validator confirmation checkbox was ticked, then runs the same decision.
create or replace function private.admin_approve_claim(p_claim_id uuid, p_verified_until date, p_validator_confirmed boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_validator_confirmed is not true then raise exception 'validator_unconfirmed' using errcode = 'P0001'; end if;
  perform set_config('stairway.validator_confirmed', 'on', true);
  perform private.admin_decide_claim(p_claim_id, true, p_verified_until, null);
  perform set_config('stairway.validator_confirmed', 'off', true);
end $$;
revoke execute on function private.admin_approve_claim(uuid, date, boolean) from public, anon, authenticated, service_role;
grant execute on function private.admin_approve_claim(uuid, date, boolean) to authenticated;
create function public.admin_approve_claim(p_claim_id uuid, p_verified_until date, p_validator_confirmed boolean) returns void
language sql security invoker set search_path = '' as $$ select private.admin_approve_claim(p_claim_id, p_verified_until, p_validator_confirmed) $$;
revoke execute on function public.admin_approve_claim(uuid, date, boolean) from public, anon, authenticated, service_role;
grant execute on function public.admin_approve_claim(uuid, date, boolean) to authenticated;

-- 4. Review queue also shows the email the member used (super admin only), so the officer can look them up in the Validator.
create or replace function private.admin_membership_queue(p_limit int, p_offset int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_total int; v_rows jsonb;
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*)::int into v_total from public.ieee_claims c where c.status = 'pending_review';
  select coalesce(jsonb_agg(to_jsonb(g) - 'ord' order by g.ord), '[]'::jsonb) into v_rows from (
    select c.id, c.member_number, p.full_name, p.handle, coalesce(pp.email, '') as email, c.created_at,
           c.prescreen || jsonb_build_object('status', c.prescreen_status) as prescreen,
           c.proof_path is not null as has_proof,
           row_number() over (order by c.created_at, c.id) as ord
      from public.ieee_claims c join public.profiles p on p.id = c.user_id
      left join public.profile_private pp on pp.user_id = c.user_id
     where c.status = 'pending_review'
     order by c.created_at, c.id
     limit least(greatest(coalesce(p_limit, 50), 1), 50) offset greatest(coalesce(p_offset, 0), 0)) g;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;
