# Phase 3 — Free Registration & Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in, onboarded students can register for free st(AI)rway sessions (with per-event custom questions), get a QR or token ticket, join a waitlist when a session is full, cancel, see their tickets in `/me`, and see who else is attending each session.

**Architecture:** A new RLS-protected `registrations` table that users can only read (own rows) and never write directly. All writes go through two `security definer` RPCs (`register_for_event`, `cancel_registration`) that lock the event row (`FOR UPDATE`) so capacity, token numbers and waitlist order are serialised per event; cancelling a confirmed seat promotes waitlist position 1 inside the same transaction. Next.js server actions call those RPCs as the signed-in user (no service role). Public seat counts and the signed-in-only attendee list are exposed through `security_invoker` views over `security definer` functions in the `private` schema, so neither leaks registration rows. Tickets render server-side: the QR matrix is computed in the Worker with the zero-dependency `uqr` library and drawn as an inline SVG path; the PNG download redraws the same matrix on a client canvas.

**Tech Stack:** Next.js 16.3.8 (App Router, server actions), React 19, Supabase (Postgres RLS + RPC), `@supabase/ssr` 0.12, zod 4, `uqr` (MIT, QR matrix), Vitest 5, Tailwind 4, OpenNext on Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-10-04-platform-backend-design.md` — §3 *Registrations & payments*, *Database functions*, *Row-level security*; §4 *Event page*, *Participant dashboard*; §5 *Registration (free)*, *Waitlist*, *Tickets & check-in*, *Errors*; §7 phase 3; §8. Earlier plans: `docs/superpowers/plans/2026-10-04-phase1-foundation.md`, `docs/superpowers/plans/2026-10-05-phase2-accounts.md`. Lessons: `.superpowers/sdd/progress.md`.

## Global Constraints

- Next.js stays `16.3.8`. **No `proxy.ts`**; the existing edge `middleware.ts` is untouched. **No `export const runtime = "edge"`** anywhere. Read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` before writing server actions (every action re-authenticates, validates input, and returns UI-shaped data only).
- Code must run on Cloudflare Workers via OpenNext: no Node-only modules (`fs`, `canvas`, `Buffer`-dependent libraries) in anything imported by pages, layouts or actions. The only new runtime dependency is `uqr` (MIT, zero dependencies, pure ESM).
- **Free events only.** `register_for_event` raises `paid_event` when `price_paise > 0`; the UI shows "Paid registration opens soon". The `registrations` table already carries every Phase 4 column and status (`pending_payment`, `refunded`, `refund_needed`, `amount_paise`, `hold_expires_at`, `razorpay_order_id`, `razorpay_payment_id`) so Phase 4 does not alter it.
- **No email in this phase** (no sending domain yet). Waitlist promotion happens inside `cancel_registration` (and before every new registration); `private.promote_waitlist` returns the promoted registration ids as the seam Phase 4 (Resend) will use. Ticket screens say plainly that no confirmation email is sent.
- **No service-role key.** Server actions call RPCs with the user's session (`lib/supabase/server.ts`).
- Users get **no** `insert`/`update`/`delete` privilege on `registrations` (table- and column-level). `anon` has **no** privilege on `registrations`, `event_attendees`, or the RPCs. Attendee data is visible to `authenticated` only and exposes only `event_id, handle, full_name, avatar_url, headline`.
- Every privileged SQL function: `security definer` (only where needed), `set search_path = ''`, fully qualified names, explicit `revoke execute … from public` (plus `anon` where relevant) and explicit grants. Helpers live in schema `private` (not exposed by PostgREST); only the two RPCs live in `public`.
- RLS writes that silently match zero rows are **failures** (check returned rows, not just `error`).
- Every redirect target built from user input goes through `safeNext()` (login/onboarding already do); hrefs we build ourselves use `loginPath()` / `registerPath()` / `ticketPath()` from `lib/registration/cta.ts`.
- Other users' avatars are rendered only via `safeAvatarUrl()` with `referrerPolicy="no-referrer"`; external URLs (Google Form fallback) are rendered only when `https://` (`safeFormUrl()`).
- Pages that need a session call `requireOnboarded(<exact path>)` **before** looking anything up (signed-out probes redirect first).
- Forms follow `design-system/MASTER.md`: `components/ui/Field.tsx`, red `*` + `aria-required`, validate on blur, errors under fields (`<id>-err`), focus the first invalid field on submit, `role="alert"` for form-level errors, `aria-live` for status; 44px touch targets.
- Every dashboard keeps its **back/close button at the top of the left sidebar** (`DashboardShell`).
- Keep the site name exactly `st(AI)rway`.
- Supabase project ref `nfrdsdnrtsbttyrmfppy`. Apply DB changes with the Supabase MCP `apply_migration`, then rename the committed file to the version `list_migrations` reports, then regenerate `lib/supabase/database.types.ts` with MCP `generate_typescript_types`. **Never run `supabase/seed.sql` against the live database** (it truncates content tables); seed changes go live through a targeted migration.
- SQL assertion scripts in `supabase/tests/*.sql` run as **one** MCP `execute_sql` call each, inside `begin … rollback`, and end by selecting a single `'<name>: all assertions passed'` row. If Supabase's role setup forces a statement shape change, adapt it while preserving every asserted behaviour.
- After adding or renaming a route, run `npx next typegen` so `PageProps<"/…">` types exist before `tsc`.
- Every task ends with `npx vitest run`, `npx tsc --noEmit` and `npx eslint .` passing with zero errors/warnings, then a commit whose message ends with a blank line and `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `phase3-registration` (created from `main` in Task 1, Step 1).

## Spec deviations & deferrals (decided — do not re-open during execution)

| Spec item | Phase 3 decision |
|---|---|
| `event_questions` table | Questions are an `events.questions jsonb` array, validated by `private.questions_valid()` (CHECK) and zod. The `file` question type (and the `registration-files` bucket) is deferred. |
| Confirmation / "you're in" emails | Deferred until a sending domain exists (Phase 4). Promotion ids are returned by `private.promote_waitlist` as the seam. |
| `payment_events` table, `confirm_payment`, holds, cron | Phase 4 (new objects only; `registrations` is already complete). |
| Admins update registration status / check-in; admins read `profile_private` of registrants; `check_in()` | Phase 5 (admin dashboard). Admins can already **read** their society's registrations. |
| Ticket download as PDF | PNG only in Phase 3. |
| Phone number | Required at registration (organisers need a contact); IEEE ID optional. Both are saved back to `profile_private`. |

## File Map

| Path | Responsibility |
|---|---|
| `supabase/migrations/*_registrations.sql` | `registration_status` enum, `events.questions` + checks, `registrations` table, grants, RLS, real `event_seat_counts`, `event_attendees` view |
| `supabase/migrations/*_registration_rpcs.sql` | `private.new_ticket_code/seats_taken/validate_answers/compact_waitlist/promote_waitlist`, `public.register_for_event`, `public.cancel_registration` |
| `supabase/migrations/*_registration_seed_config.sql` | Generated targeted updates: questions / ticket type / opening time for live events |
| `supabase/tests/registrations-rls.sql`, `supabase/tests/registrations-rpc.sql` | Rolled-back SQL assertion scripts |
| `supabase/seed-data/registration.ts` | Per-event registration config (single source for seed.sql and the config migration) |
| `scripts/generate-seed.ts` | Emits questions / ticket type / opening time; `registrationConfigSql()` |
| `lib/registration/types.ts` | Status constants, `MyRegistration`, `Attendee` |
| `lib/registration/questions.ts` | Question zod schema, per-question answer schemas, `emptyAnswers` |
| `lib/registration/schema.ts` | Registration form schema (profile fields + answers), field-id mapping |
| `lib/registration/errors.ts` | Typed error codes, copy and recovery, DB-error mapping |
| `lib/registration/external.ts` | https-only Google Form URL helpers |
| `lib/registration/cta.ts` | Registration CTA state machine and path builders |
| `lib/registration/tickets.ts` | Ticket row mapping, upcoming/past split |
| `lib/registration/server.ts` | Server-only reads: my registration, attendees, tickets |
| `lib/registration/actions.ts` | Server actions `registerForEvent`, `cancelRegistration` |
| `lib/tickets/token.ts`, `lib/tickets/qr.ts`, `lib/tickets/png.ts` | Token formatting, QR matrix + SVG path, client PNG export |
| `components/registration/*` | `RegistrationForm`, `QuestionField`, `ErrorPanel`, `RegistrationUnavailable`, `RegisterCta`, `AttendingPanel` |
| `components/tickets/*` | `TicketCard`, `TicketActions`, `CancelRegistration`, `TicketListItem`, `NextTicketCard` |
| `app/events/[slug]/register/page.tsx` | Registration page |
| `app/me/tickets/page.tsx`, `app/me/tickets/[id]/page.tsx` | My tickets list and ticket view |
| `app/events/[slug]/page.tsx`, `components/weekend/WeekendDetail.tsx` | CTA states + Attending panel |
| `app/register/page.tsx` | Legacy URL → redirect (old demo form deleted) |
| `tests/registration/*`, `tests/tickets/*` | Vitest unit tests |

---

### Task 1: Registrations schema, RLS and read views

**Files:**
- Create: `supabase/migrations/20261006000001_registrations.sql` (renamed to the assigned version in Step 4), `supabase/tests/registrations-rls.sql`
- Rename: `supabase/migrations/20261006101500_profiles_column_guards.sql` → `supabase/migrations/20261006142506_profiles_column_guards.sql` (the live DB recorded version `20261006142506`)
- Modify: `lib/supabase/database.types.ts` (regenerated), `tests/rls/public-access.test.ts`

**Interfaces:**
- Consumes: `private.is_society_admin(uuid)`, `public.events`, `public.profiles`, `public.touch_updated_at()`.
- Produces:
  - enum `public.registration_status` = `pending_payment | confirmed | waitlisted | cancelled | refunded | refund_needed`
  - column `public.events.questions jsonb not null default '[]'` (CHECK `private.questions_valid(questions)`), CHECK `token_prefix ~ '^[A-Z0-9-]{0,16}$'`
  - table `public.registrations(id, event_id, user_id → profiles.id, status, answers jsonb, ticket_code text unique /^[A-Z2-7]{26}$/, token_number int, amount_paise int, hold_expires_at, razorpay_order_id, razorpay_payment_id, waitlist_position int, confirmed_at, cancelled_at, checked_in_at, checked_in_by, created_at, updated_at)`; unique `(event_id, user_id)`, `(event_id, token_number)`, `(event_id, waitlist_position)` deferrable
  - view `public.event_seat_counts(event_id uuid, seats_taken int, waitlisted int)` (anon + authenticated)
  - view `public.event_attendees(event_id uuid, handle text, full_name text, avatar_url text, headline text)` (authenticated only; confirmed registrants of visible events)
  - function `private.questions_valid(jsonb) returns boolean` (immutable)

- [ ] **Step 1: Branch and migration-file hygiene**

```bash
git checkout main && git pull --ff-only
git checkout -b phase3-registration
```

Run MCP `list_migrations` (project `nfrdsdnrtsbttyrmfppy`). It reports `profiles_column_guards` as version `20261006142506` while the committed file is `20261006101500_profiles_column_guards.sql`. Align them:

```bash
git mv supabase/migrations/20261006101500_profiles_column_guards.sql supabase/migrations/20261006142506_profiles_column_guards.sql
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20261006000001_registrations.sql`:

```sql
-- Phase 3 (part 1): registrations table, custom questions, seat counts and the attendee list.
-- Users never write registrations directly: part 2 (registration_rpcs) adds the security-definer RPCs.

create type public.registration_status as enum
  ('pending_payment', 'confirmed', 'waitlisted', 'cancelled', 'refunded', 'refund_needed');

-- 1. Per-event custom questions: a jsonb array checked here and mirrored by zod in lib/registration/questions.ts.
create or replace function private.questions_valid(q jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  opts jsonb;
  kind text;
  ids text[] := '{}';
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
    if jsonb_typeof(item->'label') <> 'string' or char_length(btrim(item->>'label')) not between 1 and 200 then
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
                 where jsonb_typeof(o.value) <> 'string' or char_length(btrim(o.value #>> '{}')) not between 1 and 100) then
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
-- CHECK constraints are evaluated with the writer's privileges, and admins write events as `authenticated`.
grant execute on function private.questions_valid(jsonb) to authenticated;

alter table public.events
  add column questions jsonb not null default '[]'::jsonb,
  add constraint events_questions_valid check (private.questions_valid(questions)),
  add constraint events_token_prefix_shape check (token_prefix ~ '^[A-Z0-9-]{0,16}$');

-- 2. Registrations. Phase 4 payment columns/statuses are included now so Phase 4 needs no table change.
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.registration_status not null,
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 32768),
  ticket_code text not null unique check (ticket_code ~ '^[A-Z2-7]{26}$'),
  token_number int check (token_number > 0),
  amount_paise int not null default 0 check (amount_paise >= 0),
  hold_expires_at timestamptz,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  waitlist_position int check (waitlist_position > 0),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_one_per_user unique (event_id, user_id),
  constraint registrations_token_unique unique (event_id, token_number),
  constraint registrations_waitlist_unique unique (event_id, waitlist_position) deferrable initially deferred,
  constraint registrations_waitlist_shape check ((status = 'waitlisted') = (waitlist_position is not null)),
  constraint registrations_confirmed_token check (status <> 'confirmed' or token_number is not null),
  constraint registrations_hold_shape check (status <> 'pending_payment' or hold_expires_at is not null)
);
create index registrations_event_status_idx on public.registrations (event_id, status);
create index registrations_user_idx on public.registrations (user_id, created_at desc);
create index registrations_checked_in_by_idx on public.registrations (checked_in_by);
create trigger registrations_touch before update on public.registrations
  for each row execute function public.touch_updated_at();

-- 3. Privileges: read-only for signed-in users, nothing for anon. Writes only via the part-2 RPCs.
alter table public.registrations enable row level security;
revoke all on public.registrations from anon, authenticated;
grant select on public.registrations to authenticated;

create policy "owners read own registrations" on public.registrations for select to authenticated
  using (user_id = (select auth.uid()));
create policy "society admins read registrations" on public.registrations for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and private.is_society_admin(e.society_id)));

-- 4. Seat counts (replaces the Phase 1 placeholder; same name and first two columns).
create or replace function private.event_seat_counts()
returns table (event_id uuid, seats_taken int, waitlisted int)
language sql stable security definer set search_path = '' as $$
  select e.id,
         (count(r.id) filter (where r.status = 'confirmed'
                                 or (r.status = 'pending_payment' and r.hold_expires_at > now())))::int,
         (count(r.id) filter (where r.status = 'waitlisted'))::int
  from public.events e
  left join public.registrations r on r.event_id = e.id
  where e.status = 'published' or private.is_society_admin(e.society_id)
  group by e.id;
$$;
revoke execute on function private.event_seat_counts() from public;
grant execute on function private.event_seat_counts() to anon, authenticated;

create or replace view public.event_seat_counts with (security_invoker = true) as
  select c.event_id, c.seats_taken, c.waitlisted from private.event_seat_counts() as c;

-- 5. Attendee list: confirmed registrants' public profile fields, signed-in users only.
create or replace function private.event_attendees()
returns table (event_id uuid, handle text, full_name text, avatar_url text, headline text)
language sql stable security definer set search_path = '' as $$
  select r.event_id, p.handle, p.full_name, p.avatar_url, p.headline
  from public.registrations r
  join public.events e on e.id = r.event_id
  join public.profiles p on p.id = r.user_id
  where (select auth.uid()) is not null
    and r.status = 'confirmed'
    and p.onboarded
    and (e.status = 'published' or private.is_society_admin(e.society_id));
$$;
revoke execute on function private.event_attendees() from public, anon;
grant execute on function private.event_attendees() to authenticated;

create view public.event_attendees with (security_invoker = true) as
  select a.event_id, a.handle, a.full_name, a.avatar_url, a.headline from private.event_attendees() as a;
revoke all on public.event_attendees from anon, authenticated;
grant select on public.event_attendees to authenticated;
```

- [ ] **Step 3: Write the assertion script**

Create `supabase/tests/registrations-rls.sql`:

```sql
-- Phase 3 Task 1: registrations grants, RLS, seat counts and attendee view. Run as ONE execute_sql call; rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'p3-owner@test.local',     'authenticated', 'authenticated', '{"full_name":"Reg Owner"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'p3-other@test.local',     'authenticated', 'authenticated', '{"full_name":"Reg Other"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'p3-cs-admin@test.local',  'authenticated', 'authenticated', '{"full_name":"Cs Admin"}'),
  ('00000000-0000-0000-0000-0000000000e4', 'p3-ras-admin@test.local', 'authenticated', 'authenticated', '{"full_name":"Ras Admin"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2',
               '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4');
insert into public.admin_roles (user_id, role, society_id)
  select '00000000-0000-0000-0000-0000000000e3', 'society_admin', id from public.societies where slug = 'cs';
insert into public.admin_roles (user_id, role, society_id)
  select '00000000-0000-0000-0000-0000000000e4', 'society_admin', id from public.societies where slug = 'ras';

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix)
  select id, 90, 'p3-rls-event', 'P3 RLS event', now() + interval '10 days', now() + interval '10 days 6 hours', 'published', 10, 'RAS-90'
  from public.societies where slug = 'ras';
insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix)
  select id, 91, 'p3-rls-draft', 'P3 RLS draft', now() + interval '10 days', now() + interval '10 days 6 hours', 'draft', 10, 'RAS-91'
  from public.societies where slug = 'ras';

-- rows written as the table owner (users cannot write registrations)
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
  select id, '00000000-0000-0000-0000-0000000000e1', 'confirmed', 'AAAAAAAAAAAAAAAAAAAAAAAAAA', 1, now()
  from public.events where slug = 'p3-rls-event';
insert into public.registrations (event_id, user_id, status, ticket_code, waitlist_position)
  select id, '00000000-0000-0000-0000-0000000000e2', 'waitlisted', 'BBBBBBBBBBBBBBBBBBBBBBBBBB', 1
  from public.events where slug = 'p3-rls-event';
insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
  select id, '00000000-0000-0000-0000-0000000000e2', 'confirmed', 'CCCCCCCCCCCCCCCCCCCCCCCCCC', 1, now()
  from public.events where slug = 'p3-rls-draft';

-- structure and privileges
do $$ begin
  assert not has_table_privilege('anon', 'public.registrations', 'select'), 'anon can select registrations';
  assert has_table_privilege('authenticated', 'public.registrations', 'select'), 'authenticated lost select on registrations';
  assert not has_any_column_privilege('authenticated', 'public.registrations', 'insert'), 'authenticated can insert registrations';
  assert not has_any_column_privilege('authenticated', 'public.registrations', 'update'), 'authenticated can update registrations';
  assert not has_table_privilege('authenticated', 'public.registrations', 'delete'), 'authenticated can delete registrations';
  assert not has_table_privilege('authenticated', 'public.registrations', 'truncate'), 'authenticated can truncate registrations';
  assert not has_any_column_privilege('anon', 'public.registrations', 'insert'), 'anon can insert registrations';
  assert not has_table_privilege('anon', 'public.event_attendees', 'select'), 'anon can select event_attendees';
  assert has_table_privilege('authenticated', 'public.event_attendees', 'select'), 'authenticated cannot select event_attendees';
  assert has_table_privilege('anon', 'public.event_seat_counts', 'select'), 'anon lost select on event_seat_counts';
  assert (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'event_attendees')
         = array['event_id', 'handle', 'full_name', 'avatar_url', 'headline'],
    'event_attendees exposes unexpected columns';
  assert (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'event_seat_counts')
         = array['event_id', 'seats_taken', 'waitlisted'],
    'event_seat_counts columns changed';
  assert not has_function_privilege('anon', 'private.event_attendees()', 'execute'), 'anon can execute private.event_attendees';
  assert not has_function_privilege('anon', 'private.questions_valid(jsonb)', 'execute'), 'anon can execute questions_valid';

  -- question schema checks
  assert private.questions_valid('[]'), 'empty question list rejected';
  assert private.questions_valid('[{"id":"laptop","label":"Laptop?","type":"single_choice","options":["Yes","No"],"required":true},{"id":"goal","label":"Goal","help":"h","type":"textarea","required":false}]'),
    'valid questions rejected';
  assert not private.questions_valid('{}'), 'object accepted as question list';
  assert not private.questions_valid('[{"id":"laptop","label":"Laptop?","type":"single_choice","options":["Yes"],"required":true}]'), 'one-option choice accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"single_choice","options":["X","X"],"required":true}]'), 'duplicate options accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"text","required":true},{"id":"a","label":"B","type":"text","required":false}]'), 'duplicate ids accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"file","required":true}]'), 'file type accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"text","required":true,"extra":1}]'), 'unknown key accepted';
  assert not private.questions_valid('[{"id":"A b","label":"A","type":"text","required":true}]'), 'bad id accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"text","required":true,"options":["x","y"]}]'), 'options on a text question accepted';
  assert not private.questions_valid('[{"id":"a","label":" ","type":"text","required":true}]'), 'blank label accepted';
  assert not private.questions_valid('[{"id":"a","label":"A","type":"text","required":"yes"}]'), 'non-boolean required accepted';
end $$;

-- table constraints (as owner)
do $$ declare ev uuid; begin
  select id into ev from public.events where slug = 'p3-rls-event';
  begin
    update public.events set questions = '[{"id":"a","label":"A","type":"file","required":true}]' where id = ev;
    assert false, 'invalid questions stored on an event';
  exception when check_violation then null; end;
  begin
    update public.events set token_prefix = 'bad prefix!' where id = ev;
    assert false, 'bad token_prefix accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code)
      values (ev, '00000000-0000-0000-0000-0000000000e3', 'waitlisted', 'DDDDDDDDDDDDDDDDDDDDDDDDDD');
    assert false, 'waitlisted row without a position accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code)
      values (ev, '00000000-0000-0000-0000-0000000000e3', 'confirmed', 'DDDDDDDDDDDDDDDDDDDDDDDDDD');
    assert false, 'confirmed row without a token accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, token_number)
      values (ev, '00000000-0000-0000-0000-0000000000e3', 'confirmed', 'lowercase-not-base32-00000', 7);
    assert false, 'malformed ticket code accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, token_number)
      values (ev, '00000000-0000-0000-0000-0000000000e1', 'confirmed', 'EEEEEEEEEEEEEEEEEEEEEEEEEE', 9);
    assert false, 'second registration for the same user and event accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, token_number)
      values (ev, '00000000-0000-0000-0000-0000000000e3', 'confirmed', 'FFFFFFFFFFFFFFFFFFFFFFFFFF', 1);
    assert false, 'duplicate token number accepted';
  exception when unique_violation then null; end;
end $$;

-- owner e1: own row only, no direct writes, attendee view, seat counts, profile_private still private
do $$ declare n int; ev uuid; draft uuid; begin
  select id into ev from public.events where slug = 'p3-rls-event';
  select id into draft from public.events where slug = 'p3-rls-draft';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
  set local role authenticated;

  select count(*) into n from public.registrations;
  assert n = 1, 'owner should see exactly their own registration, saw ' || n;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, token_number)
      values (ev, '00000000-0000-0000-0000-0000000000e1', 'confirmed', 'GGGGGGGGGGGGGGGGGGGGGGGGGG', 5);
    assert false, 'user inserted a registration directly';
  exception when insufficient_privilege then null; end;
  begin
    update public.registrations set status = 'cancelled' where user_id = '00000000-0000-0000-0000-0000000000e1';
    assert false, 'user updated a registration directly';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.registrations where user_id = '00000000-0000-0000-0000-0000000000e1';
    assert false, 'user deleted a registration directly';
  exception when insufficient_privilege then null; end;

  select count(*) into n from public.event_attendees where event_id = ev;
  assert n = 1, 'attendee list should show 1 confirmed registrant, got ' || n;
  assert (select handle from public.event_attendees where event_id = ev)
         = (select handle from public.profiles where id = '00000000-0000-0000-0000-0000000000e1'),
    'attendee list shows the wrong person';
  select count(*) into n from public.event_attendees where event_id = draft;
  assert n = 0, 'attendees of a draft event leaked';

  assert (select seats_taken from public.event_seat_counts where event_id = ev) = 1, 'seats_taken should be 1';
  assert (select waitlisted from public.event_seat_counts where event_id = ev) = 1, 'waitlisted should be 1';
  select count(*) into n from public.event_seat_counts where event_id = draft;
  assert n = 0, 'seat counts of a draft event leaked';

  select count(*) into n from public.profile_private where user_id <> '00000000-0000-0000-0000-0000000000e1';
  assert n = 0, 'profile_private of other users leaked';
  reset role;
end $$;

-- e2 sees both own rows (including the draft event's), nothing of e1
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.registrations;
  assert n = 2, 'e2 should see their 2 registrations, saw ' || n;
  select count(*) into n from public.registrations where user_id = '00000000-0000-0000-0000-0000000000e1';
  assert n = 0, 'e2 read e1''s registration';
  reset role;
end $$;

-- society admins: CS admin sees nothing of RAS; RAS admin sees all RAS rows and can still update events
-- (proves the events CHECK constraint's function is executable by `authenticated`)
do $$ declare n int; draft uuid; begin
  select id into draft from public.events where slug = 'p3-rls-draft';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.registrations;
  assert n = 0, 'CS admin read RAS registrations: ' || n;
  reset role;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.registrations;
  assert n = 3, 'RAS admin should read all 3 RAS registrations, saw ' || n;
  select count(*) into n from public.event_attendees where event_id = draft;
  assert n = 1, 'RAS admin should see attendees of own draft event';
  update public.events set summary = 'checked' where slug = 'p3-rls-event';
  get diagnostics n = row_count;
  assert n = 1, 'RAS admin could not update an event (questions CHECK not executable?)';
  begin
    update public.registrations set status = 'cancelled';
    assert false, 'society admin updated registrations directly (Phase 5 adds an RPC for that)';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- a signed-in role without a user id sees no attendees (defence in depth)
do $$ declare n int; begin
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.event_attendees;
  assert n = 0, 'attendees visible without a user id';
  reset role;
end $$;

-- anonymous visitors: no registrations, no attendees, but seat counts work
do $$ declare n int; ev uuid; begin
  select id into ev from public.events where slug = 'p3-rls-event';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform 1 from public.registrations;
    assert false, 'anon read registrations';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.event_attendees;
    assert false, 'anon read the attendee list';
  exception when insufficient_privilege then null; end;
  select seats_taken into n from public.event_seat_counts where event_id = ev;
  assert n = 1, 'anon seat count wrong: ' || coalesce(n::text, 'null');
  begin
    perform 1 from public.profile_private;
    assert false, 'anon read profile_private';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

rollback;
select 'registrations-rls: all assertions passed' as result;
```

- [ ] **Step 4: Apply, rename, verify**

1. MCP `apply_migration` with name `registrations` and the SQL from Step 2. Expected: success.
2. MCP `list_migrations`; rename the file to the reported version, e.g. `git mv supabase/migrations/20261006000001_registrations.sql supabase/migrations/<version>_registrations.sql`.
3. Run the whole of `supabase/tests/registrations-rls.sql` as one MCP `execute_sql` call. Expected: one row `registrations-rls: all assertions passed`.
4. Re-run `supabase/tests/profiles-rls.sql` and `supabase/tests/security-hardening.sql` the same way. Expected: their pass rows.
5. MCP `get_advisors` (type `security`): no new `ERROR` level findings (in particular no `security_definer_view`).
6. MCP `generate_typescript_types` → overwrite `lib/supabase/database.types.ts`.

- [ ] **Step 5: Extend the anonymous RLS test**

Append these cases inside the `describe.skipIf(!live)(…)` block of `tests/rls/public-access.test.ts`:

```ts
  it("cannot read registrations or the attendee list", async () => {
    const regs = await db.from("registrations").select("id").limit(1);
    expect(regs.error?.code).toBe("42501"); // permission denied: anon has no grant at all
    const att = await db.from("event_attendees").select("handle").limit(1);
    expect(att.error?.code).toBe("42501");
  });

  it("can read seat counts (numbers only)", async () => {
    const { data, error } = await db.from("event_seat_counts").select("event_id, seats_taken, waitlisted").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(typeof data![0].seats_taken).toBe("number");
    expect(typeof data![0].waitlisted).toBe("number");
  });
```

Run: `npx vitest run tests/rls` → PASS (needs `.env.local`). Then the full gate: `npx vitest run && npx tsc --noEmit && npx eslint .` → all green.

- [ ] **Step 6: Commit**

```bash
git add supabase lib/supabase/database.types.ts tests/rls/public-access.test.ts
git commit -m "feat(db): registrations table, attendee and seat-count views

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Registration RPCs (capacity, waitlist, cancel)

**Files:**
- Create: `supabase/migrations/20261006000002_registration_rpcs.sql` (renamed in Step 3), `supabase/tests/registrations-rpc.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated), `tests/rls/public-access.test.ts`

**Interfaces:**
- Consumes: Task 1 objects.
- Produces (callable by `authenticated` only):
  - `public.register_for_event(p_event_id uuid, p_answers jsonb default '{}') returns jsonb` → `{"registration_id": uuid, "status": "confirmed"|"waitlisted", "waitlist_position": int|null}`. Raises (SQLSTATE `P0001`, message is the code): `not_signed_in`, `not_onboarded`, `event_not_found`, `paid_event`, `not_open_yet`, `registration_closed`, `invalid_answers`, `already_registered`.
  - `public.cancel_registration(p_registration_id uuid) returns jsonb` → `{"registration_id": uuid, "event_id": uuid, "promoted": int}`. Raises: `not_signed_in`, `registration_not_found`, `not_cancellable`, `paid_cancel_not_supported`, `event_started`.
  - Private (no API grants): `private.new_ticket_code() returns text`, `private.seats_taken(uuid) returns int`, `private.validate_answers(jsonb, jsonb) returns boolean`, `private.compact_waitlist(uuid)`, `private.promote_waitlist(uuid) returns setof uuid` (caller must hold the event row lock; returns promoted registration ids — the Phase 4 email seam).
- Rules: registration window is open when `(registration_opens_at is null or now() >= registration_opens_at)` **and** `now() < least(coalesce(registration_closes_at, starts_at), starts_at)`. Token numbers are `max(token_number)+1` per event and never reused (a returning user keeps their old one). Waitlist positions are dense `1..n` in join order.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261006000002_registration_rpcs.sql`:

```sql
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
  select e.capacity, e.price_paise into cap, price from public.events e where e.id = p_event_id;
  if price > 0 then
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
from public, anon, authenticated;
revoke execute on function public.register_for_event(uuid, jsonb), public.cancel_registration(uuid) from public, anon;
grant execute on function public.register_for_event(uuid, jsonb), public.cancel_registration(uuid) to authenticated;
```

- [ ] **Step 2: Write the assertion script**

Create `supabase/tests/registrations-rpc.sql`:

```sql
-- Phase 3 Task 2: register_for_event / cancel_registration. Run as ONE execute_sql call; rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'p3-f1@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay One"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'p3-f2@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Two"}'),
  ('00000000-0000-0000-0000-0000000000f3', 'p3-f3@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Three"}'),
  ('00000000-0000-0000-0000-0000000000f4', 'p3-f4@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Four"}'),
  ('00000000-0000-0000-0000-0000000000f5', 'p3-f5@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Five"}'),
  ('00000000-0000-0000-0000-0000000000f6', 'p3-f6@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Six"}'),
  ('00000000-0000-0000-0000-0000000000f7', 'p3-f7@test.local', 'authenticated', 'authenticated', '{"full_name":"Fay Seven"}');
-- f1..f6 finish onboarding; f7 does not
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3',
               '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f6');

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix,
                           questions, price_paise, registration_opens_at, registration_closes_at)
select s.id, v.step, v.slug, v.slug, now() + v.starts, now() + v.starts + interval '6 hours', v.status::public.event_status,
       v.capacity, 'RAS-' || v.step, v.questions::jsonb, v.price, now() + v.opens, now() + v.closes
from public.societies s,
  (values
    (92, 'p3-cap',    interval '10 days', 'published', 3,
       '[{"id":"laptop","label":"Laptop?","type":"single_choice","options":["Yes","No"],"required":true},{"id":"note","label":"Note","type":"text","required":false}]',
       0, null::interval, null::interval),
    (93, 'p3-past',   interval '-1 day',  'published', 10, '[]', 0,    null, null),
    (94, 'p3-window', interval '10 days', 'published', 10, '[]', 0,    null, interval '-1 hour'),
    (95, 'p3-soon',   interval '10 days', 'published', 10, '[]', 0,    interval '1 day', null),
    (96, 'p3-draft',  interval '10 days', 'draft',     10, '[]', 0,    null, null),
    (97, 'p3-paid',   interval '10 days', 'published', 10, '[]', 9900, null, null)
  ) as v(step, slug, starts, status, capacity, questions, price, opens, closes)
where s.slug = 'ras';

-- pure helpers
do $$
declare
  q constant jsonb := '[{"id":"fw","label":"F","type":"multi_choice","options":["A","B","C"],"required":true},{"id":"ok","label":"OK","type":"checkbox","required":true},{"id":"bio","label":"Bio","type":"textarea","required":false}]';
begin
  assert private.validate_answers(q, '{"fw":["A","C"],"ok":true}'), 'valid multi/checkbox answers rejected';
  assert private.validate_answers(q, '{"fw":["B"],"ok":true,"bio":""}'), 'empty optional textarea rejected';
  assert not private.validate_answers(q, '{"fw":[],"ok":true}'), 'empty required multi accepted';
  assert not private.validate_answers(q, '{"fw":["A","A"],"ok":true}'), 'duplicate choices accepted';
  assert not private.validate_answers(q, '{"fw":["D"],"ok":true}'), 'unknown choice accepted';
  assert not private.validate_answers(q, '{"fw":["A"],"ok":false}'), 'unticked required checkbox accepted';
  assert not private.validate_answers(q, '{"fw":["A"],"ok":"true"}'), 'string checkbox accepted';
  assert not private.validate_answers(q, jsonb_build_object('fw', jsonb_build_array('A'), 'ok', true, 'bio', repeat('x', 2001))),
    'over-long textarea accepted';
  assert private.validate_answers('[]', '{}'), 'empty questions with empty answers rejected';
  assert not private.validate_answers('[]', '[]'), 'array answers accepted';
  assert private.new_ticket_code() ~ '^[A-Z2-7]{26}$', 'ticket code is not 26-char base32';
  assert private.new_ticket_code() <> private.new_ticket_code(), 'ticket codes repeat';
end $$;

-- sequential saturation: capacity 3, five sign-ups → 3 confirmed (tokens 1..3) + waitlist #1, #2
do $$
declare
  cap uuid;
  r jsonb;
  n int;
  ans constant jsonb := '{"laptop":"Yes","note":""}';
begin
  select id into cap from public.events where slug = 'p3-cap';
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
  r := public.register_for_event(cap, ans);
  assert r->>'status' = 'confirmed', 'f1: ' || r::text;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
  r := public.register_for_event(cap, '{"laptop":"No"}');
  assert r->>'status' = 'confirmed', 'f2: ' || r::text;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
  r := public.register_for_event(cap, '{"laptop":"Yes"}');
  assert r->>'status' = 'confirmed', 'f3: ' || r::text;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true);
  r := public.register_for_event(cap, '{"laptop":"Yes"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 1, 'f4: ' || r::text;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f5","role":"authenticated"}', true);
  r := public.register_for_event(cap, '{"laptop":"No"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 2, 'f5: ' || r::text;
  reset role;

  select count(*) into n from public.registrations where event_id = cap and status = 'confirmed';
  assert n = 3, 'confirmed count should equal capacity (3), got ' || n;
  assert (select array_agg(token_number order by token_number) from public.registrations
          where event_id = cap and status = 'confirmed') = array[1, 2, 3], 'tokens are not 1..3';
  assert (select count(distinct ticket_code) from public.registrations where event_id = cap) = 5, 'ticket codes not unique';
  assert not exists (select 1 from public.registrations where event_id = cap and ticket_code !~ '^[A-Z2-7]{26}$'),
    'ticket code shape';
  assert (select answers from public.registrations where event_id = cap and user_id = '00000000-0000-0000-0000-0000000000f1') = ans,
    'answers not stored';
  assert (select seats_taken from public.event_seat_counts where event_id = cap) = 3, 'seat count view wrong';
  assert (select waitlisted from public.event_seat_counts where event_id = cap) = 2, 'waitlist count view wrong';
end $$;

-- rejections
do $$
declare
  cap uuid; past uuid; win uuid; soon uuid; draft uuid; paid uuid;
  n int;
begin
  select id into cap   from public.events where slug = 'p3-cap';
  select id into past  from public.events where slug = 'p3-past';
  select id into win   from public.events where slug = 'p3-window';
  select id into soon  from public.events where slug = 'p3-soon';
  select id into draft from public.events where slug = 'p3-draft';
  select id into paid  from public.events where slug = 'p3-paid';
  set local role authenticated;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes"}');
    assert false, 'duplicate registration accepted';
  exception when others then if sqlerrm <> 'already_registered' then raise; end if; end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes"}');
    assert false, 'waitlisted user registered twice';
  exception when others then if sqlerrm <> 'already_registered' then raise; end if; end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f6","role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{}');
    assert false, 'missing required answer accepted';
  exception when others then if sqlerrm <> 'invalid_answers' then raise; end if; end;
  begin
    perform public.register_for_event(cap, '{"laptop":"Maybe"}');
    assert false, 'unknown option accepted';
  exception when others then if sqlerrm <> 'invalid_answers' then raise; end if; end;
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes","extra":"x"}');
    assert false, 'answer to an unknown question accepted';
  exception when others then if sqlerrm <> 'invalid_answers' then raise; end if; end;
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes","note":5}');
    assert false, 'non-string text answer accepted';
  exception when others then if sqlerrm <> 'invalid_answers' then raise; end if; end;
  begin
    perform public.register_for_event(past, '{}');
    assert false, 'registration for a started event accepted';
  exception when others then if sqlerrm <> 'registration_closed' then raise; end if; end;
  begin
    perform public.register_for_event(win, '{}');
    assert false, 'registration after the closing time accepted';
  exception when others then if sqlerrm <> 'registration_closed' then raise; end if; end;
  begin
    perform public.register_for_event(soon, '{}');
    assert false, 'registration before the opening time accepted';
  exception when others then if sqlerrm <> 'not_open_yet' then raise; end if; end;
  begin
    perform public.register_for_event(draft, '{}');
    assert false, 'registration for a draft event accepted';
  exception when others then if sqlerrm <> 'event_not_found' then raise; end if; end;
  begin
    perform public.register_for_event(paid, '{}');
    assert false, 'paid event accepted on the free path';
  exception when others then if sqlerrm <> 'paid_event' then raise; end if; end;
  begin
    perform public.register_for_event(gen_random_uuid(), '{}');
    assert false, 'unknown event accepted';
  exception when others then if sqlerrm <> 'event_not_found' then raise; end if; end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f7","role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes"}');
    assert false, 'user without onboarding registered';
  exception when others then if sqlerrm <> 'not_onboarded' then raise; end if; end;

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform public.register_for_event(cap, '{"laptop":"Yes"}');
    assert false, 'registration without a user id accepted';
  exception when others then if sqlerrm <> 'not_signed_in' then raise; end if; end;
  reset role;

  select count(*) into n from public.registrations where event_id in (past, win, soon, draft, paid);
  assert n = 0, 'a rejected registration left a row';
  select count(*) into n from public.registrations where user_id in ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f7');
  assert n = 0, 'rejected users have rows';

  assert not has_function_privilege('anon', 'public.register_for_event(uuid, jsonb)', 'execute'), 'anon can execute register_for_event';
  assert not has_function_privilege('anon', 'public.cancel_registration(uuid)', 'execute'), 'anon can execute cancel_registration';
  assert has_function_privilege('authenticated', 'public.register_for_event(uuid, jsonb)', 'execute'), 'authenticated cannot register';
  assert has_function_privilege('authenticated', 'public.cancel_registration(uuid)', 'execute'), 'authenticated cannot cancel';
  assert not has_function_privilege('authenticated', 'private.promote_waitlist(uuid)', 'execute'), 'promote_waitlist is callable';
  assert not has_function_privilege('authenticated', 'private.compact_waitlist(uuid)', 'execute'), 'compact_waitlist is callable';
  assert not has_function_privilege('authenticated', 'private.seats_taken(uuid)', 'execute'), 'seats_taken is callable';
  assert not has_function_privilege('authenticated', 'private.validate_answers(jsonb, jsonb)', 'execute'), 'validate_answers is callable';
  assert not has_function_privilege('authenticated', 'private.new_ticket_code()', 'execute'), 'new_ticket_code is callable';
end $$;

-- anon cannot even call the RPC
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.register_for_event(gen_random_uuid(), '{}');
    assert false, 'anon executed register_for_event';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- cancel rules and waitlist promotion order
do $$
declare
  cap uuid; past uuid;
  f1 constant uuid := '00000000-0000-0000-0000-0000000000f1';
  f2 constant uuid := '00000000-0000-0000-0000-0000000000f2';
  f3 constant uuid := '00000000-0000-0000-0000-0000000000f3';
  f4 constant uuid := '00000000-0000-0000-0000-0000000000f4';
  f5 constant uuid := '00000000-0000-0000-0000-0000000000f5';
  f6 constant uuid := '00000000-0000-0000-0000-0000000000f6';
  reg_f1 uuid; reg_f2 uuid; reg_f3 uuid; reg_f5 uuid; reg_past uuid;
  old_code text;
  r jsonb;
begin
  select id into cap  from public.events where slug = 'p3-cap';
  select id into past from public.events where slug = 'p3-past';
  select id into reg_f1 from public.registrations where event_id = cap and user_id = f1;
  select id into reg_f2 from public.registrations where event_id = cap and user_id = f2;
  select id into reg_f3 from public.registrations where event_id = cap and user_id = f3;
  select id into reg_f5 from public.registrations where event_id = cap and user_id = f5;

  -- f2 cancels a confirmed seat → f4 (#1) is promoted, f5 moves up to #1
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  r := public.cancel_registration(reg_f2);
  assert (r->>'promoted')::int = 1, 'cancelling a confirmed seat did not promote: ' || r::text;
  assert (select status from public.registrations where id = reg_f2) = 'cancelled', 'f2 not cancelled';
  begin
    perform public.cancel_registration(reg_f2);
    assert false, 'a registration was cancelled twice';
  exception when others then if sqlerrm <> 'not_cancellable' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  begin
    perform public.cancel_registration(reg_f3);
    assert false, 'cancelled someone else''s registration';
  exception when others then if sqlerrm <> 'registration_not_found' then raise; end if; end;
  reset role;

  assert (select status from public.registrations where event_id = cap and user_id = f4) = 'confirmed', 'f4 (#1) not promoted';
  assert (select token_number from public.registrations where event_id = cap and user_id = f4) = 4,
    'promoted seat should get the next token (4); tokens are never reused';
  assert (select waitlist_position from public.registrations where event_id = cap and user_id = f4) is null, 'promoted row kept a position';
  assert (select waitlist_position from public.registrations where event_id = cap and user_id = f5) = 1, 'f5 should move up to #1';
  assert (select count(*) from public.registrations where event_id = cap and status = 'confirmed') = 3, 'capacity broken after promotion';

  -- f5 leaves the waitlist (no promotion); f6 joins at #1; f2 re-registers at #2 with a fresh ticket code
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f5, 'role', 'authenticated')::text, true);
  r := public.cancel_registration(reg_f5);
  assert (r->>'promoted')::int = 0, 'leaving the waitlist promoted someone: ' || r::text;
  perform set_config('request.jwt.claims', json_build_object('sub', f6, 'role', 'authenticated')::text, true);
  r := public.register_for_event(cap, '{"laptop":"Yes"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 1, 'f6: ' || r::text;
  reset role;
  select ticket_code into old_code from public.registrations where id = reg_f2;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f2, 'role', 'authenticated')::text, true);
  r := public.register_for_event(cap, '{"laptop":"No"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 2, 'f2 re-register: ' || r::text;
  assert (r->>'registration_id')::uuid = reg_f2, 're-registration should reuse the cancelled row';

  -- f3 cancels → f6 (#1) is promoted before f2 (#2)
  perform set_config('request.jwt.claims', json_build_object('sub', f3, 'role', 'authenticated')::text, true);
  r := public.cancel_registration(reg_f3);
  assert (r->>'promoted')::int = 1, 'f3 cancel did not promote: ' || r::text;
  reset role;
  assert (select status from public.registrations where event_id = cap and user_id = f6) = 'confirmed',
    'waitlist order not respected: f6 (#1) should be promoted first';
  assert (select token_number from public.registrations where event_id = cap and user_id = f6) = 5, 'f6 should get token 5';
  assert (select status from public.registrations where id = reg_f2) = 'waitlisted', 'f2 should still be waiting';
  assert (select waitlist_position from public.registrations where id = reg_f2) = 1, 'f2 should now be #1';
  assert (select ticket_code from public.registrations where id = reg_f2) <> old_code, 're-registration kept the old ticket code';

  -- capacity raised by an admin: the next sign-up first promotes the waitlist head (f2 keeps token 2), then queues
  update public.events set capacity = 4 where id = cap;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f5, 'role', 'authenticated')::text, true);
  r := public.register_for_event(cap, '{"laptop":"Yes"}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 1, 'f5 after capacity raise: ' || r::text;
  reset role;
  assert (select status from public.registrations where id = reg_f2) = 'confirmed', 'waiting f2 not promoted before a newcomer';
  assert (select token_number from public.registrations where id = reg_f2) = 2, 'returning f2 should keep token 2';
  assert (select count(*) from public.registrations where event_id = cap and status = 'confirmed') = 4, 'capacity 4 not filled exactly';

  -- started event and checked-in ticket cannot be cancelled
  insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
    values (past, f1, 'confirmed', 'PPPPPPPPPPPPPPPPPPPPPPPPPP', 1, now())
    returning id into reg_past;
  update public.registrations set checked_in_at = now() where id = reg_f1;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', f1, 'role', 'authenticated')::text, true);
  begin
    perform public.cancel_registration(reg_past);
    assert false, 'cancelled after the event started';
  exception when others then if sqlerrm <> 'event_started' then raise; end if; end;
  begin
    perform public.cancel_registration(reg_f1);
    assert false, 'cancelled a checked-in ticket';
  exception when others then if sqlerrm <> 'not_cancellable' then raise; end if; end;
  reset role;

  -- deferred uniqueness (waitlist positions) holds at commit time
  set constraints all immediate;
  assert not exists (select 1 from public.events e
                     where e.slug like 'p3-%'
                       and (select count(*) from public.registrations x where x.event_id = e.id and x.status = 'confirmed') > e.capacity),
    'an event is over capacity';
end $$;

rollback;
select 'registrations-rpc: all assertions passed' as result;
```

- [ ] **Step 3: Apply, rename, verify**

1. MCP `apply_migration` name `registration_rpcs` with the Step 1 SQL. Expected: success.
2. `list_migrations` → `git mv` the file to its assigned version.
3. Run `supabase/tests/registrations-rpc.sql` (one `execute_sql` call) → `registrations-rpc: all assertions passed`. Re-run `supabase/tests/registrations-rls.sql` → pass.
4. `get_advisors` (security): the only new findings allowed are WARN `authenticated_security_definer_function_executable` for `register_for_event` / `cancel_registration` (intentional: they are the write API). Nothing for `anon`.
5. `generate_typescript_types` → `lib/supabase/database.types.ts`.

- [ ] **Step 4: Anonymous RPC test**

Append to the `describe.skipIf(!live)` block in `tests/rls/public-access.test.ts`:

```ts
  it("cannot call the registration RPCs", async () => {
    const reg = await db.rpc("register_for_event", { p_event_id: crypto.randomUUID(), p_answers: {} });
    expect(reg.error).not.toBeNull();
    // 42501 = permission denied; PGRST202 = PostgREST hides functions the role cannot execute. Both mean "not executed".
    expect(["42501", "PGRST202"]).toContain(reg.error!.code);
    const cancel = await db.rpc("cancel_registration", { p_registration_id: crypto.randomUUID() });
    expect(cancel.error).not.toBeNull();
    expect(["42501", "PGRST202"]).toContain(cancel.error!.code);
  });
```

Run the gate: `npx vitest run && npx tsc --noEmit && npx eslint .` → green.

- [ ] **Step 5: Commit**

```bash
git add supabase lib/supabase/database.types.ts tests/rls/public-access.test.ts
git commit -m "feat(db): register and cancel RPCs with capacity lock and waitlist promotion

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Registration form schemas, typed errors, external-form helpers

**Files:**
- Create: `lib/registration/types.ts`, `lib/registration/questions.ts`, `lib/registration/schema.ts`, `lib/registration/errors.ts`, `lib/registration/external.ts`
- Test: `tests/registration/questions.test.ts`, `tests/registration/schema.test.ts`, `tests/registration/errors.test.ts`, `tests/registration/external.test.ts`

**Interfaces:**
- Consumes: `OnboardingSchema` from `lib/profile/schema.ts`; `Settings` from `lib/site/schema.ts`.
- Produces:
  - `types.ts`: `REGISTRATION_STATUSES`, `type RegistrationStatus`, `ACTIVE_STATUSES` (`pending_payment|confirmed|waitlisted`), `type ActiveStatus`, `isActiveStatus(s): s is ActiveStatus`, `interface MyRegistration { id: string; status: RegistrationStatus; waitlistPosition: number | null }`, `interface Attendee { handle: string; fullName: string; avatarUrl: string | undefined; headline: string }`
  - `questions.ts`: `QuestionSchema`, `QuestionsSchema`, `type Question`, `type AnswerValue = string | string[] | boolean`, `type Answers = Record<string, AnswerValue>`, `TEXT_MAX = 500`, `TEXTAREA_MAX = 2000`, `parseQuestions(raw: unknown): Question[]`, `emptyAnswers(qs): Answers`, `answersSchema(qs)`
  - `schema.ts`: `PHONE_RE`, `RegistrantSchema`, `interface Registrant { fullName; college; branch; year; phone; ieeeMemberId }` (all `string`), `registrationSchema(qs)` (shape `{ registrant, answers }`), `fieldIdFor(path): string`, `registrationFieldErrors(error): Record<string, string>` (keys `fullName`…, `q-<questionId>`, `form`)
  - `errors.ts`: `REGISTRATION_ERROR_CODES`, `type RegistrationErrorCode`, `type Recovery = "retry" | "sign_in" | "onboarding" | "tickets" | "event" | "fix_fields"`, `interface RegistrationError { code; message; recovery }`, `registrationError(code)`, `errorFromDb(err)`
  - `external.ts`: `safeFormUrl(raw: string): string | null`, `externalRegistrationUrl(reg: Settings["registration"]): string | null`, `fallbackFormUrl(reg): string | null`

- [ ] **Step 1: Write the failing tests**

`tests/registration/questions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { answersSchema, emptyAnswers, parseQuestions, QuestionsSchema, type Question } from "@/lib/registration/questions";

const QS: Question[] = [
  { id: "laptop", label: "Will you bring a laptop?", type: "single_choice", options: ["Yes", "No"], required: true },
  { id: "goal", label: "Goal", help: "Optional", type: "textarea", required: false },
  { id: "nick", label: "Nickname", type: "text", required: false },
  { id: "fw", label: "Frameworks", type: "multi_choice", options: ["PyTorch", "JAX", "Keras"], required: true },
  { id: "agree", label: "I agree", type: "checkbox", required: true },
];
const ok = { laptop: "Yes", goal: "", nick: "", fw: ["PyTorch"], agree: true };

describe("QuestionsSchema", () => {
  it("accepts a valid list", () => expect(QuestionsSchema.safeParse(QS).success).toBe(true));
  it("rejects duplicate ids", () =>
    expect(QuestionsSchema.safeParse([QS[1], { ...QS[2], id: "goal" }]).success).toBe(false));
  it("rejects a choice with one option", () =>
    expect(QuestionsSchema.safeParse([{ ...QS[0], options: ["Yes"] }]).success).toBe(false));
  it("rejects duplicate options", () =>
    expect(QuestionsSchema.safeParse([{ ...QS[0], options: ["Yes", "Yes"] }]).success).toBe(false));
  it("rejects unknown types, extra keys and bad ids", () => {
    expect(QuestionsSchema.safeParse([{ id: "f", label: "F", type: "file", required: true }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([{ ...QS[2], extra: 1 }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([{ ...QS[2], id: "Bad id" }]).success).toBe(false);
    expect(QuestionsSchema.safeParse([{ ...QS[2], options: ["a", "b"] }]).success).toBe(false);
  });
  it("parseQuestions treats null as no questions and throws on garbage", () => {
    expect(parseQuestions(null)).toEqual([]);
    expect(() => parseQuestions({})).toThrow();
  });
});

describe("answersSchema", () => {
  const s = answersSchema(QS);
  it("accepts complete answers", () => expect(s.safeParse(ok).success).toBe(true));
  it("requires required answers", () => {
    expect(s.safeParse({ ...ok, laptop: "" }).success).toBe(false);
    expect(s.safeParse({ ...ok, fw: [] }).success).toBe(false);
    expect(s.safeParse({ ...ok, agree: false }).success).toBe(false);
  });
  it("rejects options that do not exist and duplicates", () => {
    expect(s.safeParse({ ...ok, laptop: "Maybe" }).success).toBe(false);
    expect(s.safeParse({ ...ok, fw: ["Rust"] }).success).toBe(false);
    expect(s.safeParse({ ...ok, fw: ["JAX", "JAX"] }).success).toBe(false);
  });
  it("caps text lengths", () => {
    expect(s.safeParse({ ...ok, nick: "x".repeat(501) }).success).toBe(false);
    expect(s.safeParse({ ...ok, goal: "x".repeat(2001) }).success).toBe(false);
    expect(s.safeParse({ ...ok, goal: "x".repeat(2000) }).success).toBe(true);
  });
  it("rejects answers to unknown questions", () => expect(s.safeParse({ ...ok, extra: "x" }).success).toBe(false));
  it("required text must not be blank", () => {
    const t = answersSchema([{ id: "why", label: "Why", type: "text", required: true }]);
    expect(t.safeParse({ why: "   " }).success).toBe(false);
    expect(t.safeParse({ why: " ok " }).data).toEqual({ why: "ok" });
  });
});

describe("emptyAnswers", () => {
  it("starts every question blank", () =>
    expect(emptyAnswers(QS)).toEqual({ laptop: "", goal: "", nick: "", fw: [], agree: false }));
});
```

`tests/registration/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fieldIdFor, registrationFieldErrors, registrationSchema, type Registrant } from "@/lib/registration/schema";
import type { Question } from "@/lib/registration/questions";

const QS: Question[] = [{ id: "laptop", label: "Laptop?", type: "single_choice", options: ["Yes", "No"], required: true }];
const me: Registrant = {
  fullName: "Ada Lovelace", college: "CEK", branch: "Civil", year: "1st year", phone: "9876543210", ieeeMemberId: "",
};

describe("registrationSchema", () => {
  const s = registrationSchema(QS);
  it("accepts a complete registration", () =>
    expect(s.safeParse({ registrant: me, answers: { laptop: "Yes" } }).success).toBe(true));
  it("requires a phone number and validates the IEEE id", () => {
    expect(s.safeParse({ registrant: { ...me, phone: "" }, answers: { laptop: "Yes" } }).success).toBe(false);
    expect(s.safeParse({ registrant: { ...me, ieeeMemberId: "123" }, answers: { laptop: "Yes" } }).success).toBe(false);
    expect(s.safeParse({ registrant: { ...me, ieeeMemberId: "12345678" }, answers: { laptop: "Yes" } }).success).toBe(true);
  });
  it("only accepts listed branches and years", () =>
    expect(s.safeParse({ registrant: { ...me, branch: "Astrology" }, answers: { laptop: "Yes" } }).success).toBe(false));
});

describe("field ids", () => {
  it("maps schema paths to form element ids", () => {
    expect(fieldIdFor(["registrant", "phone"])).toBe("phone");
    expect(fieldIdFor(["answers", "laptop"])).toBe("q-laptop");
    expect(fieldIdFor(["answers"])).toBe("form");
    expect(fieldIdFor([])).toBe("form");
  });
  it("collects the first message per field", () => {
    const r = registrationSchema(QS).safeParse({ registrant: { ...me, phone: "1" }, answers: {} });
    expect(r.success).toBe(false);
    const errs = registrationFieldErrors(r.error!);
    expect(errs.phone).toBe("Use a 10-digit Indian mobile number.");
    expect(errs["q-laptop"]).toBeTruthy();
  });
});
```

`tests/registration/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { errorFromDb, REGISTRATION_ERROR_CODES, registrationError } from "@/lib/registration/errors";

describe("errorFromDb", () => {
  it("maps RPC error codes raised as messages", () => {
    expect(errorFromDb({ message: "already_registered", code: "P0001" })).toMatchObject({ code: "already_registered", recovery: "tickets" });
    expect(errorFromDb({ message: "registration_closed", code: "P0001" })).toMatchObject({ code: "registration_closed", recovery: "event" });
    expect(errorFromDb({ message: "not_onboarded" }).recovery).toBe("onboarding");
  });
  it("maps unique violations and permission errors", () => {
    expect(errorFromDb({ code: "23505", message: "duplicate key value" }).code).toBe("already_registered");
    expect(errorFromDb({ code: "42501", message: "permission denied for function register_for_event" }).code).toBe("not_signed_in");
  });
  it("falls back to unknown", () => {
    expect(errorFromDb({ message: "boom" }).code).toBe("unknown");
    expect(errorFromDb(null).code).toBe("unknown");
  });
});

describe("registrationError", () => {
  it("has copy and a recovery for every code", () => {
    for (const c of REGISTRATION_ERROR_CODES) {
      const e = registrationError(c);
      expect(e.message.length).toBeGreaterThan(10);
      expect(e.recovery).toBeTruthy();
    }
  });
});
```

`tests/registration/external.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { externalRegistrationUrl, fallbackFormUrl, safeFormUrl } from "@/lib/registration/external";

describe("safeFormUrl", () => {
  it("keeps https links", () => expect(safeFormUrl("https://forms.gle/abc123")).toBe("https://forms.gle/abc123"));
  it("drops placeholders, http, scripts, credentials and junk", () => {
    expect(safeFormUrl("https://forms.gle/your-form-id")).toBeNull();
    expect(safeFormUrl("http://forms.gle/abc123")).toBeNull();
    expect(safeFormUrl("javascript:alert(1)")).toBeNull();
    expect(safeFormUrl("https://user:pw@evil.example/x")).toBeNull();
    expect(safeFormUrl("")).toBeNull();
  });
});

describe("externalRegistrationUrl", () => {
  const reg = { mode: "external" as const, googleFormUrl: "https://forms.gle/abc123", endpoint: "" };
  it("is the form URL only in external mode", () => {
    expect(externalRegistrationUrl(reg)).toBe("https://forms.gle/abc123");
    expect(externalRegistrationUrl({ ...reg, mode: "onsite" })).toBeNull();
    expect(externalRegistrationUrl({ ...reg, googleFormUrl: "https://forms.gle/your-form-id" })).toBeNull();
  });
  it("fallbackFormUrl ignores the mode", () =>
    expect(fallbackFormUrl({ ...reg, mode: "onsite" })).toBe("https://forms.gle/abc123"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/registration` → FAIL (modules not found).

- [ ] **Step 3: Implement**

`lib/registration/types.ts`:

```ts
export const REGISTRATION_STATUSES = [
  "pending_payment", "confirmed", "waitlisted", "cancelled", "refunded", "refund_needed",
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/** Statuses that hold (or wait for) a seat. Cancelled/refunded rows behave as "not registered". */
export const ACTIVE_STATUSES = ["pending_payment", "confirmed", "waitlisted"] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export function isActiveStatus(s: RegistrationStatus): s is ActiveStatus {
  return (ACTIVE_STATUSES as readonly string[]).includes(s);
}

