# Phase 2 — Accounts & Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students sign in with Google, finish a short onboarding, manage a rich profile (photo, bio, skills, links, projects, experience) from a participant dashboard, and let signed-in users view each other's profiles — plus close the database-permission gaps found in the Phase 1 review before any admin account exists.

**Architecture:** Supabase Auth (Google OAuth, PKCE) with cookie sessions via `@supabase/ssr`. A small edge `middleware.ts` refreshes sessions only for requests that carry a Supabase auth cookie; server code reads the user with `getClaims()` and redirects unauthenticated visitors to `/login`. Profile data lives in new RLS-protected tables created by an `auth.users` insert trigger; avatars go to a public `avatars` storage bucket scoped to each user's own folder. Everything runs on the existing Cloudflare Worker.

**Tech Stack:** Next.js 16.3.8 (App Router), React 19, Supabase (Auth, Postgres RLS, Storage), `@supabase/ssr` 0.12, zod 4, Vitest 5, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-04-platform-backend-design.md` (sections 2, 3 People, 4 Public + Participant dashboard, 7 Phase 2, 8). Phase 1 plan: `docs/superpowers/plans/2026-10-04-phase1-foundation.md`.

## Global Constraints

- Next.js stays `16.3.8`. **No `proxy.ts`** (Node runtime unsupported by OpenNext). An **edge `middleware.ts`** is allowed solely for Supabase session refresh. **No `export const runtime = "edge"`** in pages/route handlers.
- Login: **Google** only is enabled in the UI; the **email-code** form is built but hidden behind `EMAIL_LOGIN_ENABLED = false` (Supabase's built-in email only delivers to the project's team members; a sending domain + custom SMTP is needed first).
- **Profiles and attendee data are visible to signed-in users only** (RLS `to authenticated`); `anon` must be unable to read any profile table.
- Every redirect target taken from a URL (`?next=`) must pass `safeNext()` (same-origin relative paths only).
- Supabase project ref `nfrdsdnrtsbttyrmfppy` (region `ap-south-1`). Cloudflare account `7a852bedf2056637d90bd9534e6cd7c1`; live site `https://stairway.ieeesbcek.workers.dev`.
- Secrets never enter git. Only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are used in the app. **No service-role key is introduced in this phase** (account deletion is therefore "email us" for now).
- Every dashboard has a **back/close button at the top of its left sidebar** (spec requirement).
- UI follows `design-system/MASTER.md` (paper brutalism: ink 2px borders, hard shadows, square corners, flat colour tags, 44px touch targets below 1024px, visible focus ring, labelled fields with `*` on required ones, errors under fields, `aria-live` for status).
- Keep the site name exactly `st(AI)rway`.
- Database changes are applied with the Supabase MCP `apply_migration`; afterwards rename the committed migration file to the version Supabase assigned (see `list_migrations`) so file and database agree, and regenerate `lib/supabase/database.types.ts` with `generate_typescript_types`.
- Every task ends with `npx vitest run`, `npx tsc --noEmit` and `npx eslint .` all passing with zero errors/warnings, then a commit ending with a blank line and `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `phase2-accounts`.

## File Map

| Path | Responsibility |
|---|---|
| `supabase/migrations/*_security_hardening.sql` | Private helper schema, scoped speaker/society/storage policies, integrity triggers, grant hardening, FK indexes |
| `supabase/migrations/*_profiles.sql` | `profiles`, `profile_private`, `profile_projects`, `profile_experience`, new-user trigger, `avatars` bucket, RLS |
| `supabase/tests/security-hardening.sql`, `supabase/tests/profiles-rls.sql` | Rolled-back SQL assertion scripts run through the MCP |
| `lib/auth/safe-next.ts` | Open-redirect-safe `next` parameter parser |
| `lib/auth/cookies.ts` | `hasSupabaseSessionCookie(names)` |
| `lib/auth/config.ts` | `EMAIL_LOGIN_ENABLED` flag |
| `lib/auth/types.ts` | `AuthUser`, `AuthProfile`, `AuthState` |
| `lib/auth/session.ts` | Server-only `getAuthState`, `requireSignedIn`, `requireOnboarded` |
| `lib/auth/redirect.ts` | `postSignInPath(supabase, next)` shared by callback and continue routes |
| `lib/supabase/middleware.ts` + `middleware.ts` | Session refresh (edge) |
| `lib/profile/{options,schema,handle,crop}.ts` | Shared option lists, zod schemas, handle helpers, avatar crop math + canvas helper |
| `components/providers/AuthProvider.tsx` | Client `AuthContext`, `useAuth`, refresh-on-auth-change |
| `components/auth/{LoginPanel,EmailCodeForm}.tsx` | Google button and (flagged) email code flow |
| `components/layout/AccountButton.tsx` | Top-bar "Sign in" / avatar button |
| `components/ui/Field.tsx` | Shared labelled field + input classes |
| `components/profile/*` | Onboarding form, avatar uploader, profile editor, row lists, profile view |
| `components/dashboard/DashboardShell.tsx` | Sidebar layout with back button |
| `app/login`, `app/auth/{callback,continue,signout}`, `app/onboarding`, `app/me/**`, `app/u/[handle]` | Routes |
| `tests/**` | Vitest unit tests |

---

### Task 1: Security hardening migration

**Files:**
- Create: `supabase/migrations/<assigned>_security_hardening.sql`, `supabase/tests/security-hardening.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces: schema `private` containing `is_super_admin()`, `is_society_admin(uuid)`, `is_any_admin()` (moved from `public`, same signatures, still used by every existing policy), `private.can_manage_media(text) returns boolean`, trigger functions `private.guard_society_update`, `private.check_event_track`, `private.check_gallery_event`. `public.is_*` no longer exist.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261005000001_security_hardening.sql`:

```sql
-- Phase 2 pre-task: close the permission gaps found in the Phase 1 final review.

-- 1. Helpers move to a schema that PostgREST does not expose (no /rpc/is_* endpoints).
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

alter function public.is_super_admin()        set schema private;
alter function public.is_society_admin(uuid)  set schema private;
alter function public.is_any_admin()          set schema private;
revoke execute on function private.is_super_admin(), private.is_society_admin(uuid), private.is_any_admin() from public;
grant  execute on function private.is_super_admin(), private.is_society_admin(uuid), private.is_any_admin() to anon, authenticated;
-- Existing policies keep working: policy expressions reference these functions by OID.

-- 2. Speakers: a society admin may only write their own society's speakers;
--    speakers with no society are super-admin only.
drop policy if exists "admins write speakers" on public.speakers;
create policy "admins write speakers" on public.speakers for all
  using      (private.is_super_admin() or (society_id is not null and private.is_society_admin(society_id)))
  with check (private.is_super_admin() or (society_id is not null and private.is_society_admin(society_id)));

-- 3. Societies: society admins may change description / logo / page content only.
create or replace function private.guard_society_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_super_admin() then
    if new.id         is distinct from old.id
    or new.slug       is distinct from old.slug
    or new.name       is distinct from old.name
    or new.short_name is distinct from old.short_name
    or new.color      is distinct from old.color
    or new.sort_order is distinct from old.sort_order then
      raise exception 'Only a super admin can change a society''s identity fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger societies_guard_update before update on public.societies
  for each row execute function private.guard_society_update();

-- 4. Cross-society integrity.
create or replace function private.check_event_track() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.track_id is not null and not exists (
    select 1 from public.tracks t where t.id = new.track_id and t.society_id = new.society_id
  ) then
    raise exception 'Track does not belong to the event''s society' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger events_check_track before insert or update of track_id, society_id on public.events
  for each row execute function private.check_event_track();

create or replace function private.check_gallery_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.event_id is not null and new.society_id is not null and not exists (
    select 1 from public.events e where e.id = new.event_id and e.society_id = new.society_id
  ) then
    raise exception 'Gallery item society does not match its event''s society' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger gallery_items_check_event before insert or update of event_id, society_id on public.gallery_items
  for each row execute function private.check_gallery_event();

-- 5. Media bucket: super admins anywhere; society admins only under societies/<their-society-uuid>/.
create or replace function private.can_manage_media(object_name text) returns boolean
language sql stable set search_path = '' as $$
  select private.is_super_admin() or (
    case
      when (storage.foldername(object_name))[1] = 'societies'
       and (storage.foldername(object_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_society_admin(((storage.foldername(object_name))[2])::uuid)
      else false
    end
  );
$$;
revoke execute on function private.can_manage_media(text) from public;
grant  execute on function private.can_manage_media(text) to authenticated;

drop policy if exists "admins upload media" on storage.objects;
drop policy if exists "admins update media" on storage.objects;
drop policy if exists "admins delete media" on storage.objects;
create policy "admins upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and private.can_manage_media(name));
create policy "admins update media" on storage.objects for update to authenticated
  using (bucket_id = 'media' and private.can_manage_media(name));
create policy "admins delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and private.can_manage_media(name));
-- SVGs can carry scripts and the bucket is public: drop SVG from the allow-list.
update storage.buckets set allowed_mime_types =
  array['image/png','image/jpeg','image/webp','image/avif','video/mp4','video/webm','application/pdf']
  where id = 'media';

-- 6. Grants: anon is read-only; nobody needs TRUNCATE / REFERENCES / TRIGGER through the API.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- 7. Indexes on foreign keys flagged by the performance advisor.
create index if not exists events_track_id_idx          on public.events (track_id);
create index if not exists event_speakers_speaker_idx   on public.event_speakers (speaker_id);
create index if not exists gallery_items_event_id_idx   on public.gallery_items (event_id);
create index if not exists gallery_items_society_id_idx on public.gallery_items (society_id);
create index if not exists speakers_society_id_idx      on public.speakers (society_id);
create index if not exists admin_roles_society_id_idx   on public.admin_roles (society_id);
```

- [ ] **Step 2: Write the assertion script**

Create `supabase/tests/security-hardening.sql` (runs in one transaction that is rolled back; any failed assertion aborts with a message):

```sql
-- Run through the Supabase MCP execute_sql as a single call. Everything is rolled back.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'cs-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'super@test.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'nobody@test.local',   'authenticated', 'authenticated');
insert into public.admin_roles (user_id, role, society_id)
  select '00000000-0000-0000-0000-0000000000a1', 'society_admin', id from public.societies where slug = 'cs';
insert into public.admin_roles (user_id, role)
  values ('00000000-0000-0000-0000-0000000000a2', 'super_admin');

-- structure
do $$ begin
  assert (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'is\_%admin') = 0,
    'public.is_* helpers still exist';
  assert has_table_privilege('anon', 'public.events', 'select'),   'anon lost select on events';
  assert not has_table_privilege('anon', 'public.events', 'insert'),   'anon can insert events';
  assert not has_table_privilege('anon', 'public.events', 'truncate'), 'anon can truncate events';
  assert not has_table_privilege('authenticated', 'public.events', 'truncate'), 'authenticated can truncate events';
end $$;

-- society admin of CS
do $$ declare n int; cs uuid; ras uuid; begin
  select id into cs  from public.societies where slug = 'cs';
  select id into ras from public.societies where slug = 'ras';
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  set local role authenticated;

  update public.societies set description = 'cs ok' where id = cs;
  get diagnostics n = row_count;  assert n = 1, 'cs admin cannot edit own society description';

  update public.societies set description = 'hacked' where id = ras;
  get diagnostics n = row_count;  assert n = 0, 'cs admin edited another society';

  begin
    update public.societies set slug = 'hacked' where id = cs;
    assert false, 'cs admin changed own society slug';
  exception when others then
    if sqlerrm not like '%identity fields%' then raise; end if;
  end;

  update public.speakers set bio = 'hacked' where society_id is null;
  get diagnostics n = row_count;  assert n = 0, 'society admin edited a society-less speaker';

  update public.events set title = 'hacked' where society_id = ras;
  get diagnostics n = row_count;  assert n = 0, 'cs admin edited a ras event';

  assert private.can_manage_media('societies/' || cs  || '/poster.png'), 'cs admin cannot manage own media folder';
  assert not private.can_manage_media('societies/' || ras || '/poster.png'), 'cs admin can manage ras media';
  assert not private.can_manage_media('site/hero.png'),                       'cs admin can manage site media';
  assert not private.can_manage_media('societies/not-a-uuid/x.png'),          'bad folder not rejected cleanly';
  reset role;
end $$;

-- non-admin user
do $$ declare n int; begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
  set local role authenticated;
  update public.events set title = 'hacked';
  get diagnostics n = row_count;  assert n = 0, 'non-admin edited events';
  assert not private.can_manage_media('societies/x/y.png'), 'non-admin can manage media';
  reset role;
end $$;

-- super admin + integrity triggers
do $$ declare n int; ras_event uuid; cs_track uuid; begin
  select e.id into ras_event from public.events e join public.societies s on s.id = e.society_id where s.slug = 'ras' limit 1;
  select t.id into cs_track  from public.tracks t join public.societies s on s.id = t.society_id where s.slug = 'cs' limit 1;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  set local role authenticated;

  update public.speakers set bio = bio where society_id is null;
  get diagnostics n = row_count;  assert n > 0, 'super admin cannot edit speakers';

  begin
    update public.events set track_id = cs_track where id = ras_event;
    assert false, 'event accepted another society''s track';
  exception when others then
    if sqlerrm not like '%Track does not belong%' then raise; end if;
  end;

  assert private.can_manage_media('site/hero.png'), 'super admin cannot manage site media';
  reset role;
end $$;

rollback;
select 'security-hardening: all assertions passed' as result;
```

- [ ] **Step 3: Apply and verify**

1. Apply the migration with MCP `apply_migration` (name `security_hardening`). Expected: success.
2. Rename the committed file to the version `list_migrations` reports (e.g. `20261005xxxxxx_security_hardening.sql`).
3. Run the whole of `supabase/tests/security-hardening.sql` through MCP `execute_sql` as one call. Expected: result row `security-hardening: all assertions passed`. If a statement shape needs adapting to Supabase's role setup (e.g. `set local role`), adapt it while preserving every asserted behaviour.
4. Confirm the public site still works: `curl -s -o /dev/null -w "%{http_code}" https://stairway.ieeesbcek.workers.dev/s/ras` → `200`, and run `npx vitest run tests/rls` (anonymous RLS tests) → pass.
5. Run MCP `get_advisors` (security): the six `function_exposed` / `anon_security_definer_function_executable` warnings for `is_*` must be gone.
6. Regenerate types with MCP `generate_typescript_types` into `lib/supabase/database.types.ts`; `npx tsc --noEmit` passes.

- [ ] **Step 4: Commit**

```bash
git add supabase lib/supabase/database.types.ts
git commit -m "feat(db): harden permissions before any admin exists"
```

---

### Task 2: Profiles migration (tables, trigger, avatars bucket)

**Files:**
- Create: `supabase/migrations/<assigned>_profiles.sql`, `supabase/tests/profiles-rls.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Produces tables (all RLS on): `public.profiles(id uuid pk → auth.users, handle text unique, full_name, avatar_url, headline, bio, college, branch, year, skills text[], links jsonb, onboarded bool, created_at, updated_at)`, `public.profile_private(user_id pk, email, phone, ieee_member_id, created_at, updated_at)`, `public.profile_projects(id, user_id → profiles.id, title, description, url, image_url, sort_order, …)`, `public.profile_experience(id, user_id, title, organization, start_date date, end_date date null, description, sort_order, …)`; function `private.generate_handle(seed text) returns text`; trigger `on_auth_user_created` on `auth.users` creating a profile + private row; public bucket `avatars`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261005000002_profiles.sql`:

```sql
-- Phase 2: participant profiles.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  full_name text not null default '' check (char_length(full_name) <= 80),
  avatar_url text,
  headline text not null default '' check (char_length(headline) <= 120),
  bio text not null default '' check (char_length(bio) <= 1500),
  college text not null default '' check (char_length(college) <= 120),
  branch text not null default '',
  year text not null default '',
  skills text[] not null default '{}' check (cardinality(skills) <= 30),
  links jsonb not null default '{}'::jsonb,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  phone text not null default '' check (phone = '' or phone ~ '^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$'),
  ieee_member_id text not null default '' check (ieee_member_id = '' or ieee_member_id ~ '^\d{8,9}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  description text not null default '' check (char_length(description) <= 500),
  url text not null default '' check (url = '' or url ~* '^https?://'),
  image_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profile_projects_user_idx on public.profile_projects (user_id, sort_order);

create table public.profile_experience (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  organization text not null check (char_length(organization) between 2 and 100),
  start_date date not null,
  end_date date,
  description text not null default '' check (char_length(description) <= 500),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index profile_experience_user_idx on public.profile_experience (user_id, sort_order);

do $$ declare t text; begin
  foreach t in array array['profiles','profile_private','profile_projects','profile_experience'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- Handle generation: slug from a seed, with a random suffix on collision.
create or replace function private.generate_handle(seed text) returns text
language plpgsql set search_path = '' as $$
declare base text; candidate text; tries int := 0;
begin
  base := lower(regexp_replace(coalesce(seed, ''), '[^a-zA-Z0-9]+', '-', 'g'));
  base := regexp_replace(base, '^-+|-+$', '', 'g');
  base := left(base, 24);
  base := regexp_replace(base, '-+$', '');
  if char_length(base) < 3 then base := 'user'; end if;
  candidate := base;
  while exists (select 1 from public.profiles p where p.handle = candidate) and tries < 25 loop
    tries := tries + 1;
    candidate := base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
  end loop;
  return candidate;
end $$;

-- New auth user → profile + private row (name/avatar from Google metadata).
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  email_local text := split_part(coalesce(new.email, ''), '@', 1);
  display text := coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', ''), email_local, '');
begin
  insert into public.profiles (id, handle, full_name, avatar_url)
  values (
    new.id,
    private.generate_handle(coalesce(nullif(email_local, ''), display)),
    left(display, 80),
    nullif(coalesce(meta->>'avatar_url', meta->>'picture'), '')
  );
  insert into public.profile_private (user_id, email) values (new.id, coalesce(new.email, ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- RLS
alter table public.profiles           enable row level security;
alter table public.profile_private    enable row level security;
alter table public.profile_projects   enable row level security;
alter table public.profile_experience enable row level security;
revoke all on public.profiles, public.profile_private, public.profile_projects, public.profile_experience from anon;

create policy "signed-in users read profiles" on public.profiles for select to authenticated using (true);
create policy "owners update profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "owners read private" on public.profile_private for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owners update private" on public.profile_private for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "signed-in users read projects" on public.profile_projects for select to authenticated using (true);
create policy "owners insert projects" on public.profile_projects for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "owners update projects" on public.profile_projects for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners delete projects" on public.profile_projects for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "signed-in users read experience" on public.profile_experience for select to authenticated using (true);
create policy "owners insert experience" on public.profile_experience for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "owners update experience" on public.profile_experience for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners delete experience" on public.profile_experience for delete to authenticated
  using (user_id = (select auth.uid()));

-- Avatars: public bucket (served by URL), writes only inside the user's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;
create policy "users upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

- [ ] **Step 2: Write the assertion script**

Create `supabase/tests/profiles-rls.sql` (single call via MCP `execute_sql`; rolled back):

```sql
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'ada.lovelace@test.local', 'authenticated', 'authenticated',
   '{"full_name":"Ada Lovelace","avatar_url":"https://example.com/a.png"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'ada.lovelace@other.local', 'authenticated', 'authenticated', '{}');

-- trigger output
do $$ declare ha text; hb text; begin
  select handle into ha from public.profiles where id = '00000000-0000-0000-0000-0000000000b1';
  select handle into hb from public.profiles where id = '00000000-0000-0000-0000-0000000000b2';
  assert ha = 'ada-lovelace', 'first handle should be ada-lovelace, got ' || coalesce(ha, 'null');
  assert hb like 'ada-lovelace-____', 'colliding handle should get a suffix, got ' || coalesce(hb, 'null');
  assert (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = 'Ada Lovelace', 'name not copied';
  assert (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = 'https://example.com/a.png', 'avatar not copied';
  assert (select onboarded from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') = false, 'new profile should not be onboarded';
  assert (select email from public.profile_private where user_id = '00000000-0000-0000-0000-0000000000b1') = 'ada.lovelace@test.local', 'private email missing';
end $$;

-- user B1 (owner of the first profile)
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  set local role authenticated;

  update public.profiles set headline = 'Analyst' where id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;  assert n = 1, 'owner cannot update own profile';

  update public.profiles set headline = 'hacked' where id = '00000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count;  assert n = 0, 'user updated someone else''s profile';

  select count(*) into n from public.profiles;                 assert n >= 2, 'signed-in user should read all profiles';
  select count(*) into n from public.profile_private;          assert n = 1, 'user should only see own private row';

  update public.profile_private set phone = '9876543210' where user_id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;  assert n = 1, 'owner cannot update private row';

  begin
    update public.profiles set handle = 'AB' where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'bad handle accepted';
  exception when check_violation then null; end;

  begin
    update public.profiles set handle = (select handle from public.profiles where id = '00000000-0000-0000-0000-0000000000b2')
      where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'duplicate handle accepted';
  exception when unique_violation then null; end;

  insert into public.profile_projects (user_id, title) values ('00000000-0000-0000-0000-0000000000b1', 'My project');
  begin
    insert into public.profile_projects (user_id, title) values ('00000000-0000-0000-0000-0000000000b2', 'Forged');
    assert false, 'inserted a project for another user';
  exception when insufficient_privilege then null; end;

  insert into public.profile_experience (user_id, title, organization, start_date)
    values ('00000000-0000-0000-0000-0000000000b1', 'Intern', 'Acme', '2026-01-01');
  begin
    insert into public.profile_experience (user_id, title, organization, start_date, end_date)
      values ('00000000-0000-0000-0000-0000000000b1', 'Bad', 'Acme', '2026-02-01', '2026-01-01');
    assert false, 'end before start accepted';
  exception when check_violation then null; end;
  reset role;
end $$;

-- user B2 cannot see B1's private data or edit B1's rows
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.profile_private where user_id = '00000000-0000-0000-0000-0000000000b1';
  assert n = 0, 'user read another user''s private row';
  update public.profile_projects set title = 'hacked';
  get diagnostics n = row_count;  assert n = 0, 'user edited another user''s project';
  delete from public.profile_projects;
  get diagnostics n = row_count;  assert n = 0, 'user deleted another user''s project';
  reset role;
end $$;

-- anonymous visitors cannot read profile tables at all
do $$ declare n int; begin
  set local role anon;
  begin
    select count(*) into n from public.profiles;
    assert n = 0, 'anon read profiles';
  exception when insufficient_privilege then null; end;
  begin
    select count(*) into n from public.profile_private;
    assert n = 0, 'anon read profile_private';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

rollback;
select 'profiles-rls: all assertions passed' as result;
```

- [ ] **Step 3: Apply and verify**

1. Apply with MCP `apply_migration` (name `profiles`); rename the committed file to the assigned version.
2. Run `supabase/tests/profiles-rls.sql` via MCP `execute_sql` as one call. Expected: `profiles-rls: all assertions passed`. Adapt statement shapes if Supabase's role setup requires it, preserving every asserted behaviour.
3. Re-run `supabase/tests/security-hardening.sql` → still passes. Run `npx vitest run tests/rls` → pass.
4. MCP `get_advisors` (security): no new ERROR-level findings; note any WARN in the report.
5. Regenerate `lib/supabase/database.types.ts`; `npx tsc --noEmit` passes.

- [ ] **Step 4: Commit**

```bash
git add supabase lib/supabase/database.types.ts
git commit -m "feat(db): profiles, new-user trigger and avatar storage with RLS"
```

---

### Task 3: Pure libraries (safe redirect, cookies, profile schemas, handle, crop)

**Files:**
- Create: `lib/auth/safe-next.ts`, `lib/auth/cookies.ts`, `lib/auth/config.ts`, `lib/auth/types.ts`, `lib/profile/options.ts`, `lib/profile/schema.ts`, `lib/profile/handle.ts`, `lib/profile/crop.ts`
- Test: `tests/auth/safe-next.test.ts`, `tests/auth/cookies.test.ts`, `tests/profile/schema.test.ts`, `tests/profile/handle.test.ts`, `tests/profile/crop.test.ts`

**Interfaces:**
- Produces:
  - `safeNext(raw: string | null | undefined, fallback?: string): string`
  - `hasSupabaseSessionCookie(names: string[]): boolean`
  - `EMAIL_LOGIN_ENABLED: boolean`
  - `AuthUser { id: string; email: string }`, `AuthProfile { handle: string; fullName: string; avatarUrl: string | null; onboarded: boolean }`, `AuthState { user: AuthUser | null; profile: AuthProfile | null }`
  - `BRANCHES`, `YEARS` (readonly tuples), `SOCIAL_KEYS`
  - `HANDLE_RE: RegExp`; zod schemas `OnboardingSchema`, `ProfileDetailsSchema`, `PrivateSchema`, `ProjectSchema`, `ExperienceSchema`; `fieldErrors(error: z.ZodError): Record<string, string>`
  - `normalizeHandle(input: string): string`, `suggestHandle(name: string, email: string): string`
  - `squareCropRect(width: number, height: number): { sx: number; sy: number; size: number }`, `cropToSquareWebp(file: File, outSize?: number): Promise<Blob>`

- [ ] **Step 1: Write the failing tests**

`tests/auth/safe-next.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";

describe("safeNext", () => {
  it("keeps same-origin relative paths with query and hash", () => {
    expect(safeNext("/me")).toBe("/me");
    expect(safeNext("/events/x?y=1#z")).toBe("/events/x?y=1#z");
  });
  it("falls back for missing or empty values", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null, "/me")).toBe("/me");
    expect(safeNext("", "/me")).toBe("/me");
  });
  it("rejects absolute, protocol-relative and backslash tricks", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "\\\\evil.com", "javascript:alert(1)", "evil.com"])
      expect(safeNext(bad, "/safe")).toBe("/safe");
  });
  it("rejects control characters", () => {
    expect(safeNext("/me\n/evil", "/safe")).toBe("/safe");
  });
  it("never redirects back into the auth pages", () => {
    expect(safeNext("/login?next=/me", "/safe")).toBe("/safe");
    expect(safeNext("/auth/callback", "/safe")).toBe("/safe");
  });
});
```

`tests/auth/cookies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasSupabaseSessionCookie } from "@/lib/auth/cookies";

describe("hasSupabaseSessionCookie", () => {
  it("detects a plain and a chunked auth-token cookie", () => {
    expect(hasSupabaseSessionCookie(["a", "sb-abc-auth-token"])).toBe(true);
    expect(hasSupabaseSessionCookie(["sb-abc-auth-token.0", "sb-abc-auth-token.1"])).toBe(true);
  });
  it("ignores the PKCE code verifier and unrelated cookies", () => {
    expect(hasSupabaseSessionCookie(["sb-abc-auth-token-code-verifier"])).toBe(false);
    expect(hasSupabaseSessionCookie(["theme", "stairway-announce-dismissed"])).toBe(false);
    expect(hasSupabaseSessionCookie([])).toBe(false);
  });
});
```

`tests/profile/handle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HANDLE_RE, normalizeHandle, suggestHandle } from "@/lib/profile/handle";

describe("normalizeHandle", () => {
  it("lowercases and slugs", () => {
    expect(normalizeHandle("Ada Lovelace!")).toBe("ada-lovelace");
    expect(normalizeHandle("  --Foo__Bar--  ")).toBe("foo__bar");
  });
  it("caps at 30 characters", () => {
    expect(normalizeHandle("a".repeat(50))).toHaveLength(30);
  });
});

describe("suggestHandle", () => {
  it("prefers the name, falls back to the email local part, then 'user'", () => {
    expect(suggestHandle("Ada Lovelace", "x@y.z")).toBe("ada-lovelace");
    expect(suggestHandle("", "grace.hopper@navy.mil")).toBe("grace-hopper");
    expect(suggestHandle("!!", "")).toBe("user");
  });
  it("always produces a valid handle", () => {
    for (const [n, e] of [["Ada", "a@b.c"], ["", "q@w.e"], ["Zoë Ünal", ""], ["x", "y@z"]])
      expect(HANDLE_RE.test(suggestHandle(n, e))).toBe(true);
  });
});
```

`tests/profile/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ExperienceSchema, OnboardingSchema, PrivateSchema, ProfileDetailsSchema, ProjectSchema, fieldErrors } from "@/lib/profile/schema";

const ok = { fullName: "Ada Lovelace", handle: "ada-l", college: "CEK", branch: "Computer Science", year: "3rd year" };

describe("OnboardingSchema", () => {
  it("accepts valid input and normalises the handle", () => {
    expect(OnboardingSchema.parse({ ...ok, handle: "Ada-L" }).handle).toBe("ada-l");
  });
  it("rejects bad handle, branch and short name with friendly messages", () => {
    const r = OnboardingSchema.safeParse({ ...ok, handle: "A", branch: "Nope", fullName: "A" });
    expect(r.success).toBe(false);
    const e = fieldErrors(r.error!);
    expect(e.handle).toMatch(/3–30/);
    expect(e.branch).toBeTruthy();
    expect(e.fullName).toBeTruthy();
  });
});

describe("ProfileDetailsSchema", () => {
  const base = { ...ok, headline: "", bio: "", skills: [], links: { linkedin: "", github: "", x: "", instagram: "", website: "" } };
  it("accepts empty optional fields", () => {
    expect(ProfileDetailsSchema.safeParse(base).success).toBe(true);
  });
  it("rejects non-http links and too many skills", () => {
    expect(ProfileDetailsSchema.safeParse({ ...base, links: { ...base.links, github: "javascript:alert(1)" } }).success).toBe(false);
    expect(ProfileDetailsSchema.safeParse({ ...base, links: { ...base.links, github: "https://github.com/ada" } }).success).toBe(true);
    expect(ProfileDetailsSchema.safeParse({ ...base, skills: Array.from({ length: 31 }, (_, i) => `s${i}`) }).success).toBe(false);
  });
});

describe("PrivateSchema", () => {
  it("allows empty and valid values, rejects bad phone / IEEE id", () => {
    expect(PrivateSchema.safeParse({ phone: "", ieeeMemberId: "" }).success).toBe(true);
    expect(PrivateSchema.safeParse({ phone: "+91 98765 43210", ieeeMemberId: "12345678" }).success).toBe(true);
    expect(PrivateSchema.safeParse({ phone: "12345", ieeeMemberId: "" }).success).toBe(false);
    expect(PrivateSchema.safeParse({ phone: "", ieeeMemberId: "abc" }).success).toBe(false);
  });
});

describe("ProjectSchema / ExperienceSchema", () => {
  it("requires a project title and an http url when given", () => {
    expect(ProjectSchema.safeParse({ title: "A", description: "", url: "" }).success).toBe(false);
    expect(ProjectSchema.safeParse({ title: "Bus tracker", description: "", url: "ftp://x" }).success).toBe(false);
    expect(ProjectSchema.safeParse({ title: "Bus tracker", description: "", url: "https://x.dev" }).success).toBe(true);
  });
  it("rejects an experience that ends before it starts", () => {
    const base = { title: "Intern", organization: "Acme", description: "" };
    expect(ExperienceSchema.safeParse({ ...base, startDate: "2026-02-01", endDate: "2026-01-01" }).success).toBe(false);
    expect(ExperienceSchema.safeParse({ ...base, startDate: "2026-01-01", endDate: "" }).success).toBe(true);
  });
});
```

`tests/profile/crop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { squareCropRect } from "@/lib/profile/crop";

describe("squareCropRect", () => {
  it("centre-crops landscape and portrait images", () => {
    expect(squareCropRect(1000, 600)).toEqual({ sx: 200, sy: 0, size: 600 });
    expect(squareCropRect(600, 1000)).toEqual({ sx: 0, sy: 200, size: 600 });
    expect(squareCropRect(500, 500)).toEqual({ sx: 0, sy: 0, size: 500 });
  });
  it("floors odd offsets", () => {
    expect(squareCropRect(1001, 600)).toEqual({ sx: 200, sy: 0, size: 600 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/auth tests/profile`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`lib/auth/safe-next.ts`:

```ts
/** Accepts only same-origin relative paths; everything else becomes `fallback`. */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, "http://localhost");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://localhost") return fallback;
  if (url.pathname === "/login" || url.pathname.startsWith("/auth/")) return fallback;
  return url.pathname + url.search + url.hash;
}
```

`lib/auth/cookies.ts`:

```ts
/** True when any cookie looks like a Supabase auth session (plain or chunked). */
export function hasSupabaseSessionCookie(names: string[]): boolean {
  return names.some((n) => n.startsWith("sb-") && /-auth-token(\.\d+)?$/.test(n));
}
```

`lib/auth/config.ts`:

```ts
/**
 * The email-code login form is built but hidden: Supabase's built-in email only
 * delivers to the project's own team members. Flip to true once a sending domain
 * and custom SMTP (e.g. Resend) are configured in Supabase → Authentication.
 */
