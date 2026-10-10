# Phase 5 — Admin Dashboard Implementation Plan (LEAN)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. One Sonnet implementer per task; ONE combined review per review point (listed at the end of the task overview). Steps use checkbox syntax. **Cost mode:** this plan gives full code only for security-critical parts (SQL, authorization helpers, action guards). UI tasks give structure, props, states and a11y rules; the implementer writes the JSX following `design-system/MASTER.md` and the existing `/me` pages. Do not re-open decisions below.

**Goal:** Organisers run st(AI)rway from `/admin`: super admins run the whole site; society admins run their own society. Events (draft, publish, duplicate, cancel, media, questions), registrations (search, CSV, cancel, promote waitlist, refund), phone door check-in, society pages, site content, admin invites and roles, audit log, account anonymisation. Every mutation re-authorises on the server and leaves an audit row.

**Architecture:** Authorization lives in the database first: existing RLS + new guard triggers + `SECURITY DEFINER` functions in `private` (explicit grants, `search_path = ''`) behind thin `SECURITY INVOKER` wrappers in `public` (the Phase 3/4 pattern). Next.js server actions only re-authenticate (`getClaims` + `admin_roles` read through the session client), validate with zod, derive the society from the database row (never from client input), call RLS tables or RPCs with the **session** client, write audit entries and `revalidatePath`. The service role is used in exactly two new server-only modules (refund, anonymise-avatar cleanup). Reads use RLS (admins already read `registrations` of their society's events) except registrant contact details, which come from one definer function that returns the minimal set.

**Tech Stack:** Next.js 16.3.8 App Router + server actions + route handler (CSV), React 19, Supabase (RLS, RPC, Storage `media` bucket), zod 4, Vitest 5, lucide-react, OpenNext/Cloudflare Workers. One new client-only dependency: `jsqr` (MIT, exact version, dynamically imported in the scanner only — iOS Safari has no `BarcodeDetector`).

**Spec:** `docs/superpowers/specs/2026-10-04-platform-backend-design.md` §3 (RLS table, audit_log, admin_invites), §4 (Admin dashboard), §5 (check-in). Earlier plans: `2026-10-06-phase3-registration.md`, `2026-10-10-phase4-payments-sync.md` (deferrals closed here: admin refund UI, account anonymisation, waitlist promotion after a capacity raise, check-in, token-ticket identity check). Ledger: `.superpowers/sdd/progress.md`.

## Global Constraints

- Next.js stays `16.3.8`; read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and `.../03-file-conventions/route.md` before writing actions / routes. **No `proxy.ts`**, no `runtime = "edge"`, no Node-only modules (`node:crypto`, `Buffer`-dependent libs) in app code: use WebCrypto (`crypto.subtle`) and `btoa`. Tests may use `node:crypto`.
- **Workers FREE (10 ms CPU) reality:** admin pages are low traffic but must stay light: paginate everything (≤ 100 rows/page), CSV capped at 2 000 rows, no client-side libraries on pages that do not need them, the scanner chunk (and `jsqr`) loads only on the check-in page, no new server-side dependency.
- **Authorization rule (non-negotiable):** every server action and every `/admin` page calls `authorize*()` from `lib/admin/auth.ts` first. The society of an existing entity is read from the database row by its id; a `societyId` sent by the client is accepted only for *creating* rows and is checked against the admin's roles. Hiding a button is UX, never security. DB functions re-check independently (defence in depth).
- **Privacy rule:** admins never read `profile_private` directly (RLS: owner only — unchanged). The only contact data an admin can obtain is `public.admin_event_registrants()`: email + phone of registrants of **their own society's events** whose status is `confirmed | waitlisted | pending_payment | refund_needed`. `ieee_member_id` is never returned (there is no member pricing; revisit if member-priced events are added). Payment ids are returned to super admins only. CSV omits payment ids for everyone.
- **Audit rule:** content tables are audited by an `AFTER` trigger (actor = `auth.uid()`, only when the actor is an admin); registration/people operations call `private.write_audit` inside their definer function; actions that cannot be inside SQL (CSV export, refund, media upload) call `public.log_admin_event` with a whitelisted action. Summaries hold column *names*, ids and a few enum/number old→new values — never free text, emails, phone numbers, answers or secrets. `audit_log` is append-only and super-admin-readable.
- **Service role** (`createAdminClient`) is added to `ADMIN_ALLOWED` in `tests/payments/boundaries.test.ts` for exactly: `lib/admin/refund-action.ts`, `lib/admin/anonymise-action.ts`. Nothing else in Phase 5 imports it. Both are `"use server"` modules that authorise the caller first.
- **Money stays manual-flagged:** the UI never toggles `private.feature_flags` (the go-live checklist keeps that a SQL step). Refund UI is disabled with an explanation unless `paymentsConfig().enabled` AND the DB flag is on; society admins never see refund controls.
- **Routing/SEO:** `/admin` is `noindex`, added to `app/robots.ts` disallow (`/admin/`, `/admin$`), excluded from the sitemap. The `/admin` layout does a soft guard (signed-out → `/login?next=/admin`, non-admin → `notFound()`); **every page and action guards again with its own path**. Non-admins get a 404, not a "forbidden" page (no role disclosure).
- **Dashboards rule:** `BACK TO SITE` is the FIRST control in the left sidebar (existing `DashboardShell` behaviour; the admin variant must keep it first). The check-in scanner has its own back control (top-left) to the registrations page.
- Cobalt Circuit: cobalt chrome + cream work panels; tokens only from `lib/design/tokens.ts` / `globals.css`; `components/ui/Field.tsx`; errors `role="alert"`, status `aria-live="polite"`; 44 px targets (48 px on the scanner); focus rings visible; `prefers-reduced-motion` respected; no colour-only status (icon + word).
- Supabase project `nfrdsdnrtsbttyrmfppy`, shared live DB: migrations are **additive**, applied with MCP `apply_migration`, then the committed file is renamed to the version `list_migrations` reports, then `database.types.ts` is regenerated (`generate_typescript_types`). **Never run `supabase/seed.sql` live.** SQL assertion scripts (`supabase/tests/admin-*.sql`) run as ONE `execute_sql` call inside `begin … rollback`, non-vacuous (each negative assertion has a matching positive one), ending with `select '<name>: all assertions passed'`. After every migration `get_advisors` (security + performance) must show 0 new findings (allowed: the pre-existing leaked-password-protection Auth warning; INFO "unused index" for new indexes).
- Every task ends with `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` all clean, then a commit ending with a blank line and `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Branch `phase5-admin` (created in Task 1). Stop any `next dev` / `workerd` before an OpenNext build. Site name is exactly `st(AI)rway`. Money in paise; display `₹` en-IN; times `Asia/Kolkata`.

## Decisions (final)

| Topic | Decision |
|---|---|
| Storage | Reuse the existing public `media` bucket and `private.can_manage_media` (society admins only under `societies/<society-uuid>/`, super admin anywhere). "event-media / site-media" = path prefixes: `societies/<society-uuid>/events/<event-uuid>/…` and `site/…` (super only). No new buckets. Uploads go browser → Storage with a server-issued **signed upload URL** (action authorises, picks a random unguessable path, checks declared MIME/size); the action later stores only a URL that starts with this project's public storage prefix + the allowed folder. Bucket MIME allow-list (no SVG) + 100 MB cap stay; images are additionally capped at 5 MB, posters/logos/gallery by the action and the client. |
| Video | `events.video_url`: https only; accepted forms: YouTube (`youtube.com/watch?v=`, `youtu.be/`), Vimeo (`vimeo.com/<digits>`), or a direct `.mp4/.webm` https URL (own bucket or any https host). Parsed by `lib/admin/video.ts` to a normalised canonical URL; anything else rejected. |
| Society admin scope | Events/registrations/check-in of their society; society description/logo/page_content (identity fields are blocked by `guard_society_update`); tracks; speakers of their society; gallery of their society. Not: site content, settings, admins, audit, refunds, anonymisation. |
| Event guards (DB) | A society admin cannot move an event to another society, change slug after first publish, cancel via plain UPDATE (use `admin_cancel_event`), unpublish an event that has live registrations, change price once a paid registration exists, lower capacity below taken seats, or change ticket type/token prefix once a registration is confirmed. |
| Check-in | QR code → immediate check-in. Typed token / number → server returns `confirm_identity` with name + photo + college; the organiser taps "Confirm it's them" (tokens are guessable). Manual pick from the name search = identity confirmed. Window: 24 h before start to 24 h after end. Already-checked-in returns the first time and **never** overwrites it. Check-ins are not audit-logged (volume); `checked_in_by` + `checked_in_at` are the record. |
| Roles | No direct role inserts from the UI: roles are created only by accepting an invite. Revoking = delete via RLS (audited by trigger). The last super admin can never be removed or demoted (trigger). |
| Invites | No email (no sending domain): super admin creates an invite, the page shows the one-time link `…/invite/<token>` once; DB stores only SHA-256 hex of the token (32 random bytes, base64url). Acceptance requires the signed-in user's **confirmed** email to equal the invite email; expiry 7 days; one use; uniform `invalid_invite` error. The link page sends `Referrer-Policy: no-referrer`. |
| Anonymisation | Super-admin only, never for admins or yourself, blocked while the user has a live seat or open payment (cancel/refund first). Keeps the profile row as a tombstone (handle `deleted-xxxxxxxxxxxx`) so financial `registrations`, `private.payment_*`, receipts and `audit_log` stay intact (`ON DELETE RESTRICT` is respected — nothing is deleted). Erases: name, avatar (storage objects too), headline, bio, college, branch, year, skills, links, projects, experience, phone, email, IEEE id, registration answers; bans + renames the auth user, removes identities and sessions. **Remains:** registration ids/status/amounts/receipt numbers/Razorpay ids/ticket codes/timestamps, the payment ledger, audit rows. Fund Easy keeps its own copy of already-synced name/email (out of our control — documented). |
| Overview revenue | Net confirmed paid amount + count of refunds pending; shown only when payments are enabled (flag + env). |
| Settings editor | Super admin edits a whitelist of `settings` block fields (announcement, tagline/supportLine/description, contact, social, ieee, aftermovieUrl, sponsorDeckUrl, speakerFormUrl, volunteerFormUrl) and `stats`; `name`, `siteUrl`, `gaId`, `venue`, `registration`, `newsletter` stay SQL-only. Read-merge-validate with `SettingsSchema`, optimistic `updated_at` check. Payments status panel is read-only booleans (never secret values). |
| Duplicate event | Server-side insert of a `draft` copy (title `"<title> (copy)"`, new unique slug + next free step number, dates kept, registration window cleared, speakers/questions copied, no registrations). |

## Capability matrix

| Capability | super_admin | society_admin |
|---|---|---|
| Events: create / edit / publish / unpublish / duplicate / cancel | all societies | own society |
| Event delete | drafts without registrations | same, own society |
| Registrations: list, search, CSV, cancel, promote waitlist, undo check-in | all | own society's events |
| Registrant email + phone | yes | own society's events, live statuses only |
| Payment / receipt ids | yes | receipt number only |
| Refund (Razorpay) | yes, payments on | no |
| Check-in scanner | all | own society's events |
| Society page (description, logo, page content) | all | own |
| Society name / slug / colour / order | yes | no (DB trigger) |
| Tracks, gallery | all | own |
| Speakers | all (incl. shared) | own society's |
| Site content lists, settings, stats | yes | no |
| Admin roles + invites | yes | no |
| Audit log | yes | no |
| Anonymise account | yes | no |
| System status (payments/sync booleans) | yes | no |

## File Map

| Path | Responsibility |
|---|---|
| `supabase/migrations/*_admin_foundation.sql` | `audit_log`, `write_audit`, `log_admin_event`, content audit triggers, event guard, last-super-admin guard, `admin_invites` |
| `supabase/migrations/*_admin_registrations.sql` | cancel-reason values, `admin_scope`, registrants, check-in, undo, cancel registration, promote, cancel event (+ public wrappers) |
| `supabase/migrations/*_admin_people.sql` | `accept_admin_invite`, `anonymise_user`, `admin_payments_flag`, `admin_overview` |
| `supabase/tests/admin-foundation.sql`, `admin-registrations.sql`, `admin-people.sql` | rolled-back assertion scripts |
| `lib/admin/auth.ts` | `getAdminContext`, `authorize*`, capability helpers (pure part: `lib/admin/caps.ts`) |
| `lib/admin/result.ts` | `ActionResult`, error codes, DB-error mapping |
| `lib/admin/event-schema.ts`, `lib/admin/content-schemas.ts`, `lib/admin/video.ts`, `lib/admin/media.ts`, `lib/admin/csv.ts`, `lib/admin/invite.ts` | pure helpers + zod |
| `lib/admin/*-actions.ts` | server actions per area (`"use server"`) |
| `lib/admin/refund-action.ts`, `lib/admin/anonymise-action.ts` | the only service-role users |
| `app/admin/**` | pages; `components/admin/**` UI |
| `app/admin/events/[id]/export/route.ts` | CSV route handler |
| `tests/admin/**` | Vitest |

## Task overview

1. Admin foundation migration: audit log, guards, invites table
2. Admin registration operations migration (registrants, check-in, cancel, promote, cancel event)
3. Admin people migration (invite acceptance, anonymisation, payments flag, overview)
4. Admin core: authorization helpers, action result, `/admin` shell, overview page
5. Events: list, create/edit core, publish / duplicate / cancel
6. Event editor extras: media upload, video URL, agenda/lists/speakers, custom questions, resources
7. Registrations page, CSV export, cancel / promote / refund actions
8. Check-in scanner
9. Society management and site content editor
10. People (admins, invites, anonymise), audit log, settings/status
11. Docs, advisors, whole-branch review, merge, deploy, USER checklist

**Review points (one combined Sonnet review each; fix round included, no separate re-review):** after Tasks 1-3 (database), after Tasks 4-6, after Tasks 7-9, final after Tasks 10-11.

---
### Task 1: Admin foundation migration (audit log, guards, invites table)

**Goal:** the database enforces admin safety rules and records every content mutation.
**Files:** create `supabase/migrations/20261011000001_admin_foundation.sql` (renamed to the live version), `supabase/tests/admin-foundation.sql`; regenerate `lib/supabase/database.types.ts`.
**Consumes:** `private.is_super_admin/is_society_admin/is_any_admin`, `private.seats_taken(uuid)`, `public.admin_roles`, `public.events`, `public.registrations`.
**Produces:** `public.audit_log`; `private.write_audit(action, target_type, target_id, society_id, summary)`; `public.log_admin_event(...)` (whitelisted); triggers `*_audit`, `events_guard`, `admin_roles_guard`; `public.admin_invites`.

- [ ] **Step 1:** `git checkout main && git pull --ff-only && git checkout -b phase5-admin`.
- [ ] **Step 2:** write the migration (full code below; `private` functions always get explicit revokes — default privileges do not cover them).

```sql
-- Phase 5 (part 1): audit log, admin guards, admin invites. Additive; no existing object is dropped.

-- 1. Audit log: append-only, super-admin readable, written only by definer functions.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text not null default '',
  action text not null check (char_length(action) between 3 and 60),
  target_type text not null check (char_length(target_type) between 2 and 40),
  target_id text check (char_length(target_id) <= 80),
  society_id uuid references public.societies(id) on delete set null,
  summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 2048)
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_society_idx on public.audit_log (society_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated, service_role;
grant select on public.audit_log to authenticated;
create policy "super admin reads audit" on public.audit_log for select to authenticated
  using (private.is_super_admin());

create or replace function private.audit_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'audit_log is append-only' using errcode = '42501'; end $$;
revoke execute on function private.audit_append_only() from public, anon, authenticated, service_role;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function private.audit_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_append_only();

create or replace function private.write_audit(
  p_action text, p_target_type text, p_target_id text, p_society_id uuid, p_summary jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_label text;
begin
  select p.handle into v_label from public.profiles p where p.id = v_uid;
  insert into public.audit_log (actor_id, actor_label, action, target_type, target_id, society_id, summary)
  values (v_uid, coalesce(v_label, ''), p_action, p_target_type, p_target_id, p_society_id, coalesce(p_summary, '{}'::jsonb));
end $$;
revoke execute on function private.write_audit(text, text, text, uuid, jsonb) from public, anon, authenticated, service_role;

-- 2. Whitelisted entries for things SQL cannot see (CSV export, refunds, uploads, speaker links).
create or replace function private.log_admin_event(
  p_action text, p_target_type text, p_target_id text, p_society_id uuid, p_summary jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_any_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('registrations.export', 'refund.attempt', 'refund.result', 'media.upload', 'event.speakers') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_society_id is null then
    if not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not private.is_society_admin(p_society_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_summary is not null and (jsonb_typeof(p_summary) <> 'object' or octet_length(p_summary::text) > 1024) then
    raise exception 'invalid_summary' using errcode = 'P0001';
  end if;
  perform private.write_audit(p_action, left(coalesce(p_target_type, 'misc'), 40), left(p_target_id, 80), p_society_id, p_summary);
end $$;
revoke execute on function private.log_admin_event(text, text, text, uuid, jsonb) from public, anon, service_role;
grant execute on function private.log_admin_event(text, text, text, uuid, jsonb) to authenticated;

create function public.log_admin_event(
  p_action text, p_target_type text, p_target_id text, p_society_id uuid, p_summary jsonb default '{}'::jsonb)
returns void language sql security invoker set search_path = '' as $$
  select private.log_admin_event(p_action, p_target_type, p_target_id, p_society_id, p_summary);
$$;
revoke execute on function public.log_admin_event(text, text, text, uuid, jsonb) from public, anon, service_role;
grant execute on function public.log_admin_event(text, text, text, uuid, jsonb) to authenticated;

-- 3. Content-table audit trigger: only admin actors are logged (service role, cron, SQL editor are not).
create or replace function private.audit_content_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_r jsonb := coalesce(v_n, v_o);
  v_cols text[];
  v_sid uuid;
  v_summary jsonb := jsonb_build_object('op', tg_op);
begin
  if (select auth.uid()) is null or not private.is_any_admin() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(e.k order by e.k), '{}') into v_cols
      from jsonb_each(v_n) as e(k, v) where e.k <> 'updated_at' and v_o -> e.k is distinct from e.v;
    if cardinality(v_cols) = 0 then return null; end if;
    v_summary := v_summary || jsonb_build_object('columns', to_jsonb(v_cols))
      || coalesce((select jsonb_object_agg(k, jsonb_build_object('from', v_o -> k, 'to', v_n -> k))
                     from unnest(array['status', 'capacity', 'price_paise', 'role', 'slug']) as k
                    where v_o -> k is distinct from v_n -> k), '{}'::jsonb);
  end if;
  v_sid := case tg_table_name when 'societies' then (v_r ->> 'id')::uuid else nullif(v_r ->> 'society_id', '')::uuid end;
  perform private.write_audit(tg_table_name || '.' || lower(tg_op), tg_table_name,
                              coalesce(v_r ->> 'id', v_r ->> 'key'), v_sid, v_summary);
  return null;
end $$;
revoke execute on function private.audit_content_change() from public, anon, authenticated, service_role;

do $$ declare t text; begin
  foreach t in array array['events', 'societies', 'tracks', 'speakers', 'gallery_items', 'site_blocks', 'sponsors',
                           'team_members', 'faqs', 'testimonials', 'admin_roles'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit_content_change()', t || '_audit', t);
  end loop;
end $$;

-- 4. Event guard (admins write events through RLS; these rules RLS cannot express).
create or replace function private.guard_event_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;             -- service role / cron / SQL editor
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
create trigger events_guard before insert or update on public.events
  for each row execute function private.guard_event_write();

-- 5. The last super admin can never be deleted or demoted (also stops an auth.users cascade removing them).
create or replace function private.guard_last_super_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'super_admin' and (tg_op = 'DELETE' or new.role <> 'super_admin')
     and not exists (select 1 from public.admin_roles r where r.role = 'super_admin' and r.id <> old.id) then
    raise exception 'last_super_admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function private.guard_last_super_admin() from public, anon, authenticated, service_role;
create trigger admin_roles_guard before update or delete on public.admin_roles
  for each row execute function private.guard_last_super_admin();

-- 6. Invites: hash only, super admin only. The token itself never reaches the database.
create table public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254
                             and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role public.admin_role not null,
  society_id uuid references public.societies(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check ((role = 'super_admin' and society_id is null) or (role = 'society_admin' and society_id is not null))
);
create index admin_invites_society_idx on public.admin_invites (society_id);
create index admin_invites_created_by_idx on public.admin_invites (created_by);
create index admin_invites_accepted_by_idx on public.admin_invites (accepted_by);
alter table public.admin_invites enable row level security;
revoke all on public.admin_invites from public, anon, authenticated, service_role;
grant select (id, email, role, society_id, created_by, created_at, expires_at, accepted_at, accepted_by, revoked_at)
  on public.admin_invites to authenticated;
grant insert (email, role, society_id, token_hash, created_by, expires_at) on public.admin_invites to authenticated;
grant update (revoked_at) on public.admin_invites to authenticated;
create policy "super admin reads invites" on public.admin_invites for select to authenticated using (private.is_super_admin());
create policy "super admin creates invites" on public.admin_invites for insert to authenticated
  with check (private.is_super_admin() and created_by = (select auth.uid()) and accepted_at is null);
create policy "super admin revokes invites" on public.admin_invites for update to authenticated
  using (private.is_super_admin() and accepted_at is null) with check (private.is_super_admin());
create trigger admin_invites_audit after insert or update on public.admin_invites
  for each row execute function private.audit_content_change();
```

- [ ] **Step 3:** apply with MCP `apply_migration` (name `admin_foundation`), rename the file to the reported version, regenerate types.
- [ ] **Step 4:** write `supabase/tests/admin-foundation.sql` (fixtures: 1 super admin, 1 society admin of `ras`, 1 society admin of `cs`, 1 plain user, one `ras` event; impersonate with `set local role authenticated` + `set_config('request.jwt.claims', …)` as in `registrations-rpc.sql`) and run it. **Required assertions (each with its positive twin):**
  - audit: an event title update by the ras admin writes exactly one `events.update` row whose `columns` contains `title`; an update with claims cleared (service-role style) writes none; a plain user's profile update writes none; `audit_log` UPDATE/DELETE/TRUNCATE raise `42501`; ras admin and plain user read 0 audit rows, super admin reads ≥ 1; `log_admin_event` with action `role.granted` raises `invalid_action`, with `registrations.export` for a foreign society raises `42501`, for the own society succeeds.
  - event guard: ras admin cannot set `society_id` to cs (`42501`) nor insert `status='cancelled'`; cannot UPDATE `status='cancelled'` (`use_cancel_event`); can set `draft→published`; cannot go `published→draft` with a confirmed registration (`has_registrations`), can without; cannot change `slug` of a published event; cannot change price while a paid confirmed row exists (`price_locked`) but can when none; cannot lower capacity under seats taken; `ticket_locked` once a token exists; super admin may move an event between societies.
  - last super admin: deleting/demoting the only super admin raises `last_super_admin`; with a second super admin the delete works.
  - invites: society admin / plain user select 0 rows and cannot insert; super admin insert works with `created_by = self`, forged `created_by` fails; `select token_hash` as `authenticated` raises `42501`; updating any column except `revoked_at` fails; the email check rejects upper-case and blank values.
- [ ] **Step 5:** MCP `get_advisors` (security + performance); fix or justify. Commit `feat(db): admin audit log, guards and invites` (+ trailer).

---

### Task 2: Admin registration operations migration

**Goal:** every registration-changing admin operation is one audited, locked, scope-checked SQL function.
**Files:** `supabase/migrations/20261011000002_admin_registrations.sql`, `supabase/tests/admin-registrations.sql`, regenerated types.
**Consumes:** Task 1 (`write_audit`, GUC `stairway.admin_cancel` read by `guard_event_write`), `private.promote_waitlist(uuid)` and `private.compact_waitlist(uuid)` (caller must hold the event row lock), `public.registrations`, `profile_private`.
**Produces (public wrappers, `security invoker`, `authenticated` only):**
`admin_event_registrants(p_event_id uuid, p_status text default null, p_q text default null, p_limit int default 100, p_offset int default 0) → jsonb {total, rows[]}`;
`admin_check_in(p_event_id uuid, p_code text default null, p_registration_id uuid default null, p_confirm boolean default false) → jsonb {result, attendee?, checked_in_at?}`;
`admin_undo_check_in(p_registration_id uuid) → jsonb`; `admin_cancel_registration(p_registration_id uuid) → jsonb {registration_id, status, promoted}`;
`admin_promote_waitlist(p_event_id uuid) → jsonb {promoted}`; `admin_cancel_event(p_event_id uuid) → jsonb {cancelled, refund_needed, waitlisted}`.
`result` ∈ `checked_in | already_checked_in | confirm_identity | not_found | not_confirmed | event_not_open | outside_window | invalid_code`.

- [ ] **Step 1:** write the migration (full code; every private function: `security definer`, `set search_path = ''`, `revoke … from public, anon, service_role`, `grant … to authenticated`; then the wrapper with the same grants, as in `20261006161150_registration_rpcs_invoker.sql`):

```sql
-- Phase 5 (part 2): admin registration operations.
alter table public.registrations drop constraint registrations_cancel_reason_check;
alter table public.registrations add constraint registrations_cancel_reason_check
  check (cancel_reason in ('user', 'hold_expired', 'late_payment_no_seat', 'refunded', 'admin', 'event_cancelled'));

-- Society of an event, or 42501 (same error for "no such event" and "not yours": no existence oracle).
create or replace function private.admin_scope(p_event_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_sid uuid;
begin
  select e.society_id into v_sid from public.events e where e.id = p_event_id;
  if v_sid is null or (select auth.uid()) is null or not private.is_society_admin(v_sid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_sid;
end $$;
revoke execute on function private.admin_scope(uuid) from public, anon, service_role;
grant execute on function private.admin_scope(uuid) to authenticated;

-- Minimal registrant listing. Contact only for live statuses; payment id only for super admins.
create or replace function private.admin_event_registrants(
  p_event_id uuid, p_status text default null, p_q text default null, p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_super boolean := private.is_super_admin();
  v_q text := nullif(btrim(p_q), '');
  v_like text;
  v_result jsonb;
begin
  perform private.admin_scope(p_event_id);
  if v_q is not null then
    v_like := '%' || replace(replace(replace(left(v_q, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select jsonb_build_object('total', coalesce(max(g.total), 0),
           'rows', coalesce(jsonb_agg(to_jsonb(g) - 'total' - 'ord' order by g.ord), '[]'::jsonb))
    into v_result
    from (
      select r.id as registration_id, r.status, r.token_number, r.waitlist_position, r.checked_in_at, r.created_at,
             r.amount_paise, r.receipt_number,
             case when v_super then r.razorpay_payment_id end as razorpay_payment_id,
             p.full_name, p.handle, p.college, p.branch, p.year,
             case when r.status in ('confirmed', 'waitlisted', 'pending_payment', 'refund_needed') then pp.email end as email,
             case when r.status in ('confirmed', 'waitlisted', 'pending_payment', 'refund_needed') then pp.phone end as phone,
             r.answers,
             count(*) over () as total,
             row_number() over (order by r.created_at, r.id) as ord
        from public.registrations r
        join public.profiles p on p.id = r.user_id
        left join public.profile_private pp on pp.user_id = r.user_id
       where r.event_id = p_event_id
         and (p_status is null or r.status::text = p_status)
         and (v_like is null or p.full_name ilike v_like or p.handle ilike v_like or r.token_number::text = v_q)
       order by r.created_at, r.id
       limit least(greatest(coalesce(p_limit, 100), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
    ) g;
  return v_result;
end $$;

create or replace function private.admin_check_in(
  p_event_id uuid, p_code text default null, p_registration_id uuid default null, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  ev public.events%rowtype;
  reg public.registrations%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_kind text;
  v_who jsonb;
begin
  perform private.admin_scope(p_event_id);
  select e.* into ev from public.events e where e.id = p_event_id;
  if ev.status <> 'published' then return jsonb_build_object('result', 'event_not_open'); end if;
  if now() < ev.starts_at - interval '24 hours' or now() > ev.ends_at + interval '24 hours' then
    return jsonb_build_object('result', 'outside_window');
  end if;

  if p_registration_id is not null then
    v_kind := 'manual';
    select r.* into reg from public.registrations r where r.id = p_registration_id and r.event_id = p_event_id for update;
  elsif v_code ~ '^[A-Z2-7]{26}$' then
    v_kind := 'qr';
    select r.* into reg from public.registrations r where r.ticket_code = v_code and r.event_id = p_event_id for update;
  elsif v_code ~ '^([A-Z0-9]+-)*[0-9]{1,6}$' then
    v_kind := 'token';
    -- a typed prefix must be this event's prefix (a RAS-05 token is never accepted at another session)
    if regexp_replace(v_code, '-?[0-9]{1,6}$', '') <> '' and regexp_replace(v_code, '-?[0-9]{1,6}$', '') <> ev.token_prefix then
      return jsonb_build_object('result', 'not_found');
    end if;
    select r.* into reg from public.registrations r
     where r.event_id = p_event_id and r.token_number = (substring(v_code from '([0-9]{1,6})$'))::int for update;
  else
    return jsonb_build_object('result', 'invalid_code');
  end if;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  select jsonb_build_object('registration_id', reg.id, 'full_name', p.full_name, 'handle', p.handle,
           'avatar_url', p.avatar_url, 'college', p.college, 'token_number', reg.token_number,
           'token_prefix', ev.token_prefix)
    into v_who from public.profiles p where p.id = reg.user_id;

  if reg.status <> 'confirmed' then
    return jsonb_build_object('result', 'not_confirmed', 'status', reg.status, 'attendee', v_who);
  end if;
  if reg.checked_in_at is not null then
    return jsonb_build_object('result', 'already_checked_in', 'checked_in_at', reg.checked_in_at, 'attendee', v_who);
  end if;
  if v_kind = 'token' and not coalesce(p_confirm, false) then
    return jsonb_build_object('result', 'confirm_identity', 'attendee', v_who);
  end if;
  update public.registrations r set checked_in_at = now(), checked_in_by = v_uid where r.id = reg.id;
  return jsonb_build_object('result', 'checked_in', 'checked_in_at', now(), 'attendee', v_who);
end $$;

create or replace function private.admin_undo_check_in(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_sid uuid;
begin
  select r.event_id into v_event from public.registrations r where r.id = p_registration_id;
  if v_event is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_sid := private.admin_scope(v_event);
  update public.registrations r set checked_in_at = null, checked_in_by = null
   where r.id = p_registration_id and r.checked_in_at is not null;
  if not found then raise exception 'not_checked_in' using errcode = 'P0001'; end if;
  perform private.write_audit('checkin.undone', 'registration', p_registration_id::text, v_sid, '{}'::jsonb);
  return jsonb_build_object('registration_id', p_registration_id);
end $$;

create or replace function private.admin_cancel_registration(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  ev public.events%rowtype;
  reg public.registrations%rowtype;
  v_new public.registration_status;
  v_promoted int;
begin
  select r.event_id into v_event from public.registrations r where r.id = p_registration_id;
  if v_event is null then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.admin_scope(v_event);
  select e.* into ev from public.events e where e.id = v_event for update;          -- lock order: event, then rows
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;
  if reg.status not in ('confirmed', 'waitlisted', 'pending_payment') then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  if reg.checked_in_at is not null then raise exception 'already_checked_in' using errcode = 'P0001'; end if;
  v_new := (case when reg.status = 'confirmed' and reg.razorpay_payment_id is not null
                 then 'refund_needed' else 'cancelled' end)::public.registration_status;
  update public.registrations r
     set status = v_new, cancelled_at = now(), cancel_reason = 'admin', waitlist_position = null
   where r.id = reg.id;
  if reg.status = 'waitlisted' then perform private.compact_waitlist(ev.id); end if;
  select count(*)::int into v_promoted from private.promote_waitlist(ev.id);
  perform private.write_audit('registration.cancelled', 'registration', reg.id::text, ev.society_id,
    jsonb_build_object('from', reg.status, 'to', v_new, 'promoted', v_promoted));
  return jsonb_build_object('registration_id', reg.id, 'status', v_new, 'promoted', v_promoted);
end $$;

create or replace function private.admin_promote_waitlist(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sid uuid := private.admin_scope(p_event_id); v_promoted int;
begin
  perform 1 from public.events e where e.id = p_event_id for update;
  select count(*)::int into v_promoted from private.promote_waitlist(p_event_id);
  perform private.write_audit('waitlist.promoted', 'event', p_event_id::text, v_sid, jsonb_build_object('promoted', v_promoted));
  return jsonb_build_object('promoted', v_promoted);
end $$;

create or replace function private.admin_cancel_event(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sid uuid := private.admin_scope(p_event_id);
  ev public.events%rowtype;
  v_cancelled int; v_refund int; v_wait int;
begin
  select e.* into ev from public.events e where e.id = p_event_id for update;
  if ev.status = 'cancelled' then raise exception 'event_cancelled' using errcode = 'P0001'; end if;
  perform set_config('stairway.admin_cancel', 'on', true);
  update public.events e set status = 'cancelled' where e.id = p_event_id;
  perform set_config('stairway.admin_cancel', 'off', true);
  select count(*)::int into v_wait from public.registrations r where r.event_id = p_event_id and r.status = 'waitlisted';
  with moved as (
    update public.registrations r
       set status = (case when r.status = 'confirmed' and r.razorpay_payment_id is not null
                          then 'refund_needed' else 'cancelled' end)::public.registration_status,
           cancelled_at = now(), cancel_reason = 'event_cancelled', waitlist_position = null
     where r.event_id = p_event_id and r.status in ('confirmed', 'waitlisted', 'pending_payment')
    returning r.status)
  select count(*)::int, (count(*) filter (where m.status = 'refund_needed'))::int
    into v_cancelled, v_refund from moved m;
  perform private.write_audit('event.cancelled', 'event', p_event_id::text, v_sid,
    jsonb_build_object('registrations', v_cancelled, 'refund_needed', v_refund, 'waitlisted', v_wait));
  return jsonb_build_object('cancelled', v_cancelled, 'refund_needed', v_refund, 'waitlisted', v_wait);
end $$;
```
Then for each of the six functions: `revoke execute … from public, anon, service_role; grant execute … to authenticated;` plus `create function public.<name>(<same args and defaults>) returns jsonb language sql security invoker set search_path = '' as $$ select private.<name>(<args>) $$;` with the same revoke/grant.
- [ ] **Step 2:** apply, rename, regenerate types. Verify live (rolled back) that the `cancel_reason` constraint swap accepts existing rows and that the Phase 4 scripts (`payments-rpc.sql`, `payments-service.sql`) still pass.
- [ ] **Step 3:** `supabase/tests/admin-registrations.sql`. **Required assertions:** a `cs` admin gets `42501` from every function against a `ras` event/registration, and the same error for a random uuid; ras admin: registrants returns `total` + rows, `email`/`phone` present for `confirmed` and **null** for `cancelled`, `razorpay_payment_id` null for the society admin and present for a super admin, `p_limit` 1000 clamps to 200, a `%` query is escaped (matches nothing); check-in: valid QR → `checked_in` with `checked_in_by = admin`; second scan → `already_checked_in` with the **original** timestamp; typed token → `confirm_identity` and row unchanged, with `p_confirm` → `checked_in`; wrong-prefix token → `not_found`; `waitlisted` row → `not_confirmed`; draft event → `event_not_open`; event starting in 3 days → `outside_window`; garbage → `invalid_code`; QR of another event → `not_found`; undo then re-check-in works; cancel: free confirmed → `cancelled` and promotes the waitlist head; paid confirmed (payment id set) → `refund_needed`; checked-in → `already_checked_in`; cancelling twice → `not_cancellable`; promote after a capacity raise promotes N and is a no-op at 0 free seats; `admin_cancel_event`: counts correct, paid → `refund_needed`, `status='cancelled'`, second call raises `event_cancelled`, plain UPDATE still raises `use_cancel_event`; audit rows exist for cancel/promote/undo/cancel-event and none for check-in.
- [ ] **Step 4:** advisors; commit `feat(db): admin registration operations` (+ trailer).

---

### Task 3: Admin people migration (invites, anonymisation, status, overview)

**Goal:** one-time invite acceptance, anonymisation, a read-only payments-flag probe and the overview metrics.
**Files:** `supabase/migrations/20261011000003_admin_people.sql`, `supabase/tests/admin-people.sql`, regenerated types.
**Produces:** `public.accept_admin_invite(p_token_hash text) → jsonb {role, society_id}`; `public.anonymise_user(p_user_id uuid) → jsonb {registrations_kept}`; `public.admin_payments_flag() → boolean` (super admin only); `public.admin_overview(p_society_id uuid default null) → jsonb`.

- [ ] **Step 1:** migration (private definer + public invoker wrappers + explicit grants as in Task 2):

```sql
-- Phase 5 (part 3)
create or replace function private.accept_admin_invite(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  inv public.admin_invites%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  select i.* into inv from public.admin_invites i where i.token_hash = p_token_hash for update;
  -- one uniform error: unknown, used, revoked, expired and wrong-account are indistinguishable to the caller
  if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at <= now()
     or v_email is null or v_email <> inv.email then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  insert into public.admin_roles (user_id, role, society_id) values (v_uid, inv.role, inv.society_id)
    on conflict do nothing;
  update public.admin_invites i set accepted_at = now(), accepted_by = v_uid where i.id = inv.id;
  perform private.write_audit('invite.accepted', 'admin_invites', inv.id::text, inv.society_id,
                              jsonb_build_object('role', inv.role));
  return jsonb_build_object('role', inv.role, 'society_id', inv.society_id);
end $$;
revoke execute on function private.accept_admin_invite(text) from public, anon, service_role;
grant execute on function private.accept_admin_invite(text) to authenticated;

create or replace function private.anonymise_user(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_tomb text := 'deleted-' || substr(replace(p_user_id::text, '-', ''), 1, 12);
  v_kept int;
begin
  if v_uid is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user_id = v_uid or exists (select 1 from public.admin_roles r where r.user_id = p_user_id) then
    raise exception 'admin_account' using errcode = 'P0001';
  end if;
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registrations r join public.events e on e.id = r.event_id
              where r.user_id = p_user_id
                and (r.status = 'refund_needed'
                     or (r.status in ('confirmed', 'waitlisted', 'pending_payment') and e.ends_at > now()))) then
    raise exception 'open_registrations' using errcode = 'P0001';
  end if;

  update public.profiles p
     set onboarded = false, handle = v_tomb, full_name = 'Deleted user', avatar_url = null, headline = '', bio = '',
         college = '', branch = '', year = '', skills = '{}', links = '{}'::jsonb
   where p.id = p_user_id;
  update public.profile_private pp set email = '', phone = '', ieee_member_id = '' where pp.user_id = p_user_id;
  delete from public.profile_projects where user_id = p_user_id;
  delete from public.profile_experience where user_id = p_user_id;
  update public.registrations r set answers = '{}'::jsonb where r.user_id = p_user_id;
  -- Sign-in is closed for good: renamed (frees the real address), banned, identities + sessions removed.
  update auth.users u
     set email = v_tomb || '@anonymised.invalid', phone = null, raw_user_meta_data = '{}'::jsonb,
         banned_until = 'infinity', encrypted_password = null
   where u.id = p_user_id;
  delete from auth.identities where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;

  select count(*)::int into v_kept from public.registrations r where r.user_id = p_user_id;
  perform private.write_audit('user.anonymised', 'profile', p_user_id::text, null, jsonb_build_object('registrations_kept', v_kept));
  return jsonb_build_object('registrations_kept', v_kept);
end $$;
revoke execute on function private.anonymise_user(uuid) from public, anon, service_role;
grant execute on function private.anonymise_user(uuid) to authenticated;

create or replace function private.admin_payments_flag() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.flag_enabled('payments');
end $$;
revoke execute on function private.admin_payments_flag() from public, anon, service_role;
grant execute on function private.admin_payments_flag() to authenticated;
```
`admin_overview` is a plain **security invoker** SQL function (RLS does the scoping), `language sql stable`, returning `jsonb` with keys: `upcoming` (≤ 5 soonest published/draft events: id, title, society short_name, starts_at, status, capacity, confirmed, waitlisted), `registrations_7d` (created in the last 7 days, statuses confirmed/waitlisted/pending_payment), `fill_rate` (confirmed ÷ capacity over upcoming published events, 0 when no capacity), `revenue_paise` (sum `amount_paise` where `status='confirmed' and paid_at is not null`), `refunds_pending` (count `refund_needed`), `recent_checkins` (≤ 8: full_name, event title, checked_in_at). When `p_society_id` is given every part adds `e.society_id = p_society_id`.
- [ ] **Step 2:** apply, rename, regenerate types. **First prove on the live DB (rolled back) that the migration role can `update auth.users` and `delete from auth.identities, auth.sessions`**; if it cannot, drop those statements from the function and let `lib/admin/anonymise-action.ts` ban/rename the user with the service-role Admin API (`auth.admin.updateUserById`) — record the choice in the commit.
- [ ] **Step 3:** `supabase/tests/admin-people.sql`. **Required assertions:** invite: matching confirmed email + valid hash → role row created once and `accepted_at` set; replay → `invalid_invite`; wrong account → `invalid_invite` and the invite still unused; expired and revoked → `invalid_invite`; unconfirmed email → `invalid_invite`; malformed hash → `invalid_invite`; anon call → insufficient privilege; society invite creates `society_admin` with its society, super invite creates `super_admin`. anonymise: society admin → `42501`; self and another admin → `admin_account`; user with a confirmed future seat → `open_registrations`; user with only past/cancelled rows succeeds: profile fields blank, `onboarded=false`, handle `deleted-…`, `profile_private` blank, projects/experience gone, registration rows **still present** with unchanged `status/amount_paise/receipt_number/razorpay_*`, `answers = {}`, `private.payment_orders` untouched, auth email ends `@anonymised.invalid` and `banned_until` set, identities gone; a second call is idempotent. flag: society admin → `42501`, super admin → boolean. overview: super admin sees all, ras admin counts only ras (fixtures in both), revenue counts only paid-confirmed, plain user sees zeros/empty.
- [ ] **Step 4:** advisors; commit `feat(db): admin invites, anonymisation, overview` (+ trailer). **→ Review point 1 (Tasks 1-3):** reviewer checks every grant, `search_path`, lock order, that the sentinel scripts are non-vacuous, and re-runs all `supabase/tests/*.sql` (no Phase 3/4 regression).

---
### Task 4: Admin core — authorization helpers, action result, `/admin` shell, overview

**Goal:** one audited way to authorise admin pages and actions, the `/admin` frame and the overview page.
**Files:** create `lib/admin/caps.ts`, `lib/admin/auth.ts`, `lib/admin/result.ts`, `app/admin/layout.tsx`, `app/admin/page.tsx`, `components/admin/SocietySwitcher.tsx`, `components/admin/StatCard.tsx`, `tests/admin/caps.test.ts`, `tests/admin/auth.test.ts`, `tests/admin/result.test.ts`; modify `components/dashboard/DashboardShell.tsx`, `app/robots.ts`, `app/sitemap.ts` (verify exclusion only), `tests/payments/boundaries.test.ts` (no change yet), existing dashboard-shell tests.
**Consumes:** `createClient` (`lib/supabase/server.ts`), `getAuthState`, `public.admin_overview`, `paymentsConfig()`.
**Produces (exact names):**
- `lib/admin/caps.ts` (pure, importable anywhere): `interface AdminRoleRow { role: "super_admin" | "society_admin"; society_id: string | null }`, `interface AdminCaps { isSuper: boolean; societyIds: string[] }`, `adminCaps(rows: AdminRoleRow[]): AdminCaps`, `canManageSociety(caps: AdminCaps, societyId: string): boolean`.
- `lib/admin/result.ts`: `type AdminErrorCode = "not_signed_in" | "forbidden" | "invalid_input" | "conflict" | "locked" | "not_found" | "payments_disabled" | "unavailable" | "unknown"`, `interface AdminError { code; message: string; fieldErrors?: Record<string, string> }`, `type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: AdminError }`, `fail(code, message?)`, `fromZod(error: z.ZodError): AdminError` (field ids from the issue path), `mapDbError(e: { message?: string | null; code?: string | null } | null): AdminError`.
- `lib/admin/auth.ts` (`import "server-only"`): `interface AdminContext extends AdminCaps { userId: string }`, `type Scope = { kind: "any" } | { kind: "super" } | { kind: "society"; societyId: string } | { kind: "event"; eventId: string }`, `getAdminContext(): Promise<AdminContext | null>`, `authorize(scope: Scope): Promise<{ ok: true; ctx: AdminContext; db: SupabaseClient<Database>; societyId: string | null } | { ok: false; error: AdminError }>` (for server actions), `requireAdmin(next: string, scope?: Scope): Promise<{ ctx; db; societyId }>` (for pages: signed-out → `redirect('/login?next=…')`; no role or scope miss → `notFound()`).

- [ ] **Step 1: `lib/admin/auth.ts` (security-critical, write exactly this shape):**

```ts
import "server-only";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { adminCaps, canManageSociety, type AdminCaps } from "./caps";
import { fail, type AdminError } from "./result";

export interface AdminContext extends AdminCaps { userId: string }
export type Scope =
  | { kind: "any" } | { kind: "super" }
  | { kind: "society"; societyId: string } | { kind: "event"; eventId: string };
type Db = SupabaseClient<Database>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identity from the verified JWT; roles re-read from admin_roles on EVERY call (RLS lets a super admin read all
 *  rows, so the explicit user_id filter is required). Nothing from the client is trusted. Never cached. */
export async function getAdminContext(db?: Db): Promise<AdminContext | null> {
  const client = db ?? (await createClient());
  const { data, error } = await client.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") return null;
  const { data: rows, error: rolesError } = await client.from("admin_roles").select("role, society_id").eq("user_id", sub);
  if (rolesError || !rows || rows.length === 0) return null;
  return { userId: sub, ...adminCaps(rows) };
}

export async function authorize(scope: Scope) {
  const db = await createClient();
  const ctx = await getAdminContext(db);
  if (!ctx) return { ok: false as const, error: fail("forbidden") };
  let societyId: string | null = null;
  if (scope.kind === "super" && !ctx.isSuper) return { ok: false as const, error: fail("forbidden") };
  if (scope.kind === "society") {
    if (!UUID.test(scope.societyId) || !canManageSociety(ctx, scope.societyId)) return { ok: false as const, error: fail("forbidden") };
    societyId = scope.societyId;
  }
  if (scope.kind === "event") {
    if (!UUID.test(scope.eventId)) return { ok: false as const, error: fail("forbidden") };
    // The society comes from the row, never from the request. Not found and not yours look the same.
    const { data } = await db.from("events").select("society_id").eq("id", scope.eventId).maybeSingle();
    if (!data || !canManageSociety(ctx, data.society_id)) return { ok: false as const, error: fail("forbidden") };
    societyId = data.society_id;
  }
  return { ok: true as const, ctx, db, societyId };
}

export async function requireAdmin(next: string, scope: Scope = { kind: "any" }) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect(`/login?next=${encodeURIComponent(next)}`);
  const r = await authorize(scope);
  if (!r.ok) notFound();            // a 404, never "forbidden": no role disclosure
  return { ctx: r.ctx, db: r.db, societyId: r.societyId };
}
```
- [ ] **Step 2: `mapDbError` table** (match `error.message` first — our functions raise bare codes — then `error.code`): `forbidden`/`42501` → `forbidden`; `society_locked`, `slug_locked`, `price_locked`, `ticket_locked`, `capacity_below_taken`, `has_registrations`, `use_cancel_event`, `event_cancelled`, `last_super_admin`, `open_registrations`, `admin_account`, `not_cancellable`, `already_checked_in`, `not_checked_in` → `locked` with a specific plain-language message each; `invalid_invite` → `not_found` ("This invite link is invalid, used or expired."); `23505` → `conflict` ("That slug or step number is already taken."); `23514`/`22P02`/`23502` → `invalid_input`; network/other → `unavailable`/`unknown`. Messages never include SQL text.
- [ ] **Step 3: shell + routing.** `DashboardShell` gets variant `admin` (title "Admin") with items Overview `/admin` (exact), Events `/admin/events`, Society `/admin/society`, and `superOnly` items Site content `/admin/site`, Admins `/admin/people`, Audit log `/admin/audit`, Settings `/admin/settings`; new optional prop `isSuper?: boolean` filters `superOnly` items (UX only). **Back to site stays the first control** (add a test: first focusable element of the admin shell is the Back link). `app/admin/layout.tsx`: `metadata = { title: "Admin", robots: { index: false, follow: false } }`; soft guard: no session → `redirect('/login?next=/admin')`, no admin role → `notFound()`; passes `isSuper`. `app/robots.ts` adds `"/admin/"`, `"/admin$"`.
- [ ] **Step 4: overview page** (`requireAdmin("/admin")`). Params `?society=<slug>` validated against the admin's societies (invalid → ignored). Calls `db.rpc("admin_overview", { p_society_id })` once and `zod`-parses the result. UI: header with `SocietySwitcher` (plain links; super admin gets "All societies"; society admin with one society sees no switcher); `StatCard` ×4: Registrations this week, Fill rate (text + bar with `role="meter"` aria-valuenow), Revenue (rendered only when `paymentsConfig().enabled`; otherwise omitted, not zero), Refunds pending (links to the registrations page filter; shown to super admin only); "Upcoming sessions" list (title, society chip, date, `confirmed/capacity`, `+N waitlisted`, buttons Registrations / Check-in); "Recent check-ins" list; empty states with "Create the first session". Skeleton-free (server rendered). `aria-live` not needed.
- [ ] **Step 5: tests.** `caps.test.ts`: super, society, mixed, empty rows, duplicate societies deduped, `canManageSociety` true/false. `auth.test.ts` (mock `@/lib/supabase/server`, `next/navigation`): no claims → `forbidden`; claims but no role rows → `forbidden`; society admin + `{kind:"super"}` → forbidden; society admin + foreign society → forbidden; society admin + `{kind:"event"}` of own society → ok with `societyId` from the **row**; event of another society → forbidden; unknown event id → forbidden (same shape); non-uuid → forbidden without a DB call; the role query is always filtered by the claim's `sub`; `requireAdmin` redirects when signed out and calls `notFound` for non-admins. `result.test.ts`: every DB code in the table maps as specified; unknown error → `unknown` with no SQL text in `message`.
- [ ] **Step 6:** `npx next typegen`; vitest / tsc / eslint; manual: `/admin` signed-out → login, plain user → 404. Commit `feat(admin): shell, authorization helpers, overview`.

**Acceptance:** `/admin` renders for the live super admin with real numbers; a non-admin gets the 404 page; robots lists `/admin/`; no admin page or action exists that does not call `authorize`/`requireAdmin` (grep check noted in the review).

---

### Task 5: Events — list, create/edit core, publish, duplicate, cancel

**Goal:** organisers manage the lifecycle of a session.
**Files:** create `lib/admin/event-schema.ts`, `lib/admin/event-actions.ts`, `app/admin/events/page.tsx`, `app/admin/events/new/page.tsx`, `app/admin/events/[id]/page.tsx`, `components/admin/EventList.tsx`, `components/admin/EventForm.tsx`, `components/admin/StatusPanel.tsx`, `components/admin/ConfirmDialog.tsx`, `tests/admin/event-schema.test.ts`, `tests/admin/event-actions.test.ts`.
**Consumes:** `authorize/requireAdmin`, `ActionResult`, `public.admin_cancel_event`, `events` RLS, `components/ui/{Field,Modal}`, `lib/payments/money.ts`.
**Produces:**
- `lib/admin/event-schema.ts` (pure): `EventInputSchema` (zod) = `{ societyId: uuid (create only), trackId: uuid|null, step: int 1..999, slug: /^[a-z0-9-]{2,80}$/, title: 3..120, topic ≤ 120, summary ≤ 300, description ≤ 5000, startsAt/endsAt: ISO with offset (end > start), venue ≤ 200 (required when mode ≠ online), mode: offline|online|hybrid, level: Beginner|Intermediate|Advanced|Expert|All levels, formats: string[≤8, each ≤40], capacity int 0..5000, pricePaise int 0..1_000_000, ticketType: qr|token, tokenPrefix: /^[A-Z0-9-]{0,16}$/, registrationOpensAt/ClosesAt: ISO|null (opens < closes ≤ endsAt), isFinale: boolean (super admin only) }`; `rupeesToPaise(input: string): number | null` (≤ 2 decimals, `"199.50"`→19950, rejects `"1e3"`, negatives, > 6 digits); `paiseToRupees(p: number): string`; `istLocalToIso(local: string): string` (`"2026-11-14T10:00"` → `"2026-11-14T10:00:00+05:30"`) and `isoToIstLocal(iso: string): string`; `slugify(title: string): string`; `publishBlockers(e: EventInput & { posterUrl: string | null }): string[]` (empty array = publishable: title, topic, venue when physical, capacity ≥ 1, `startsAt` in the future, `ticketType==='token'` ⇒ prefix non-empty).
- `lib/admin/event-actions.ts` (`"use server"`): `createEventAction(input: unknown): Promise<ActionResult<{ id: string }>>`, `updateEventAction(input: unknown)` (`{ id, seenUpdatedAt, ...EventInput minus societyId }`), `setEventStatusAction(input: { id: string; status: "published" | "draft"; seenUpdatedAt })`, `duplicateEventAction(id: string): Promise<ActionResult<{ id: string }>>`, `deleteDraftEventAction(id: string)`, `cancelEventAction(input: { id: string; confirmTitle: string })`.

**Security / authorization:**
- Create: `authorize({kind:"society", societyId: input.societyId})`. Update/status/duplicate/delete/cancel: `authorize({kind:"event", eventId})` and **ignore any society in the payload** (society is not updatable by society admins; the DB trigger is the backstop; only super admins may re-home an event, via a separate select shown to them).
- `isFinale` is written only when `ctx.isSuper`; otherwise the key is stripped from the update.
- Optimistic concurrency: updates add `.eq("updated_at", seenUpdatedAt)` and `.select("id")`; zero rows → `fail("conflict", "Someone else changed this session. Reload to see their changes.")`. A silent zero-row RLS no-op is therefore never reported as success.
- `setEventStatusAction("published")` re-runs `publishBlockers` on the **stored** row, not the client copy. `"draft"` surfaces the DB `has_registrations` error as a locked message ("Cancel the session instead; it has registrations").
- Cancel: server checks `confirmTitle === row.title` (exact), then `rpc("admin_cancel_event")`; never a plain UPDATE. Result data returns the three counts for the success banner ("12 cancelled, 5 paid seats need refunds in Registrations").
- Duplicate: reads the source through RLS, inserts a `draft` copy: `title` + " (copy)", slug `<slug>-copy` (then `-copy-2`… up to 5 tries on `23505`), `step` = max(step)+1 in that society, same dates, `registration_opens_at/closes_at` null, `status draft`, speakers + questions copied, `poster_url`/`video_url` copied, no registrations.
- Delete: only `status='draft'`; registrations FK (`RESTRICT`) turns into `locked`.
- Every action ends with `revalidatePath("/admin/events")`, `revalidatePath(`/events/${slug}`)`, `revalidatePath("/")`, `revalidatePath("/s/<society slug>")` (published events only).

**UI:** Events list: tabs Upcoming / Drafts / Past / Cancelled (server `?tab=` + `?society=`), 50 per page; row = step chip, title, society, date, status chip, `confirmed/capacity`, actions menu (Edit, Registrations, Check-in, Duplicate). `EventForm` (client, `useActionState`-style, one `<form>` per section with its own Save so a failed section does not lose another): Basics, Schedule (datetime-local inputs interpreted as IST, helper text "Times are Asia/Kolkata"), Seats & price (price input in ₹; disabled with helper text when the server reports `price_locked`; token prefix + ticket type disabled when `ticket_locked`), Registration window. `StatusPanel`: Publish (disabled with blocker list), Unpublish, Duplicate, Cancel session (opens `ConfirmDialog` requiring the title to be typed), Delete draft. Show server field errors under fields (`aria-describedby`, focus first invalid), a top `role="alert"` summary and an `aria-live="polite"` "Saved" note; all destructive buttons are real `<button>`s ≥ 44 px with visible text; dialogs trap focus and restore it (reuse `components/ui/Modal.tsx`). Unsaved changes: `beforeunload` warning only when dirty.

- [ ] **Step 1:** pure helpers + tests first (`event-schema.test.ts`: slug/prefix regex edges, `end ≤ start` rejected, window ordering, `rupeesToPaise` table (`"0"`, `"199"`, `"199.5"`, `"199.505"`→null, `"-1"`→null, `" 50 "`→5000), IST round trip across a date line, `publishBlockers` cases).
- [ ] **Step 2:** actions + `event-actions.test.ts` with a fake Supabase builder (record calls): society admin updating an event of another society → `forbidden` and **no** `update` call; payload `societyId` ignored on update; non-super payload `isFinale` stripped; stale `seenUpdatedAt` (fake returns 0 rows) → `conflict`; publish with blockers → `invalid_input` listing them; cancel with wrong `confirmTitle` → `invalid_input` and no rpc; cancel success calls `rpc("admin_cancel_event", { p_event_id })` exactly once and **never** `from("events").update`; duplicate for a society admin of another society → `forbidden`; slug collision retries then `conflict`; create with a society the admin does not manage → `forbidden`.
- [ ] **Step 3:** pages + components; manual phone-width check (360 px): form usable, no horizontal scroll. Commit `feat(admin): event list, editor core and lifecycle actions`.

**Acceptance:** super admin creates a draft, publishes it (visible on `/events/<slug>` and home), duplicates it, cancels the copy; a `cs` admin cannot open or change a `ras` event (404 page / `forbidden`); every change shows in `audit_log`.

---

### Task 6: Event editor extras — media, video, agenda & lists, speakers, questions, resources

**Goal:** the rest of the event editor: poster upload, video URL, agenda, outcomes/prerequisites/bring, speakers, custom registration questions, post-event resources and winners.
**Files:** create `lib/admin/media.ts`, `lib/admin/video.ts`, `lib/admin/media-actions.ts`, `lib/admin/event-extras-actions.ts`, `components/admin/MediaUploader.tsx`, `components/admin/QuestionsBuilder.tsx`, `components/admin/ListEditor.tsx`, `components/admin/AgendaEditor.tsx`, `components/admin/SpeakerPicker.tsx`, `tests/admin/media.test.ts`, `tests/admin/video.test.ts`, `tests/admin/questions-builder.test.ts`, `tests/admin/extras-actions.test.ts`; modify `app/admin/events/[id]/page.tsx` (add sections).
**Consumes:** Task 5 form/actions, `QuestionsSchema`/`parseQuestions`/`Question` (`lib/registration/questions.ts`), `AgendaItem`/`EventResources` (`lib/events/types.ts`), `publicEnv` Supabase URL, `public.log_admin_event`, storage policies (`private.can_manage_media`).
**Produces:**
- `lib/admin/media.ts` (pure): `MEDIA_KINDS = { poster, gallery, logo, speaker, sponsor, team, video }`, `MEDIA_LIMITS: Record<kind, { mimes: readonly string[]; maxBytes: number }>` (images png/jpeg/webp/avif ≤ 5 MB; video mp4/webm ≤ 100 MB; **never svg**), `mediaPath(opts: { scope: { societyId: string; eventId?: string } | { site: true }; kind; mime: string; rand: string }): string` (`societies/<id>/events/<eventId>/<kind>-<rand>.<ext>` or `site/<kind>-<rand>.<ext>`; extension derived from MIME, never from the file name), `isOwnMediaUrl(url: string, supabaseUrl: string, allowedPrefix: string): boolean` (https, exact host of the project, path starts `/storage/v1/object/public/media/<allowedPrefix>`, no `..`, no query/fragment).
- `lib/admin/video.ts` (pure): `parseVideoUrl(raw: string): { kind: "youtube" | "vimeo" | "direct"; url: string } | null` — https only; YouTube `watch?v=<11 chars>` / `youtu.be/<id>` / `youtube.com/embed/<id>` normalised to `https://www.youtube.com/watch?v=<id>`; Vimeo `vimeo.com/<digits>` → `https://vimeo.com/<digits>`; direct: path ends `.mp4` or `.webm`, no credentials in the URL, length ≤ 500; everything else (`http:`, `javascript:`, `data:`, other hosts, embeds with extra params) → `null`.
- `lib/admin/media-actions.ts` (`"use server"`): `prepareUploadAction(input: { target: { eventId: string } | { societyId: string } | { site: true }; kind; mime: string; size: number }): Promise<ActionResult<{ path: string; token: string; publicUrl: string }>>`, `attachEventMediaAction(input: { eventId: string; field: "poster" | "video"; url: string; seenUpdatedAt })`.
- `lib/admin/event-extras-actions.ts` (`"use server"`): `saveEventContentAction({ id, seenUpdatedAt, agenda, outcomes, prerequisites, bring })`, `saveEventSpeakersAction({ id, speakerIds })`, `saveEventQuestionsAction({ id, seenUpdatedAt, questions })`, `saveEventResourcesAction({ id, seenUpdatedAt, resources, winners })`.