export interface MyRegistration {
  id: string;
  status: RegistrationStatus;
  waitlistPosition: number | null;
}

/** One row of the public.event_attendees view (public profile fields only). */
export interface Attendee {
  handle: string;
  fullName: string;
  avatarUrl: string | undefined;
  headline: string;
}
```

`lib/registration/questions.ts`:

```ts
import { z } from "zod";

// Mirrors private.questions_valid() and private.validate_answers() in the database.
export const TEXT_MAX = 500;
export const TEXTAREA_MAX = 2000;

const unique = (xs: readonly string[]) => new Set(xs).size === xs.length;

const base = {
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Question ids are lowercase letters, digits and _."),
  label: z.string().trim().min(1).max(200),
  help: z.string().max(300).optional(),
  required: z.boolean(),
};
const options = z.array(z.string().trim().min(1).max(100)).min(2).max(20).refine(unique, "Options must be unique.");

export const QuestionSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal("text") }),
  z.strictObject({ ...base, type: z.literal("textarea") }),
  z.strictObject({ ...base, type: z.literal("checkbox") }),
  z.strictObject({ ...base, type: z.literal("single_choice"), options }),
  z.strictObject({ ...base, type: z.literal("multi_choice"), options }),
]);
export const QuestionsSchema = z
  .array(QuestionSchema)
  .max(20)
  .refine((qs) => unique(qs.map((q) => q.id)), "Question ids must be unique.");