export const EMAIL_LOGIN_ENABLED = false;
```

`lib/auth/types.ts`:

```ts
export interface AuthUser {
  id: string;
  email: string;
}
export interface AuthProfile {
  handle: string;
  fullName: string;
  avatarUrl: string | null;
  onboarded: boolean;
}
export interface AuthState {
  user: AuthUser | null;
  profile: AuthProfile | null;
}
```

`lib/profile/options.ts`:

```ts
export const BRANCHES = [
  "Computer Science", "Electronics & Communication", "Electrical & Electronics",
  "Information Technology", "Mechanical", "Civil", "Other",
] as const;
export const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "Postgraduate", "Faculty / Alumni"] as const;
export const SOCIAL_KEYS = ["linkedin", "github", "x", "instagram", "website"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export const SOCIAL_LABELS: Record<SocialKey, string> = {
  linkedin: "LinkedIn", github: "GitHub", x: "X", instagram: "Instagram", website: "Website",
};
```

`lib/profile/handle.ts`:

```ts
export const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function normalizeHandle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 30)
    .replace(/[-_]+$/, "");
}

/** A valid starting handle from the user's name, else the email's local part, else "user". */
export function suggestHandle(name: string, email: string): string {
  const base = normalizeHandle(name) || normalizeHandle(email.split("@")[0] ?? "");
  return HANDLE_RE.test(base) ? base : "user";
}
```

`lib/profile/schema.ts`:

```ts
import { z } from "zod";
import { BRANCHES, YEARS } from "./options";
import { HANDLE_RE } from "./handle";