**Security / authorization:**
- `prepareUploadAction`: `authorize` by target kind (`site` ⇒ `super`; `eventId` ⇒ `event` scope, folder derived from the **row's** society; `societyId` ⇒ `society` scope); validates `mime ∈ MEDIA_LIMITS[kind].mimes` and `size ≤ maxBytes`; builds the path server-side with a 16-byte random `rand` (`crypto.getRandomValues`, hex); returns a **signed upload token** from `db.storage.from("media").createSignedUploadUrl(path)` (session client: the `can_manage_media` storage policy is still the real gate, and no upsert is needed); calls `log_admin_event("media.upload", …, { kind })`.
- `attachEventMediaAction`: `authorize(event)`; poster URL must satisfy `isOwnMediaUrl(url, SUPABASE_URL, "societies/<row society>/events/<eventId>/")`; video: `parseVideoUrl` OR an own-bucket video URL under the same prefix; stores the normalised value; optimistic `updated_at` check.
- Questions: `QuestionsSchema.safeParse` (same schema the registration form uses) before write; the DB `events_questions_valid` check is the backstop (`23514` → "These questions are not valid"). IDs are never reused for a different meaning within an event that already has registrations: the builder marks existing ids read-only.
- Speakers: only speaker ids with `society_id = event.society_id` or `society_id is null` are accepted (resolved server-side); implementation = upsert wanted rows with `sort_order`, then delete the others (a failure leaves a superset, never an empty set); audit via `log_admin_event("event.speakers", …, { count })`.
- Agenda/list/resources/winners: zod with length caps (agenda ≤ 30 items, `time` ≤ 20, `title` ≤ 120, `detail` ≤ 400; lists ≤ 20 × 120; resource links https only via `z.url()` + `startsWith("https://")`; winners ≤ 10); stored arrays are rebuilt from parsed data (no passthrough of unknown keys).

**UI / a11y:** `MediaUploader` props `{ kind, target, currentUrl, onUploaded(url), disabled }`: file input with visible `<label>`, accept list shown as text, client pre-check of type/size (messages in `role="alert"`), progress `<progress>` with text %, preview `<img alt="">` + explicit alt-text field for gallery images (alt required for gallery), "Remove" button; uses `uploadToSignedUrl` from `@supabase/supabase-js`. Video field = text input + helper "YouTube, Vimeo or a direct .mp4/.webm link" + live validation chip (kind detected) and an "Upload a file instead" option. `QuestionsBuilder` props `{ value: Question[]; onChange(next: Question[]): void; lockedIds: ReadonlySet<string>; max: 20 }`: each question is a `<fieldset>` with label input, type `<select>`, required checkbox, help text, options list (add/remove, min 2 for choice types), **Move up / Move down / Remove** buttons (no drag-only), generated ids from the label (`slugifyId`, unique, ≤ 40 chars, pattern `^[a-z][a-z0-9_]{0,39}$`), inline error per field, an `aria-live="polite"` region announcing "Question 3 moved up", and a read-only "How it looks to registrants" preview using the registration form's field components. `AgendaEditor`/`ListEditor`: same up/down/remove pattern. Warn banner when the event already has registrations (editing questions affects new registrations only).

- [ ] **Step 1:** pure helpers + tests: `media.test.ts` (path never contains the client file name or `..`; svg and `text/html` rejected; `isOwnMediaUrl` accepts the project's URL and rejects other hosts, `http:`, other folders, `..%2f`, userinfo tricks like `https://evil@host`, and a different society's folder), `video.test.ts` (table of ≥ 15 inputs incl. `javascript:`, `http://`, `https://youtube.com.evil.com/watch?v=…`, playlist params, unicode hosts), `questions-builder.test.ts` (output of the builder always passes `QuestionsSchema`; id generation collisions; option dedup; move up/down at the edges).
- [ ] **Step 2:** actions + `extras-actions.test.ts` (fake supabase): foreign-society event → `forbidden` with no storage/update call; speaker of another society rejected; poster URL outside the event folder rejected; site upload by a society admin → `forbidden`; oversize/svg rejected before any storage call; invalid question set → `invalid_input` without update.
- [ ] **Step 3:** UI sections wired into the editor; manual: upload a poster from a phone camera roll, paste a YouTube link, reorder questions with the keyboard only. Commit `feat(admin): event media, agenda, speakers and questions builder`.

**Acceptance:** a society admin uploads a poster only under their society's folder (a crafted request for another folder is rejected by the action and by storage RLS); public event page renders the new poster/video; the custom-questions builder output is accepted by the live registration RPC (`validate_answers`). **→ Review point 2 (Tasks 4-6).**

---
### Task 7: Registrations page, CSV export, cancel / promote / manual check-in / refund

**Goal:** organisers see who registered, act on registrations, export a minimal CSV and (super admin) refund.
**Files:** create `lib/admin/csv.ts`, `lib/admin/registration-actions.ts`, `lib/admin/refund-action.ts`, `app/admin/events/[id]/registrations/page.tsx`, `app/admin/events/[id]/export/route.ts`, `components/admin/RegistrantsTable.tsx`, `components/admin/RegistrantRow.tsx`, `tests/admin/csv.test.ts`, `tests/admin/registration-actions.test.ts`, `tests/admin/refund-action.test.ts`; modify `tests/payments/boundaries.test.ts` (add `lib/admin/refund-action.ts` to `ADMIN_ALLOWED`).
**Consumes:** Task 2 RPCs (`admin_event_registrants`, `admin_check_in`, `admin_undo_check_in`, `admin_cancel_registration`, `admin_promote_waitlist`, `log_admin_event`), Task 3 `admin_payments_flag`, `refundRegistration` / `RefundDeps` / `RefundResult` (`lib/payments/refunds.ts`), `paymentsConfig`, `createAdminClient`, `formatToken`, `formatInr`.
**Produces:**
- `lib/admin/csv.ts` (pure): `csvCell(value: unknown): string`, `toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string` (CRLF, UTF-8 BOM added by the route, not here).
- `lib/admin/registration-actions.ts` (`"use server"`): `cancelRegistrationAction(input: { registrationId: string })`, `promoteWaitlistAction(input: { eventId: string })`, `undoCheckInAction(input: { registrationId: string })`, `checkInAction(input: { eventId: string; code?: string; registrationId?: string; confirm?: boolean }): Promise<ActionResult<CheckInResult>>` where `CheckInResult = { result: "checked_in" | "already_checked_in" | "confirm_identity" | "not_found" | "not_confirmed" | "event_not_open" | "outside_window" | "invalid_code"; attendee?: { registration_id; full_name; handle; avatar_url: string | null; college; token_number: number | null; token_prefix }; checked_in_at?: string; status?: string }`, `searchRegistrantsAction(input: { eventId: string; q: string }): Promise<ActionResult<{ id; fullName; college; token: string | null; status; checkedIn: boolean }[]>>` (max 10, **no contact fields returned**).
- `lib/admin/refund-action.ts` (`"use server"`, the only service-role user besides Task 10): `refundRegistrationAction(registrationId: unknown): Promise<ActionResult<{ outcome: "refunded" | "already_refunded" }>>`.

- [ ] **Step 1: `lib/admin/csv.ts` (security-critical, exact):**

```ts
// Spreadsheet formula injection: a cell that STARTS (ignoring leading blanks) with = + - @ or a tab/CR is prefixed
// with an apostrophe so Excel/Sheets/LibreOffice treat it as text. Applied to every non-numeric cell.
const FORMULA_START = /^[\t\r ]*[=+\-@]|^[\t\r]/;

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : typeof value === "string" ? value : String(value);
  s = s.replace(/\u0000/g, "");
  if (typeof value !== "number" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
```
- [ ] **Step 2: export route** `GET /admin/events/[id]/export?answers=0|1` (`export const dynamic = "force-dynamic"`; read the route-handler doc for the v16 `params` promise signature): `authorize({kind:"event", eventId})` → on failure `new Response(null, { status: 404 })`; pages of 200 through `admin_event_registrants` up to 10 pages (2 000 rows; if more, header `X-Export-Truncated: 1` and the UI says so); columns (minimal): `token, full_name, email, phone, college, branch, year, status, checked_in, registered_at` (+ one column per question label when `answers=1`; + `amount_inr, receipt_number` for super admins only; **never** payment/order ids or ticket codes); contact columns blank for statuses the function already nulls; response headers `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<event slug>-registrations.csv"` (slug re-validated against `^[a-z0-9-]+$`), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; body = BOM + `toCsv`. Writes `log_admin_event("registrations.export", "event", id, societyId, { rows, answers })` before responding. The scanner/table never link to it with a client-supplied society.
- [ ] **Step 3: actions.** Each: zod-validate → resolve the event (for registration ids: read `event_id` through the session client — RLS hides foreign rows — then `authorize({kind:"event", eventId})`) → call the RPC with the **session** client (the function re-checks scope) → `mapDbError` → `revalidatePath("/admin/events/<id>/registrations")`, `/admin`, and (cancel/promote) `/events/<slug>`, `/me/tickets`. `checkInAction` never revalidates (hot path). `searchRegistrantsAction` calls `admin_event_registrants` with `p_status = 'confirmed'`, `p_limit = 10` and maps rows to the minimal shape.
- [ ] **Step 4: `refundRegistrationAction` (exact shape):**

```ts
"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/admin/auth";
import { fail, mapDbError, type ActionResult } from "@/lib/admin/result";
import { paymentsConfig } from "@/lib/payments/config";
import { refundRegistration } from "@/lib/payments/refunds";
import { createAdminClient } from "@/lib/supabase/admin";

const httpFetch = (url: string, init?: RequestInit) => fetch(url, init);

export async function refundRegistrationAction(input: unknown): Promise<ActionResult<{ outcome: "refunded" | "already_refunded" }>> {
  const id = z.uuid().safeParse(input);
  if (!id.success) return fail("invalid_input");
  const a = await authorize({ kind: "super" });                       // 1. super admin only, re-checked server side
  if (!a.ok) return { ok: false, error: a.error };
  const cfg = paymentsConfig();                                       // 2. env flag + every secret present
  if (!cfg.enabled) return fail("payments_disabled", "Payments are switched off, so refunds are disabled.");
  const flag = await a.db.rpc("admin_payments_flag");                 // 3. database flag
  if (flag.error || flag.data !== true) return fail("payments_disabled", "Payments are switched off, so refunds are disabled.");
  const { data: reg } = await a.db.from("registrations")
    .select("status, razorpay_payment_id").eq("id", id.data).maybeSingle();
  if (!reg || !reg.razorpay_payment_id || (reg.status !== "refund_needed" && reg.status !== "confirmed")) {
    return fail("locked", "This registration has no payment that can be refunded.");   // 4. state check
  }
  await a.db.rpc("log_admin_event", { p_action: "refund.attempt", p_target_type: "registration", p_target_id: id.data, p_society_id: null, p_summary: {} });
  const r = await refundRegistration(
    { creds: { keyId: cfg.keyId, keySecret: cfg.keySecret }, fetch: httpFetch, db: createAdminClient(cfg.serviceRoleKey) },
    id.data,
  );
  await a.db.rpc("log_admin_event", { p_action: "refund.result", p_target_type: "registration", p_target_id: id.data, p_society_id: null,
    p_summary: r.ok ? { ok: true, outcome: r.outcome } : { ok: false, reason: r.reason, ...(r.reason === "razorpay_error" ? { code: r.code } : {}) } });
  revalidatePath("/admin", "layout");
  if (r.ok) return { ok: true, data: { outcome: r.outcome } };
  // fixed copy per reason; never Razorpay bodies, ids or keys
  return fail(r.reason === "in_progress" ? "conflict" : r.reason === "disabled" ? "payments_disabled" : r.reason === "not_found" ? "not_found" : "unavailable",
    r.reason === "razorpay_error" ? `Razorpay refused the refund (${r.code}). Nothing was changed.` : "The refund could not be completed. Check the registration and try again.");
}
```
- [ ] **Step 5: UI.** Page `requireAdmin(path, {kind:"event"})`. Header: event title, status chips with counts (All / Confirmed / Waitlisted / Pending payment / Refund needed / Cancelled / Refunded as links `?status=`), search box (`?q=`, GET form), pagination (`?page=`, 100/page). Buttons: **Open scanner**, **Export CSV** (plain link; helper text "Contains names, emails and phone numbers: handle with care."), **Promote from waitlist** (shows free seats; when 0 explains "No free seats. Raise the capacity in the editor first"; result banner "N people promoted"). Desktop = table; ≤ 640 px = stacked cards (same data, no horizontal scroll). Row: token (monospace), name + college, status chip (icon + word), checked-in time, "Details" `<details>` disclosure showing email (`mailto:`), phone (`tel:`), answers (rendered as plain text pairs, React-escaped, truncated at 300 chars with "Show more"), receipt number, and **for super admins** the payment id. Row actions (`<button>`, ≥ 44 px, `ConfirmDialog` for destructive ones): Check in (confirmed, not checked in), Undo check-in, Cancel (confirmed/waitlisted/pending, not checked in; copy explains "paid seats become *refund needed*"), **Refund ₹X** (super admin only; rendered for `confirmed`-with-payment and `refund_needed`; **disabled with the reason text** when `paymentsConfig().enabled` is false or the DB flag is off). Each action shows an inline `aria-live="polite"` result and refreshes via `router.refresh()`.
- [ ] **Step 6: tests.** `csv.test.ts`: `=1+1`, `+91 98…`, `-5`, `@SUM(A1)`, tab/CR/leading-space-then-`=`, embedded quotes/commas/newlines, null/undefined, number `-5` stays unprefixed, header row, CRLF. `registration-actions.test.ts` (fake supabase): foreign-society registration → `forbidden` and **no rpc**; unknown id same; cancel maps `not_cancellable`/`already_checked_in` to `locked`; `checkInAction` passes only `p_event_id/p_code/p_registration_id/p_confirm` and never revalidates; `searchRegistrantsAction` output has no `email`/`phone` keys even if the RPC returned them; invalid code strings rejected before any rpc (length > 40). `refund-action.test.ts`: society admin → `forbidden`, `refundRegistration` not called; env off → `payments_disabled`; DB flag false → `payments_disabled`; status `cancelled` or no payment id → `locked`; happy path calls `refundRegistration` once with a service client built from the config key and writes both audit rows; each `RefundResult` reason maps to the fixed copy and the error text never contains the key id/secret; export route handler: unauthorised → 404 empty body, CSV has the minimal header only, payment ids absent for super admin, `answers=1` adds columns, formula answers neutralised, truncation header at 2 001 rows.
- [ ] **Step 7:** extend `ADMIN_ALLOWED`; vitest/tsc/eslint; commit `feat(admin): registrations, CSV export, cancel, promote, refund`.

**Acceptance:** society admin of `ras` cannot read `cs` registrations (404 page, RPC `42501`); CSV opens in a spreadsheet with no live formulas; refund buttons are inert and explained while payments are off; cancelling a paid seat shows *refund needed*.

---

### Task 8: Check-in scanner (phone first)

**Goal:** door staff check people in from a phone in seconds.
**Files:** create `lib/admin/scan.ts`, `app/admin/events/[id]/check-in/page.tsx`, `components/admin/CheckInScanner.tsx`, `components/admin/ScanResultPanel.tsx`, `components/admin/AttendeeSearch.tsx`, `tests/admin/scan.test.ts`; modify `package.json` / lockfile (`npm i --save-exact jsqr`).
**Consumes:** `checkInAction`, `searchRegistrantsAction`, `CheckInResult` (Task 7), `requireAdmin`.
**Produces (pure, `lib/admin/scan.ts`):** `parseScan(raw: string): { kind: "qr"; code: string } | { kind: "token"; code: string } | { kind: "invalid" }` (trim + upper-case; 26 × `[A-Z2-7]` ⇒ qr; `^([A-Z0-9]+-)*[0-9]{1,6}$` ⇒ token; anything longer than 64 chars ⇒ invalid), `class ScanDebounce { constructor(windowMs = 3000); accept(code: string, now: number): boolean }` (same code within the window is ignored, a different code is accepted immediately), `presentResult(r: CheckInResult): { tone: "success" | "warn" | "error" | "confirm"; title: string; detail: string; sticky: boolean }`.

**Decision (justified dependency):** `BarcodeDetector` (formats `["qr_code"]`) when `"BarcodeDetector" in window`, otherwise `jsqr` imported dynamically (`await import("jsqr")`) so it ships only in this page's client chunk (iOS Safari has no `BarcodeDetector`; `jsqr` is MIT, dependency-free, ~130 KB, pinned exactly). Worker bundle size is unaffected (client asset).

**Behaviour / states** (`CheckInScanner` props `{ eventId: string; title: string; societyName: string; ticketType: "qr" | "token"; tokenPrefix: string; backHref: string }`):
- Layout: full-viewport (`fixed inset-0`, above the site dock — verify the dock is covered), cobalt chrome, cream result panel; top row: **Back** link (to `backHref`, first in tab order), title, counter "N checked in this session"; centre: `<video playsinline muted>` with a square framing guide; bottom: manual entry (text input `inputmode="text"` + Check in button) and **Find by name** (opens `AttendeeSearch`).
- Camera: `getUserMedia({ video: { facingMode: { ideal: "environment" } } })` after an explicit "Start camera" button (user gesture, required by iOS); scan loop at ~6 fps on a downscaled canvas (≤ 640 px) via `requestAnimationFrame` + timestamp throttle; stops tracks on unmount, `visibilitychange` hidden, and while a request is in flight; best-effort `navigator.wakeLock?.request("screen")`. States: `idle → starting → scanning → busy → result → scanning`; `denied` / `unsupported` / `error` render the manual entry as the primary control with a plain explanation.
- Result panel (`role="status"`, `aria-live="assertive"`), full width, ≥ 30 vh, **icon + word + colour**: success "Checked in" (name, photo, college, token; auto-dismiss after 2.5 s unless reduced-motion users prefer manual — always show a "Next" button), warning "Already checked in at 10:42" (sticky until dismissed — the double-scan warning), error variants "Not found", "Not confirmed (waitlisted)", "Not open yet / outside the check-in window", and **Confirm identity** (token entry: shows name + photo, buttons "It's them — check in" / "Not them"; this is the `confirm_identity` result, second call sends `confirm: true`). `navigator.vibrate?.(…)` on success/warn/error (feature-detected); no audio.
- Name/token fallback: `AttendeeSearch` debounced 300 ms, list of ≤ 10 (name, college, token, ✓ if checked in), tap → `checkInAction({ registrationId })`.
- Errors from actions (`forbidden`, `unavailable`) show as `role="alert"` with Retry; a network error never marks anyone as checked in locally.

- [ ] **Step 1:** `scan.ts` + `scan.test.ts` (qr/token/invalid table incl. lowercase, whitespace, 27-char, URL-looking input; debounce window boundary; `presentResult` covers every `result` value, `already_checked_in` is sticky and includes the time in IST, `confirm_identity` is `confirm`, unknown result → error).
- [ ] **Step 2:** page (`requireAdmin(path, {kind:"event"})`, selects `title, ticket_type, token_prefix, status, societies(short_name)`; a cancelled/draft event renders a message instead of the scanner) and components.
- [ ] **Step 3:** manual device pass (Android Chrome + iPhone Safari if available, else Chrome mobile emulation): camera permission denied path, token confirm flow, double scan, offline toast. Commit `feat(admin): phone check-in scanner`.

**Acceptance:** scanning a real ticket QR from `/me/tickets/<id>` on another device checks it in once and warns on the second scan; typed tokens always require the identity tap; the page works with the camera blocked (manual + search).

---

### Task 9: Society management and site content editor

**Goal:** society pages and site-wide content are editable without SQL.
**Files:** create `lib/admin/content-schemas.ts`, `lib/admin/content-actions.ts`, `lib/admin/settings-actions.ts`, `app/admin/society/page.tsx`, `app/admin/society/[slug]/page.tsx`, `app/admin/site/page.tsx`, `app/admin/site/[section]/page.tsx`, `components/admin/EntityListEditor.tsx`, `components/admin/SettingsForm.tsx`, `tests/admin/content-schemas.test.ts`, `tests/admin/content-actions.test.ts`.
**Consumes:** `authorize/requireAdmin`, Task 6 `MediaUploader` / `isOwnMediaUrl`, `SettingsSchema` / `StatsSchema` (`lib/site/schema.ts`), RLS write policies of Phase 1/2 + guard trigger `guard_society_update`.
**Produces:**
- `lib/admin/content-schemas.ts` (pure zod, one per entity, all text trimmed with explicit max lengths mirroring DB checks; every URL field `https://` only; image URLs via `isOwnMediaUrl` at action time): `SocietyEditSchema { description ≤ 600, logoUrl|null }` (+ `SocietyIdentitySchema { name, shortName, color ∈ yellow|blue|green|red|orange|purple, sortOrder }` super only), `TrackSchema { name 2..80, description ≤ 300 }`, `SpeakerSchema { slug ^[a-z0-9-]{2,60}$, name, designation, organization, photoUrl|null, bio ≤ 800, topic ≤ 120, links: Record<linkedin|github|x|instagram|website, https url|""> }`, `GallerySchema { imageUrl, caption ≤ 140, alt 3..200, ratio tall|wide|square, eventId|null }`, `SponsorSchema { name, url https|"", logoUrl|null, tier ≤ 40, tierSize xl|lg|md|sm }`, `TeamMemberSchema { name, role, group, photoUrl|null, funFact ≤ 200, links }`, `FaqSchema { question ≤ 200, answer ≤ 1500 }`, `TestimonialSchema { quote ≤ 400, name, detail ≤ 120, stepLabel ≤ 40, photoUrl|null }`, `SETTINGS_EDITABLE` = whitelist of top-level settings keys (see Decisions), `StatsInputSchema = StatsSchema`.
- `lib/admin/content-actions.ts` (`"use server"`): generic `saveEntityAction(input: { entity: Entity; id?: string; societyId?: string; data: unknown; seenUpdatedAt?: string })`, `deleteEntityAction({ entity, id })`, `reorderEntitiesAction({ entity, societyId?: string, orderedIds: string[] })` where `Entity = "track" | "speaker" | "gallery" | "sponsor" | "team" | "faq" | "testimonial"`, plus `saveSocietyAction({ societyId, data, seenUpdatedAt })`.
- `lib/admin/settings-actions.ts`: `saveSettingsAction({ patch: unknown; seenUpdatedAt: string })`, `saveStatsAction({ items: unknown; seenUpdatedAt: string })`.

**Security / authorization:**
- A static table `ENTITY_RULES: Record<Entity, { table; scope: "society" | "super"; societyColumn?: string; schema }>`: `track`, `gallery` → society-scoped (society from the row on update/delete, from `societyId` checked by `authorize` on create); `speaker` → society-scoped when `society_id` set, **super only when `society_id` is null (shared)**; `sponsor`, `team`, `faq`, `testimonial` → super only. The action looks the rule up by the enum value (unknown entity → `invalid_input`; table names never come from the client).
- Update/delete: read the row's `society_id` from the DB via the session client, `authorize({kind:"society", societyId})` or `{kind:"super"}`, then write with `.eq("id", id)` (+ `.eq("updated_at", seen)` for optimistic concurrency, zero rows → `conflict`). RLS and `guard_society_update` remain the backstop; a society admin attempting `name/color/slug/sort_order` gets `locked` ("Only a super admin can change a society's identity").
- Reorder: `orderedIds` must be a permutation of the ids currently in scope (re-selected server side, scope-checked) — otherwise `invalid_input`; updates `sort_order` 10, 20, 30…
- Gallery `eventId` must belong to the same society (DB trigger `check_gallery_event` is the backstop). Images: `isOwnMediaUrl` against `societies/<society>/` (society entities) or `site/` (site entities).
- Settings: read the current `settings` block, apply only `SETTINGS_EDITABLE` keys from the patch (unknown keys ignored, never merged), validate the merged object with `SettingsSchema`, compare `site_blocks.updated_at`, write via the session client (RLS: super admin only), `revalidatePath("/", "layout")`. `siteUrl`, `gaId`, `name`, `venue`, `registration`, `newsletter` cannot be changed here even by a crafted payload (test).
- After every write `revalidatePath("/")`, `/s/<slug>`, `/gallery`, `/events` as relevant.

**UI:** `/admin/society` lists the admin's societies (a single-society admin is redirected to theirs). `/admin/society/[slug]` (slug resolved to the society id server-side, then scope-checked): tabs Page (description + logo upload; identity fields only rendered for super admins), Tracks, Speakers, Gallery (upload grid with required alt text, caption, ratio, optional event, up/down reorder), each an `EntityListEditor` (props `{ entity, items, fields: FieldSpec[], societyId?, canEdit }`: list with Edit/Delete (ConfirmDialog) and an "Add" form; reorder via Move up/down buttons; field errors under inputs). `/admin/site` is super-only (`requireAdmin("/admin/site", {kind:"super"})`) with sections Announcement & settings, Stats, Sponsors, Team, FAQ, Testimonials using the same editor; the settings form shows each editable field with a preview of the public result where cheap (announcement bar).

- [ ] **Step 1:** schemas + tests (https-only URLs reject `javascript:`/`http:`, max lengths, enum colours, speaker slug, settings whitelist excludes `siteUrl/gaId/name/venue/registration/newsletter`).
- [ ] **Step 2:** actions + `content-actions.test.ts` (fake supabase): society admin edits a foreign society's track → `forbidden`, no write; society admin creating a **shared** speaker (no society) → `forbidden`; society admin touching sponsors/faq/settings → `forbidden`; super admin ok; reorder with a foreign id → `invalid_input`; settings patch containing `siteUrl` leaves it unchanged; stale `seenUpdatedAt` → `conflict`; society admin patching `color` → `locked` (fake DB error `42501`).
- [ ] **Step 3:** UI; phone-width check; commit `feat(admin): society management and site content editors`.

**Acceptance:** a `ras` admin edits RAS description/tracks/gallery but sees 404/forbidden for `cs` and for `/admin/site`; the super admin edits an FAQ and the announcement and sees it on the home page immediately. **→ Review point 3 (Tasks 7-9).**

---
### Task 10: People (admins, invites, anonymisation), audit log, settings status

**Goal:** the super admin manages who is an admin, can erase a person's data, reads the audit trail and sees whether payments are wired.
**Files:** create `lib/admin/invite.ts`, `lib/admin/people-actions.ts`, `lib/admin/anonymise-action.ts`, `app/admin/people/page.tsx`, `app/invite/[token]/page.tsx`, `app/admin/audit/page.tsx`, `app/admin/settings/page.tsx`, `components/admin/{InviteForm,RoleList,AnonymiseForm,AuditTable}.tsx`, `tests/admin/invite.test.ts`, `tests/admin/people-actions.test.ts`, `tests/admin/anonymise-action.test.ts`; modify `lib/payments/config.ts` (+ `tests/payments/config.test.ts`), `tests/payments/boundaries.test.ts` (add `lib/admin/anonymise-action.ts`), `app/robots.ts` (`/invite/`).
**Consumes:** Task 1 `admin_invites` (RLS), Task 3 `accept_admin_invite`, `anonymise_user`, `admin_payments_flag`, `requireSignedIn` (`lib/auth/session.ts`), `authorize`.
**Produces:**
- `lib/admin/invite.ts` (pure + WebCrypto): `newInviteToken(): string` (32 bytes from `crypto.getRandomValues`, base64url, 43 chars), `hashInviteToken(token: string): Promise<string>` (SHA-256 → 64 hex), `INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/`, `INVITE_TTL_MS = 7 * 24 * 3600 * 1000`, `inviteUrl(siteUrl: string, token: string): string`.
- `lib/admin/people-actions.ts` (`"use server"`): `createInviteAction({ email: string; role: "super_admin" | "society_admin"; societyId?: string }): Promise<ActionResult<{ url: string; expiresAt: string }>>`, `revokeInviteAction({ inviteId })`, `revokeRoleAction({ roleId })`, `acceptInviteAction(token: string): Promise<ActionResult<{ role: string }>>`, `searchPeopleAction({ q }): Promise<ActionResult<{ id; handle; fullName; college }[]>>` (super only, ≤ 10, no contact data).
- `lib/admin/anonymise-action.ts` (`"use server"`, service role for avatar cleanup only): `anonymiseUserAction({ userId: string; confirmHandle: string }): Promise<ActionResult<{ registrationsKept: number; avatarsRemoved: boolean }>>`.
- `lib/payments/config.ts`: `paymentsStatus(env: Env): { envFlag: boolean; keyIdPresent: boolean; keyMode: "test" | "live" | null; keySecretPresent: boolean; webhookSecretPresent: boolean; serviceRolePresent: boolean; cronSecretPresent: boolean; syncFlag: boolean; syncConfigured: boolean }` — booleans and the `test|live` word only, **never** a value or a prefix of a secret.

**Security / authorization:**
- Every action starts with `authorize({kind:"super"})` except `acceptInviteAction` (`requireSignedIn`-style: needs a session, not a role). The invite email is trimmed + lower-cased + validated by zod (`z.email`, ≤ 254); `society_admin` requires a `societyId` that exists (checked through RLS select); `super_admin` forbids one. At most 50 open (unaccepted, unrevoked, unexpired) invites exist at once (`count` check).
- The raw token exists only in memory: generated, hashed, `token_hash` inserted with `created_by = ctx.userId`, the URL returned **once**; never logged, never stored, never put in the audit summary. UI copy: "Copy this link now. It is shown once and works for 7 days, only for <email>."
- `acceptInviteAction`: validates `INVITE_TOKEN_RE` (else the same generic failure), requires a session, hashes, calls `rpc("accept_admin_invite")`, maps every failure to one message ("This invite link is invalid, already used, expired or for a different account."), then `redirect("/admin")`. The page `app/invite/[token]/page.tsx` exports `metadata = { robots: { index: false }, referrer: "no-referrer" }`, signed-out visitors go to `/login?next=/invite/<token>` (existing safe-next flow), and the button posts a server action (no GET side effects).
- `revokeRoleAction`: refuses the caller's own role row (`locked`: "Ask another super admin to remove you") — lock-out protection; the DB trigger additionally protects the last super admin.
- `anonymiseUserAction`: `authorize super`; reads the target's current `handle` via the session client and requires `confirmHandle === handle` (typed confirmation); calls `rpc("anonymise_user")` (the function re-checks super admin, refuses admins/self/open seats); only afterwards, with the service role, lists and removes `avatars` bucket objects under `<userId>/` (best-effort: failure sets `avatarsRemoved: false` and shows a warning, the database part is already done); never returns emails. If Task 3 fell back to the Admin API, the ban/rename also happens here.
- Audit page: `requireAdmin("/admin/audit", {kind:"super"})`; reads `audit_log` with filters (`action` prefix, society, date range) and `.range()` pagination (50); summary printed as escaped key/value text.

**UI:** People page sections — *Admins* (list: handle, role, society; Remove with `ConfirmDialog`), *Invite someone* (email, role radio, society select when society role; result panel with the one-time link, Copy button + `aria-live` "Copied"), *Pending invites* (email, role, expires, Revoke), *Erase a person's data* (search by handle/name → pick → shows "What is erased / What stays" copy from the Decisions table → type their handle → button). Settings page: read-only status list (icon + word "Configured / Missing"), DB flag status, note "Payments are switched on only via the go-live checklist; this page never changes money settings", link to `docs/payments-go-live-checklist.md` text and to Site content settings.

- [ ] **Step 1:** `invite.ts` + tests (token length/charset, hash is 64-hex and deterministic, two tokens differ, URL builder strips trailing slash); `paymentsStatus` + tests (all-missing, all-present test key → `keyMode: "test"`, live key → `"live"`, malformed key id → `keyIdPresent: false`; **`JSON.stringify` of the result contains none of the secret values passed in**).
- [ ] **Step 2:** actions + tests with fake supabase: society admin on every people action → `forbidden`; invite with society role but no society → `invalid_input`; token never appears in any insert payload (only the hash); 51st open invite → `conflict`; revoke own role → `locked`; accept with malformed token → generic failure with no rpc; accept maps rpc `invalid_invite` and `not_signed_in` correctly and redirects only on success; anonymise with wrong `confirmHandle` → `invalid_input` and **no** rpc; society admin → `forbidden` and no storage call; storage failure after a successful rpc → ok with `avatarsRemoved:false`; search returns only id/handle/fullName/college.
- [ ] **Step 3:** UI; manual: the full invite round trip in two browsers (wrong Google account must fail, correct one becomes society admin and sees the limited nav). Commit `feat(admin): people, invites, anonymisation, audit log, settings status`.

**Acceptance:** an invite link works exactly once for exactly one confirmed email; a society admin cannot reach `/admin/people`, `/admin/audit`, `/admin/site`, `/admin/settings` (404); anonymising a test user keeps its financial rows and removes sign-in.

---

### Task 11: Docs, advisors, whole-branch review, merge, deploy, user checklist

**Goal:** ship Phase 5.
**Files:** modify `README.md` (new "Admin dashboard" section), `design-system/MASTER.md` (admin dashboard pattern + scanner), `docs/payments-go-live-checklist.md` (refund UI now exists; remove the "until Phase 5 SQL" test-event caveat if superseded by the editor), `.superpowers/sdd/progress.md` (ledger line, by the controller).

- [ ] **Step 1: docs.** README: roles and the capability matrix (copy from this plan), how invites work (no email: copy the link, one use, 7 days, email must match), where media lives (`media` bucket, path prefixes), CSV contents and the formula-injection rule, check-in rules (QR immediate, token needs identity tap, window ±24 h), what anonymisation erases/keeps (copy the Decisions row), audit log scope (content + registration/people operations; check-ins not logged), the admin env needs (none new). MASTER.md: admin = cobalt chrome + cream work panels, status chips icon+word, tables collapse to cards under 640 px, scanner full-screen exception (cobalt field, cream result panel, ≥ 48 px controls), destructive actions use `ConfirmDialog`.
- [ ] **Step 2: verification sweep.** Run every `supabase/tests/*.sql` (Phases 1-5) against the live DB, one `execute_sql` each, all ending `all assertions passed`; `get_advisors` security + performance: 0 new findings; `npx vitest run && npx tsc --noEmit && npx eslint .` clean; `git grep -n "createAdminClient" -- app lib components` shows only the allow-listed files; `git grep -nE "authorize\(|requireAdmin\(" app/admin lib/admin` covers **every** page, route and action file (list printed in the review); `npx opennextjs-cloudflare build` then `npx wrangler deploy --dry-run --outdir <scratch>` → gzip size **under 3 072 KiB** (Phase 4 ended at 2 774 KiB; if over, move heavy admin-only code to client chunks or trim before merging).
- [ ] **Step 3: whole-branch review (ONE Sonnet reviewer, security-focused, covers Tasks 10-11 plus a cross-cut of 1-9).** Checklist: (a) every action/page/route authorises first and derives the society from the DB row; (b) no client-supplied role/society trusted on update/delete; (c) every `private` function has explicit revoke + grant, `search_path = ''`; (d) no admin path returns `profile_private` beyond the Task 2 function; (e) CSV minimal + neutralised; (f) invites hashed, one-time, email-bound, uniform errors; (g) anonymisation erases listed fields and keeps financial rows; (h) audit rows exist for each mutation class and contain no PII/secrets; (i) refund path disabled unless env + DB flag; (j) scanner never trusts client state; (k) robots/noindex/404-for-non-admin; (l) back-to-site first in the shell; (m) reduced-motion/keyboard/44 px; (n) tests non-vacuous. One fix round, no separate re-review.
- [ ] **Step 4: merge + deploy.** `git checkout main && git merge --no-ff phase5-admin && git push origin main` (Cloudflare auto-build deploys). Fallback: stop dev servers, `CLOUDFLARE_ACCOUNT_ID=7a852bedf2056637d90bd9534e6cd7c1 npm run deploy`. Post-deploy smoke (no login needed): `/admin` → 307 to `/login?next=/admin`; `/admin/events` same; `/robots.txt` contains `/admin/`; `/invite/<43 random chars>` renders the sign-in prompt and is `noindex`; `GET /admin/events/<uuid>/export` signed out → 404; home page + one event page still 200; cron still `GET` 405 / webhook 404 while payments off.
- [ ] **Step 5: ledger + hand-off.** Append "PHASE 5 MERGED + DEPLOYED" to `.superpowers/sdd/progress.md` with test counts, migration versions and any deferred minors.

**USER eyeball checklist (give to the user verbatim; nothing here needs secrets):**
1. Sign in as yourself → `/admin`: overview loads, sidebar shows BACK TO SITE first, then Overview, Events, Society, Site content, Admins, Audit log, Settings.
2. Events → New: create a draft (title, date, venue, capacity 5), upload a poster from your phone, add 2 custom questions, Publish → open the public event page and register with a second account; see it under Registrations.
3. Registrations: search, open Details (email/phone visible), Export CSV and open it (no `=`-starting cells executing), cancel the test registration, raise capacity and use Promote from waitlist if you queued one.
4. Phone: open the event's Check-in page on your phone; scan the ticket QR from the other account's `/me/tickets/<id>`: green "Checked in"; scan again: amber "Already checked in"; type the token: asks to confirm identity.
5. Invites: Admins → invite a second Google account as society admin of one society; open the link in a private window with the **wrong** account (must fail), then the right one; confirm that user only sees their society and gets a 404 on `/admin/site`, `/admin/people`, `/admin/audit`, `/admin/settings`, and on another society's events.
6. Audit log shows each of the above (who, what, when) and no emails/phones.
7. Settings: payments shown as off/missing; Refund buttons are disabled with an explanation.
8. Cancel the test event (type its title): registrations become cancelled; a paid seat (if any) shows "refund needed".
9. Optional: erase a throw-away test user (People → Erase) and confirm they can no longer sign in while their ticket/receipt row still exists.
10. Cleanup: delete or leave the test event/users as you prefer; revoke the test admin invite/role.