export type Question = z.infer<typeof QuestionSchema>;
export type AnswerValue = string | string[] | boolean;
export type Answers = Record<string, AnswerValue>;

/** Questions from `events.questions` (the DB CHECK already validated them); throws if the shape ever drifts. */
export function parseQuestions(raw: unknown): Question[] {
  return QuestionsSchema.parse(raw ?? []);
}

export function emptyAnswers(questions: readonly Question[]): Answers {
  return Object.fromEntries(
    questions.map((q) => [q.id, q.type === "multi_choice" ? [] : q.type === "checkbox" ? false : ""]),
  );
}

function answerSchema(q: Question): z.ZodType<AnswerValue> {
  switch (q.type) {
    case "text":
    case "textarea": {
      const max = q.type === "text" ? TEXT_MAX : TEXTAREA_MAX;
      const s = z.string().trim().max(max, `Keep it under ${max} characters.`);
      return q.required ? s.min(1, "This question is required.") : s;
    }
    case "single_choice": {
      const choice = z.enum(q.options as [string, ...string[]], { message: "Pick one of the options." });
      return q.required ? choice : z.union([z.literal(""), choice]);
    }
    case "multi_choice": {
      const list = z.array(z.enum(q.options as [string, ...string[]], { message: "Pick from the options." }));
      const sized = q.required ? list.min(1, "Pick at least one.") : list;
      return sized.refine(unique, "Pick each option once.");
    }
    case "checkbox":
      return q.required ? z.literal(true, { message: "Please tick this box to continue." }) : z.boolean();
  }
}

/** Exactly one key per question; unknown keys are rejected (as in the database). */
export function answersSchema(questions: readonly Question[]) {
  return z.strictObject(Object.fromEntries(questions.map((q) => [q.id, answerSchema(q)])));
}
```

`lib/registration/schema.ts`:

```ts
import { z } from "zod";
import { OnboardingSchema } from "@/lib/profile/schema";
import { answersSchema, type Answers, type Question } from "./questions";

export const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;

/** Profile fields shown (pre-filled) on the registration form and saved back to the profile. */
export const RegistrantSchema = OnboardingSchema.pick({ fullName: true, college: true, branch: true, year: true }).extend({
  phone: z.string().trim().regex(PHONE_RE, "Use a 10-digit Indian mobile number."),
  ieeeMemberId: z.string().trim().regex(/^$|^\d{8,9}$/, "IEEE membership IDs are 8–9 digits."),
});

export interface Registrant {
  fullName: string;
  college: string;
  branch: string;
  year: string;
  phone: string;
  ieeeMemberId: string;
}

export interface RegistrationValues {
  registrant: Registrant;
  answers: Answers;
}

export function registrationSchema(questions: readonly Question[]) {
  return z.strictObject({ registrant: RegistrantSchema, answers: answersSchema(questions) });
}

/** Form element id for a schema path: registrant fields keep their name, answers become `q-<id>`. */
export function fieldIdFor(path: readonly PropertyKey[]): string {
  if (path[0] === "answers" && typeof path[1] === "string") return `q-${path[1]}`;
  if (path[0] === "registrant" && typeof path[1] === "string") return path[1];
  return "form";
}

/** First message per form field. */
export function registrationFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = fieldIdFor(issue.path);
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
```

`lib/registration/errors.ts`:

```ts
export const REGISTRATION_ERROR_CODES = [
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "invalid_input", "already_registered", "registration_not_found", "not_cancellable",
  "paid_cancel_not_supported", "event_started", "profile_save_failed", "network", "unknown",
] as const;
export type RegistrationErrorCode = (typeof REGISTRATION_ERROR_CODES)[number];

export type Recovery = "retry" | "sign_in" | "onboarding" | "tickets" | "event" | "fix_fields";

export interface RegistrationError {
  code: RegistrationErrorCode;
  message: string;
  recovery: Recovery;
}