const httpUrl = z.url({ protocol: /^https?$/, message: "Enter a full link starting with https://" });
const optionalUrl = z.union([z.literal(""), httpUrl]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const fullName = z.string().trim().min(2, "Tell us your full name.").max(80);
const college = z.string().trim().min(2, "Which college are you from?").max(120);
const branch = z.enum(BRANCHES, { message: "Pick your branch." });
const year = z.enum(YEARS, { message: "Pick your year." });

export const OnboardingSchema = z.object({
  fullName,
  handle: z.string().trim().toLowerCase().regex(HANDLE_RE, "3–30 characters: letters, numbers, - or _ (start with a letter or number)."),
  college,
  branch,
  year,
});

export const ProfileDetailsSchema = z.object({
  fullName,
  college,
  branch,
  year,
  headline: z.string().trim().max(120, "Keep the headline under 120 characters."),
  bio: z.string().trim().max(1500, "Keep the bio under 1500 characters."),
  skills: z.array(z.string().trim().min(1).max(30)).max(30, "Up to 30 skills."),
  links: z.object({
    linkedin: optionalUrl, github: optionalUrl, x: optionalUrl, instagram: optionalUrl, website: optionalUrl,
  }),
});

export const PrivateSchema = z.object({
  phone: z.string().trim().regex(/^$|^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/, "Use a 10-digit Indian mobile number."),
  ieeeMemberId: z.string().trim().regex(/^$|^\d{8,9}$/, "IEEE membership IDs are 8–9 digits."),
});

export const ProjectSchema = z.object({
  title: z.string().trim().min(2, "Give the project a title.").max(100),
  description: z.string().trim().max(500, "Keep it under 500 characters."),
  url: optionalUrl,
});

export const ExperienceSchema = z
  .object({
    title: z.string().trim().min(2, "What was your role?").max(100),
    organization: z.string().trim().min(2, "Where was it?").max(100),
    startDate: isoDate,
    endDate: z.union([z.literal(""), isoDate]),
    description: z.string().trim().max(500, "Keep it under 500 characters."),
  })
  .refine((d) => d.endDate === "" || d.endDate >= d.startDate, {
    message: "End date must be after the start date.",
    path: ["endDate"],
  });

/** First message per field, keyed by dotted path (e.g. "links.github"). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
```

`lib/profile/crop.ts`:

```ts
/** Centre square crop rectangle for a width × height image. */
export function squareCropRect(width: number, height: number) {
  const size = Math.min(width, height);
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size };
}

