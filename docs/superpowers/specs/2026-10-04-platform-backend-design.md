# st(AI)rway Platform — Backend, Accounts, Registration & Admin

**Date:** 2026-10-04
**Status:** Approved design, pending spec review
**Builds on:** the existing Next.js 16 site in this repo (paper-brutalist UI, bottom dock, `/data` content files, static export on Cloudflare Pages at https://stairway.pages.dev).

---

## 1. Goal

Turn the static st(AI)rway site into a real platform:

- Each IEEE SB CEK society (Main IEEE, CS, IAS, RAS, WIE) runs its own **stairway** of weekly weekend sessions.
- Sessions are announced with a **poster or video**, have a step timeline, and take **registrations** (free or paid via **Razorpay**) that issue a **ticket** (QR or token, chosen per event).
- Participants **sign in**, build a **profile** (photo, bio, skills, projects, experience, social links), see their tickets in a **participant dashboard**, and can see **who else is attending** each event.
- Admins manage everything from an **admin dashboard**: super admins edit the whole site; society admins manage their own society.
- Every dashboard has a **back/close button at the top of its left sidebar**.

### Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Architecture | Next.js server rendering on **Cloudflare Workers via OpenNext** + **Supabase** (Postgres, Auth, Storage, RLS) |
| Payments | **Razorpay**; built and tested in test mode, live keys added after KYC |
| Login | **Google** sign-in now; **6-digit email code** is built but switched off until a sending domain + custom SMTP (Resend) exists, because Supabase's built-in email only delivers to the project's own team members (no passwords) |
| Profile visibility | **Signed-in users only** (profiles and attendee lists) |
| Admin roles | **Super admin** (everything) + **society admin** (own society only) |
| Stairway model | **One stairway per society**; homepage shows each society's next session |
| Tickets | **Per-event setting**: QR ticket with door scanning, or simple token number |
| Registration form | **Profile fields auto-filled** + **per-event custom questions** |
| Deployment | GitHub `main` → Cloudflare Workers auto-deploy |

---

## 2. Architecture

```
Browser ──► Cloudflare Workers (Next.js via OpenNext)
              │  server components read Supabase with the user's session (RLS applies)
              │  route handlers: /api/payments/order, /api/payments/verify,
              │                  /api/payments/webhook, /api/checkin
              ├──► Supabase Postgres (RLS) + Auth + Storage
              ├──► Razorpay API (orders, signature verification, webhooks)
              └──► Resend (transactional email: confirmations, waitlist offers, admin invites)
```

- **Rendering:** public pages (home, society, event) are server-rendered on each request, so admin edits appear immediately and share previews (Open Graph) are always correct. Short CDN caching (`s-maxage=60, stale-while-revalidate`) on anonymous public pages.
- **Auth:** `@supabase/ssr` cookie sessions. **No Next.js `proxy.ts`** (Node runtime, unsupported by OpenNext). Session refresh uses the older **edge `middleware.ts`** (still supported in Next 16 and by OpenNext) running the standard Supabase `updateSession` pattern, only for requests that carry a Supabase auth cookie. The browser client also calls `router.refresh()` when the signed-in user changes. `/me/*`, `/onboarding` and `/admin/*` layouts check the session server-side (`getClaims()`) and redirect to `/login?next=…` when it is missing.
- **Server-only secrets** (Cloudflare Worker secrets): `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`. Public env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`. No secrets in the repo.
- **Service-role usage is limited** to: payment confirmation, webhook handling, waitlist promotion, admin invites, and the seat-hold expiry job. Everything else runs as the signed-in user under RLS.
- **Scheduled job:** a Cloudflare Cron Trigger (every 5 min) expires unpaid seat holds and promotes the waitlist.

---

## 3. Data model (Supabase Postgres)

All tables have `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` unless noted. Money is stored in **paise** (integer).

### Societies & content
- **societies** — `slug` (main, cs, ias, ras, wie; unique), `name`, `short_name`, `description`, `logo_url`, `color` (one of the design tokens), `sort_order`, `page_content jsonb`.
- **tracks** — `society_id`, `name` (e.g. "AI × Robotics"), `description`, `sort_order`.
- **speakers** — `name`, `designation`, `organization`, `photo_url`, `bio`, `topic`, `links jsonb`, `society_id` (nullable = shared).
- **site_blocks** — `key` (hero, announcement, about, stats, contact, social, registration_defaults; unique), `data jsonb`. Validated by zod schemas in code.
- **sponsors** — `name`, `url`, `logo_url`, `tier`, `sort_order`.
- **team_members** — `name`, `role`, `group`, `photo_url`, `fun_fact`, `links jsonb`, `sort_order`.
- **faqs** — `question`, `answer`, `sort_order`.
- **testimonials** — `quote`, `name`, `detail`, `event_id` (nullable), `photo_url`, `sort_order`.
- **gallery_items** — `event_id` (nullable), `society_id`, `image_url`, `caption`, `alt`, `sort_order`.

### Events
- **events** — `society_id`, `track_id`, `step_number`, `slug` (unique), `title`, `topic`, `summary`, `description`, `starts_at`, `ends_at` (timestamptz), `venue`, `mode` (offline|online|hybrid), `poster_url`, `video_url`, `level`, `formats text[]`, `agenda jsonb`, `outcomes text[]`, `prerequisites text[]`, `bring text[]`, `capacity int`, `price_paise int default 0`, `ticket_type` (`qr`|`token`), `token_prefix` (e.g. "RAS-05"), `registration_opens_at`, `registration_closes_at`, `status` (`draft`|`published`|`cancelled`), `resources jsonb`.
  Unique `(society_id, step_number)`.
- **event_speakers** — `event_id`, `speaker_id` (pk pair).
- **event_questions** — `event_id`, `label`, `help_text`, `type` (`text`|`textarea`|`single_choice`|`multi_choice`|`checkbox`|`file`), `options text[]`, `required bool`, `sort_order`.

### People
- **profiles** — `id` = `auth.users.id` (pk), `handle` (unique, lowercase, 3–30 chars), `full_name`, `avatar_url`, `headline`, `bio`, `college`, `branch`, `year`, `skills text[]`, `links jsonb` (linkedin, github, x, instagram, website), `onboarded bool`.
- **profile_private** — `user_id` pk, `phone`, `ieee_member_id`, `email` (mirror of auth email).
- **profile_projects** — `user_id`, `title`, `description`, `url`, `image_url`, `sort_order`.
- **profile_experience** — `user_id`, `title`, `organization`, `start_date`, `end_date` (nullable = present), `description`, `sort_order`.

### Registrations & payments
- **registrations** — `event_id`, `user_id`, `status` (`pending_payment`|`confirmed`|`waitlisted`|`cancelled`|`refunded`|`refund_needed`), `answers jsonb`, `ticket_code` (unique, 128-bit random, base32), `token_number` (int, per event sequence), `amount_paise`, `hold_expires_at`, `razorpay_order_id`, `razorpay_payment_id`, `checked_in_at`, `checked_in_by`, `waitlist_position`.
  Unique `(event_id, user_id)`.
- **payment_events** — append-only log: `registration_id`, `source` (`client_verify`|`webhook`), `razorpay_event`, `payload jsonb`, `received_at`. Webhook idempotency via unique `(razorpay_event_id)`.

### Access & audit
- **admin_roles** — `user_id`, `role` (`super_admin`|`society_admin`), `society_id` (required iff society_admin). Unique `(user_id, society_id)`.
- **admin_invites** — `email`, `role`, `society_id`, `token`, `expires_at`, `accepted_at`.
- **audit_log** — `actor_id`, `action`, `table_name`, `row_id`, `diff jsonb`, `at`. Written by triggers on admin-editable tables.

### Database functions (security definer, called via RPC)
- `register_for_event(event_id, answers)` — in one transaction: checks published + window + not already registered, locks the event row (`FOR UPDATE`), counts confirmed + unexpired holds; then creates `confirmed` (free), `pending_payment` with `hold_expires_at = now()+15 min` (paid), or `waitlisted` (full). Assigns `ticket_code` and `token_number`.
- `confirm_payment(registration_id, order_id, payment_id)` — idempotent: only moves `pending_payment → confirmed` when ids match; called by the server after signature verification.
- `check_in(ticket_code_or_token, event_id)` — admin-only; returns attendee + previous check-in time if already checked in.
- `expire_holds()` — cancels expired holds and promotes waitlist in order (offer = new 15-min hold + email).
- Helper predicates: `is_super_admin()`, `is_society_admin(society_id)`.

### Row-level security (summary)
| Table | Read | Write |
|---|---|---|
| societies, tracks, site_blocks, sponsors, team, faqs, testimonials, gallery, speakers | anyone | super admin; society admin for rows of their society (tracks, speakers, gallery, society page) |
| events, event_questions, event_speakers | anyone if `published`; admins of the society always | society admin of that society, super admin |
| profiles, profile_projects, profile_experience | **authenticated** users | owner only |
| profile_private | owner; admins of a society where the user has a registration | owner |
| registrations | owner; admins of the event's society; **authenticated** users may see `user_id` of `confirmed` registrations (attendee list) via a view `event_attendees` exposing only handle, name, avatar, headline | via RPCs only (no direct insert/update by users); admins may update status/check-in |
| admin_roles, admin_invites, audit_log | super admin (society admins see their own role) | super admin (via server) |

### Storage buckets
- `avatars` — public read, owner write (path `user_id/…`), 2 MB, images only.
- `media` — public read, admin write (posters, logos, gallery, speaker photos), 10 MB images / 100 MB video.
- `registration-files` — private; owner write, owner + society admins read via signed URLs.

---

## 4. Pages & routes

Visual style, dock and components stay as today (see `design-system/MASTER.md`).

### Public
- `/` — hero; **society strip** (card per society with its next session + countdown); then existing sections, all fed from the database.
- `/s/[society]` — society page: description, tracks, **the society's stairway** (step rows), society gallery.
- `/events/[slug]` — event page:
  - poster or video header (YouTube/Vimeo URL embed or uploaded MP4), details, agenda, speakers, venue/map, resources (after the event);
  - registration CTA with state: Register / Pay ₹X / Registered ✓ (view ticket) / Complete payment / Waitlisted (#n) / Full — join waitlist / Opens on … / Closed;
  - share: WhatsApp, LinkedIn, X, copy link (Instagram story), Web Share API on mobile;
  - **right-side "Attending (N)" panel**: avatars + names linking to `/u/[handle]`; signed-out visitors see the count and "Sign in to see who's going".
  - Old `/weekend/[slug]` URLs redirect to `/events/[slug]`.
- `/u/[handle]` — participant profile (signed-in only): photo, headline, bio, skills, projects, experience, links, events attended.
- `/login` — "Continue with Google" or email → 6-digit code; `?next=` returns the user to where they were.
- `/onboarding` — first sign-in: name, handle, college, branch, year, photo (rest optional).
- Existing: `/gallery`, `/resources`, `/code-of-conduct`, `/privacy`, 404.

### Participant dashboard `/me` (signed-in)
Left sidebar, **back/close button at top** (returns to the referrer or `/`). Tabs:
- **Overview** — next registered event + countdown + ticket shortcut; climb streak and badges.
- **My tickets** — upcoming/past; QR or token, download (PNG/PDF), add to calendar, share; "Complete payment" for live holds; cancel (free events).
- **Profile** — edit profile, photo upload/crop, projects, experience, skills, links; "View public profile".
- **Certificates** — PDF certificates for checked-in events.
- **Settings** — email, phone, IEEE ID, sign out, delete account.

### Admin dashboard `/admin` (admins)
Left sidebar, **back/close button at top**, society switcher (super admin: all; society admin: own).
- **Overview** — upcoming sessions, registrations this week, revenue, fill rate, recent check-ins.
- **Events** — list (draft/published/past) → **editor**: details, track, step, schedule, venue, poster/video upload, agenda builder, outcomes, prerequisites, speakers, capacity, price (₹0 = free), **ticket type (QR/token)** + token prefix, registration window, **custom questions builder**, live preview; Publish / Unpublish / Duplicate / Cancel event.
- **Registrations** (per event) — search, filter by status, answers, payment ids, CSV export, mark cancelled/refunded, promote from waitlist, manual check-in.
- **Check-in scanner** — full-screen camera QR scanner (phone friendly) + token/name search fallback; big green/red result; double-scan warning.
- **Society** — description, logo, colour, tracks (add/edit/reorder), speakers, gallery uploads.
- **Site content** *(super admin)* — hero, announcement bar, about, stats, sponsors, team, FAQ, testimonials, gallery, resources; list editors with drag-to-reorder and image upload.
- **Admins** *(super admin)* — invite by email as super admin or society admin; revoke.
- **Settings** *(super admin)* — contact details, registration defaults, Razorpay mode (test/live, shows which keys are configured — never the secrets).
- **Audit log** *(super admin)* — who changed what, when.

---

## 5. Key flows & error handling

### Registration (free)
1. Click Register → sign in if needed (`/login?next=/events/x`) → onboarding if profile incomplete.
2. Form: profile fields pre-filled (editable, saved back to profile on submit) + custom questions; same validation rules as the current form (on blur, errors under fields, focus first invalid).
3. `register_for_event` RPC → `confirmed` (or `waitlisted`) → confirmation email with ticket → ticket screen with share buttons.

### Registration (paid)
1. Same form → RPC creates `pending_payment` hold (15 min).
2. Server route `/api/payments/order` creates a Razorpay order (amount from DB, never from the client) and stores `razorpay_order_id`.
3. Razorpay Checkout opens (UPI/card/netbanking).
4. On success, `/api/payments/verify` checks the HMAC signature with `RAZORPAY_KEY_SECRET`, then calls `confirm_payment`. Ticket shown + email.
5. `/api/payments/webhook` (verified with `RAZORPAY_WEBHOOK_SECRET`) handles `payment.captured` / `order.paid` independently, so closing the tab after paying still confirms.
6. Abandoned/failed → hold expires via cron → seat released; "Complete payment" visible until then.

**Guarantees:** one registration per user per event (unique constraint); capacity enforced inside a locked transaction; confirmation idempotent across client verify + webhook + retries; amount always computed server-side; a payment arriving after hold expiry is still honoured if seats remain, otherwise flagged `refund_needed` for admins.

### Waitlist
Full event → `waitlisted` with position. When a seat frees (cancel/refund/expired hold), the cron promotes position 1: free events → `confirmed` + email; paid events → 15-min `pending_payment` hold + "your seat is ready" email.

### Tickets & check-in
- QR encodes only the opaque `ticket_code` (no personal data). Ticket card shows event, step, name, date, QR.
- Token = `${token_prefix}-${token_number padded to 4}` e.g. `RAS-05-0042`.
- Scanner calls `check_in`; results: ✓ checked in (name, photo) / ⚠ already checked in at HH:MM / ✗ not found or wrong event / ✗ not confirmed.

### Errors
- All server routes return typed errors; UI shows a clear message + recovery (retry, contact, Google Form fallback for registration).
- Network failure during payment → user lands on My tickets with status from the server (never trust client state).
- Admin forms: optimistic save with error toast + field errors; destructive actions need confirmation.

---

## 6. Seed data

- Societies: **Main IEEE, CS, IAS, RAS, WIE**.
- Tracks (as provided):
  - Main IEEE — AI × Research & Innovation, AI × Cybersecurity, AI × Data Analytics, AI × Generative Media
  - CS — AI × Web Development, AI × App Development, AI × Cloud & DevOps, AI × Software Engineering
  - IAS — AI × Industrial Automation, AI × Predictive Maintenance, AI × Digital Twins, AI × Smart Manufacturing
  - RAS — AI × Robotics, AI × Computer Vision, AI × Autonomous Systems, AI × ROS
  - **WIE (draft, editable)** — AI × HealthTech, AI × Inclusive Design, AI × Social Impact, AI × Entrepreneurship & Leadership
- Events: the 12 existing steps are mapped onto society stairways by topic (e.g. Computer Vision → RAS, Generative AI → Main IEEE), plus **4 draft WIE sessions** (one per WIE track) — all editable in the dashboard.
- Site content, sponsors, team, FAQ, testimonials, gallery, speakers: migrated from `/data/*.ts`. The `/data` files are kept only as the seed source.

---

## 7. Build phases

Each phase ends deployed and testable.

1. **Foundation** — Supabase project + schema + RLS + seed; switch to OpenNext on Cloudflare Workers with **GitHub auto-deploy**; public pages (home, society, event, gallery, resources) read from the DB; `/weekend/*` redirects.
2. **Accounts & profiles** — Google + email-code login, onboarding, `/me` shell with Profile & Settings, `/u/[handle]`, avatar upload.
3. **Free registration & tickets** — registration form + custom questions, capacity + waitlist, QR/token tickets, confirmation email, attendee panel, sharing, My tickets.
4. **Payments** — Razorpay test mode, holds, verify route, webhook, cron expiry, Complete payment.
5. **Admin dashboard** — event editor, registrations, check-in scanner, society management, site content editor, admins & invites, audit log, certificates.

### Needed from the user
- Phase 2: Google Cloud OAuth client (step-by-step guide provided); email-code login works without it.
- Phase 3: Resend account (+ sender domain if available).
- Phase 4: Razorpay account — test keys now, live keys after KYC.
- Phase 5: first admin email addresses.

---

## 8. Testing

- **RLS tests** (SQL, run against a local/branch database): each role × table × operation, e.g. CS admin cannot update RAS events; users cannot read others' `profile_private`; anonymous users cannot read profiles.
- **Unit tests** (Vitest): ticket code/token generation, Razorpay signature verification, zod schemas for site blocks and registration answers, capacity/waitlist logic via RPC against a test database.
- **End-to-end** (Playwright): sign up → onboarding → register (free) → ticket; paid flow with Razorpay test card; admin creates event → publishes → scans ticket.
- **Manual each phase:** phone + desktop in the browser, reduced motion, keyboard-only.

---

## 9. Out of scope (this build)

In-site refunds (done in the Razorpay dashboard and marked in admin), mobile apps, multiple languages, chat/messaging between participants, team formation for hackathons, public (non-signed-in) profiles.