const COPY: Record<RegistrationErrorCode, { message: string; recovery: Recovery }> = {
  not_signed_in: { message: "Your session has ended. Sign in again to continue.", recovery: "sign_in" },
  not_onboarded: { message: "Finish setting up your profile before registering.", recovery: "onboarding" },
  event_not_found: { message: "We couldn't find this session. It may have been unpublished.", recovery: "event" },
  paid_event: { message: "Paid registration isn't open yet for this session.", recovery: "event" },
  not_open_yet: { message: "Registration for this session hasn't opened yet.", recovery: "event" },
  registration_closed: { message: "Registration for this session has closed.", recovery: "event" },
  invalid_answers: { message: "Some answers need a look. Check the highlighted questions.", recovery: "fix_fields" },
  invalid_input: { message: "A few fields need a look before you can register.", recovery: "fix_fields" },
  already_registered: { message: "You're already registered for this session.", recovery: "tickets" },
  registration_not_found: { message: "We couldn't find that registration.", recovery: "tickets" },
  not_cancellable: { message: "This registration can't be cancelled any more.", recovery: "tickets" },
  paid_cancel_not_supported: {
    message: "Paid registrations are cancelled by the organisers. Contact us about a refund.",
    recovery: "tickets",
  },
  event_started: { message: "This session has already started, so it can't be cancelled.", recovery: "tickets" },
  profile_save_failed: { message: "We couldn't save your details. Please try again.", recovery: "retry" },
  network: { message: "We couldn't reach the server. Check your connection and try again.", recovery: "retry" },
  unknown: { message: "Something went wrong on our side. Please try again.", recovery: "retry" },
};

export function registrationError(code: RegistrationErrorCode): RegistrationError {
  return { code, ...COPY[code] };
}

// Codes the RPCs raise as the exception message (see the registration_rpcs migration).
const DB_CODES: ReadonlySet<string> = new Set([
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "already_registered", "registration_not_found", "not_cancellable",
  "paid_cancel_not_supported", "event_started",
]);

export function errorFromDb(err: { message?: string | null; code?: string | null } | null | undefined): RegistrationError {
  const msg = err?.message?.trim() ?? "";
  if (DB_CODES.has(msg)) return registrationError(msg as RegistrationErrorCode);
  if (err?.code === "23505") return registrationError("already_registered");
  if (err?.code === "42501") return registrationError("not_signed_in");
  return registrationError("unknown");
}
```

`lib/registration/external.ts`:

```ts
import type { Settings } from "@/lib/site/schema";

const PLACEHOLDER = /your-form-id/i;

/** An https URL without credentials, never the seed placeholder; otherwise null. */
export function safeFormUrl(raw: string): string | null {
  if (!/^https:\/\//i.test(raw) || PLACEHOLDER.test(raw)) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** `registration.mode: "external"` sends every Register button to the Google Form (if it is a real https link). */
export function externalRegistrationUrl(reg: Settings["registration"]): string | null {
  return reg.mode === "external" ? safeFormUrl(reg.googleFormUrl) : null;
}

/** Google Form shown as a recovery option when on-site registration fails. */
export function fallbackFormUrl(reg: Settings["registration"]): string | null {
  return safeFormUrl(reg.googleFormUrl);
}
```

- [ ] **Step 4: Run tests, then the full gate**

Run: `npx vitest run tests/registration` → PASS. Then `npx vitest run && npx tsc --noEmit && npx eslint .` → green.

- [ ] **Step 5: Commit**

```bash
git add lib/registration tests/registration
git commit -m "feat(registration): question, form and error schemas

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Registration settings for the seeded events (live + seed.sql)

**Files:**
- Create: `supabase/seed-data/registration.ts`, `supabase/migrations/20261006000003_registration_seed_config.sql` (generated, renamed in Step 5), `tests/registration/seed-config.test.ts`
- Modify: `scripts/generate-seed.ts`, `tests/seed/generate-seed.test.ts`, `supabase/seed.sql` (regenerated, **not applied**)

**Interfaces:**
- Consumes: `type Question`, `QuestionsSchema` (Task 3); `events.questions` (Task 1).
- Produces: `REGISTRATION_CONFIG: Record<string, RegistrationSeed>` with `interface RegistrationSeed { ticketType?: "qr" | "token"; questions?: Question[]; opensAt?: string }`; `registrationConfigSql(): string` exported from `scripts/generate-seed.ts`; CLI `npx tsx scripts/generate-seed.ts --registration-sql` prints it.
- Live result: `seeing-machines` (RAS-01, QR) and `deep-learning-decoded` get questions; `wie-ai-healthtech` becomes a **token** ticket with questions; `language-and-machines` opens on 20 Oct 2026 09:00 IST (demonstrates "Opens on …"). All other events: QR, no questions, open until the session starts.

- [ ] **Step 1: Write the failing tests**

`tests/registration/seed-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REGISTRATION_CONFIG } from "@/supabase/seed-data/registration";
import { EVENT_SOCIETY_MAP } from "@/supabase/seed-data/event-map";
import { WIE_EVENTS } from "@/supabase/seed-data/wie-events";
import { QuestionsSchema } from "@/lib/registration/questions";

describe("REGISTRATION_CONFIG", () => {
  const slugs = new Set([...Object.keys(EVENT_SOCIETY_MAP), ...WIE_EVENTS.map((w) => w.slug)]);
  it("only configures events that exist", () => {
    for (const slug of Object.keys(REGISTRATION_CONFIG)) expect(slugs.has(slug)).toBe(true);
  });
  it("only contains questions the database will accept", () => {
    for (const c of Object.values(REGISTRATION_CONFIG))
      if (c.questions) expect(QuestionsSchema.safeParse(c.questions).success).toBe(true);
  });
  it("uses ISO timestamps with an offset", () => {
    for (const c of Object.values(REGISTRATION_CONFIG))
      if (c.opensAt) expect(c.opensAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});
```

In `tests/seed/generate-seed.test.ts`:
- change the import line to
  `import { buildSeedSql, registrationConfigSql, sqlJson, sqlLiteral, validateSeedInputs } from "@/scripts/generate-seed";`
  and add `import { readdirSync, readFileSync } from "node:fs";` and `import path from "node:path";` at the top;
- in the test "renders agenda, resources and winners as jsonb in every event insert", replace the second `expect(st).toMatch(…)` with
  ```ts
      expect(st).toMatch(/'published', (true|false), '\{.*\}'::jsonb, '\[.*\]'::jsonb, '\[.*\]'::jsonb, (null|'[^']+')\s+from public\.societies/);
  ```
  (resources, winners, questions, registration_opens_at);
- add inside `describe("buildSeedSql", …)`:
  ```ts
  it("applies the Phase 3 registration config", () => {
    expect(eventInsert("wie-ai-healthtech")).toContain(", 'token', 'WIE-01', ");
    expect(eventInsert("seeing-machines")).toContain('"id":"laptop"');
    expect(eventInsert("language-and-machines")).toContain("'2026-10-20T09:00:00+05:30'");
    expect(eventInsert("ai-unlocked")).toContain(", 'qr', 'MAIN-01', ");
  });
  ```
- add a new block:
  ```ts
  describe("registrationConfigSql", () => {
    it("is exactly the committed registration_seed_config migration", () => {
      const dir = path.resolve(process.cwd(), "supabase/migrations");
      const file = readdirSync(dir).find((f) => f.endsWith("_registration_seed_config.sql"));
      expect(file).toBeDefined();
      expect(readFileSync(path.join(dir, file!), "utf8").replace(/\r\n/g, "\n")).toBe(registrationConfigSql());
    });
    it("never truncates or inserts", () => {
      expect(registrationConfigSql()).not.toMatch(/truncate|insert|delete/i);
    });
  });
  ```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/seed tests/registration/seed-config.test.ts` → FAIL (missing module / export).

- [ ] **Step 3: Implement the config and generator changes**

`supabase/seed-data/registration.ts`:

```ts
import type { Question } from "@/lib/registration/questions";

export interface RegistrationSeed {
  ticketType?: "qr" | "token";
  questions?: Question[];
  /** ISO timestamp with offset; registration is open until the session starts unless set. */
  opensAt?: string;
}

// Per-event registration settings. Events not listed: QR ticket, no questions, open until the session starts.
export const REGISTRATION_CONFIG: Record<string, RegistrationSeed> = {
  "seeing-machines": {
    questions: [
      { id: "laptop", label: "Will you bring a laptop?", type: "single_choice", options: ["Yes", "No"], required: true },
      {
        id: "goal", label: "What would you like to build with computer vision?",
        help: "Optional. Helps the speakers tailor the lab.", type: "textarea", required: false,
      },
    ],
  },
  "wie-ai-healthtech": {
    ticketType: "token",
    questions: [
      { id: "kit_size", label: "T-shirt size for the welcome kit", type: "single_choice", options: ["S", "M", "L", "XL"], required: true },
      { id: "photo_consent", label: "Happy to appear in event photos", type: "checkbox", required: false },
    ],
  },
  "deep-learning-decoded": {
    questions: [
      {
        id: "frameworks", label: "Which frameworks have you used?", type: "multi_choice",
        options: ["PyTorch", "TensorFlow", "Keras", "JAX", "None yet"], required: false,
      },
    ],
  },
  "language-and-machines": { opensAt: "2026-10-20T09:00:00+05:30" },
};
```

In `scripts/generate-seed.ts`:

1. Add the import after the `WIE_EVENTS` import:
   ```ts
   import { REGISTRATION_CONFIG } from "@/supabase/seed-data/registration";
   ```
2. Replace the event insert inside `for (const e of eventRows()) { … }` with:
   ```ts
    const prefix = `${e.society.toUpperCase()}-${String(e.step).padStart(2, "0")}`;
    const reg = REGISTRATION_CONFIG[e.slug] ?? {};
    out.push(
      `insert into public.events (society_id, track_id, step_number, slug, title, topic, summary, description, starts_at, ends_at, venue, level, formats, agenda, outcomes, prerequisites, bring, capacity, price_paise, ticket_type, token_prefix, status, is_finale, resources, winners, questions, registration_opens_at)
select s.id, t.id, ${e.step}, ${L(e.slug)}, ${L(e.title)}, ${L(e.topic)}, ${L(e.summary)}, ${L(e.description)}, ${L(e.start)}, ${L(e.end)}, ${L(settings.venue.hall)}, ${L(e.level)}, ${arr(e.formats)}, ${sqlJson(e.agenda)}, ${arr(e.outcomes)}, ${arr(e.prerequisites)}, ${arr(e.bring)}, ${e.capacity}, 0, ${L(reg.ticketType ?? "qr")}, ${L(prefix)}, 'published', ${L(e.finale)}, ${sqlJson(e.resources)}, ${sqlJson(e.winners)}, ${sqlJson(reg.questions ?? [])}, ${L(reg.opensAt ?? null)}
from public.societies s left join public.tracks t on t.society_id = s.id and t.name = ${L(e.track)} where s.slug = ${L(e.society)};`,
    );
   ```
3. Add, after `buildSeedSql()`:
   ```ts
   /** Targeted updates that bring the live database in line with REGISTRATION_CONFIG (no truncation). */
   export function registrationConfigSql(): string {
     const lines = [
       "-- Phase 3: registration settings for live events. GENERATED by registrationConfigSql() in scripts/generate-seed.ts.",
       "-- Targeted updates only: never run supabase/seed.sql against the live database.",
     ];
     for (const [slug, c] of Object.entries(REGISTRATION_CONFIG)) {
       const sets = [
         c.ticketType ? `ticket_type = ${L(c.ticketType)}` : null,
         c.questions ? `questions = ${sqlJson(c.questions)}` : null,
         c.opensAt ? `registration_opens_at = ${L(c.opensAt)}` : null,
       ].filter((s): s is string => s !== null);
       if (sets.length) lines.push(`update public.events set ${sets.join(", ")} where slug = ${L(slug)};`);
     }
     return lines.join("\n") + "\n";
   }
   ```
4. Replace the CLI block at the bottom with:
   ```ts
   // CLI: `npm run seed:generate` writes supabase/seed.sql;
   // `npx tsx scripts/generate-seed.ts --registration-sql` prints the registration config migration.
   if (process.argv[1] && path.basename(process.argv[1]).startsWith("generate-seed")) {
     if (process.argv.includes("--registration-sql")) {
       process.stdout.write(registrationConfigSql());
     } else {
       const file = path.resolve(process.cwd(), "supabase/seed.sql");
       writeFileSync(file, buildSeedSql());
       console.log(`wrote ${file}`);
     }
   }
   ```

- [ ] **Step 4: Generate the migration and seed.sql**

```bash
npx tsx scripts/generate-seed.ts --registration-sql > supabase/migrations/20261006000003_registration_seed_config.sql
npm run seed:generate
```

Expected migration content:

```sql
-- Phase 3: registration settings for live events. GENERATED by registrationConfigSql() in scripts/generate-seed.ts.
-- Targeted updates only: never run supabase/seed.sql against the live database.
update public.events set questions = '[{"id":"laptop","label":"Will you bring a laptop?","type":"single_choice","options":["Yes","No"],"required":true},{"id":"goal","label":"What would you like to build with computer vision?","help":"Optional. Helps the speakers tailor the lab.","type":"textarea","required":false}]'::jsonb where slug = 'seeing-machines';
update public.events set ticket_type = 'token', questions = '[{"id":"kit_size","label":"T-shirt size for the welcome kit","type":"single_choice","options":["S","M","L","XL"],"required":true},{"id":"photo_consent","label":"Happy to appear in event photos","type":"checkbox","required":false}]'::jsonb where slug = 'wie-ai-healthtech';
update public.events set questions = '[{"id":"frameworks","label":"Which frameworks have you used?","type":"multi_choice","options":["PyTorch","TensorFlow","Keras","JAX","None yet"],"required":false}]'::jsonb where slug = 'deep-learning-decoded';
update public.events set registration_opens_at = '2026-10-20T09:00:00+05:30' where slug = 'language-and-machines';
```

**Do not apply `supabase/seed.sql`.**

- [ ] **Step 5: Apply the config migration and verify**

1. MCP `apply_migration` name `registration_seed_config` with the file's exact content → success (the DB CHECK validates the questions).
2. `list_migrations` → `git mv supabase/migrations/20261006000003_registration_seed_config.sql supabase/migrations/<version>_registration_seed_config.sql`.
3. MCP `execute_sql`:
   ```sql
   select slug, ticket_type, jsonb_array_length(questions) as q, registration_opens_at
   from public.events where slug in ('seeing-machines','wie-ai-healthtech','deep-learning-decoded','language-and-machines') order by slug;
   ```
   Expected: `deep-learning-decoded qr 1 null`, `language-and-machines qr 0 2026-10-20 03:30:00+00`, `seeing-machines qr 2 null`, `wie-ai-healthtech token 2 null`.
4. Gate: `npx vitest run && npx tsc --noEmit && npx eslint .` → green.

- [ ] **Step 6: Commit**

```bash
git add supabase scripts tests
git commit -m "feat(seed): per-event registration settings and live config migration

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tickets (token, QR) and the registration CTA state machine

**Files:**
- Create: `lib/tickets/token.ts`, `lib/tickets/qr.ts`, `lib/registration/cta.ts`
- Modify: `package.json`, `package-lock.json` (add `uqr`)
- Test: `tests/tickets/token.test.ts`, `tests/tickets/qr.test.ts`, `tests/registration/cta.test.ts`

**Interfaces:**
- Consumes: `MyRegistration`, `isActiveStatus` (Task 3).
- Produces:
  - `formatToken(prefix: string, n: number): string` — `"RAS-05", 42 → "RAS-05-0042"`
  - `qrRows(text: string): string[]` (rows of `"1"`/`"0"`, no quiet zone, ECC M) and `qrPath(rows: readonly string[]): string` (SVG path, 1 unit per module)
  - `registerPath(slug)`, `ticketPath(id)`, `loginPath(next)`; `interface CtaEvent { slug; start; pricePaise; seatsLeft; registrationOpensAt: string | null; registrationClosesAt: string | null }`; `ctaEvent(e)` (from any object with `slug, start, pricePaise, seatsTotal, seatsFilled, registrationOpensAt, registrationClosesAt`); `registrationWindow(e, now): "not_open" | "open" | "closed"`; `interface CtaInput { now: number; event: CtaEvent; signedIn: boolean; registration: MyRegistration | null; externalUrl: string | null }`; `type CtaState` (below); `ctaState(input): CtaState`.

**QR library choice (record in the commit body):** `uqr` — MIT, zero dependencies, pure ESM, documented to run in any runtime. The matrix is computed on the server inside the Worker (microseconds of CPU) and rendered as an inline SVG `<path>`, so the ticket page ships no QR JavaScript and uses no canvas/`Buffer`/`fs`. The PNG export reuses the same matrix on a client canvas. (`qrcode` was rejected: it pulls `pngjs`/Node `Buffer` paths that are awkward on Workers.)

- [ ] **Step 1: Install**

```bash
npm install uqr
```

Expected: `uqr` appears in `dependencies` (version `^0.1.3` or newer).

- [ ] **Step 2: Write the failing tests**

`tests/tickets/token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatToken } from "@/lib/tickets/token";

describe("formatToken", () => {
  it("pads to four digits after the prefix", () => expect(formatToken("RAS-05", 42)).toBe("RAS-05-0042"));
  it("works without a prefix", () => expect(formatToken("", 7)).toBe("0007"));
  it("never truncates large numbers", () => expect(formatToken("CS-01", 12345)).toBe("CS-01-12345"));
});
```

`tests/tickets/qr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { qrPath, qrRows } from "@/lib/tickets/qr";

describe("qrRows", () => {
  const code = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 26-char base32, like a real ticket code
  const rows = qrRows(code);
  it("is a square matrix of 0/1", () => {
    expect(rows.length).toBeGreaterThanOrEqual(21);
    for (const r of rows) {
      expect(r).toMatch(/^[01]+$/);
      expect(r.length).toBe(rows.length);
    }
  });
  it("starts with the top-left finder pattern (no quiet zone)", () => {
    expect(rows[0].slice(0, 7)).toBe("1111111");
    expect(rows[6].slice(0, 7)).toBe("1111111");
    expect(rows[1].slice(0, 7)).toBe("1000001");
  });
  it("is deterministic", () => expect(qrRows(code)).toEqual(rows));
});

describe("qrPath", () => {
  it("draws one square per dark module", () => expect(qrPath(["10", "01"])).toBe("M0 0h1v1h-1zM1 1h1v1h-1z"));
  it("merges horizontal runs", () => expect(qrPath(["0110"])).toBe("M1 0h2v1h-2z"));
  it("is empty for a blank matrix", () => expect(qrPath(["000"])).toBe(""));
});
```

`tests/registration/cta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ctaEvent, ctaState, registrationWindow, type CtaEvent, type CtaInput } from "@/lib/registration/cta";

const NOW = Date.parse("2026-10-06T12:00:00+05:30");
const EVENT: CtaEvent = {
  slug: "seeing-machines", start: "2026-10-10T09:30:00+05:30", pricePaise: 0, seatsLeft: 10,
  registrationOpensAt: null, registrationClosesAt: null,
};
const base: CtaInput = { now: NOW, event: EVENT, signedIn: true, registration: null, externalUrl: null };
const at = (p: Partial<CtaInput>, e: Partial<CtaEvent> = {}): CtaInput => ({ ...base, ...p, event: { ...EVENT, ...e } });

describe("ctaState", () => {
  it("offers registration", () =>
    expect(ctaState(base)).toEqual({ kind: "register", href: "/events/seeing-machines/register" }));
  it("offers the waitlist when full", () =>
    expect(ctaState(at({}, { seatsLeft: 0 }))).toEqual({ kind: "join_waitlist", href: "/events/seeing-machines/register" }));
  it("asks signed-out visitors to sign in, returning to the form", () => {
    expect(ctaState(at({ signedIn: false }))).toEqual({
      kind: "sign_in", href: "/login?next=%2Fevents%2Fseeing-machines%2Fregister", full: false,
    });
    expect(ctaState(at({ signedIn: false }, { seatsLeft: 0 }))).toMatchObject({ kind: "sign_in", full: true });
  });
  it("shows the ticket for confirmed and pending registrations, even after the event", () => {
    expect(ctaState(at({ registration: { id: "r1", status: "confirmed", waitlistPosition: null } })))
      .toEqual({ kind: "registered", registrationId: "r1" });
    expect(ctaState(at({ registration: { id: "r1", status: "pending_payment", waitlistPosition: null } })).kind).toBe("registered");
    expect(ctaState(at({ now: Date.parse("2026-12-01T00:00:00Z"), registration: { id: "r1", status: "confirmed", waitlistPosition: null } })).kind)
      .toBe("registered");
  });
  it("shows the waitlist position", () =>
    expect(ctaState(at({ registration: { id: "r2", status: "waitlisted", waitlistPosition: 3 } })))
      .toEqual({ kind: "waitlisted", registrationId: "r2", position: 3 }));
  it("treats cancelled or refunded registrations as not registered", () => {
    expect(ctaState(at({ registration: { id: "r3", status: "cancelled", waitlistPosition: null } })).kind).toBe("register");
    expect(ctaState(at({ registration: { id: "r3", status: "refunded", waitlistPosition: null } })).kind).toBe("register");
  });
  it("closes at the start time or the closing time, whichever is first", () => {
    expect(ctaState(at({ now: Date.parse(EVENT.start) })).kind).toBe("closed");
    expect(ctaState(at({}, { registrationClosesAt: "2026-10-05T00:00:00+05:30" })).kind).toBe("closed");
    expect(ctaState(at({ now: Date.parse(EVENT.start) }, { registrationClosesAt: "2026-10-20T00:00:00+05:30" })).kind).toBe("closed");
  });
  it("announces the opening time", () =>
    expect(ctaState(at({}, { registrationOpensAt: "2026-10-08T09:00:00+05:30" })))
      .toEqual({ kind: "opens", opensAt: "2026-10-08T09:00:00+05:30" }));
  it("uses the external form when configured, unless closed", () => {
    expect(ctaState(at({ externalUrl: "https://forms.gle/abc" }))).toEqual({ kind: "external", href: "https://forms.gle/abc" });
    expect(ctaState(at({ externalUrl: "https://forms.gle/abc", signedIn: false })).kind).toBe("external");
    expect(ctaState(at({ externalUrl: "https://forms.gle/abc", now: Date.parse(EVENT.start) })).kind).toBe("closed");
  });
  it("defers paid events to Phase 4", () => expect(ctaState(at({}, { pricePaise: 9900 })).kind).toBe("paid_soon"));
});

describe("registrationWindow", () => {
  it("matches the database rules", () => {
    expect(registrationWindow(EVENT, NOW)).toBe("open");
    expect(registrationWindow({ ...EVENT, registrationOpensAt: "2026-10-07T00:00:00+05:30" }, NOW)).toBe("not_open");
    expect(registrationWindow(EVENT, Date.parse(EVENT.start) - 1)).toBe("open");
    expect(registrationWindow(EVENT, Date.parse(EVENT.start))).toBe("closed");
  });
});

describe("ctaEvent", () => {
  it("derives seats left and never goes negative", () => {
    const e = { slug: "x", start: EVENT.start, pricePaise: 0, seatsTotal: 10, seatsFilled: 12, registrationOpensAt: null, registrationClosesAt: null };
    expect(ctaEvent(e).seatsLeft).toBe(0);
    expect(ctaEvent({ ...e, seatsFilled: 4 }).seatsLeft).toBe(6);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/tickets tests/registration/cta.test.ts` → FAIL (modules not found).

- [ ] **Step 4: Implement**

`lib/tickets/token.ts`:

```ts
/** Door token: `${prefix}-${n padded to 4}`, e.g. RAS-05-0042 (spec §5 Tickets). */
export function formatToken(prefix: string, n: number): string {
  const num = String(Math.trunc(n)).padStart(4, "0");
  return prefix ? `${prefix}-${num}` : num;
}
```

`lib/tickets/qr.ts`:

```ts
import { encode } from "uqr";

/** QR matrix for an opaque ticket code as rows of "1" (dark) / "0" (light), without a quiet zone. */
export function qrRows(text: string): string[] {
  const { data } = encode(text, { ecc: "M", border: 0 });
  return data.map((row) => row.map((dark) => (dark ? "1" : "0")).join(""));
}

/** SVG path drawing every dark module (one unit each), merging horizontal runs to keep it small. */
export function qrPath(rows: readonly string[]): string {
  let d = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "1") {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === "1") end++;
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return d;
}
```

(If `uqr`'s `encode` option names differ in the installed version, check `node_modules/uqr/dist/index.d.mts` and adapt; the "no quiet zone" test must keep passing.)

`lib/registration/cta.ts`:

```ts
import { isActiveStatus, type MyRegistration } from "./types";

export const registerPath = (slug: string) => `/events/${slug}/register`;
export const ticketPath = (id: string) => `/me/tickets/${id}`;
export const loginPath = (next: string) => `/login?next=${encodeURIComponent(next)}`;

export interface CtaEvent {
  slug: string;
  start: string;
  pricePaise: number;
  seatsLeft: number;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
}

export interface CtaInput {
  now: number;
  event: CtaEvent;
  signedIn: boolean;
  /** The viewer's registration for this event, if any. */
  registration: MyRegistration | null;
  /** Set when site settings say registration happens on an external (Google) form. */
  externalUrl: string | null;
}

export type CtaState =
  | { kind: "register"; href: string }
  | { kind: "join_waitlist"; href: string }
  | { kind: "sign_in"; href: string; full: boolean }
  | { kind: "registered"; registrationId: string }
  | { kind: "waitlisted"; registrationId: string; position: number }
  | { kind: "opens"; opensAt: string }
  | { kind: "closed" }
  | { kind: "external"; href: string }
  | { kind: "paid_soon" };

export function ctaEvent(e: {
  slug: string; start: string; pricePaise: number; seatsTotal: number; seatsFilled: number;
  registrationOpensAt: string | null; registrationClosesAt: string | null;
}): CtaEvent {
  return {
    slug: e.slug,
    start: e.start,
    pricePaise: e.pricePaise,
    seatsLeft: Math.max(0, e.seatsTotal - e.seatsFilled),
    registrationOpensAt: e.registrationOpensAt,
    registrationClosesAt: e.registrationClosesAt,
  };
}

/** Same rules as register_for_event: not before opens_at; closed at the earlier of closes_at and the start. */
export function registrationWindow(
  e: Pick<CtaEvent, "start" | "registrationOpensAt" | "registrationClosesAt">,
  now: number,
): "not_open" | "open" | "closed" {
  if (e.registrationOpensAt && now < Date.parse(e.registrationOpensAt)) return "not_open";
  const start = Date.parse(e.start);
  const closes = e.registrationClosesAt ? Math.min(Date.parse(e.registrationClosesAt), start) : start;
  return now >= closes ? "closed" : "open";
}

export function ctaState(i: CtaInput): CtaState {
  const r = i.registration && isActiveStatus(i.registration.status) ? i.registration : null;
  if (r?.status === "waitlisted") return { kind: "waitlisted", registrationId: r.id, position: r.waitlistPosition ?? 0 };
  if (r) return { kind: "registered", registrationId: r.id };

  const win = registrationWindow(i.event, i.now);
  if (win === "closed") return { kind: "closed" };
  if (i.externalUrl) return { kind: "external", href: i.externalUrl };
  if (win === "not_open") return { kind: "opens", opensAt: i.event.registrationOpensAt ?? i.event.start };
  if (i.event.pricePaise > 0) return { kind: "paid_soon" };

  const href = registerPath(i.event.slug);
  const full = i.event.seatsLeft <= 0;
  if (!i.signedIn) return { kind: "sign_in", href: loginPath(href), full };
  return full ? { kind: "join_waitlist", href } : { kind: "register", href };
}
```

- [ ] **Step 5: Run tests, then the full gate**

Run: `npx vitest run tests/tickets tests/registration` → PASS. Then `npx vitest run && npx tsc --noEmit && npx eslint .`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/tickets lib/registration/cta.ts tests/tickets tests/registration/cta.test.ts
git commit -m "feat(tickets): token format, QR matrix and registration CTA states

QR uses uqr (MIT, zero-dependency ESM): the matrix is computed in the Worker and
rendered as an inline SVG path; the PNG export redraws it on a client canvas.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Server reads, server actions, and event registration-window fields

**Files:**
- Create: `lib/registration/tickets.ts`, `lib/registration/server.ts`, `lib/registration/actions.ts`
- Modify: `lib/events/types.ts`, `lib/events/mappers.ts`, `tests/events/mappers.test.ts`, `tests/events/status.test.ts`
- Test: `tests/registration/tickets.test.ts`

**Interfaces:**
- Consumes: Task 3 (`registrationSchema`, `registrationFieldErrors`, `parseQuestions`, `errorFromDb`, `registrationError`, `ACTIVE_STATUSES`, `MyRegistration`, `Attendee`), Task 5 (`formatToken`), `getAuthState()`, `createClient()` (server), `safeAvatarUrl()`.
- Produces:
  - `EventView` gains `registrationOpensAt: string | null` and `registrationClosesAt: string | null` (and `EVENT_SELECT` reads them).
  - `tickets.ts` (pure): `TICKET_SELECT`, `interface TicketRow`, `interface TicketSummary { id; status: RegistrationStatus; waitlistPosition: number | null; token: string | null; ticketType: "qr" | "token"; event: { id; slug; title; topic; step: number; start; end; pricePaise: number; societyShort: string; societyColor: SocietyColor } }`, `interface TicketDetail extends TicketSummary { ticketCode: string; checkedInAt: string | null }`, `rowToTicket(r): TicketDetail | null`, `toSummary(t): TicketSummary`, `splitTickets(list, now): { upcoming; past }`, `nextTicket(list, now): T | null`.
  - `server.ts` (server-only): `getMyRegistration(eventId, userId): Promise<MyRegistration | null>`, `getAttendees(eventId): Promise<Attendee[] | null>` (null = could not load), `getMyTickets(userId): Promise<TicketSummary[]>`, `getTicket(id, userId): Promise<TicketDetail | null>`.
  - `actions.ts` (`"use server"`): `registerForEvent(slug: string, values: unknown): Promise<RegisterResult>`, `cancelRegistration(registrationId: string): Promise<CancelResult>`; `type RegisterResult = { ok: true; registrationId: string; status: "confirmed" | "waitlisted" } | { ok: false; error: RegistrationError; fieldErrors?: Record<string, string> }`; `type CancelResult = { ok: true; promoted: number } | { ok: false; error: RegistrationError }`.

- [ ] **Step 1: Write the failing tests**

`tests/registration/tickets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextTicket, rowToTicket, splitTickets, toSummary, type TicketRow, type TicketSummary } from "@/lib/registration/tickets";

const row: TicketRow = {
  id: "r1", status: "confirmed", waitlist_position: null, ticket_code: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", token_number: 7, checked_in_at: null,
  event: {
    id: "e1", slug: "seeing-machines", title: "Seeing Machines", topic: "CV", step_number: 1,
    starts_at: "2026-10-10T04:00:00+00:00", ends_at: "2026-10-10T11:00:00+00:00", price_paise: 0,
    ticket_type: "qr", token_prefix: "RAS-01", society: { short_name: "RAS", color: "green" },
  },
};

describe("rowToTicket", () => {
  it("maps a row and formats the token", () => {
    const t = rowToTicket(row)!;
    expect(t.token).toBe("RAS-01-0007");
    expect(t.ticketCode).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(t.event).toMatchObject({ slug: "seeing-machines", step: 1, societyShort: "RAS", societyColor: "green" });
  });
  it("has no token while waitlisted", () =>
    expect(rowToTicket({ ...row, status: "waitlisted", waitlist_position: 2, token_number: null })!.token).toBeNull());
  it("drops rows whose event (or society) is not visible", () => {
    expect(rowToTicket({ ...row, event: null })).toBeNull();
    expect(rowToTicket({ ...row, event: { ...row.event!, society: null } })).toBeNull();
  });
  it("toSummary strips the ticket code", () => expect("ticketCode" in toSummary(rowToTicket(row)!)).toBe(false));
});

describe("splitTickets / nextTicket", () => {
  const mk = (id: string, start: string, end: string): TicketSummary => ({
    ...toSummary(rowToTicket(row)!), id, event: { ...toSummary(rowToTicket(row)!).event, start, end },
  });
  const NOW = Date.parse("2026-10-10T06:00:00Z");
  const list = [
    mk("later", "2026-11-01T04:00:00Z", "2026-11-01T11:00:00Z"),
    mk("past", "2026-09-01T04:00:00Z", "2026-09-01T11:00:00Z"),
    mk("live", "2026-10-10T04:00:00Z", "2026-10-10T11:00:00Z"),
    mk("older", "2026-08-01T04:00:00Z", "2026-08-01T11:00:00Z"),
  ];
  it("keeps running events as upcoming and orders both lists", () => {
    const { upcoming, past } = splitTickets(list, NOW);
    expect(upcoming.map((t) => t.id)).toEqual(["live", "later"]);
    expect(past.map((t) => t.id)).toEqual(["past", "older"]);
  });
  it("picks the next ticket", () => {
    expect(nextTicket(list, NOW)?.id).toBe("live");
    expect(nextTicket([list[1]], NOW)).toBeNull();
  });
});
```

In `tests/events/mappers.test.ts`, add `registration_opens_at: "2026-10-01T09:00:00+05:30", registration_closes_at: null,` to the `row` fixture (after `token_prefix: "RAS-01",`) and add to the first `it(…)`:

```ts
    expect(v.registrationOpensAt).toBe("2026-10-01T09:00:00+05:30");
    expect(v.registrationClosesAt).toBeNull();
```

In `tests/events/status.test.ts`, add `registrationOpensAt: null, registrationClosesAt: null,` to the `ev(…)` fixture object (after `speakerIds: [],`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/registration/tickets.test.ts tests/events` → FAIL (module missing; `registrationOpensAt` undefined; TS excess-property errors show up in `tsc`).

- [ ] **Step 3: Event fields**

`lib/events/types.ts` — in `interface EventView`, after `tokenPrefix: string;` add:

```ts
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
```

`lib/events/mappers.ts`:
- in `interface EventRow`, after `token_prefix: string;` add `registration_opens_at: string | null;` and `registration_closes_at: string | null;`
- in `EVENT_SELECT`, insert `registration_opens_at, registration_closes_at, ` right after `token_prefix, `
- in `rowToEventView`, after `tokenPrefix: r.token_prefix,` add:
  ```ts
    registrationOpensAt: r.registration_opens_at,
    registrationClosesAt: r.registration_closes_at,
  ```

- [ ] **Step 4: Ticket mapping (pure)**

`lib/registration/tickets.ts`:

```ts
import type { SocietyColor } from "@/lib/events/types";
import { formatToken } from "@/lib/tickets/token";
import type { RegistrationStatus } from "./types";

export const TICKET_SELECT =
  "id, status, waitlist_position, ticket_code, token_number, checked_in_at, event:events(id, slug, title, topic, step_number, starts_at, ends_at, price_paise, ticket_type, token_prefix, society:societies(short_name, color))";

export interface TicketRow {
  id: string;
  status: RegistrationStatus;
  waitlist_position: number | null;
  ticket_code: string;
  token_number: number | null;
  checked_in_at: string | null;
  event: {
    id: string; slug: string; title: string; topic: string; step_number: number;
    starts_at: string; ends_at: string; price_paise: number;
    ticket_type: "qr" | "token"; token_prefix: string;
    society: { short_name: string; color: string } | null;
  } | null;
}

export interface TicketSummary {
  id: string;
  status: RegistrationStatus;
  waitlistPosition: number | null;
  token: string | null;
  ticketType: "qr" | "token";
  event: {
    id: string; slug: string; title: string; topic: string; step: number;
    start: string; end: string; pricePaise: number; societyShort: string; societyColor: SocietyColor;
  };
}

export interface TicketDetail extends TicketSummary {
  ticketCode: string;
  checkedInAt: string | null;
}

/** Null when RLS hides the event (e.g. unpublished) — such tickets are not shown. */
export function rowToTicket(r: TicketRow): TicketDetail | null {
  const e = r.event;
  if (!e || !e.society) return null;
  return {
    id: r.id,
    status: r.status,
    waitlistPosition: r.waitlist_position,
    token: r.token_number ? formatToken(e.token_prefix, r.token_number) : null,
    ticketType: e.ticket_type,
    ticketCode: r.ticket_code,
    checkedInAt: r.checked_in_at,
    event: {
      id: e.id, slug: e.slug, title: e.title, topic: e.topic, step: e.step_number,
      start: e.starts_at, end: e.ends_at, pricePaise: e.price_paise,
      societyShort: e.society.short_name, societyColor: e.society.color as SocietyColor,
    },
  };
}

/** Drops the ticket code so lists never carry it. */
export function toSummary(t: TicketDetail): TicketSummary {
  return { id: t.id, status: t.status, waitlistPosition: t.waitlistPosition, token: t.token, ticketType: t.ticketType, event: t.event };
}

/** Upcoming = not yet ended (soonest first); past = ended (most recent first). */
export function splitTickets<T extends TicketSummary>(list: readonly T[], now: number): { upcoming: T[]; past: T[] } {
  const upcoming = list.filter((t) => Date.parse(t.event.end) >= now)
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));
  const past = list.filter((t) => Date.parse(t.event.end) < now)
    .sort((a, b) => Date.parse(b.event.start) - Date.parse(a.event.start));
  return { upcoming, past };
}

export function nextTicket<T extends TicketSummary>(list: readonly T[], now: number): T | null {
  return splitTickets(list, now).upcoming[0] ?? null;
}
```

- [ ] **Step 5: Server reads**

`lib/registration/server.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { safeAvatarUrl } from "@/lib/profile/view";
import { ACTIVE_STATUSES, type Attendee, type MyRegistration } from "./types";
import { rowToTicket, TICKET_SELECT, toSummary, type TicketDetail, type TicketRow, type TicketSummary } from "./tickets";

/** The signed-in user's active registration for an event (RLS: own rows only). */
export async function getMyRegistration(eventId: string, userId: string): Promise<MyRegistration | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("registrations")
    .select("id, status, waitlist_position")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES])
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, status: data.status, waitlistPosition: data.waitlist_position };
}