/** Browser only: centre-crops an image file to a square WebP blob. */
export async function cropToSquareWebp(file: File, outSize = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, size } = squareCropRect(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = outSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, outSize, outSize);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))), "image/webp", 0.9),
  );
}
```

- [ ] **Step 4: Run tests, then full gate**

Run: `npx vitest run tests/auth tests/profile` → PASS. If a zod 4 option name differs (e.g. `message` vs `error` on `z.enum`/`z.url`), adjust the call while keeping the same behaviour and messages.
Then `npx vitest run && npx tsc --noEmit && npx eslint .` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/auth lib/profile tests/auth tests/profile
git commit -m "feat: safe redirects, profile schemas, handle and avatar crop helpers"
```

---

### Task 4: Session plumbing, login and account button

**Files:**
- Create: `lib/supabase/middleware.ts`, `middleware.ts`, `lib/auth/session.ts`, `lib/auth/redirect.ts`, `components/providers/AuthProvider.tsx`, `components/auth/LoginPanel.tsx`, `components/auth/EmailCodeForm.tsx`, `components/layout/AccountButton.tsx`, `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/auth/continue/route.ts`, `app/auth/signout/route.ts`, `tests/auth/middleware.test.ts`
- Modify: `app/layout.tsx`, `components/layout/TopBar.tsx`, `components/ui/BrandIcons.tsx` (add `GoogleG`), `app/robots.ts`

**Interfaces:**
- Consumes: `safeNext`, `hasSupabaseSessionCookie`, `EMAIL_LOGIN_ENABLED`, `AuthState` (Task 3); `createClient` from `lib/supabase/server.ts` and `lib/supabase/browser.ts`.
- Produces: `updateSession(request: NextRequest): Promise<NextResponse>`; `getAuthState(): Promise<AuthState>` (React-cached); `requireSignedIn(next: string): Promise<{ user: AuthUser; profile: AuthProfile | null }>`; `requireOnboarded(next: string): Promise<{ user: AuthUser; profile: AuthProfile }>`; `postSignInPath(supabase, next): Promise<string>`; `<AuthProvider value={AuthState}>`, `useAuth(): AuthState`; routes `/login`, `/auth/callback`, `/auth/continue`, `/auth/signout` (POST).

- [ ] **Step 1: Write the failing middleware test**

`tests/auth/middleware.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

describe("updateSession", () => {
  it("passes anonymous requests straight through without touching Supabase", async () => {
    const res = await updateSession(new NextRequest("http://localhost/events/x"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
```

Run `npx vitest run tests/auth/middleware.test.ts` → FAIL (module missing).

- [ ] **Step 2: Middleware**

`lib/supabase/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";
import { hasSupabaseSessionCookie } from "@/lib/auth/cookies";

/**
 * Standard Supabase session refresh. Runs only for requests that already carry an
 * auth cookie, so anonymous visitors pay nothing. Refreshed tokens are written to
 * both the request (so server components see them) and the response.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  if (!hasSupabaseSessionCookie(request.cookies.getAll().map((c) => c.name))) {
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
```

`middleware.ts` (project root):

```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Edge middleware (the Node-runtime `proxy.ts` is not supported by OpenNext on Cloudflare).
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
```

Run `npx vitest run tests/auth/middleware.test.ts` → PASS.

- [ ] **Step 3: Server session helpers**

`lib/auth/session.ts`:

```ts
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseSessionCookie } from "./cookies";
import type { AuthProfile, AuthState, AuthUser } from "./types";

const ANON: AuthState = { user: null, profile: null };

/** Who is signed in for this request (verified locally from the JWT; one small profile query). */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const store = await cookies();
  if (!hasSupabaseSessionCookie(store.getAll().map((c) => c.name))) return ANON;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return ANON;
  const { data: row } = await supabase
    .from("profiles")
    .select("handle, full_name, avatar_url, onboarded")
    .eq("id", claims.sub)
    .maybeSingle();
  const user: AuthUser = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
  const profile: AuthProfile | null = row
    ? { handle: row.handle, fullName: row.full_name, avatarUrl: row.avatar_url, onboarded: row.onboarded }
    : null;
  return { user, profile };
});

/** Page guard: redirects visitors without a session to /login (returning to `next`). */
export async function requireSignedIn(next: string) {
  const { user, profile } = await getAuthState();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { user, profile };
}

/** Page guard: signed in AND finished onboarding. */
export async function requireOnboarded(next: string) {
  const { user, profile } = await requireSignedIn(next);
  if (!profile?.onboarded) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return { user, profile };
}
```

`lib/auth/redirect.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Where to send someone who has just signed in: onboarding first, otherwise `next`. */
export async function postSignInPath(supabase: SupabaseClient<Database>, next: string): Promise<string> {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return `/login?error=auth`;
  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", sub).maybeSingle();
  return profile?.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`;
}
```

- [ ] **Step 4: Auth routes**

`app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { postSignInPath } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/me");
  if (!code) return NextResponse.redirect(`${origin}/login?error=auth`);
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth`);
  return NextResponse.redirect(`${origin}${await postSignInPath(supabase, next)}`);
}
```

`app/auth/continue/route.ts` (used after the email-code flow, where the session is already set in the browser):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { postSignInPath } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"), "/me");
  const supabase = await createClient();
  return NextResponse.redirect(`${origin}${await postSignInPath(supabase, next)}`);
}
```

`app/auth/signout/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
```

- [ ] **Step 5: Client auth context**

`components/providers/AuthProvider.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { AuthState } from "@/lib/auth/types";

const AuthContext = createContext<AuthState>({ user: null, profile: null });

/** Shares the server-verified auth state and refreshes the page when the signed-in user changes. */
export function AuthProvider({ value, children }: { value: AuthState; children: React.ReactNode }) {
  const router = useRouter();
  const serverUserId = value.user?.id ?? null;

  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      if ((session?.user.id ?? null) !== serverUserId) router.refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [serverUserId, router]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
```

Wire it into `app/layout.tsx`: add `import { AuthProvider } from "@/components/providers/AuthProvider";` and `import { getAuthState } from "@/lib/auth/session";`; in `RootLayout` add `const auth = await getAuthState();` after `const data = await getSiteData();` (run both with `Promise.all`), and wrap the existing tree: `<AuthProvider value={auth}><SiteDataProvider …>…</SiteDataProvider></AuthProvider>`.

- [ ] **Step 6: Login page and panels**

Add to `components/ui/BrandIcons.tsx` a `GoogleG` component using Google's standard four-colour "G" mark (official asset; keep proportions and colours):

```tsx
export const GoogleG = ({ size = 20, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...p}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);
```

`components/auth/LoginPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { GoogleG } from "@/components/ui/BrandIcons";
import { EMAIL_LOGIN_ENABLED } from "@/lib/auth/config";
import { EmailCodeForm } from "./EmailCodeForm";

export function LoginPanel({ next, error }: { next: string; error: string | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error);

  async function google() {
    setBusy(true);
    setMessage(null);
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setMessage("Couldn't start Google sign-in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="box mx-auto max-w-md p-6 shadow-[6px_6px_0_0_var(--ink)] md:p-8">
      <button type="button" onClick={google} disabled={busy} className="btn btn-primary btn-lg w-full">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <GoogleG size={20} />}
        Continue with Google
      </button>
      {EMAIL_LOGIN_ENABLED && (
        <>
          <p className="mono my-5 text-center font-bold text-ink-3">or</p>
          <EmailCodeForm next={next} />
        </>
      )}
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm font-semibold text-red-ink">
        {message}
      </p>
      <p className="mt-2 text-xs text-ink-3">
        By signing in you agree to the <a className="underline" href="/code-of-conduct">Code of Conduct</a> and{" "}
        <a className="underline" href="/privacy">Privacy Policy</a>.
      </p>
    </div>
  );
}
```

`components/auth/EmailCodeForm.tsx` (hidden while `EMAIL_LOGIN_ENABLED` is false):

```tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Field, inputCls } from "@/components/ui/Field";

export function EmailCodeForm({ next }: { next: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("That email doesn't look right.");
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) return setError("We couldn't send a code. Please try again in a minute.");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (err) {
      setBusy(false);
      return setError("That code didn't work. Check it and try again.");
    }
    window.location.assign(`/auth/continue?next=${encodeURIComponent(next)}`);
  }

  return step === "email" ? (
    <form onSubmit={send} noValidate className="grid gap-4">
      <Field id="login-email" label="Email" error={error ?? undefined}>
        <input id="login-email" type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <button type="submit" className="btn btn-ghost w-full" disabled={busy}>
        {busy && <Loader2 size={16} className="animate-spin" />} Email me a code
      </button>
    </form>
  ) : (
    <form onSubmit={verify} noValidate className="grid gap-4">
      <Field id="login-code" label={`6-digit code sent to ${email}`} error={error ?? undefined}>
        <input id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={inputCls} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy && <Loader2 size={16} className="animate-spin" />} Sign in
      </button>
    </form>
  );
}
```

Create the shared field component `components/ui/Field.tsx` (used by every form in this phase):

```tsx
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputCls =
  "h-12 w-full border-2 border-ink bg-paper px-4 outline-none placeholder:text-ink-4 focus:bg-paper-2 focus:shadow-[3px_3px_0_0_var(--ink)] aria-[invalid=true]:bg-red/15";
