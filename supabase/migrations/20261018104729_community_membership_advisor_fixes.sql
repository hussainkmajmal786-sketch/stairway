-- Advisor clean-up for part 1: explicit deny-all policies on the private membership tables (the definer functions run as the
-- table owner and bypass RLS; API roles have no privileges anyway) and a primary key on the attempts log.
alter table private.ieee_attempts add column id bigint generated always as identity primary key;
create policy "deny api access" on private.app_secrets for all to anon, authenticated using (false) with check (false);
create policy "deny api access" on private.ieee_roster for all to anon, authenticated using (false) with check (false);
create policy "deny api access" on private.ieee_attempts for all to anon, authenticated using (false) with check (false);