/** Confirmed attendees (public profile fields only). Null when the list could not be loaded. */
export async function getAttendees(eventId: string): Promise<Attendee[] | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("event_attendees")
    .select("handle, full_name, avatar_url, headline")
    .eq("event_id", eventId)
    .order("full_name");
  if (error) return null;
  return (data ?? [])
    .filter((a): a is typeof a & { handle: string } => typeof a.handle === "string" && a.handle.length > 0)
    .map((a) => ({
      handle: a.handle,
      fullName: a.full_name ?? "",
      avatarUrl: safeAvatarUrl(a.avatar_url),
      headline: a.headline ?? "",
    }));
}

/** All active tickets of the user, without ticket codes, soonest first. */
export async function getMyTickets(userId: string): Promise<TicketSummary[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("registrations")
    .select(TICKET_SELECT)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES]);
  if (error) throw new Error(`Failed to load tickets: ${error.message}`);
  return (data as unknown as TicketRow[])
    .map(rowToTicket)
    .filter((t): t is TicketDetail => t !== null)
    .map(toSummary)
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));
}

/** One active ticket of the user (with its code), or null. */
export async function getTicket(id: string, userId: string): Promise<TicketDetail | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("registrations")
    .select(TICKET_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES])
    .maybeSingle();
  if (error || !data) return null;
  return rowToTicket(data as unknown as TicketRow);
}
```

- [ ] **Step 6: Server actions**

`lib/registration/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthState } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseQuestions, type Question } from "./questions";
import { registrationFieldErrors, registrationSchema } from "./schema";
import { errorFromDb, registrationError, type RegistrationError, type RegistrationErrorCode } from "./errors";

export type RegisterResult =
  | { ok: true; registrationId: string; status: "confirmed" | "waitlisted" }
  | { ok: false; error: RegistrationError; fieldErrors?: Record<string, string> };

export type CancelResult = { ok: true; promoted: number } | { ok: false; error: RegistrationError };

const SLUG_RE = /^[a-z0-9-]{2,80}$/;
const RegisterRpcResult = z.object({
  registration_id: z.uuid(),
  status: z.enum(["confirmed", "waitlisted"]),
  waitlist_position: z.number().int().nullable(),
});
const CancelRpcResult = z.object({ promoted: z.number().int() });

const fail = (code: RegistrationErrorCode, fieldErrors?: Record<string, string>) =>
  ({ ok: false as const, error: registrationError(code), ...(fieldErrors ? { fieldErrors } : {}) });

/**
 * Saves the edited profile fields back to the profile, then registers through the RPC (which enforces
 * capacity, window, answers and one-per-user). Runs as the signed-in user: no service role.
 */
export async function registerForEvent(slug: string, values: unknown): Promise<RegisterResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return fail("event_not_found");
  const { user, profile } = await getAuthState();
  if (!user) return fail("not_signed_in");
  if (!profile?.onboarded) return fail("not_onboarded");

  const db = await createClient();
  const { data: ev, error: evError } = await db
    .from("events")
    .select("id, questions")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (evError) return fail("unknown");
  if (!ev) return fail("event_not_found");

  let questions: Question[];
  try {
    questions = parseQuestions(ev.questions);
  } catch {
    return fail("unknown");
  }

  const parsed = registrationSchema(questions).safeParse(values);
  if (!parsed.success) return fail("invalid_input", registrationFieldErrors(parsed.error));
  const { registrant: r, answers } = parsed.data;

  // RLS turns a blocked write into "0 rows updated" without an error: treat that as a failure too.
  const [pub, priv] = await Promise.all([
    db.from("profiles")
      .update({ full_name: r.fullName, college: r.college, branch: r.branch, year: r.year })
      .eq("id", user.id)
      .select("id"),
    db.from("profile_private")
      .update({ phone: r.phone, ieee_member_id: r.ieeeMemberId })
      .eq("user_id", user.id)
      .select("user_id"),
  ]);
  if (pub.error || !pub.data?.length || priv.error || !priv.data?.length) return fail("profile_save_failed");

  const { data, error } = await db.rpc("register_for_event", { p_event_id: ev.id, p_answers: answers });
  if (error) return { ok: false, error: errorFromDb(error) };
  const res = RegisterRpcResult.safeParse(data);
  if (!res.success) return fail("unknown");

  revalidatePath(`/events/${slug}`);
  revalidatePath("/me", "layout");
  return { ok: true, registrationId: res.data.registration_id, status: res.data.status };
}

/** Cancels the user's own free registration (the RPC promotes the waitlist head). */
export async function cancelRegistration(registrationId: string): Promise<CancelResult> {
  if (typeof registrationId !== "string" || !z.uuid().safeParse(registrationId).success) return fail("registration_not_found");
  const { user } = await getAuthState();
  if (!user) return fail("not_signed_in");

  const db = await createClient();
  const { data: own } = await db
    .from("registrations")
    .select("event:events(slug)")
    .eq("id", registrationId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data, error } = await db.rpc("cancel_registration", { p_registration_id: registrationId });
  if (error) return { ok: false, error: errorFromDb(error) };
  const res = CancelRpcResult.safeParse(data);

  const slug = (own?.event as { slug: string } | null | undefined)?.slug;
  if (slug) revalidatePath(`/events/${slug}`);
  revalidatePath("/me", "layout");
  return { ok: true, promoted: res.success ? res.data.promoted : 0 };
}
```

- [ ] **Step 7: Run tests, then the full gate**

Run: `npx vitest run tests/registration tests/events` → PASS. Then `npx vitest run && npx tsc --noEmit && npx eslint .` → green (`tsc` proves the RPC argument names match the regenerated `database.types.ts`).

- [ ] **Step 8: Commit**

```bash
git add lib/registration lib/events tests/registration/tickets.test.ts tests/events
git commit -m "feat(registration): ticket reads and register/cancel server actions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Registration page and form