export const textareaCls = cn(inputCls, "h-auto min-h-28 py-3");

export function Field({
  id, label, error, hint, required = false, children, className,
}: {
  id: string; label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mono mb-2 block font-bold">
        {label}
        {required && <span className="ml-0.5 text-red-ink" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-ink">
          <AlertCircle size={14} strokeWidth={2} aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
```

`app/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/ui/PageHero";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { getAuthState } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-next";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/me");
  const { user, profile } = await getAuthState();
  if (user) redirect(profile?.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`);
  const error = sp.error === "auth" ? "Sign-in didn't complete. Please try again." : null;
  return (
    <>
      <PageHero eyebrow="Sign in" title="Join the [[climb.]]" lead="Sign in to register for sessions, build your profile and see who else is climbing." />
      <div className="wrap pb-[var(--section-y)]">
        <LoginPanel next={next} error={error} />
      </div>
    </>
  );
}
```

`components/layout/AccountButton.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";

export function AccountButton() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  if (!user) {
    const next = pathname.startsWith("/login") || pathname.startsWith("/auth") ? "/" : pathname;
    return (
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-sm btn-primary !px-3">
        Sign in
      </Link>
    );
  }
  const name = profile?.fullName || user.email;
  return (
    <Link
      href={profile?.onboarded ? "/me" : "/onboarding"}
      className="flex h-11 items-center gap-2 border-2 border-ink bg-paper-2 pl-1 pr-3 shadow-[3px_3px_0_0_var(--ink)] hover:bg-yellow"
      aria-label={`${name} — open your dashboard`}
    >
      <Avatar name={name} photo={profile?.avatarUrl ?? undefined} size={34} />
      <span className="hidden max-w-[10ch] truncate font-mono text-xs font-bold uppercase sm:inline">{name.split(" ")[0]}</span>
    </Link>
  );
}
```

In `components/layout/TopBar.tsx` wrap the right side: replace the `{next && (<Link …>)}` block with `<div className="flex items-center gap-2">{next && (<Link …existing…>)}<AccountButton /></div>` (keep the existing next-step link unchanged inside) and import `AccountButton`.

`app/robots.ts`: add `disallow: ["/me", "/onboarding", "/auth", "/login", "/u/"]` to the `rules` object.

- [ ] **Step 7: Verify**

1. `npx vitest run && npx tsc --noEmit && npx eslint .` → clean (run `npx next typegen` first if route types are stale).
2. `npm run dev` (port 3000) and curl: `/login` → 200 containing "Continue with Google"; `/auth/callback` → 307 to `/login?error=auth`; `GET /auth/signout` → 405; `/login?next=https://evil.com` renders (the `next` is sanitised to `/me`: confirm the page does not echo the evil URL); `/` still 200. Stop the server.
3. Build for Cloudflare and confirm the middleware bundles: `npx opennextjs-cloudflare build` succeeds and its log mentions middleware; then `npm run preview` and repeat the curl checks on port 8787 (`/` → 200, `/login` → 200). If OpenNext cannot bundle `middleware.ts`, STOP and report BLOCKED with the exact error (fallback decision belongs to the controller).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): Google sign-in, session middleware and account button"
```

---

### Task 5: Onboarding with avatar upload

**Files:**
- Create: `components/profile/AvatarUploader.tsx`, `components/profile/OnboardingForm.tsx`, `app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `OnboardingSchema`, `fieldErrors`, `BRANCHES`, `YEARS`, `suggestHandle`, `cropToSquareWebp`; `Field`, `inputCls`; `requireSignedIn`; `createClient` (browser).
- Produces: `<AvatarUploader userId currentUrl name onUploaded(url: string): void />`; `<OnboardingForm userId email initial next />`; route `/onboarding`.

- [ ] **Step 1: `AvatarUploader`**

`components/profile/AvatarUploader.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { cropToSquareWebp } from "@/lib/profile/crop";
import { Avatar } from "@/components/ui/Avatar";

const MAX_BYTES = 8 * 1024 * 1024;

/** Picks an image, centre-crops it to a 512px WebP and uploads it to the user's own avatar folder. */
export function AvatarUploader({
  userId, currentUrl, name, onUploaded,
}: { userId: string; currentUrl: string | null; name: string; onUploaded: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (file.size > MAX_BYTES) return setError("That image is over 8 MB — pick a smaller one.");
    setBusy(true);
    setError(null);
    try {
      const blob = await cropToSquareWebp(file);
      const supabase = createClient();
      const path = `${userId}/avatar-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/webp",
        cacheControl: "31536000",
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // best effort: remove the previous upload from our own bucket
      const old = currentUrl?.split("/avatars/")[1];
      if (old && old.startsWith(`${userId}/`)) void supabase.storage.from("avatars").remove([old]);
      setPreview(data.publicUrl);
      onUploaded(data.publicUrl);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || "You"} photo={preview ?? undefined} size={88} />
      <div>
        <input ref={input} type="file" accept="image/*" className="sr-only" id="avatar-input" onChange={pick} />
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} strokeWidth={2} />}
          {preview ? "Change photo" : "Add photo"}
        </button>
        <p role="status" aria-live="polite" className="mt-2 text-xs font-semibold text-red-ink">{error}</p>
        <p className="mt-1 text-xs text-ink-3">Square crops look best. Max 8 MB.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `OnboardingForm`**

`components/profile/OnboardingForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { OnboardingSchema, fieldErrors } from "@/lib/profile/schema";
import { BRANCHES, YEARS } from "@/lib/profile/options";
import { Field, inputCls } from "@/components/ui/Field";
import { AvatarUploader } from "./AvatarUploader";

interface Initial { fullName: string; handle: string; college: string; branch: string; year: string; avatarUrl: string | null }

export function OnboardingForm({ userId, initial, next }: { userId: string; initial: Initial; next: string }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof Initial, v: string | null) => setD((x) => ({ ...x, [k]: v }));
  const aria = (k: string) => ({ "aria-required": true, "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-err` : undefined });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = OnboardingSchema.safeParse(d);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      document.getElementById(Object.keys(errs)[0])?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    setFormError(null);
    const v = parsed.data;
    const { error } = await createClient()
      .from("profiles")
      .update({ full_name: v.fullName, handle: v.handle, college: v.college, branch: v.branch, year: v.year, avatar_url: d.avatarUrl, onboarded: true })
      .eq("id", userId);
    setBusy(false);
    if (error) {
      if (error.code === "23505") {
        setErrors({ handle: "That handle is taken — try another." });
        document.getElementById("handle")?.focus();
      } else setFormError("We couldn't save your profile. Please try again.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="box mx-auto grid max-w-2xl gap-6 p-6 shadow-[6px_6px_0_0_var(--ink)] md:grid-cols-2 md:p-10">
      <div className="md:col-span-2">
        <AvatarUploader userId={userId} currentUrl={d.avatarUrl} name={d.fullName} onUploaded={(u) => set("avatarUrl", u)} />
      </div>
      <p className="text-sm text-ink-3 md:col-span-2">Fields marked <span className="text-red-ink">*</span> are required. You can add more details later from your dashboard.</p>
      <Field id="fullName" label="Full name" required error={errors.fullName} className="md:col-span-2">
        <input id="fullName" className={inputCls} autoComplete="name" value={d.fullName} onChange={(e) => set("fullName", e.target.value)} {...aria("fullName")} />
      </Field>
      <Field id="handle" label="Handle" required error={errors.handle} hint="Your profile lives at /u/your-handle." className="md:col-span-2">
        <input id="handle" className={inputCls} autoComplete="username" value={d.handle} onChange={(e) => set("handle", e.target.value.toLowerCase())} {...aria("handle")} />
      </Field>
      <Field id="college" label="College" required error={errors.college} className="md:col-span-2">
        <input id="college" className={inputCls} autoComplete="organization" placeholder="College of Engineering Kidangoor" value={d.college} onChange={(e) => set("college", e.target.value)} {...aria("college")} />
      </Field>
      <Field id="branch" label="Branch" required error={errors.branch}>
        <select id="branch" className={inputCls} value={d.branch} onChange={(e) => set("branch", e.target.value)} {...aria("branch")}>
          <option value="">Select branch</option>
          {BRANCHES.map((b) => <option key={b}>{b}</option>)}
        </select>
      </Field>
      <Field id="year" label="Year" required error={errors.year}>
        <select id="year" className={inputCls} value={d.year} onChange={(e) => set("year", e.target.value)} {...aria("year")}>
          <option value="">Select year</option>
          {YEARS.map((y) => <option key={y}>{y}</option>)}
        </select>
      </Field>
      <div className="md:col-span-2">
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} strokeWidth={2} />} Finish setup
        </button>
        <p role="alert" className="mt-3 text-sm font-semibold text-red-ink">{formError}</p>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: `/onboarding` page**

`app/onboarding/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/ui/PageHero";
import { OnboardingForm } from "@/components/profile/OnboardingForm";
import { requireSignedIn } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import { BRANCHES, YEARS } from "@/lib/profile/options";

export const metadata: Metadata = { title: "Finish your profile", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/me");
  const { user, profile } = await requireSignedIn(`/onboarding?next=${encodeURIComponent(next)}`);
  if (profile?.onboarded) redirect(next);
  const db = await createClient();
  const { data: row } = await db
    .from("profiles")
    .select("handle, full_name, college, branch, year, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  return (
    <>
      <PageHero eyebrow="Welcome" title="Set up your [[profile.]]" lead="A minute now means one-tap registration later." />
      <div className="wrap pb-[var(--section-y)]">
        <OnboardingForm
          userId={user.id}
          next={next}
          initial={{
            fullName: row?.full_name ?? "",
            handle: row?.handle ?? "",
            college: row?.college || "College of Engineering Kidangoor",
            branch: (BRANCHES as readonly string[]).includes(row?.branch ?? "") ? row!.branch : "",
            year: (YEARS as readonly string[]).includes(row?.year ?? "") ? row!.year : "",
            avatarUrl: row?.avatar_url ?? null,
          }}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verify**

1. `npx vitest run && npx tsc --noEmit && npx eslint .` → clean.
2. `npm run dev`; curl `/onboarding` → 307 redirect to `/login?next=%2Fonboarding%3Fnext%3D%252Fme` (signed out). Stop the server.
3. (Real sign-in is verified in Task 9.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(profile): onboarding form with avatar upload"
```

---

### Task 6: Participant dashboard shell, overview and settings

**Files:**
- Create: `components/dashboard/DashboardShell.tsx`, `app/me/layout.tsx`, `app/me/page.tsx`, `app/me/settings/page.tsx`, `components/profile/SettingsForm.tsx`

**Interfaces:**
- Consumes: `requireOnboarded`, `useAuth`, `PrivateSchema`, `fieldErrors`, `Field`, `inputCls`, `createClient`.
- Produces: `<DashboardShell variant="me">` (client; sidebar with **back button at the top**); routes `/me`, `/me/settings` (and `/me/profile` added in Task 7). The sidebar nav config lives inside `DashboardShell.tsx` so no component references cross the server/client boundary.

- [ ] **Step 1: `DashboardShell`**

`components/dashboard/DashboardShell.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, LayoutDashboard, LogOut, Settings, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem { href: string; label: string; Icon: LucideIcon; exact?: boolean }

const NAV: Record<"me", { title: string; items: NavItem[] }> = {
  me: {
    title: "Your dashboard",
    items: [
      { href: "/me", label: "Overview", Icon: LayoutDashboard, exact: true },
      { href: "/me/profile", label: "Profile", Icon: UserRound },
      { href: "/me/settings", label: "Settings", Icon: Settings },
    ],
  },
};

/** Sidebar layout for dashboards. The back button at the top closes the dashboard. */
export function DashboardShell({ variant, children }: { variant: keyof typeof NAV; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { title, items } = NAV[variant];

  function close() {
    const sameOrigin = document.referrer.startsWith(window.location.origin);
    if (sameOrigin && !document.referrer.includes("/me")) router.back();
    else router.push("/");
  }

  return (
    <div className="wrap grid gap-6 py-8 md:py-12 lg:grid-cols-[240px_1fr] lg:gap-10">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <button type="button" onClick={close} className="btn btn-sm btn-ghost mb-4 w-full justify-start lg:mb-6">
          <ArrowLeft size={16} strokeWidth={2} aria-hidden /> Back to site
        </button>
        <p className="mono mb-3 hidden font-bold text-ink-3 lg:block">{title}</p>
        <nav aria-label={title} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
          {items.map(({ href, label, Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 border-2 border-ink px-4 font-mono text-xs font-bold uppercase tracking-[0.12em] transition-colors",
                  active ? "bg-yellow shadow-[3px_3px_0_0_var(--ink)]" : "bg-paper hover:bg-paper-3",
                )}
              >
                <Icon size={16} strokeWidth={2} aria-hidden /> {label}
              </Link>
            );
          })}
          <form action="/auth/signout" method="post" className="lg:mt-4">
            <button type="submit" className="flex h-12 shrink-0 items-center gap-2 border-2 border-ink bg-paper px-4 font-mono text-xs font-bold uppercase tracking-[0.12em] hover:bg-red lg:w-full">
              <LogOut size={16} strokeWidth={2} aria-hidden /> Sign out
            </button>
          </form>
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Layout, overview, settings**

`app/me/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requireOnboarded } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your dashboard", robots: { index: false } };

export default async function MeLayout({ children }: LayoutProps<"/me">) {
  await requireOnboarded("/me");
  return <DashboardShell variant="me">{children}</DashboardShell>;
}
```

`app/me/page.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/Avatar";

export default async function MePage() {
  const { user, profile } = await requireOnboarded("/me");
  const db = await createClient();
  const [{ data: p }, { count: projects }, { count: experience }] = await Promise.all([
    db.from("profiles").select("headline, bio, skills, links, avatar_url").eq("id", user.id).single(),
    db.from("profile_projects").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    db.from("profile_experience").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const links = Object.values((p?.links ?? {}) as Record<string, string>).filter(Boolean);
  const steps = [
    { label: "Add a profile photo", done: !!p?.avatar_url },
    { label: "Write a headline", done: !!p?.headline },
    { label: "Tell people about yourself", done: !!p?.bio },
    { label: "List your skills", done: (p?.skills?.length ?? 0) > 0 },
    { label: "Add a link (LinkedIn, GitHub…)", done: links.length > 0 },
    { label: "Add a project", done: (projects ?? 0) > 0 },
    { label: "Add experience", done: (experience ?? 0) > 0 },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="grid gap-8">
      <header className="flex items-center gap-5">
        <Avatar name={profile.fullName} photo={profile.avatarUrl ?? undefined} size={72} />
        <div>
          <p className="mono font-bold text-ink-3">Welcome back</p>
          <h1 className="text-3xl font-semibold md:text-4xl">{profile.fullName}</h1>
        </div>
      </header>
      <section className="box shadow-hard" aria-labelledby="complete-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-paper-2 px-5 py-3">
          <h2 id="complete-title" className="mono font-bold">Profile completeness</h2>
          <span className="tag tag-ink">{done} / {steps.length}</span>
        </div>
        <ul className="grid gap-2 p-5 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3">
              {s.done ? <Check size={18} strokeWidth={2.5} className="text-green-ink" aria-hidden /> : <Circle size={18} strokeWidth={2} className="text-ink-4" aria-hidden />}
              <span className={s.done ? "text-ink-3 line-through" : ""}>{s.label}</span>
              <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3 border-t-2 border-ink p-5">
          <Link href="/me/profile" className="btn btn-primary">Edit profile <ArrowRight size={16} strokeWidth={2} /></Link>
          <Link href={`/u/${profile.handle}`} className="btn btn-ghost">View public profile</Link>
        </div>
      </section>
    </div>
  );
}
```

`components/profile/SettingsForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { PrivateSchema, fieldErrors } from "@/lib/profile/schema";
import { Field, inputCls } from "@/components/ui/Field";

export function SettingsForm({ userId, email, initial }: { userId: string; email: string; initial: { phone: string; ieeeMemberId: string } }) {
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = PrivateSchema.safeParse(d);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    setStatus(null);
    const { error } = await createClient()
      .from("profile_private")
      .update({ phone: parsed.data.phone, ieee_member_id: parsed.data.ieeeMemberId })
      .eq("user_id", userId);
    setBusy(false);
    setStatus(error ? { ok: false, text: "Couldn't save. Please try again." } : { ok: true, text: "Saved." });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 md:grid-cols-2">
      <Field id="email" label="Email" hint="From your Google account." className="md:col-span-2">
        <input id="email" className={`${inputCls} bg-paper-2`} value={email} readOnly aria-readonly />
      </Field>
      <Field id="phone" label="Phone (WhatsApp)" error={errors.phone} hint="Only you and event organisers can see this.">
        <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" className={inputCls} value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-err" : undefined} />
      </Field>
      <Field id="ieeeMemberId" label="IEEE membership ID" error={errors.ieeeMemberId} hint="Optional — members get free entry and priority seats.">
        <input id="ieeeMemberId" inputMode="numeric" className={inputCls} value={d.ieeeMemberId} onChange={(e) => setD({ ...d, ieeeMemberId: e.target.value })} aria-invalid={!!errors.ieeeMemberId} aria-describedby={errors.ieeeMemberId ? "ieeeMemberId-err" : undefined} />
      </Field>
      <div className="md:col-span-2 flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />} Save settings
        </button>
        <p role="status" aria-live="polite" className={status?.ok ? "text-sm font-semibold text-green-ink" : "text-sm font-semibold text-red-ink"}>{status?.text}</p>
      </div>
    </form>
  );
}
```

`app/me/settings/page.tsx`:

```tsx
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSiteData } from "@/lib/site/load";
import { SettingsForm } from "@/components/profile/SettingsForm";