**Files:**
- Create: `app/events/[slug]/register/page.tsx`, `components/registration/RegistrationForm.tsx`, `components/registration/QuestionField.tsx`, `components/registration/ErrorPanel.tsx`, `components/registration/RegistrationUnavailable.tsx`

**Interfaces:**
- Consumes: `registerForEvent`, `type RegisterResult` (Task 6); `registrationSchema`, `registrationFieldErrors`, `type Registrant` (Task 3); `emptyAnswers`, `parseQuestions`, `TEXT_MAX`, `TEXTAREA_MAX`, `type Question`, `type Answers`, `type AnswerValue` (Task 3); `registrationError`, `type RegistrationError` (Task 3); `externalRegistrationUrl`, `fallbackFormUrl` (Task 3); `ctaState`, `ctaEvent`, `ticketPath`, `registerPath`, `loginPath`, `type CtaState` (Task 5); `getMyRegistration` (Task 6); `requireOnboarded`, `getSiteData`, `Field`, `inputCls`, `textareaCls`, `PageHero`, `BRANCHES`, `YEARS`.
- Produces: route `/events/[slug]/register`; `ErrorPanel({ error, slug?, fallbackUrl, onRetry?, autoFocus? })` (reused by Task 8); `RegistrationUnavailable({ state, slug })`. On success the form navigates to `/me/tickets/<id>?new=1` (Task 8).

- [ ] **Step 1: `ErrorPanel` and `RegistrationUnavailable`**

`components/registration/ErrorPanel.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import type { RegistrationError } from "@/lib/registration/errors";
import { loginPath, registerPath } from "@/lib/registration/cta";

/** Typed registration error with a recovery action. Takes focus so screen readers and keyboards land on it. */
export function ErrorPanel({
  error, slug, fallbackUrl, onRetry, autoFocus = true,
}: {
  error: RegistrationError; slug?: string; fallbackUrl: string | null; onRetry?: () => void; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [error, autoFocus]);
  const here = slug ? registerPath(slug) : "/me/tickets";

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="border-2 border-ink bg-red/15 p-5 outline-none focus-visible:outline focus-visible:outline-3 focus-visible:outline-blue-ink"
    >
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle size={18} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden /> {error.message}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {error.recovery === "retry" && onRetry && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onRetry}>Try again</button>
        )}
        {error.recovery === "retry" && fallbackUrl && (
          <a className="btn btn-sm btn-ghost" href={fallbackUrl} target="_blank" rel="noopener noreferrer">Use the Google Form</a>
        )}
        {error.recovery === "sign_in" && <Link className="btn btn-sm btn-primary" href={loginPath(here)}>Sign in</Link>}
        {error.recovery === "onboarding" && (
          <Link className="btn btn-sm btn-primary" href={`/onboarding?next=${encodeURIComponent(here)}`}>Finish your profile</Link>
        )}
        {error.recovery === "tickets" && <Link className="btn btn-sm btn-primary" href="/me/tickets">Go to My tickets</Link>}
        {error.recovery === "event" && slug && <Link className="btn btn-sm btn-ghost" href={`/events/${slug}`}>Back to the session</Link>}
      </div>
    </div>
  );
}
```

`components/registration/RegistrationUnavailable.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeft, Clock, Lock } from "lucide-react";
import type { CtaState } from "@/lib/registration/cta";
import { longDate, timeOf } from "@/lib/weekends";

/** Shown on /events/[slug]/register when the session cannot take registrations right now. */
export function RegistrationUnavailable({ state, slug }: { state: CtaState; slug: string }) {
  const text =
    state.kind === "opens"
      ? `Registration opens on ${longDate(state.opensAt)} at ${timeOf(state.opensAt)} IST.`
      : state.kind === "paid_soon"
        ? "Paid registration for this session opens soon."
        : "Registration for this session is closed.";
  const Icon = state.kind === "opens" ? Clock : Lock;
  return (
    <div className="box mx-auto max-w-2xl p-8 text-center shadow-[6px_6px_0_0_var(--ink)]" role="status">
      <Icon size={32} strokeWidth={2} className="mx-auto" aria-hidden />
      <p className="mt-4 text-xl font-semibold">{text}</p>
      <Link href={`/events/${slug}`} className="btn btn-ghost mt-6">
        <ArrowLeft size={16} strokeWidth={2} aria-hidden /> Back to the session
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: `QuestionField`**

`components/registration/QuestionField.tsx`:

```tsx
"use client";

import { AlertCircle } from "lucide-react";
import { Field, inputCls, textareaCls } from "@/components/ui/Field";
import { TEXT_MAX, TEXTAREA_MAX, type AnswerValue, type Question } from "@/lib/registration/questions";
import { cn } from "@/lib/utils";

const Req = () => <span className="ml-0.5 text-red-ink" aria-hidden>*</span>;

function GroupError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-err`} className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-ink">
      <AlertCircle size={14} strokeWidth={2} aria-hidden /> {error}
    </p>
  );
}

const optionCls = (on: boolean) =>
  cn(
    "flex min-h-12 cursor-pointer items-center gap-3 border-2 border-ink px-4 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-blue-ink",
    on ? "bg-yellow" : "bg-paper hover:bg-paper-2",
  );

/**
 * One custom question. The focusable element for "focus first invalid" always has id `q-<question id>`
 * (the first option for choice groups).
 */
export function QuestionField({
  q, value, error, onChange, onBlur,
}: {
  q: Question; value: AnswerValue; error?: string; onChange: (v: AnswerValue) => void; onBlur: () => void;
}) {
  const id = `q-${q.id}`;

  if (q.type === "text" || q.type === "textarea") {
    const v = typeof value === "string" ? value : "";
    const a11y = { "aria-required": q.required, "aria-invalid": !!error, "aria-describedby": error ? `${id}-err` : undefined };
    return (
      <Field id={id} label={q.label} required={q.required} error={error} hint={q.help}>
        {q.type === "text" ? (
          <input id={id} className={inputCls} value={v} maxLength={TEXT_MAX} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} {...a11y} />
        ) : (
          <textarea id={id} className={textareaCls} rows={4} value={v} maxLength={TEXTAREA_MAX} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} {...a11y} />
        )}
      </Field>
    );
  }

  if (q.type === "checkbox") {
    const on = value === true;
    const describedBy = error ? `${id}-err` : q.help ? `${id}-help` : undefined;
    return (
      <div>
        <label className={optionCls(on)}>
          <input
            id={id} type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} onBlur={onBlur}
            className="h-5 w-5 accent-[#100f0d]" aria-required={q.required} aria-invalid={!!error} aria-describedby={describedBy}
          />
          <span>{q.label}{q.required && <Req />}</span>
        </label>
        {q.help && <p id={`${id}-help`} className="mt-1.5 text-xs text-ink-3">{q.help}</p>}
        <GroupError id={id} error={error} />
      </div>
    );
  }

  const multi = q.type === "multi_choice";
  const selected: string[] = multi ? (Array.isArray(value) ? value : []) : typeof value === "string" && value ? [value] : [];
  const toggle = (opt: string) => {
    if (!multi) return onChange(opt);
    const on = selected.includes(opt);
    onChange(q.options.filter((o) => (o === opt ? !on : selected.includes(o))));
  };
  const describedBy = [q.help ? `${id}-help` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset aria-describedby={describedBy}>
      <legend className="mono mb-2 font-bold">{q.label}{q.required && <Req />}</legend>
      {q.help && <p id={`${id}-help`} className="mb-2 text-xs text-ink-3">{q.help}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((opt, i) => {
          const on = selected.includes(opt);
          return (
            <label key={opt} className={optionCls(on)}>
              <input
                id={i === 0 ? id : `${id}-${i}`} type={multi ? "checkbox" : "radio"} name={id} value={opt} checked={on}
                onChange={() => toggle(opt)} onBlur={onBlur} className="h-5 w-5 accent-[#100f0d]" aria-invalid={!!error}
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
      <GroupError id={id} error={error} />
    </fieldset>
  );
}
```

- [ ] **Step 3: `RegistrationForm`**

`components/registration/RegistrationForm.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Field, inputCls } from "@/components/ui/Field";
import { BRANCHES, YEARS } from "@/lib/profile/options";
import { emptyAnswers, type AnswerValue, type Answers, type Question } from "@/lib/registration/questions";
import { registrationFieldErrors, registrationSchema, type Registrant } from "@/lib/registration/schema";
import { registrationError, type RegistrationError } from "@/lib/registration/errors";
import { registerForEvent, type RegisterResult } from "@/lib/registration/actions";
import { ticketPath } from "@/lib/registration/cta";
import { QuestionField } from "./QuestionField";
import { ErrorPanel } from "./ErrorPanel";

const REGISTRANT_FIELDS = ["fullName", "college", "branch", "year", "phone", "ieeeMemberId"] as const;

export function RegistrationForm({
  slug, questions, initial, waitlist, fallbackUrl,
}: {
  slug: string; questions: Question[]; initial: Registrant; waitlist: boolean; fallbackUrl: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const schema = useMemo(() => registrationSchema(questions), [questions]);
  const order = useMemo(() => [...REGISTRANT_FIELDS, ...questions.map((q) => `q-${q.id}`)], [questions]);
  const [registrant, setRegistrant] = useState<Registrant>(initial);
  const [answers, setAnswers] = useState<Answers>(() => emptyAnswers(questions));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<RegistrationError | null>(null);
  const [busy, setBusy] = useState(false);

  const clientErrors = useMemo(() => {
    const r = schema.safeParse({ registrant, answers });
    return r.success ? {} : registrationFieldErrors(r.error);
  }, [schema, registrant, answers]);

  const errorFor = (id: string): string | undefined =>
    serverErrors[id] ?? (submitted || touched[id] ? clientErrors[id] : undefined);
  const blur = (id: string) => () => setTouched((t) => (t[id] ? t : { ...t, [id]: true }));
  const clearServer = (id: string) =>
    setServerErrors((e) => {
      if (!(id in e)) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  const setField = (k: keyof Registrant, v: string) => {
    setRegistrant((r) => ({ ...r, [k]: v }));
    clearServer(k);
  };
  const setAnswer = (qid: string, v: AnswerValue) => {
    setAnswers((a) => ({ ...a, [qid]: v }));
    clearServer(`q-${qid}`);
  };
  const aria = (id: string, required = true) => ({
    "aria-required": required,
    "aria-invalid": !!errorFor(id),
    "aria-describedby": errorFor(id) ? `${id}-err` : undefined,
  });

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setError(null);
    const first = order.find((id) => clientErrors[id]);
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    let res: RegisterResult;
    try {
      res = await registerForEvent(slug, { registrant, answers });
    } catch {
      setBusy(false);
      setError(registrationError("network"));
      return;
    }
    if (res.ok) {
      // Stay busy while the ticket page loads.
      router.push(`${ticketPath(res.registrationId)}?new=1`);
      return;
    }
    setBusy(false);
    setError(res.error);
    const fieldErrors = res.fieldErrors;
    if (fieldErrors) {
      setServerErrors(fieldErrors);
      const f = order.find((id) => fieldErrors[id]);
      if (f) document.getElementById(f)?.focus();
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <div className="grid gap-8">
        <section className="box grid gap-6 p-6 shadow-[6px_6px_0_0_var(--ink)] md:grid-cols-2 md:p-10" aria-labelledby="you-h">
          <div className="md:col-span-2">
            <h2 id="you-h" className="mono font-bold">Your details</h2>
            <p className="mt-2 text-sm text-ink-3">
              Filled in from your profile; changes are saved back to it. Fields marked <span className="text-red-ink">*</span> are required.
            </p>
          </div>
          <Field id="fullName" label="Full name" required error={errorFor("fullName")} className="md:col-span-2">
            <input id="fullName" className={inputCls} autoComplete="name" value={registrant.fullName}
              onChange={(e) => setField("fullName", e.target.value)} onBlur={blur("fullName")} {...aria("fullName")} />
          </Field>
          <Field id="college" label="College" required error={errorFor("college")} className="md:col-span-2">
            <input id="college" className={inputCls} autoComplete="organization" value={registrant.college}
              onChange={(e) => setField("college", e.target.value)} onBlur={blur("college")} {...aria("college")} />
          </Field>
          <Field id="branch" label="Branch" required error={errorFor("branch")}>
            <select id="branch" className={inputCls} value={registrant.branch}
              onChange={(e) => setField("branch", e.target.value)} onBlur={blur("branch")} {...aria("branch")}>
              <option value="">Select branch</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field id="year" label="Year" required error={errorFor("year")}>
            <select id="year" className={inputCls} value={registrant.year}
              onChange={(e) => setField("year", e.target.value)} onBlur={blur("year")} {...aria("year")}>
              <option value="">Select year</option>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </Field>
          <Field id="phone" label="Phone (WhatsApp)" required error={errorFor("phone")} hint="Only you and the organisers can see this.">
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" className={inputCls}
              value={registrant.phone} onChange={(e) => setField("phone", e.target.value)} onBlur={blur("phone")} {...aria("phone")} />
          </Field>
          <Field id="ieeeMemberId" label="IEEE membership ID" error={errorFor("ieeeMemberId")} hint="Optional.">
            <input id="ieeeMemberId" inputMode="numeric" autoComplete="off" className={inputCls}
              value={registrant.ieeeMemberId} onChange={(e) => setField("ieeeMemberId", e.target.value)}
              onBlur={blur("ieeeMemberId")} {...aria("ieeeMemberId", false)} />
          </Field>
        </section>

        {questions.length > 0 && (
          <section className="box grid gap-6 p-6 shadow-[6px_6px_0_0_var(--ink)] md:p-10" aria-labelledby="questions-h">
            <h2 id="questions-h" className="mono font-bold">A few questions from the organisers</h2>
            {questions.map((q) => (
              <QuestionField
                key={q.id} q={q} value={answers[q.id]} error={errorFor(`q-${q.id}`)}
                onChange={(v) => setAnswer(q.id, v)} onBlur={blur(`q-${q.id}`)}
              />
            ))}
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <div className="border-2 border-ink bg-paper-2 p-6 shadow-[6px_6px_0_0_var(--ink)]">
          <p className="mono font-bold">{waitlist ? "This step is full" : "Free registration"}</p>
          <p className="mt-2 text-sm text-ink-2">
            {waitlist
              ? "Join the waitlist: if a seat frees up you move up automatically, and My tickets shows your place."
              : "Your ticket appears straight after you confirm."}
          </p>
          <button type="submit" className="btn btn-primary btn-lg mt-6 w-full" disabled={busy}>
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ArrowRight size={18} strokeWidth={2} aria-hidden />}
            {busy ? "Saving…" : waitlist ? "Join the waitlist" : "Confirm registration"}
          </button>
          {submitted && !error && Object.keys(clientErrors).length > 0 && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-ink">A few fields need a look before you can register.</p>
          )}
        </div>
        {error && (
          <ErrorPanel
            error={error} slug={slug} fallbackUrl={fallbackUrl}
            onRetry={() => formRef.current?.requestSubmit()}
            autoFocus={error.recovery !== "fix_fields"}
          />
        )}
        <p className="px-2 text-xs text-ink-3">
          By registering you agree to the <Link href="/code-of-conduct" className="underline hover:bg-yellow">Code of Conduct</Link> and{" "}
          <Link href="/privacy" className="underline hover:bg-yellow">Privacy Policy</Link>. Your name, photo and headline appear in the
          session&apos;s attendee list for signed-in members.
        </p>
      </aside>
    </form>
  );
}
```

- [ ] **Step 4: The page**

`app/events/[slug]/register/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BRANCHES, YEARS } from "@/lib/profile/options";
import { ctaEvent, ctaState, ticketPath } from "@/lib/registration/cta";
import { externalRegistrationUrl, fallbackFormUrl } from "@/lib/registration/external";
import { parseQuestions } from "@/lib/registration/questions";
import { getMyRegistration } from "@/lib/registration/server";
import type { Registrant } from "@/lib/registration/schema";
import { longDate, pad2, timeOf } from "@/lib/weekends";
import { PageHero } from "@/components/ui/PageHero";
import { RegistrationForm } from "@/components/registration/RegistrationForm";
import { RegistrationUnavailable } from "@/components/registration/RegistrationUnavailable";

export const metadata: Metadata = { title: "Register", robots: { index: false } };

const SLUG_RE = /^[a-z0-9-]{2,80}$/;
const requestNow = () => Date.now();
const oneOf = (list: readonly string[], v: string | undefined) => (v && list.includes(v) ? v : "");

export default async function RegisterPage({ params }: PageProps<"/events/[slug]/register">) {
  const { slug: raw } = await params;
  const { settings, events } = await getSiteData();
  const external = externalRegistrationUrl(settings.registration);
  if (external) redirect(external);

  const slug = SLUG_RE.test(raw) ? raw : null;
  // Session first: signed-out visitors are redirected before anything is looked up.
  const { user, profile } = await requireOnboarded(slug ? `/events/${slug}/register` : "/");
  const ev = slug ? events.find((e) => e.slug === slug) : undefined;
  if (!ev) notFound();

  const mine = await getMyRegistration(ev.id, user.id);
  if (mine) redirect(ticketPath(mine.id));

  const state = ctaState({ now: requestNow(), event: ctaEvent(ev), signedIn: true, registration: null, externalUrl: null });
  const hero = (
    <PageHero
      eyebrow={`${ev.society.shortName} · Step ${pad2(ev.step)} · Registration`}
      title={ev.title}
      lead={`${longDate(ev.start)} · ${timeOf(ev.start)} – ${timeOf(ev.end)} IST`}
    />
  );
  if (state.kind !== "register" && state.kind !== "join_waitlist") {
    return (
      <>
        {hero}
        <div className="wrap pb-[var(--section-y)]"><RegistrationUnavailable state={state} slug={ev.slug} /></div>
      </>
    );
  }

  const db = await createClient();
  const [{ data: evRow }, { data: p }, { data: priv }] = await Promise.all([
    db.from("events").select("questions").eq("id", ev.id).single(),
    db.from("profiles").select("full_name, college, branch, year").eq("id", user.id).single(),
    db.from("profile_private").select("phone, ieee_member_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const questions = parseQuestions(evRow?.questions ?? []);
  const initial: Registrant = {
    fullName: p?.full_name ?? profile.fullName,
    college: p?.college ?? "",
    branch: oneOf(BRANCHES, p?.branch),
    year: oneOf(YEARS, p?.year),
    phone: priv?.phone ?? "",
    ieeeMemberId: priv?.ieee_member_id ?? "",
  };

  return (
    <>
      {hero}
      <div className="wrap pb-[var(--section-y)]">
        <RegistrationForm
          slug={ev.slug}
          questions={questions}
          initial={initial}
          waitlist={state.kind === "join_waitlist"}
          fallbackUrl={fallbackFormUrl(settings.registration)}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Verify**

1. `npx next typegen`, then `npx vitest run && npx tsc --noEmit && npx eslint .` → green.
2. `npm run dev`, then in a browser:
   - Signed out: `http://localhost:3000/events/seeing-machines/register` → 307 to `/login?next=%2Fevents%2Fseeing-machines%2Fregister`.
   - Signed in + onboarded: form shows prefilled name/college/branch/year/phone; the two RAS questions render.
   - Click *Confirm registration* with the laptop question empty → focus jumps to the first "Yes" radio, error text under the group.
   - `/events/language-and-machines/register` → "Registration opens on Tuesday, 20 October 2026 at 9:00 am IST." (only before that date).
   - `/events/nope/register` → 404 page.
   - Do **not** complete a live registration yet (Task 8 builds the ticket page it lands on).

- [ ] **Step 6: Commit**

```bash
git add app/events components/registration
git commit -m "feat(registration): registration page with prefilled profile and custom questions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Ticket view (QR / token, PNG download, calendar, share, cancel)

**Files:**
- Create: `app/me/tickets/[id]/page.tsx`, `components/tickets/TicketCard.tsx`, `components/tickets/TicketActions.tsx`, `components/tickets/CancelRegistration.tsx`, `lib/tickets/png.ts`

**Interfaces:**
- Consumes: `getTicket`, `type TicketDetail` (Task 6); `cancelRegistration` (Task 6); `qrRows`, `qrPath` (Task 5); `ErrorPanel` (Task 7); `registrationError`; `googleCalendarUrl`, `downloadIcs` (`lib/calendar.ts`); `ShareButtons`; `useSiteData`; `getSiteData`; `requireOnboarded`.
- Produces: route `/me/tickets/[id]` (`?new=1` shows the confirmation banner); `TicketCard({ t: TicketCardData })`; `interface TicketPngData { eyebrow; title; when; venue; name; token: string | null; qrRows: string[] | null }`; `ticketPngBlob(data): Promise<Blob>`; `downloadBlob(blob, filename)`; after a successful cancel the user lands on `/me/tickets?cancelled=1` (Task 9).

- [ ] **Step 1: PNG export (client-only canvas code)**

`lib/tickets/png.ts`:

```ts
// Client-only: draws the ticket on a canvas. Never import from server code.

export interface TicketPngData {
  eyebrow: string;
  title: string;
  when: string;
  venue: string;
  name: string;
  token: string | null;
  qrRows: string[] | null;
}