export default async function SettingsPage() {
  const { user } = await requireOnboarded("/me/settings");
  const [db, { settings }] = await Promise.all([createClient(), getSiteData()]);
  const { data } = await db.from("profile_private").select("phone, ieee_member_id").eq("user_id", user.id).maybeSingle();
  return (
    <div className="grid gap-8">
      <h1 className="text-3xl font-semibold md:text-4xl">Settings</h1>
      <SettingsForm userId={user.id} email={user.email} initial={{ phone: data?.phone ?? "", ieeeMemberId: data?.ieee_member_id ?? "" }} />
      <section className="box-2 p-5">
        <h2 className="mono font-bold">Delete your account</h2>
        <p className="mt-2 text-ink-2">
          To delete your account and profile, email{" "}
          <a className="font-semibold underline" href={`mailto:${settings.contact.email}?subject=Delete%20my%20st(AI)rway%20account`}>{settings.contact.email}</a>{" "}
          from the address you signed up with and we&apos;ll remove it.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

1. `npx vitest run && npx tsc --noEmit && npx eslint .` → clean.
2. `npm run dev`; curl `/me` and `/me/settings` → 307 to `/login?next=…` (signed out). Stop the server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard): participant dashboard shell with overview and settings"
```

---

### Task 7: Profile editor (details, skills, links, projects, experience)

**Files:**
- Create: `components/profile/ProfileForm.tsx`, `components/profile/RowList.tsx`, `components/profile/ProjectsEditor.tsx`, `components/profile/ExperienceEditor.tsx`, `app/me/profile/page.tsx`

**Interfaces:**
- Consumes: `ProfileDetailsSchema`, `ProjectSchema`, `ExperienceSchema`, `fieldErrors`, `SOCIAL_KEYS`, `SOCIAL_LABELS`, `BRANCHES`, `YEARS`, `AvatarUploader`, `Field`, `inputCls`, `textareaCls`, `createClient` (browser).
- Produces: `<RowList<T> …/>` generic add/edit/save/delete list; `<ProfileForm userId initial />`; `<ProjectsEditor userId initial />`; `<ExperienceEditor userId initial />`; route `/me/profile`.

- [ ] **Step 1: Generic `RowList`**

`components/profile/RowList.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

export interface RowListProps<T extends { id?: string }> {
  title: string;
  addLabel: string;
  rows: T[];
  blank: () => T;
  /** returns field errors keyed by field name; empty object = valid */
  validate: (row: T) => Record<string, string>;
  /** persists a row; resolves with the saved row (with its id) or throws */
  save: (row: T) => Promise<T>;
  remove: (id: string) => Promise<void>;
  summary: (row: T) => ReactNode;
  fields: (row: T, set: (patch: Partial<T>) => void, errors: Record<string, string>) => ReactNode;
}

/** A list of rows where each row can be added, edited inline, saved and deleted. */
export function RowList<T extends { id?: string }>(p: RowListProps<T>) {
  const [rows, setRows] = useState(p.rows);
  const [editing, setEditing] = useState<{ index: number; draft: T } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const begin = (index: number, draft: T) => {
    setEditing({ index, draft });
    setErrors({});
    setMessage(null);
  };

  async function onSave() {
    if (!editing) return;
    const errs = p.validate(editing.draft);
    if (Object.keys(errs).length) return setErrors(errs);
    setBusy(true);
    try {
      const saved = await p.save(editing.draft);
      setRows((r) => (editing.index >= r.length ? [...r, saved] : r.map((x, i) => (i === editing.index ? saved : x))));
      setEditing(null);
    } catch {
      setMessage("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(index: number) {
    const row = rows[index];
    if (!row.id || !window.confirm("Delete this entry?")) return;
    try {
      await p.remove(row.id);
      setRows((r) => r.filter((_, i) => i !== index));
    } catch {
      setMessage("Couldn't delete. Please try again.");
    }
  }

  return (
    <section className="box shadow-hard" aria-label={p.title}>
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-paper-2 px-5 py-3">
        <h2 className="mono font-bold">{p.title}</h2>
        {!editing && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => begin(rows.length, p.blank())}>
            <Plus size={16} strokeWidth={2} aria-hidden /> {p.addLabel}
          </button>
        )}
      </div>
      <ul className="divide-y-2 divide-ink">
        {rows.length === 0 && !editing && <li className="p-5 text-ink-3">Nothing here yet.</li>}
        {rows.map((row, i) =>
          editing?.index === i ? null : (
            <li key={row.id ?? i} className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0">{p.summary(row)}</div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="grid h-11 w-11 place-items-center border-2 border-ink bg-paper hover:bg-yellow" aria-label="Edit entry" onClick={() => begin(i, row)}>
                  <Pencil size={16} strokeWidth={2} />
                </button>
                <button type="button" className="grid h-11 w-11 place-items-center border-2 border-ink bg-paper hover:bg-red" aria-label="Delete entry" onClick={() => onRemove(i)}>
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </div>
            </li>
          ),
        )}
        {editing && (
          <li className="grid gap-5 bg-paper-2 p-5">
            {p.fields(editing.draft, (patch) => setEditing({ ...editing, draft: { ...editing.draft, ...patch } }), errors)}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={busy}>
                {busy && <Loader2 size={16} className="animate-spin" />} Save
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            </div>
          </li>
        )}
      </ul>
      <p role="status" aria-live="polite" className="px-5 pb-4 text-sm font-semibold text-red-ink">{message}</p>
    </section>
  );
}
```

- [ ] **Step 2: Projects and experience editors**

`components/profile/ProjectsEditor.tsx`:

```tsx
"use client";

import { createClient } from "@/lib/supabase/browser";
import { ProjectSchema, fieldErrors } from "@/lib/profile/schema";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { RowList } from "./RowList";

export interface ProjectRow { id?: string; title: string; description: string; url: string }

export function ProjectsEditor({ userId, initial }: { userId: string; initial: ProjectRow[] }) {
  return (
    <RowList<ProjectRow>
      title="Projects"
      addLabel="Add project"
      rows={initial}
      blank={() => ({ title: "", description: "", url: "" })}
      validate={(r) => {
        const x = ProjectSchema.safeParse(r);
        return x.success ? {} : fieldErrors(x.error);
      }}
      save={async (r) => {
        const db = createClient();
        const payload = { title: r.title.trim(), description: r.description.trim(), url: r.url.trim() };
        const q = r.id
          ? db.from("profile_projects").update(payload).eq("id", r.id).select("id, title, description, url").single()
          : db.from("profile_projects").insert({ ...payload, user_id: userId }).select("id, title, description, url").single();
        const { data, error } = await q;
        if (error || !data) throw error ?? new Error("save failed");
        return data;
      }}
      remove={async (id) => {
        const { error } = await createClient().from("profile_projects").delete().eq("id", id);
        if (error) throw error;
      }}
      summary={(r) => (
        <>
          <p className="font-semibold">{r.title}</p>
          {r.description && <p className="mt-1 text-sm text-ink-2">{r.description}</p>}
          {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block break-all text-sm font-semibold text-blue-ink underline">{r.url}</a>}
        </>
      )}
      fields={(r, set, e) => (
        <>
          <Field id="project-title" label="Title" required error={e.title}>
            <input id="project-title" className={inputCls} value={r.title} onChange={(ev) => set({ title: ev.target.value })} aria-invalid={!!e.title} />
          </Field>
          <Field id="project-url" label="Link" error={e.url} hint="Demo, repository or write-up (https://…)">
            <input id="project-url" className={inputCls} value={r.url} onChange={(ev) => set({ url: ev.target.value })} aria-invalid={!!e.url} />
          </Field>
          <Field id="project-description" label="What did you build?" error={e.description}>
            <textarea id="project-description" className={textareaCls} value={r.description} onChange={(ev) => set({ description: ev.target.value })} aria-invalid={!!e.description} />
          </Field>
        </>
      )}
    />
  );
}
```

`components/profile/ExperienceEditor.tsx`:

```tsx
"use client";

import { createClient } from "@/lib/supabase/browser";
import { ExperienceSchema, fieldErrors } from "@/lib/profile/schema";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { RowList } from "./RowList";

export interface ExperienceRow { id?: string; title: string; organization: string; startDate: string; endDate: string; description: string }

const fmt = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "");
const COLS = "id, title, organization, start_date, end_date, description";
type Db = { id: string; title: string; organization: string; start_date: string; end_date: string | null; description: string };
const fromDb = (d: Db): ExperienceRow => ({ id: d.id, title: d.title, organization: d.organization, startDate: d.start_date, endDate: d.end_date ?? "", description: d.description });

export function experienceFromDb(rows: Db[]): ExperienceRow[] {
  return rows.map(fromDb);
}

export function ExperienceEditor({ userId, initial }: { userId: string; initial: ExperienceRow[] }) {
  return (
    <RowList<ExperienceRow>
      title="Experience"
      addLabel="Add experience"
      rows={initial}
      blank={() => ({ title: "", organization: "", startDate: "", endDate: "", description: "" })}
      validate={(r) => {
        const x = ExperienceSchema.safeParse(r);
        return x.success ? {} : fieldErrors(x.error);
      }}
      save={async (r) => {
        const db = createClient();
        const payload = {
          title: r.title.trim(), organization: r.organization.trim(), start_date: r.startDate,
          end_date: r.endDate || null, description: r.description.trim(),
        };
        const q = r.id
          ? db.from("profile_experience").update(payload).eq("id", r.id).select(COLS).single()
          : db.from("profile_experience").insert({ ...payload, user_id: userId }).select(COLS).single();
        const { data, error } = await q;
        if (error || !data) throw error ?? new Error("save failed");
        return fromDb(data as Db);
      }}
      remove={async (id) => {
        const { error } = await createClient().from("profile_experience").delete().eq("id", id);
        if (error) throw error;
      }}
      summary={(r) => (
        <>
          <p className="font-semibold">{r.title} <span className="font-normal text-ink-3">· {r.organization}</span></p>
          <p className="mono mt-1 text-[0.7rem] font-bold text-ink-3">{fmt(r.startDate)} – {r.endDate ? fmt(r.endDate) : "Present"}</p>
          {r.description && <p className="mt-1 text-sm text-ink-2">{r.description}</p>}
        </>
      )}
      fields={(r, set, e) => (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="exp-title" label="Role" required error={e.title}>
              <input id="exp-title" className={inputCls} value={r.title} onChange={(ev) => set({ title: ev.target.value })} aria-invalid={!!e.title} />
            </Field>
            <Field id="exp-org" label="Organisation" required error={e.organization}>
              <input id="exp-org" className={inputCls} value={r.organization} onChange={(ev) => set({ organization: ev.target.value })} aria-invalid={!!e.organization} />
            </Field>
            <Field id="exp-start" label="Start date" required error={e.startDate}>
              <input id="exp-start" type="date" className={inputCls} value={r.startDate} onChange={(ev) => set({ startDate: ev.target.value })} aria-invalid={!!e.startDate} />
            </Field>
            <Field id="exp-end" label="End date" error={e.endDate} hint="Leave empty if it's current.">
              <input id="exp-end" type="date" className={inputCls} value={r.endDate} onChange={(ev) => set({ endDate: ev.target.value })} aria-invalid={!!e.endDate} />
            </Field>
          </div>
          <Field id="exp-desc" label="What did you do?" error={e.description}>
            <textarea id="exp-desc" className={textareaCls} value={r.description} onChange={(ev) => set({ description: ev.target.value })} aria-invalid={!!e.description} />
          </Field>
        </>
      )}
    />
  );
}
```

- [ ] **Step 3: `ProfileForm` (details, skills, links, photo)**

`components/profile/ProfileForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { ProfileDetailsSchema, fieldErrors } from "@/lib/profile/schema";
import { BRANCHES, SOCIAL_KEYS, SOCIAL_LABELS, YEARS, type SocialKey } from "@/lib/profile/options";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { AvatarUploader } from "./AvatarUploader";

export interface ProfileFormValues {
  fullName: string; headline: string; bio: string; college: string; branch: string; year: string;
  skills: string[]; links: Record<SocialKey, string>; avatarUrl: string | null;
}

export function ProfileForm({ userId, initial }: { userId: string; initial: ProfileFormValues }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [skillDraft, setSkillDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const addSkill = () => {
    const s = skillDraft.trim();
    if (!s || d.skills.some((x) => x.toLowerCase() === s.toLowerCase())) return setSkillDraft("");
    setD({ ...d, skills: [...d.skills, s] });
    setSkillDraft("");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = ProfileDetailsSchema.safeParse(d);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setStatus({ ok: false, text: "A few fields need a look." });
      return;
    }
    setErrors({});
    setBusy(true);
    setStatus(null);
    const v = parsed.data;
    const { error } = await createClient()
      .from("profiles")
      .update({
        full_name: v.fullName, headline: v.headline, bio: v.bio, college: v.college, branch: v.branch, year: v.year,
        skills: v.skills, links: v.links, avatar_url: d.avatarUrl,
      })
      .eq("id", userId);
    setBusy(false);
    if (error) return setStatus({ ok: false, text: "Couldn't save. Please try again." });
    setStatus({ ok: true, text: "Profile saved." });
    router.refresh();
  }

  const aria = (k: string) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-err` : undefined });

  return (
    <form onSubmit={submit} noValidate className="box grid gap-6 p-6 shadow-hard md:grid-cols-2 md:p-8">
      <div className="md:col-span-2">
        <AvatarUploader userId={userId} currentUrl={d.avatarUrl} name={d.fullName} onUploaded={(u) => setD((x) => ({ ...x, avatarUrl: u }))} />
      </div>
      <Field id="fullName" label="Full name" required error={errors.fullName}>
        <input id="fullName" className={inputCls} value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} {...aria("fullName")} />
      </Field>
      <Field id="headline" label="Headline" error={errors.headline} hint="e.g. 3rd-year ECE · robotics tinkerer">
        <input id="headline" className={inputCls} value={d.headline} onChange={(e) => setD({ ...d, headline: e.target.value })} {...aria("headline")} />
      </Field>
      <Field id="bio" label="About you" error={errors.bio} className="md:col-span-2">
        <textarea id="bio" className={textareaCls} value={d.bio} onChange={(e) => setD({ ...d, bio: e.target.value })} {...aria("bio")} />
      </Field>
      <Field id="college" label="College" required error={errors.college} className="md:col-span-2">
        <input id="college" className={inputCls} value={d.college} onChange={(e) => setD({ ...d, college: e.target.value })} {...aria("college")} />
      </Field>
      <Field id="branch" label="Branch" required error={errors.branch}>
        <select id="branch" className={inputCls} value={d.branch} onChange={(e) => setD({ ...d, branch: e.target.value })} {...aria("branch")}>
          <option value="">Select branch</option>
          {BRANCHES.map((b) => <option key={b}>{b}</option>)}
        </select>
      </Field>
      <Field id="year" label="Year" required error={errors.year}>
        <select id="year" className={inputCls} value={d.year} onChange={(e) => setD({ ...d, year: e.target.value })} {...aria("year")}>
          <option value="">Select year</option>
          {YEARS.map((y) => <option key={y}>{y}</option>)}
        </select>
      </Field>

      <div className="md:col-span-2">
        <Field id="skill-input" label="Skills" error={errors.skills} hint="Type a skill and press Enter (up to 30).">
          <input
            id="skill-input" className={inputCls} value={skillDraft}
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
            onBlur={addSkill}
          />
        </Field>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your skills">
          {d.skills.map((s) => (
            <li key={s} className="tag tag-yellow !pr-1">
              {s}
              <button type="button" className="grid h-6 w-6 place-items-center hover:bg-ink hover:text-paper" aria-label={`Remove ${s}`} onClick={() => setD({ ...d, skills: d.skills.filter((x) => x !== s) })}>
                <X size={12} strokeWidth={3} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {SOCIAL_KEYS.map((k) => (
        <Field key={k} id={`links.${k}`} label={SOCIAL_LABELS[k]} error={errors[`links.${k}`]}>
          <input
            id={`links.${k}`} className={inputCls} placeholder="https://" value={d.links[k]}
            onChange={(e) => setD({ ...d, links: { ...d.links, [k]: e.target.value } })}
            aria-invalid={!!errors[`links.${k}`]} aria-describedby={errors[`links.${k}`] ? `links.${k}-err` : undefined}
          />
        </Field>
      ))}

      <div className="flex flex-wrap items-center gap-4 md:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />} Save profile
        </button>
        <p role="status" aria-live="polite" className={status?.ok ? "text-sm font-semibold text-green-ink" : "text-sm font-semibold text-red-ink"}>{status?.text}</p>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: `/me/profile` page**

`app/me/profile/page.tsx`:

```tsx
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm, type ProfileFormValues } from "@/components/profile/ProfileForm";
import { ProjectsEditor } from "@/components/profile/ProjectsEditor";
import { ExperienceEditor, experienceFromDb } from "@/components/profile/ExperienceEditor";
import { SOCIAL_KEYS } from "@/lib/profile/options";

export default async function EditProfilePage() {
  const { user, profile } = await requireOnboarded("/me/profile");
  const db = await createClient();
  const [{ data: p }, { data: projects }, { data: experience }] = await Promise.all([
    db.from("profiles").select("full_name, headline, bio, college, branch, year, skills, links, avatar_url").eq("id", user.id).single(),
    db.from("profile_projects").select("id, title, description, url").eq("user_id", user.id).order("sort_order").order("created_at"),
    db.from("profile_experience").select("id, title, organization, start_date, end_date, description").eq("user_id", user.id).order("start_date", { ascending: false }),
  ]);
  const links = (p?.links ?? {}) as Record<string, string>;
  const initial: ProfileFormValues = {
    fullName: p?.full_name ?? "", headline: p?.headline ?? "", bio: p?.bio ?? "", college: p?.college ?? "",
    branch: p?.branch ?? "", year: p?.year ?? "", skills: p?.skills ?? [], avatarUrl: p?.avatar_url ?? null,
    links: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, links[k] ?? ""])) as ProfileFormValues["links"],
  };
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold md:text-4xl">Your profile</h1>
        <Link href={`/u/${profile.handle}`} className="btn btn-sm btn-ghost">View public profile</Link>
      </div>
      <ProfileForm userId={user.id} initial={initial} />
      <ProjectsEditor userId={user.id} initial={projects ?? []} />
      <ExperienceEditor userId={user.id} initial={experienceFromDb(experience ?? [])} />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