const W = 1080;
const H = 1350;
const INK = "#100f0d";
const PAPER = "#f4efe6";
const YELLOW = "#ffb200";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(next).width <= maxWidth) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s*\S*$/, "")}…`;
  return kept;
}

export async function ticketPngBlob(t: TicketPngData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(48, 48, W - 96, 120);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.beginPath();
  ctx.moveTo(48, 168);
  ctx.lineTo(W - 48, 168);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.font = `bold 40px ${MONO}`;
  ctx.fillText("ST(AI)RWAY TICKET", 96, 124);
  ctx.font = `bold 30px ${MONO}`;
  ctx.fillText(t.eyebrow.toUpperCase(), 96, 240);

  ctx.font = `600 60px ${SANS}`;
  let y = 320;
  for (const l of wrap(ctx, t.title, W - 192, 2)) {
    ctx.fillText(l, 96, y);
    y += 70;
  }
  ctx.font = `32px ${SANS}`;
  for (const text of [t.when, t.venue, t.name]) {
    for (const l of wrap(ctx, text, W - 192, 1)) {
      ctx.fillText(l, 96, y + 20);
      y += 48;
    }
  }

  ctx.textAlign = "center";
  if (t.qrRows) {
    const n = t.qrRows.length;
    const quiet = 4;
    const cells = n + quiet * 2;
    const mod = Math.floor(560 / cells);
    const size = mod * cells;
    const x0 = Math.round((W - size) / 2);
    const y0 = 650;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0, y0, size, size);
    ctx.lineWidth = 4;
    ctx.strokeRect(x0, y0, size, size);
    ctx.fillStyle = INK;
    t.qrRows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "1") ctx.fillRect(x0 + (c + quiet) * mod, y0 + (r + quiet) * mod, mod, mod);
      }
    });
    ctx.font = `bold 30px ${MONO}`;
    ctx.fillText(t.token ? `SHOW AT THE DOOR · ${t.token}` : "SHOW AT THE DOOR", W / 2, y0 + size + 50);
  } else if (t.token) {
    ctx.font = `bold 34px ${MONO}`;
    ctx.fillText("YOUR TOKEN", W / 2, 760);
    ctx.font = `bold 120px ${MONO}`;
    ctx.fillText(t.token, W / 2, 900);
    ctx.font = `30px ${SANS}`;
    ctx.fillText("Say or show this token at the door.", W / 2, 980);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: `TicketCard` (server-renderable)**

`components/tickets/TicketCard.tsx`:

```tsx
import { qrPath } from "@/lib/tickets/qr";
import type { RegistrationStatus } from "@/lib/registration/types";

export interface TicketCardData {
  eyebrow: string;
  title: string;
  when: string;
  venue: string;
  name: string;
  status: RegistrationStatus;
  waitlistPosition: number | null;
  token: string | null;
  ticketType: "qr" | "token";
  qrRows: string[] | null;
  checkedInAt: string | null;
}

function QrSvg({ rows }: { rows: string[] }) {
  const n = rows.length;
  const q = 4; // quiet zone, in modules
  return (
    <svg
      viewBox={`${-q} ${-q} ${n + 2 * q} ${n + 2 * q}`} width={240} height={240} role="img"
      aria-label="Ticket QR code" shapeRendering="crispEdges" className="border-2 border-ink"
    >
      <rect x={-q} y={-q} width={n + 2 * q} height={n + 2 * q} fill="#ffffff" />
      <path d={qrPath(rows)} fill="#100f0d" />
    </svg>
  );
}

/** The ticket itself. The QR encodes only the opaque ticket code (no personal data). */
export function TicketCard({ t }: { t: TicketCardData }) {
  return (
    <article className="box mx-auto w-full max-w-md shadow-[6px_6px_0_0_var(--ink)]" aria-labelledby="ticket-title">
      <header className="border-b-2 border-ink bg-yellow px-5 py-3">
        <p className="mono font-bold">st(AI)rway ticket</p>
      </header>
      <div className="grid gap-5 p-5">
        <div>
          <p className="mono font-bold text-ink-3">{t.eyebrow}</p>
          <h2 id="ticket-title" className="mt-1 text-2xl font-semibold">{t.title}</h2>
        </div>
        <dl className="grid gap-2 text-sm">
          <div><dt className="mono text-ink-3">When</dt><dd>{t.when}</dd></div>
          <div><dt className="mono text-ink-3">Where</dt><dd>{t.venue}</dd></div>
          <div><dt className="mono text-ink-3">Name</dt><dd className="font-semibold">{t.name}</dd></div>
        </dl>
        {t.status === "confirmed" ? (
          t.ticketType === "qr" && t.qrRows ? (
            <figure className="grid justify-items-center gap-2">
              <QrSvg rows={t.qrRows} />
              <figcaption className="mono text-center text-ink-3">
                Show this code at the door{t.token ? ` · ${t.token}` : ""}
              </figcaption>
            </figure>
          ) : (
            <div className="border-2 border-ink bg-paper-2 p-5 text-center">
              <p className="mono text-ink-3">Your token</p>
              <p className="mt-2 font-mono text-4xl font-bold tabular">{t.token}</p>
              <p className="mt-2 text-sm text-ink-3">Say or show this token at the door.</p>
            </div>
          )
        ) : t.status === "waitlisted" ? (
          <div className="border-2 border-ink bg-paper-2 p-5 text-center">
            <p className="mono">Waitlist</p>
            <p className="mt-2 font-mono text-5xl font-bold">#{t.waitlistPosition}</p>
            <p className="mt-2 text-sm text-ink-2">
              Not an entry ticket yet. If a seat frees up you move up automatically and this page becomes your ticket.
            </p>
          </div>
        ) : (
          <p className="border-2 border-ink bg-paper-2 p-5 text-center">Payment pending.</p>
        )}
        {t.checkedInAt && <p className="tag tag-green justify-self-start">Checked in</p>}
      </div>
    </article>
  );
}
```

- [ ] **Step 3: `TicketActions` and `CancelRegistration` (client)**

`components/tickets/TicketActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CalendarPlus, Download, Loader2 } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { ShareButtons } from "@/components/ui/ShareButtons";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar";
import { downloadBlob, ticketPngBlob, type TicketPngData } from "@/lib/tickets/png";
import type { EventView } from "@/lib/events/types";

/** Download PNG (confirmed tickets only), add to calendar, and share the session page (never the ticket). */
export function TicketActions({
  ev, png, filename, shareText,
}: {
  ev: EventView | null; png: TicketPngData | null; filename: string; shareText: string;
}) {
  const { settings } = useSiteData();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function download() {
    if (!png || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      downloadBlob(await ticketPngBlob(png), filename);
      setMsg({ ok: true, text: "Ticket saved." });
    } catch {
      setMsg({ ok: false, text: "Couldn't create the image. Take a screenshot of the ticket instead." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      {png && (
        <div>
          <button type="button" className="btn btn-primary w-full" onClick={download} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} strokeWidth={2} aria-hidden />}
            Download ticket (PNG)
          </button>
          <p role="status" aria-live="polite" className={msg?.ok ? "mt-2 text-sm font-semibold text-green-ink" : "mt-2 text-sm font-semibold text-red-ink"}>
            {msg?.text}
          </p>
        </div>
      )}
      {ev && (
        <div>
          <p className="mono mb-3 font-bold">Add to calendar</p>
          <div className="grid grid-cols-2 gap-3">
            <a href={googleCalendarUrl(ev, settings)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost !px-2">
              <CalendarPlus size={16} strokeWidth={2} aria-hidden /> Google
            </a>
            <button type="button" onClick={() => downloadIcs(ev, settings)} className="btn btn-sm btn-ghost !px-2">
              <Download size={16} strokeWidth={2} aria-hidden /> .ics
            </button>
          </div>
        </div>
      )}
      {ev && (
        <div>
          <p className="mono mb-3 font-bold">Bring a friend</p>
          <ShareButtons path={`/events/${ev.slug}`} text={shareText} />
        </div>
      )}
    </div>
  );
}
```

`components/tickets/CancelRegistration.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { cancelRegistration } from "@/lib/registration/actions";
import { registrationError, type RegistrationError } from "@/lib/registration/errors";
import { ErrorPanel } from "@/components/registration/ErrorPanel";

/** Two-step cancel for free registrations. Focus moves to "Yes, cancel" and back to the opener on "Keep". */
export function CancelRegistration({ registrationId, waitlisted }: { registrationId: string; waitlisted: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RegistrationError | null>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) yesRef.current?.focus();
    else if (restoreFocus) openRef.current?.focus();
  }, [confirming, restoreFocus]);

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await cancelRegistration(registrationId);
      if (res.ok) {
        router.replace("/me/tickets?cancelled=1");
        return;
      }
      setError(res.error);
    } catch {
      setError(registrationError("network"));
    }
    setBusy(false);
  }

  if (!confirming)
    return (
      <button ref={openRef} type="button" className="btn btn-sm btn-ghost justify-self-start" onClick={() => setConfirming(true)}>
        <X size={16} strokeWidth={2} aria-hidden /> {waitlisted ? "Leave the waitlist" : "Cancel registration"}
      </button>
    );

  return (
    <div className="box-2 grid gap-3 p-4" role="group" aria-labelledby="cancel-q">
      <p id="cancel-q" className="font-semibold">
        {waitlisted
          ? "Leave the waitlist? You'll lose your place."
          : "Cancel your registration? Your seat goes to the next person on the waitlist."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button ref={yesRef} type="button" className="btn btn-sm btn-ink" onClick={cancel} disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Yes, cancel
        </button>
        <button
          type="button" className="btn btn-sm btn-ghost" disabled={busy}
          onClick={() => {
            setConfirming(false);
            setRestoreFocus(true);
          }}
        >
          Keep my seat
        </button>
      </div>
      {error && <ErrorPanel error={error} fallbackUrl={null} onRetry={cancel} />}
    </div>
  );
}
```

- [ ] **Step 4: The page**

`app/me/tickets/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PartyPopper } from "lucide-react";
import { requireOnboarded } from "@/lib/auth/session";
import { getSiteData } from "@/lib/site/load";
import { getTicket } from "@/lib/registration/server";
import { qrRows } from "@/lib/tickets/qr";
import { longDate, pad2, timeOf } from "@/lib/weekends";
import { TicketCard, type TicketCardData } from "@/components/tickets/TicketCard";
import { TicketActions } from "@/components/tickets/TicketActions";
import { CancelRegistration } from "@/components/tickets/CancelRegistration";

export const metadata: Metadata = { title: "Your ticket", robots: { index: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestNow = () => Date.now();

export default async function TicketPage({ params, searchParams }: PageProps<"/me/tickets/[id]">) {
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  const id = UUID_RE.test(raw) ? raw.toLowerCase() : null;
  const { user, profile } = await requireOnboarded(id ? `/me/tickets/${id}` : "/me/tickets");
  if (!id) notFound();

  const [ticket, { settings, events }] = await Promise.all([getTicket(id, user.id), getSiteData()]);
  if (!ticket) notFound();

  const ev = events.find((e) => e.slug === ticket.event.slug) ?? null;
  const confirmed = ticket.status === "confirmed";
  const rows = confirmed && ticket.ticketType === "qr" ? qrRows(ticket.ticketCode) : null;
  const eyebrow = `${ticket.event.societyShort} · Step ${pad2(ticket.event.step)}`;
  const when = `${longDate(ticket.event.start)} · ${timeOf(ticket.event.start)} – ${timeOf(ticket.event.end)} IST`;
  const venue = `${ev?.venue || settings.venue.hall}, ${settings.venue.name}`;
  const card: TicketCardData = {
    eyebrow, title: ticket.event.title, when, venue, name: profile.fullName, status: ticket.status,
    waitlistPosition: ticket.waitlistPosition, token: ticket.token, ticketType: ticket.ticketType,
    qrRows: rows, checkedInAt: ticket.checkedInAt,
  };
  const cancellable =
    (ticket.status === "confirmed" || ticket.status === "waitlisted") &&
    ticket.event.pricePaise === 0 &&
    !ticket.checkedInAt &&
    Date.parse(ticket.event.start) > requestNow();

  return (
    <div className="grid gap-8">
      <Link href="/me/tickets" className="mono inline-flex min-h-11 items-center gap-2 font-bold text-ink-3 hover:text-ink">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden /> All tickets
      </Link>
      {sp.new === "1" && (
        <section role="status" className="border-2 border-ink bg-green p-5 shadow-[4px_4px_0_0_var(--ink)]">
          <p className="flex items-center gap-2 text-xl font-semibold">
            <PartyPopper size={22} strokeWidth={2} aria-hidden />
            {confirmed ? "You're registered. See you there!" : `You're on the waitlist at #${ticket.waitlistPosition}.`}
          </p>
          <p className="mt-2 text-sm">
            We don&apos;t send confirmation emails yet, so download your ticket below or find it any time under My tickets.
          </p>
        </section>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-start">
        <TicketCard t={card} />
        <div className="grid gap-6">
          <TicketActions
            ev={ev}
            png={confirmed ? { eyebrow, title: ticket.event.title, when, venue, name: profile.fullName, token: ticket.token, qrRows: rows } : null}
            filename={`stairway-${ticket.event.slug}-ticket.png`}
            shareText={`I'm climbing st(AI)rway: ${eyebrow}, ${ticket.event.title}`}
          />
          {ev && <Link href={`/events/${ev.slug}`} className="btn btn-ghost justify-self-start">Session details</Link>}
          {cancellable && <CancelRegistration registrationId={ticket.id} waitlisted={ticket.status === "waitlisted"} />}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

1. `npx next typegen && npx vitest run && npx tsc --noEmit && npx eslint .` → green.
2. `npm run dev`, signed in: register for `seeing-machines` at `/events/seeing-machines/register` → lands on `/me/tickets/<id>?new=1` with the green banner and a QR code. Scan the QR with a phone camera: it reads exactly the 26-character code (A–Z, 2–7).
3. *Download ticket (PNG)* → a 1080×1350 PNG with title, date, venue, your name and a scannable QR.
4. *Google* opens a prefilled calendar event; *.ics* downloads.
5. *Cancel registration* → *Yes, cancel* → lands on `/me/tickets?cancelled=1` (404 until Task 9 — expected at this point). Re-register so a ticket exists for later tasks.
6. `/me/tickets/not-a-uuid` and a random UUID → 404. Signed out: `/me/tickets/<id>` → `/login?next=%2Fme%2Ftickets%2F<id>`.

- [ ] **Step 6: Commit**

```bash
git add app/me components/tickets lib/tickets/png.ts
git commit -m "feat(tickets): ticket view with QR/token, PNG download, calendar, share and cancel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: My tickets list, dashboard nav, Overview "next step" card

**Files:**
- Create: `app/me/tickets/page.tsx`, `components/tickets/TicketListItem.tsx`, `components/tickets/NextTicketCard.tsx`
- Modify: `components/dashboard/DashboardShell.tsx`, `app/me/page.tsx`

**Interfaces:**
- Consumes: `getMyTickets` (Task 6), `splitTickets`, `nextTicket`, `type TicketSummary` (Task 6), `ticketPath` (Task 5), `Countdown`, `requireOnboarded`.
- Produces: route `/me/tickets` (`?cancelled=1` banner); nav item "My tickets"; Overview card `NextTicketCard({ t: TicketSummary | null })`.

- [ ] **Step 1: Components**

`components/tickets/TicketListItem.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ticketPath } from "@/lib/registration/cta";
import type { TicketSummary } from "@/lib/registration/tickets";
import { pad2, shortDate, timeOf } from "@/lib/weekends";

function StatusTag({ t }: { t: TicketSummary }) {
  if (t.status === "waitlisted") return <span className="tag tag-yellow">Waitlist #{t.waitlistPosition}</span>;
  if (t.status === "pending_payment") return <span className="tag tag-orange">Payment pending</span>;
  return <span className="tag tag-green">Confirmed{t.token ? ` · ${t.token}` : ""}</span>;
}

export function TicketListItem({ t }: { t: TicketSummary }) {
  return (
    <Link href={ticketPath(t.id)} className="box flex flex-wrap items-center justify-between gap-4 p-5 shadow-hard hover:bg-paper-2">
      <span className="min-w-0">
        <span className="mono block font-bold text-ink-3">
          {t.event.societyShort} · Step {pad2(t.event.step)} · {shortDate(t.event.start)}, {timeOf(t.event.start)}
        </span>
        <span className="mt-1 block text-xl font-semibold">{t.event.title}</span>
      </span>
      <span className="flex flex-wrap items-center gap-3">
        <StatusTag t={t} />
        <span className="mono inline-flex items-center gap-1 font-bold">
          View ticket <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </span>
      </span>
    </Link>
  );
}
```

`components/tickets/NextTicketCard.tsx`:

```tsx
import Link from "next/link";
import { Countdown } from "@/components/ui/Countdown";
import { ticketPath } from "@/lib/registration/cta";
import type { TicketSummary } from "@/lib/registration/tickets";
import { longDate, pad2, timeOf } from "@/lib/weekends";

/** Overview card: the next session the user is registered (or waitlisted) for, with a countdown and ticket shortcut. */
export function NextTicketCard({ t }: { t: TicketSummary | null }) {
  return (
    <section className="box shadow-hard" aria-labelledby="next-ticket-h">
      <div className="border-b-2 border-ink bg-yellow px-5 py-3">
        <h2 id="next-ticket-h" className="mono font-bold">Your next step</h2>
      </div>
      {t ? (
        <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <p className="mono font-bold text-ink-3">{t.event.societyShort} · Step {pad2(t.event.step)}</p>
            <p className="mt-1 text-2xl font-semibold">{t.event.title}</p>
            <p className="mt-1 text-ink-2">{longDate(t.event.start)} · {timeOf(t.event.start)} IST</p>
            <Link href={ticketPath(t.id)} className="btn btn-primary mt-4">
              {t.status === "waitlisted" ? `Waitlist #${t.waitlistPosition}: view status` : "Open ticket"}
            </Link>
          </div>
          <Countdown target={t.event.start} size="sm" label={`until ${t.event.title}`} />
        </div>
      ) : (
        <div className="p-5">
          <p className="text-ink-2">You haven&apos;t registered for an upcoming session yet.</p>
          <Link href="/#societies" className="btn btn-ghost mt-4">Find your next step</Link>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: `/me/tickets` page**

`app/me/tickets/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { requireOnboarded } from "@/lib/auth/session";
import { getMyTickets } from "@/lib/registration/server";
import { splitTickets } from "@/lib/registration/tickets";
import { TicketListItem } from "@/components/tickets/TicketListItem";

export const metadata: Metadata = { title: "My tickets", robots: { index: false } };

const requestNow = () => Date.now();

export default async function TicketsPage({ searchParams }: PageProps<"/me/tickets">) {
  const { user } = await requireOnboarded("/me/tickets");
  const sp = await searchParams;
  const { upcoming, past } = splitTickets(await getMyTickets(user.id), requestNow());

  return (
    <div className="grid gap-8">
      <h1 className="text-3xl font-semibold md:text-4xl">My tickets</h1>
      {sp.cancelled === "1" && (
        <p role="status" className="box-2 flex items-center gap-2 p-4 font-semibold">
          <Check size={18} strokeWidth={2.5} className="text-green-ink" aria-hidden /> Your registration was cancelled.
        </p>
      )}
      <section aria-labelledby="upcoming-h" className="grid gap-4">
        <h2 id="upcoming-h" className="mono font-bold">Upcoming</h2>
        {upcoming.length ? (
          <ul className="grid gap-4">{upcoming.map((t) => <li key={t.id}><TicketListItem t={t} /></li>)}</ul>
        ) : (
          <div className="box-2 p-5">
            <p className="text-ink-2">No upcoming sessions yet.</p>
            <Link href="/#societies" className="btn btn-primary mt-4">Find your next step</Link>
          </div>
        )}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="past-h" className="grid gap-4">
          <h2 id="past-h" className="mono font-bold">Past</h2>
          <ul className="grid gap-4">{past.map((t) => <li key={t.id}><TicketListItem t={t} /></li>)}</ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Nav item and Overview card**

`components/dashboard/DashboardShell.tsx`:
- change the lucide import to `import { ArrowLeft, LayoutDashboard, LogOut, Settings, Ticket, UserRound, type LucideIcon } from "lucide-react";`
- in `NAV.me.items`, insert after the Overview entry:
  ```ts
      { href: "/me/tickets", label: "My tickets", Icon: Ticket },
  ```
  (The "Back to site" link stays the first control in the sidebar.)

`app/me/page.tsx`:
- add imports:
  ```ts
  import { getMyTickets } from "@/lib/registration/server";
  import { nextTicket } from "@/lib/registration/tickets";
  import { NextTicketCard } from "@/components/tickets/NextTicketCard";
  ```
  and, above the component, `const requestNow = () => Date.now();`
- replace the `Promise.all` destructuring with:
  ```ts
  const [{ data: p }, { count: projects }, { count: experience }, tickets] = await Promise.all([
    db.from("profiles").select("headline, bio, skills, links, avatar_url").eq("id", user.id).maybeSingle(),
    db.from("profile_projects").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    db.from("profile_experience").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    // The overview still renders if tickets fail to load.
    getMyTickets(user.id).catch(() => []),
  ]);
  const upcoming = nextTicket(tickets, requestNow());
  ```
- render `<NextTicketCard t={upcoming} />` directly after the closing `</header>`.

- [ ] **Step 4: Verify**

1. `npx next typegen && npx vitest run && npx tsc --noEmit && npx eslint .` → green.
2. `npm run dev`: `/me` shows "Your next step" with a countdown and *Open ticket*; the sidebar has Back to site (top), Overview, My tickets, Profile, Settings, Sign out; on a 375px viewport the tab strip scrolls horizontally.
3. `/me/tickets` lists the ticket under Upcoming; cancelling from the ticket page lands here with the "cancelled" banner and the list no longer shows it.

- [ ] **Step 5: Commit**

```bash
git add app/me components/tickets components/dashboard
git commit -m "feat(dashboard): My tickets and next-step card on the overview

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Event page CTA states and the legacy `/register` URL

**Files:**
- Create: `components/registration/RegisterCta.tsx`
- Modify: `app/events/[slug]/page.tsx`, `components/weekend/WeekendDetail.tsx`, `lib/weekends.ts`, `app/register/page.tsx`, `components/layout/Dock.tsx`, `app/sitemap.ts`, `lib/jsonld.tsx`
- Delete: `components/register/RegisterForm.tsx` (and the now-empty `components/register/` folder)

**Interfaces:**
- Consumes: `ctaState`, `ctaEvent`, `registerPath`, `ticketPath`, `type CtaState` (Task 5); `externalRegistrationUrl` (Task 3); `getMyRegistration` (Task 6); `getAuthState`; `pickNext`, `withStatus`.
- Produces: `RegisterCta({ state: CtaState; step: number })`; `WeekendDetail({ slug, cta })`; `registerHref(slug?)` now returns `/events/<slug>/register` (or `/register` without a slug); `/register?step=<slug>` redirects to `/events/<slug>/register` (or the external form, or the next session).

- [ ] **Step 1: `RegisterCta`**

`components/registration/RegisterCta.tsx`:

```tsx
"use client";

import { ArrowRight, Check, Clock, Hourglass, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ticketPath, type CtaState } from "@/lib/registration/cta";
import { longDate, timeOf } from "@/lib/weekends";

const note = "flex items-center gap-2 border-2 border-ink bg-paper p-4 font-semibold";

/** The event page's registration call to action for every state in lib/registration/cta.ts. */
export function RegisterCta({ state, step }: { state: CtaState; step: number }) {
  const trackProps = { from: "event_page", step };
  switch (state.kind) {
    case "register":
      return (
        <Button href={state.href} variant="ink" size="lg" className="w-full" trackAs="register_click" trackProps={trackProps}>
          Register, it&apos;s free <ArrowRight size={18} strokeWidth={2} />
        </Button>
      );
    case "join_waitlist":
      return (
        <Button href={state.href} variant="ink" size="lg" className="w-full" trackAs="register_click" trackProps={trackProps}>
          Full — join the waitlist <ArrowRight size={18} strokeWidth={2} />
        </Button>
      );
    case "sign_in":
      return (
        <div className="grid gap-2">
          <Button href={state.href} variant="ink" size="lg" className="w-full" trackAs="register_click" trackProps={trackProps}>
            <LogIn size={18} strokeWidth={2} /> Sign in to register
          </Button>
          {state.full && <p className="text-sm text-ink-2">This step is full. Sign in to join the waitlist.</p>}
        </div>
      );
    case "external":
      return (
        <Button href={state.href} external variant="ink" size="lg" className="w-full" trackAs="register_click" trackProps={trackProps}>
          Register (Google Form) <ArrowRight size={18} strokeWidth={2} />
        </Button>
      );
    case "registered":
      return (
        <Button href={ticketPath(state.registrationId)} variant="primary" size="lg" className="w-full">
          <Check size={18} strokeWidth={2.5} /> Registered ✓ · View ticket
        </Button>
      );
    case "waitlisted":
      return (
        <Button href={ticketPath(state.registrationId)} variant="ghost" size="lg" className="w-full">
          <Hourglass size={18} strokeWidth={2} /> Waitlisted #{state.position} · View status
        </Button>
      );
    case "opens":
      return (
        <p className={note}>
          <Clock size={18} strokeWidth={2} aria-hidden /> Opens on {longDate(state.opensAt)}, {timeOf(state.opensAt)} IST
        </p>
      );
    case "paid_soon":
      return <p className={note}><Clock size={18} strokeWidth={2} aria-hidden /> Paid registration opens soon</p>;
    case "closed":
      return <p className={note}><Lock size={18} strokeWidth={2} aria-hidden /> Registration closed</p>;
  }
}
```

- [ ] **Step 2: Wire the event page**

`app/events/[slug]/page.tsx` — replace the `EventPage` component and add imports:

```tsx
import { getAuthState } from "@/lib/auth/session";
import { ctaEvent, ctaState } from "@/lib/registration/cta";
import { externalRegistrationUrl } from "@/lib/registration/external";
import { getMyRegistration } from "@/lib/registration/server";

const requestNow = () => Date.now();

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const [{ data, ev }, auth] = await Promise.all([findEvent(slug), getAuthState()]);
  if (!ev) notFound();
  const registration = auth.user ? await getMyRegistration(ev.id, auth.user.id) : null;
  const cta = ctaState({
    now: requestNow(),
    event: ctaEvent(ev),
    signedIn: !!auth.user,
    registration,
    externalUrl: externalRegistrationUrl(data.settings.registration),
  });
  return (
    <>
      <JsonLd data={eventJsonLd(ev, data.settings)} />
      <WeekendDetail slug={slug} cta={cta} />
    </>
  );
}
```

`components/weekend/WeekendDetail.tsx`:
- add imports:
  ```ts
  import { RegisterCta } from "@/components/registration/RegisterCta";
  import type { CtaState } from "@/lib/registration/cta";
  ```
- change the signature to `export function WeekendDetail({ slug, cta }: { slug: string; cta: CtaState }) {`
- replace the rail's register button

  ```tsx
                <Button href={registerHref(w.slug)} variant="ink" size="lg" className="mt-6 w-full" trackAs="register_click" trackProps={{ from: "weekend_page", step: w.step }}>
                  Claim your step <ArrowRight size={18} strokeWidth={2} />
                </Button>
  ```
  with
  ```tsx
                <div className="mt-6">
                  <RegisterCta state={cta} step={w.step} />
                </div>
  ```
  (`Button`, `ArrowRight` and `registerHref` stay imported: the completed-step branch still uses them.)

- [ ] **Step 3: New register links, legacy redirect, cleanup**

`lib/weekends.ts` — replace `registerHref`:

```ts
/** Per-session registration page; without a slug, the legacy /register redirect picks the next session. */
export function registerHref(slug?: string) {
  return slug ? `/events/${slug}/register` : "/register";
}
```

`app/register/page.tsx` — replace the whole file:

```tsx
import { redirect } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { pickNext, withStatus } from "@/lib/events/status";
import { externalRegistrationUrl } from "@/lib/registration/external";
import { registerPath } from "@/lib/registration/cta";

const requestNow = () => Date.now();

// The old all-in-one demo form is gone: registration now happens per session at /events/<slug>/register.
// Old links (/register, /register?step=<slug>) keep working through this redirect.
export default async function LegacyRegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const { settings, events } = await getSiteData();
  const external = externalRegistrationUrl(settings.registration);
  if (external) redirect(external);
  const step = typeof sp.step === "string" ? sp.step : "";
  const target = events.find((e) => e.slug === step) ?? pickNext(withStatus(events, requestNow()));
  redirect(target ? registerPath(target.slug) : "/");
}
```

```bash
git rm components/register/RegisterForm.tsx
```

`components/layout/Dock.tsx` — replace the `active` computation with:

```ts
  const active = isHome
    ? spy
    : pathname === "/register" || pathname.endsWith("/register")
      ? "register"
      : pathname.startsWith("/events") || pathname.startsWith("/s/")
        ? "societies"
        : pathname.startsWith("/gallery")
          ? "gallery"
          : "";
```

`app/sitemap.ts` — remove `"/register"` from the `pages` list:

```ts
  const pages = ["", "/gallery", "/resources", "/code-of-conduct", "/privacy"].map((p) => ({
```

`lib/jsonld.tsx` — in `offers`, change the url to the event page:

```ts
      url: `${settings.siteUrl}/events/${w.slug}`,
```

- [ ] **Step 4: Verify**

1. `npx next typegen && npx vitest run && npx tsc --noEmit && npx eslint .` → green; `grep -rn "RegisterForm\|components/register" app components lib` → no matches.
2. `npm run dev`:
   - Signed out, `/events/seeing-machines` → "Sign in to register" → login → (onboarding if needed) → the registration form.
   - Signed in with a ticket → "Registered ✓ · View ticket"; `/events/language-and-machines` → "Opens on 20 October 2026, 9:00 am IST" (before that date); a completed session keeps its "Climbed ✓" panel.
   - `/register?step=seeing-machines` → 307 to `/events/seeing-machines/register`; `/register` → the next session's register page.
   - Hero / dock / announcement "Register" links go to `/events/<next>/register`; the dock highlights Register on that page.
   - Temporarily set `registration.mode` to `external` with a real https form URL in a local DB copy only if available; otherwise rely on the `ctaState`/`externalRegistrationUrl` unit tests (do **not** edit the live settings block).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(events): registration CTA states; retire the demo /register form

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: "Attending (N)" panel on the event page

**Files:**
- Create: `components/registration/AttendingPanel.tsx`
- Modify: `app/events/[slug]/page.tsx`, `components/weekend/WeekendDetail.tsx`

**Interfaces:**
- Consumes: `getAttendees` (Task 6), `type Attendee` (Task 3), `loginPath` (Task 5), `Avatar`.
- Produces: `interface AttendingProps { count: number; signedIn: boolean; attendees: Attendee[] | null; signInHref: string }`; `AttendingPanel(props: AttendingProps)`; `WeekendDetail({ slug, cta, attending })`.

- [ ] **Step 1: Component**

`components/registration/AttendingPanel.tsx`:

```tsx
import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Attendee } from "@/lib/registration/types";

export interface AttendingProps {
  count: number;
  signedIn: boolean;
  /** Null when signed out, or when the list could not be loaded. */
  attendees: Attendee[] | null;
  signInHref: string;
}

const SHOWN = 30;

/** Right-rail list of confirmed attendees. Signed-out visitors only see the count (profiles are members-only). */
export function AttendingPanel({ count, signedIn, attendees, signInHref }: AttendingProps) {
  return (
    <section className="box p-6 shadow-hard" aria-labelledby="attending-h" data-reveal>
      <h2 id="attending-h" className="mono mb-4 flex items-center gap-2 font-bold">
        <Users size={16} strokeWidth={2} aria-hidden /> Attending ({count})
      </h2>
      {!signedIn ? (
        <p className="text-sm text-ink-2">
          <Link href={signInHref} className="font-semibold underline underline-offset-4">Sign in</Link> to see who&apos;s going.
        </p>
      ) : attendees === null ? (
        <p className="text-sm text-ink-3">We couldn&apos;t load the list right now.</p>
      ) : attendees.length === 0 ? (
        <p className="text-sm text-ink-3">No one yet. Be the first to claim a seat.</p>
      ) : (
        <>
          <ul className="grid gap-3">
            {attendees.slice(0, SHOWN).map((a) => (
              <li key={a.handle}>
                <Link href={`/u/${encodeURIComponent(a.handle)}`} className="flex min-h-11 items-center gap-3 hover:bg-paper-2">
                  <Avatar name={a.fullName || a.handle} photo={a.avatarUrl} size={40} decorative referrerPolicy="no-referrer" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{a.fullName || `@${a.handle}`}</span>
                    {a.headline && <span className="block truncate text-xs text-ink-3">{a.headline}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {attendees.length > SHOWN && <p className="mt-3 text-sm text-ink-3">and {attendees.length - SHOWN} more</p>}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire it in**

`app/events/[slug]/page.tsx` — add imports `import { getAttendees } from "@/lib/registration/server";` (extend the existing import) and `import { loginPath } from "@/lib/registration/cta";` (extend the existing import), then replace the registration lookup and the return:

```tsx
  const [registration, attendees] = auth.user
    ? await Promise.all([getMyRegistration(ev.id, auth.user.id), getAttendees(ev.id)])
    : ([null, null] as const);
  const cta = ctaState({
    now: requestNow(),
    event: ctaEvent(ev),
    signedIn: !!auth.user,
    registration,
    externalUrl: externalRegistrationUrl(data.settings.registration),
  });
  const attending = {
    count: attendees?.length ?? ev.seatsFilled,
    signedIn: !!auth.user,
    attendees,
    signInHref: loginPath(`/events/${ev.slug}`),
  };
  return (
    <>
      <JsonLd data={eventJsonLd(ev, data.settings)} />
      <WeekendDetail slug={slug} cta={cta} attending={attending} />
    </>
  );
```

`components/weekend/WeekendDetail.tsx`:
- add `import { AttendingPanel, type AttendingProps } from "@/components/registration/AttendingPanel";`
- signature: `export function WeekendDetail({ slug, cta, attending }: { slug: string; cta: CtaState; attending: AttendingProps }) {`
- in the `<aside …>` rail, insert `<AttendingPanel {...attending} />` between the CTA box (`</div>` that closes the yellow/paper panel) and the "Share this step" box.

- [ ] **Step 3: Verify**

1. `npx vitest run && npx tsc --noEmit && npx eslint .` → green.
2. `npm run dev`:
   - Signed out: "Attending (N)" with N = confirmed seats and "Sign in to see who's going" (link returns to the event after login).
   - Signed in: your avatar + name appear (after registering), linking to `/u/<handle>`; avatars from non-allowed hosts fall back to monograms; DevTools → Network shows avatar requests without a `Referer`.
   - Check the HTML source of the signed-out page: no handles or names of attendees.

- [ ] **Step 4: Commit**

```bash
git add app/events components/registration/AttendingPanel.tsx components/weekend
git commit -m "feat(events): attending panel for signed-in members

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Docs, whole-branch review, merge, deploy, live end-to-end check

**Files:**
- Modify: `README.md`, `design-system/MASTER.md`
- (Controller-led with the user) review, merge, deploy, live test.

- [ ] **Step 1: Docs (implementer)**

`README.md`:
- Replace the whole `### Registration` subsection (under section 3) with:

  ```markdown
  ### Registration
  Registration is per session at `/events/<slug>/register` (signed-in, onboarded members). Old `/register?step=<slug>` links redirect there.

  - Each event row carries its own `capacity`, `price_paise` (0 = free; paid registration arrives with Razorpay in Phase 4), `ticket_type` (`qr` or `token`), `token_prefix` (e.g. `RAS-01`), `registration_opens_at` / `registration_closes_at` (empty = open until the session starts) and `questions` (custom questions, see `lib/registration/questions.ts`; types `text`, `textarea`, `single_choice`, `multi_choice`, `checkbox`).
  - In the `registration` object of the `settings` site block, `mode: "external"` sends every Register button to `googleFormUrl` (https only). In the default `mode: "onsite"`, `googleFormUrl` is offered as a fallback when an on-site registration fails; the placeholder `your-form-id` is ignored. `registration.endpoint` is no longer used.
  ```

- Add after section `3b` a section:

  ```markdown
  ## 3c. Registration & tickets

  - Users never write the `registrations` table. Two RPCs do: `register_for_event(event_id, answers)` and `cancel_registration(registration_id)` (security definer). Each locks the event row, so capacity is never exceeded, token numbers stay unique and waitlist order is first-come-first-served.
  - Full sessions take a waitlist. When a confirmed attendee cancels, waitlist #1 is confirmed immediately inside the cancel RPC. **No emails are sent yet** (no sending domain); the ticket page and My tickets always show the current status.
  - Tickets: QR tickets encode only an opaque 26-character code (no personal data); token tickets show `PREFIX-0042`. `/me/tickets` lists upcoming and past tickets; each ticket can be downloaded as a PNG, added to a calendar, and cancelled (free sessions, before the start).
  - The event page shows "Attending (N)". Signed-in members see names, photos and headlines (from the `event_attendees` view); anonymous visitors only see the count.
  - SQL assertion scripts: `supabase/tests/registrations-rls.sql` and `supabase/tests/registrations-rpc.sql` (run each as one query; they roll back).
  - Per-event registration settings for the seeded events live in `supabase/seed-data/registration.ts`. `npx tsx scripts/generate-seed.ts --registration-sql` prints the matching targeted-update migration; never run `supabase/seed.sql` against the live database.
  ```

- In section 5 (*Project structure*): replace `/register,` in the `app/` line with `/register (redirect), /events/[slug]/register, /me/tickets (+ /me/tickets/[id]),`; replace the `register/           registration form` line with `registration/       registration form, questions, CTA, attending panel` and add `tickets/            ticket card, actions, list items`; add `registration/      registration schemas, CTA states, errors, server reads and actions` and `tickets/           token format, QR matrix, PNG export` under `lib/`.

`design-system/MASTER.md` — under the existing component notes add:

```markdown
- **Tickets:** `components/tickets/TicketCard.tsx` — yellow mono header, ink 2px border, hard shadow; QR is an inline SVG with a 4-module white quiet zone; token tickets show the token in large mono digits.
- **Typed errors:** registration/cancel failures render `components/registration/ErrorPanel.tsx` (`role="alert"`, takes focus unless the fix is in the form fields) with one recovery action (retry + Google Form fallback, sign in, finish profile, My tickets, back to session).
- **Attendee lists:** avatars 40px, `referrerPolicy="no-referrer"`, only through `safeAvatarUrl()`; signed-out visitors see the count only.
```

Gate, then commit:

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git commit -am "docs: registration and tickets

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Live database re-verification (controller)**

Run each script as one MCP `execute_sql` call and confirm the pass row: `supabase/tests/security-hardening.sql`, `supabase/tests/profiles-rls.sql`, `supabase/tests/registrations-rls.sql`, `supabase/tests/registrations-rpc.sql`. Run `get_advisors` for `security` and `performance`; record anything new in `.superpowers/sdd/progress.md`. Run `npx vitest run tests/rls` against the live project.

- [ ] **Step 3: Whole-branch review (controller)**

Use superpowers:requesting-code-review for `main..phase3-registration`. Focus areas to hand the reviewer: RPC locking and lock order, waitlist compaction under the deferred unique constraint, grants on every new function/view (anon must have none on writes or attendee data), zero-row write handling in `registerForEvent`, `requireOnboarded` before lookups on every new page, avatar/URL rendering rules, focus management in `RegistrationForm` / `CancelRegistration`, Workers compatibility of `uqr`. Fix findings in one wave, re-run the gate and Step 2.

- [ ] **Step 4: Merge and deploy (controller)**

Use superpowers:finishing-a-development-branch to merge `phase3-registration` into `main` and push. Cloudflare Workers Builds should deploy automatically; **it did not trigger for the Phase 2 push**, so if no new deployment appears within a few minutes, deploy manually:

```bash
CLOUDFLARE_ACCOUNT_ID=7a852bedf2056637d90bd9534e6cd7c1 npm run deploy
```

Smoke checks:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://stairway.ieeesbcek.workers.dev/events/seeing-machines            # 200
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://stairway.ieeesbcek.workers.dev/events/seeing-machines/register  # 307 → /login?next=…
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "https://stairway.ieeesbcek.workers.dev/register?step=seeing-machines"  # 307 → /events/seeing-machines/register
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://stairway.ieeesbcek.workers.dev/me/tickets           # 307 → /login?next=%2Fme%2Ftickets
```

- [ ] **Step 5: Live end-to-end check (with the user, phone + desktop)**

1. Signed out on `/events/seeing-machines`: CTA "Sign in to register"; "Attending (N)" with "Sign in to see who's going".
2. Sign in with Google → finish onboarding if prompted → the registration form opens with name/college/branch/year/phone prefilled.
3. Submit with the laptop question empty → focus moves to it with an error under the group. Answer, confirm → ticket page with the green banner and a QR code; scan it with a phone (shows the 26-character code only).
4. Download the PNG; add to Google Calendar; open a share link (shares the event page, not the ticket).
5. Back on `/events/seeing-machines`: "Registered ✓ · View ticket"; you appear in Attending with your avatar, linking to `/u/<handle>`.
6. `/me`: "Your next step" card with countdown; `/me/tickets` lists the ticket; the sidebar back button is still at the top.
7. Register for `wie-ai-healthtech`: token ticket `WIE-01-000N`, kit-size question required.
8. `/events/language-and-machines` shows "Opens on 20 October 2026, 9:00 am IST" (until that date).
9. Cancel the WIE registration → `/me/tickets?cancelled=1`; the event page offers Register again and the attending count drops.
10. Keyboard only: complete a registration with Tab/Space/Enter; reduced-motion on: no layout jumps.
11. Decide with the user whether to keep or cancel these test registrations (they are real rows on the live database).

---

## Self-review notes

- **Spec coverage (Phase 3):** registrations table with every Phase 4 column/status (T1); `register_for_event` with published + window + one-per-user + `FOR UPDATE` capacity + waitlist + ticket code + token (T2); `cancel_registration` with in-transaction promotion (T2); RLS: owner / society admin read, no user writes, `event_attendees` (handle, name, avatar, headline) for authenticated, anon count only via `event_seat_counts` (T1); per-event ticket type, token prefix, custom questions with zod + SQL validation (T1–T4); seed config via targeted migration (T4); CTA states Register / Registered ✓ / Waitlisted #n / Full — join waitlist / Opens on … / Closed / Sign in / external Google Form / paid soon (T5, T10); registration form prefilled from profile and saved back, validation on blur, focus first invalid (T7); ticket screen with QR or token, PNG download, calendar, share, cancel (T8); My tickets + nav + Overview next-step card with countdown (T9); attendee panel with sign-in prompt (T11); old `/register` demo form retired with redirects (T10); typed errors with recovery and Google Form fallback (T3, T7); docs, review, deploy with the manual fallback, live check (T12).
- **Deliberately deferred:** emails (no sending domain), `file` questions, PDF tickets, admin writes/check-in, `payment_events`, holds/cron (see *Spec deviations & deferrals*).
- **Type consistency:** `MyRegistration`, `Attendee`, `RegistrationStatus` (T3) are used unchanged by `cta.ts` (T5), `server.ts`/`tickets.ts` (T6) and the components (T7–T11). `TicketSummary`/`TicketDetail` (T6) feed `TicketListItem`, `NextTicketCard` (T9) and the ticket page (T8). `CtaState` kinds (T5) match `RegisterCta` cases (T10) and `RegistrationUnavailable` (T7). `RegisterResult`/`CancelResult` (T6) match their callers (T7, T8). RPC argument names `p_event_id`, `p_answers`, `p_registration_id` (T2) match `actions.ts` (T6), checked by `tsc` against the regenerated types. Form field ids (`fullName`…, `q-<id>`) come from `fieldIdFor` (T3) and match `RegistrationForm`/`QuestionField` (T7).
- **Concurrency note:** the SQL scripts prove capacity under sequential saturation; true concurrent safety rests on the event-row `FOR UPDATE` lock taken first by both RPCs plus the unique constraints `(event_id, user_id)`, `(event_id, token_number)` and deferred `(event_id, waitlist_position)`.