1. `npx vitest run && npx tsc --noEmit && npx eslint .` → clean (the `react-hooks` lint rules are strict: do not call `setState` synchronously inside effects; the code above uses event handlers only).
2. `npm run dev`; curl `/me/profile` → 307 to `/login?next=…`. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(profile): profile editor with skills, links, projects and experience"
```

---

### Task 8: Public profile page `/u/[handle]`

**Files:**
- Create: `components/profile/ProfileView.tsx`, `app/u/[handle]/page.tsx`

**Interfaces:**
- Consumes: `requireSignedIn`, `createClient` (server), `SOCIAL_KEYS`, `SOCIAL_LABELS`, `Avatar`.
- Produces: route `/u/[handle]` (signed-in users only; unknown handle → 404; signed out → login).

- [ ] **Step 1: View component**

`components/profile/ProfileView.tsx`:

```tsx
import { ExternalLink } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SOCIAL_KEYS, SOCIAL_LABELS } from "@/lib/profile/options";

export interface ProfileViewData {
  handle: string; fullName: string; avatarUrl: string | null; headline: string; bio: string;
  college: string; branch: string; year: string; skills: string[]; links: Record<string, string>;
  projects: { id: string; title: string; description: string; url: string }[];
  experience: { id: string; title: string; organization: string; start_date: string; end_date: string | null; description: string }[];
}

const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });

export function ProfileView({ p }: { p: ProfileViewData }) {
  const links = SOCIAL_KEYS.filter((k) => p.links[k]);
  return (
    <article className="wrap grid gap-8 py-10 md:py-14">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar name={p.fullName || p.handle} photo={p.avatarUrl ?? undefined} size={128} />
        <div className="min-w-0">
          <p className="mono font-bold text-ink-3">@{p.handle}</p>
          <h1 className="mt-1 text-4xl font-semibold leading-tight md:text-5xl">{p.fullName || p.handle}</h1>
          {p.headline && <p className="mt-2 text-lg text-ink-2">{p.headline}</p>}
          <p className="mt-2 text-sm text-ink-3">{[p.college, p.branch, p.year].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      {links.length > 0 && (
        <ul className="flex flex-wrap gap-3" aria-label="Links">
          {links.map((k) => (
            <li key={k}>
              <a href={p.links[k]} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-sm btn-ghost">
                {SOCIAL_LABELS[k]} <ExternalLink size={14} strokeWidth={2} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}

      {p.bio && (
        <section className="box p-6 shadow-hard" aria-labelledby="about-h">
          <h2 id="about-h" className="mono mb-3 font-bold">About</h2>
          <p className="whitespace-pre-line text-ink-2">{p.bio}</p>
        </section>
      )}

      {p.skills.length > 0 && (
        <section aria-labelledby="skills-h">
          <h2 id="skills-h" className="mono mb-3 font-bold">Skills</h2>
          <ul className="flex flex-wrap gap-2">{p.skills.map((s) => <li key={s} className="tag tag-yellow">{s}</li>)}</ul>
        </section>
      )}

      {p.projects.length > 0 && (
        <section aria-labelledby="projects-h">
          <h2 id="projects-h" className="mono mb-3 font-bold">Projects</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {p.projects.map((pr) => (
              <li key={pr.id} className="box p-5 shadow-hard">
                <h3 className="text-xl font-semibold">{pr.title}</h3>
                {pr.description && <p className="mt-2 text-ink-2">{pr.description}</p>}
                {pr.url && <a href={pr.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block break-all font-semibold text-blue-ink underline">{pr.url}</a>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.experience.length > 0 && (
        <section aria-labelledby="exp-h">
          <h2 id="exp-h" className="mono mb-3 font-bold">Experience</h2>
          <ol className="grid gap-4">
            {p.experience.map((x) => (
              <li key={x.id} className="box p-5 shadow-hard">
                <h3 className="text-lg font-semibold">{x.title} <span className="font-normal text-ink-3">· {x.organization}</span></h3>
                <p className="mono mt-1 text-[0.7rem] font-bold text-ink-3">{fmt(x.start_date)} – {x.end_date ? fmt(x.end_date) : "Present"}</p>
                {x.description && <p className="mt-2 text-ink-2">{x.description}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Page**

`app/u/[handle]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSignedIn } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProfileView, type ProfileViewData } from "@/components/profile/ProfileView";

export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

export default async function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  const h = decodeURIComponent(handle).toLowerCase();
  await requireSignedIn(`/u/${encodeURIComponent(h)}`);
  const db = await createClient();
  const { data: p } = await db
    .from("profiles")
    .select("id, handle, full_name, avatar_url, headline, bio, college, branch, year, skills, links, onboarded")
    .eq("handle", h)
    .maybeSingle();
  if (!p || !p.onboarded) notFound();
  const [{ data: projects }, { data: experience }] = await Promise.all([
    db.from("profile_projects").select("id, title, description, url").eq("user_id", p.id).order("sort_order").order("created_at"),
    db.from("profile_experience").select("id, title, organization, start_date, end_date, description").eq("user_id", p.id).order("start_date", { ascending: false }),
  ]);
  const data: ProfileViewData = {
    handle: p.handle, fullName: p.full_name, avatarUrl: p.avatar_url, headline: p.headline, bio: p.bio,
    college: p.college, branch: p.branch, year: p.year, skills: p.skills, links: (p.links ?? {}) as Record<string, string>,
    projects: projects ?? [], experience: experience ?? [],
  };
  return <ProfileView p={data} />;
}
```

- [ ] **Step 3: Verify**

1. `npx next typegen && npx vitest run && npx tsc --noEmit && npx eslint .` → clean.
2. `npm run dev`; curl `/u/anything` → 307 to `/login?next=%2Fu%2Fanything`. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(profile): signed-in-only public profile page"
```

---

### Task 9: Docs, deploy and end-to-end verification

**Files:**
- Modify: `README.md`, `design-system/MASTER.md`
- (Controller-led with the user) Supabase Auth + Google Cloud configuration; production deploy; real sign-in test.

- [ ] **Step 1: Docs (implementer)**

`README.md`: add a section "Accounts & profiles" covering: Google sign-in only for now (email code is built but hidden: `lib/auth/config.ts` flag, needs a sending domain + custom SMTP), the routes (`/login`, `/onboarding`, `/me`, `/u/[handle]`), that profiles are visible to signed-in users only, the `middleware.ts` session refresh (edge, runs only when a Supabase cookie is present), the two SQL assertion scripts in `supabase/tests/` and how to run them (via the Supabase SQL editor or MCP; they roll back), and account deletion = email the team. `design-system/MASTER.md`: add "Dashboards: sidebar with a back button at the top; mobile collapses to a horizontal tab strip" and "Forms: use `components/ui/Field.tsx`".
Run the gate (`npx vitest run && npx tsc --noEmit && npx eslint .`) and commit: `git commit -am "docs: accounts and profiles"`.

- [ ] **Step 2: Supabase Auth + Google OAuth configuration (controller with the user — not delegated)**

User actions, with exact values:
1. Google Cloud Console → create/select a project → *APIs & Services → OAuth consent screen* (External; app name `st(AI)rway`; support email = the user's; authorised domain `supabase.co`) → *Credentials → Create credentials → OAuth client ID* → type **Web application** → Authorized redirect URI: `https://nfrdsdnrtsbttyrmfppy.supabase.co/auth/v1/callback`. Copy the Client ID and Client secret.
2. Supabase dashboard → *Authentication → Sign In / Providers → Google* → enable → paste Client ID + secret → Save.
3. Supabase dashboard → *Authentication → URL Configuration*: Site URL `https://stairway.ieeesbcek.workers.dev`; Redirect URLs: `https://stairway.ieeesbcek.workers.dev/**`, `http://localhost:3000/**`, `http://localhost:3123/**`, `http://localhost:8787/**`.
4. Supabase dashboard → *Authentication → Sign In / Providers → Email*: switch **Enable Email provider** off (prevents anonymous password sign-ups through the public API until email-code login is intentionally turned on).
5. Never paste the Client secret into chat or the repo.

- [ ] **Step 3: Deploy**

Merge happens via the finishing skill; after merge to `main` Cloudflare Workers Builds deploys automatically (or run `CLOUDFLARE_ACCOUNT_ID=7a852bedf2056637d90bd9534e6cd7c1 npm run deploy`). Verify `curl -s -o /dev/null -w "%{http_code}" https://stairway.ieeesbcek.workers.dev/login` → 200 and `/me` → 307 to `/login?next=%2Fme`.

- [ ] **Step 4: Real sign-in test (with the user, on the live site)**

1. Open `/login` → *Continue with Google* → choose an account → land on `/onboarding` (name and photo prefilled from Google).
2. Finish setup (handle, college, branch, year) → land on `/me`; the top bar shows the avatar.
3. `/me/profile`: upload a photo, save details, add a skill, a link, a project, an experience; reload to confirm they persist.
4. `/u/<your-handle>` shows the profile; open it in a private window → redirected to `/login`.
5. `/me/settings`: save a phone number and IEEE ID; the back button at the top of the sidebar returns to the previous page; *Sign out* returns to `/` and shows "Sign in" again.
6. Leave the tab for over an hour (or delete the `sb-…-auth-token` access token expiry via DevTools) and reload `/me` to confirm the session refreshes instead of signing out (middleware).
7. In Supabase *Table Editor* confirm one `profiles` + one `profile_private` row exist for the account and `anon` cannot read them (`npx vitest run tests/rls` still passes).

---

## Self-review notes

- **Spec coverage (Phase 2):** Google login + hidden email code (T4), onboarding (T5), `/me` shell with back button, Overview, Settings, Profile (T6–T7), `/u/[handle]` signed-in only (T8), avatar upload/crop (T5), profile tables + RLS (T2), security fixes deferred from Phase 1 (T1). My tickets / Certificates tabs and the attendee panel arrive with Phase 3 (they need registrations). Account deletion is "email us" until a service-role key exists.
- **Types:** `AuthState`/`AuthProfile` (T3) are used verbatim by `session.ts`, `AuthProvider`, `AccountButton`, `requireOnboarded` (T4–T6). `ProfileFormValues` (T7) is built from the same column names as `ProfileView` data (T8).
- **Deliberately not built (YAGNI):** project images, profile search, follow/connect, notifications.
