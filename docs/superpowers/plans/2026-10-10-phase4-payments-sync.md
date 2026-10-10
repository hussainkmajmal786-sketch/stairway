# Phase 4 — Razorpay Payments & Fund Easy Outbound Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in members can register for paid st(AI)rway sessions and pay on st(AI)rway itself with Razorpay Checkout (15-minute seat hold, idempotent confirmation from the browser and from the webhook, late-payment handling, refund bookkeeping), and every confirmed / cancelled / refunded registration is pushed one way, signed and idempotently, to Fund Easy — all feature-flagged OFF until the user supplies secrets.

**Architecture:** The `registrations` table (Phase 3) already carries every payment column and status. Phase 4 adds a private payment ledger (`private.payment_orders`, append-only `private.payment_events`), a per-event token counter, receipt numbers and an `external_sync_outbox`, all in the unexposed `private` schema. Users still never write tables: `register_for_event` gains paid holds; `attach_payment_order` (signed-in user) links a Razorpay order to the user's own hold; `confirm_payment`, `expire_holds`, `claim_refund`, `mark_refunded`, `claim_sync_batch`, `complete_sync` are `security definer` functions in `private` reachable only by `service_role` through thin `security invoker` wrappers in `public`. Next.js server actions create orders and verify checkout signatures; a route handler receives Razorpay webhooks; a Cloudflare Cron Trigger (custom OpenNext worker entry `cloudflare/worker.ts` with a `scheduled` handler) calls a secret-protected route that expires holds, promotes waitlists and drains the outbox to Fund Easy's proposed `external-sync` Edge Function (contract + patch delivered as docs only; Fund Easy is not touched).

**Tech Stack:** Next.js 16.3.8 (App Router, server actions, route handlers), React 19, Supabase Postgres (RLS + RPC) via `@supabase/supabase-js` 2 / `@supabase/ssr` 0.12, zod 4, Razorpay REST API v1 via `fetch` (no SDK), WebCrypto HMAC-SHA256, Razorpay Checkout (`checkout.js`, loaded only on pages that pay), Vitest 5, OpenNext Cloudflare 1.20.8 on Workers, Wrangler 4 (cron triggers).

**Spec:** `docs/superpowers/specs/2026-10-04-platform-backend-design.md` — §2 (server-only secrets, service-role usage, scheduled job), §3 *Registrations & payments* (`payment_events`), *Database functions* (`confirm_payment`, `expire_holds`), *Row-level security*; §4 event CTA states (Pay ₹X / Complete payment), My tickets ("Complete payment" for live holds); §5 *Registration (paid)*, *Waitlist*, *Errors*; §7 phase 4; §8. Earlier plan: `docs/superpowers/plans/2026-10-06-phase3-registration.md`. Ledger and decisions: `.superpowers/sdd/progress.md` (sections *Phase 3*, *Fund Easy study results*, *Fund Easy decisions*, *INCIDENT 1102*).

## Global Constraints

- Next.js stays `16.3.8`. **No `proxy.ts`**; the edge `middleware.ts` keeps its body (only its `matcher` changes in Task 8). **No `export const runtime = "edge"`** anywhere. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before writing a route handler and `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` before writing a server action (every action re-authenticates, validates input with zod, derives identity from the session and returns UI-shaped data only).
- Code must run on Cloudflare Workers via OpenNext: no Node-only modules (`fs`, `crypto` from `node:crypto`, `Buffer`-dependent libraries) in anything imported by pages, layouts, actions or route handlers. HMAC uses `globalThis.crypto.subtle`; base64 uses `btoa`. **No new runtime dependency** (no Razorpay SDK). Tests may use `node:crypto` to compute expected values.
- **Workers FREE plan reality (incident 1102):** the account currently allows 10 ms CPU per request. Every new handler (order creation, verify, webhook, cron tick, outbox processor) must be CPU-light: no large JSON, payload size caps (webhook body ≤ 64 KiB, outbox payload ≤ 8 KiB), batch limits (≤ 10 outbox rows and ≤ 50 hold events per tick), a wall-clock budget, and early exits before any DB call when a request is not ours. The plan **assumes the user upgrades to Workers Paid before enabling payments** (pre-flight checklist in Task 15).
- **Everything money-related is OFF by default.** Payments run only when `PAYMENTS_ENABLED=true` **and** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` are present (`lib/payments/config.ts`) **and** the database flag `private.feature_flags('payments')` is on. Otherwise paid events keep the "Paid registration opens soon" CTA and `register_for_event` keeps raising `paid_event`. Fund Easy sync runs only when `FUND_EASY_SYNC_ENABLED=true` and `FUND_EASY_SYNC_URL` (https) + `STAIRWAY_SYNC_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` are present. The cron route needs `CRON_SECRET`.
- **No task needs real secrets or a live payment.** Razorpay, Fund Easy and Supabase are mocked (`fetch` / client fakes) in Vitest; SQL behaviour is proven with rolled-back assertion scripts. The live test-mode payment is a USER step (Task 15).
- Secrets live only in Cloudflare Worker secrets (and a git-ignored `.dev.vars` locally). Never in git, never `NEXT_PUBLIC_*`, never in logs, never in error messages or responses. The Razorpay **key id** (public by design) reaches the browser only as a prop returned by `createPaymentOrder`, not through `NEXT_PUBLIC_RAZORPAY_KEY_ID` (runtime flag, not build-time inlining).
- **Service role is used only** in `lib/supabase/admin.ts`, imported only by: `lib/payments/actions.ts` (confirm after a verified checkout), `app/api/payments/webhook/route.ts`, `lib/payments/refunds.ts`, `app/api/cron/tick/route.ts`. Each service-role DB function is `security definer` in `private`, `set search_path = ''`, fully qualified names, `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`; its `public` wrapper is `security invoker` with the same grants.
- **Razorpay rules:** REST via `fetch` to `https://api.razorpay.com/v1` with `Authorization: Basic base64(key_id:key_secret)`, 8 s timeout. Every order carries `notes.source = "stairway"` and `notes.registration_id`. Amount is ALWAYS `registrations.amount_paise`, which only `register_for_event` sets from `events.price_paise`. Checkout signature = HMAC-SHA256(`order_id|payment_id`, key secret); webhook signature = HMAC-SHA256(raw body, webhook secret) from header `x-razorpay-signature`; both compared in constant time. Before confirming, re-fetch the payment (`status = captured`, `currency = INR`, `order_id` matches) and check the order's server-set notes. The webhook ignores (HTTP 200) anything whose notes are not ours or whose order id we don't know — the Razorpay account is SHARED with Fund Easy.
- Confirmation is idempotent across client verify + webhook + retries (`private.payment_events.razorpay_event_id` unique; `confirm_payment` locks the event row, then the registration). A payment after hold expiry is honoured if a seat remains, else the row becomes `refund_needed`. Refunds are never automatic: a user cancelling a paid seat sets `refund_needed`; `lib/payments/refunds.ts` (behind the flag, admin UI in Phase 5) performs the Razorpay refund.
- QR / code / token only for `confirmed` rows (Phase 3 gate `doorPass` unchanged). The attendee list and "Attending (N)" count confirmed rows only; capacity counts confirmed + live holds.
- Fund Easy (`C:\fund easy\`, project `fidguqathrzitfbpknrd`) **must not be modified, deployed or pushed**. Its side ships only as a contract doc + a PROPOSED patch stored in this repo under `docs/integrations/fund-easy-patch/`, marked NOT APPLIED. FE → st(AI)rway reverse sync is out of scope.
- Analytics events never carry registration / order / payment ids (only `step` numbers and error codes).
- Every privileged SQL object follows Phase 3: helpers in `private`, `set search_path = ''`, explicit revokes and grants; RLS writes that silently match zero rows are failures. New tables live in `private` (not exposed by PostgREST, no RLS lint noise); `private.*` tables get `revoke all … from public, anon, authenticated`.
- Supabase project ref `nfrdsdnrtsbttyrmfppy`. Apply DB changes with the Supabase MCP `apply_migration`, then rename the committed file to the version `list_migrations` reports, then regenerate `lib/supabase/database.types.ts` with MCP `generate_typescript_types`. **Never run `supabase/seed.sql` against the live database.**
- SQL assertion scripts in `supabase/tests/*.sql` run as **one** MCP `execute_sql` call each, inside `begin … rollback`, and end with a single `'<name>: all assertions passed'` row. After every migration: MCP `get_advisors` (`security`) must show **no new findings** (the pre-existing "leaked password protection disabled" Auth warning is allowed); `performance` may only add INFO "unused index" for the new indexes.
- Forms and UI follow `design-system/MASTER.md` (Cobalt Circuit): `components/ui/Field.tsx`, `role="alert"` for errors, `aria-live` for status, 44px touch targets, `prefers-reduced-motion` respected (countdowns tick without animation).
- Every new route is followed by `npx next typegen`. Every task ends with `npx vitest run`, `npx tsc --noEmit` and `npx eslint .` passing with zero errors/warnings, then a commit whose message ends with a blank line and `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `phase4-payments` (created from `main` in Task 1, Step 1). No process may hold `.open-next` when building (stop any `next dev` / `workerd` first).
- Keep the site name exactly `st(AI)rway`. Money in paise (integer); display `₹` with `en-IN` grouping; times in `Asia/Kolkata`.

## Decisions (final — do not re-open during execution)

| Topic | Decision |
|---|---|
| Where people pay | On st(AI)rway, Razorpay Checkout modal. Never redirected to Fund Easy. |
| Shared Razorpay account | Every order we create has `notes.source = "stairway"` + `notes.registration_id`; checkout passes the same notes. Webhook handles only `order.paid` (order notes are server-set, so trustworthy) and `refund.processed` (refund notes set by us); everything else, and anything whose notes are not ours or whose order id is unknown, is acknowledged with 200 and ignored. Refund notes use `source`/`registration_id` — never the key `refund_id` (Fund Easy's webhook looks that key up). |
| Order / verify endpoints | Server actions `createPaymentOrder` / `verifyPayment` (built-in Origin check, session identity) instead of the spec's `/api/payments/order` and `/api/payments/verify` routes. The webhook and cron are route handlers (`/api/payments/webhook`, `/api/cron/tick`). |
| Hold | 15 minutes from `register_for_event`; holds count toward capacity while `hold_expires_at > now()`, so a late cron never oversells. One Razorpay order per hold, reused for retries (no order spam). |
| Late payment | Honoured if the event is published, not started, and a seat is free; else `refund_needed` (receipt still issued). A second payment for an already-paid registration is logged as `duplicate_payment` in `private.payment_events` for manual refund (Phase 5 admin list). |
| Account deletion vs payments | `private.payment_orders.registration_id` and `private.payment_events.registration_id` reference `registrations ON DELETE RESTRICT`: a user who ever created an order cannot be deleted by cascade (Postgres raises 23503) until Phase 5 provides admin anonymisation. Free-only users still cascade. A cascaded delete of a confirmed free row enqueues `registration.cancelled` for Fund Easy. |
| Token numbers | `private.event_token_counters` (per-event counter, bumped under the event row lock) — numbers are never reused, even after deletions. Re-registration keeps a row's existing token. Paid rows get their token at confirmation. |
| Re-registration | Allowed from `cancelled`, `refunded`, and an expired `pending_payment` hold; every payment field on the row is reset (`amount_paise`, order/payment/refund ids, `paid_at`, `receipt_number`, `refunded_at`, `cancel_reason`). The ledger (`private.payment_orders`) keeps the history. `refund_needed` blocks re-registration with `refund_pending`. |
| Receipts | `STW-YYYY-NNNNNN` (IST year, `private.receipt_seq`), issued when a payment is accepted (confirmed or refund_needed), shown on the ticket and sent to Fund Easy. |
| Waitlist for paid events | Promotion gives the head a 15-minute `pending_payment` hold (no email: still deferred). The cron also promotes waitlists whose event has free seats (fixes "capacity raise promotes only on next register/cancel"). `register_for_event` returns promoted ids (`promoted`) as the seam for future emails. |
| Cancel | `cancel_registration` now also cancels a live hold (`cancelled`, reason `user`) and turns a paid confirmed seat into `refund_needed` (seat released, waitlist promoted, no automatic refund). |
| Cron | Custom worker entry `cloudflare/worker.ts` re-exports OpenNext's generated `.open-next/worker.js` `fetch` and adds `scheduled()`; it returns immediately when neither feature flag is on, else calls the app's own `POST /api/cron/tick` in-process via `handler.fetch` with `Authorization: Bearer ${CRON_SECRET}`. Wrangler `triggers.crons = ["*/5 * * * *"]`. Chosen over a separate cron Worker: one deployment, one secret set, no public network hop. |
| Fund Easy sync | Outbound only. Rows enqueued by a trigger on `registrations` into `private.external_sync_outbox` (snapshot payload, minimal PII: email + full name only for confirmations), drained by the cron with exponential backoff (1 min doubling, cap 6 h, dead after 10 attempts or a permanent 4xx). Payloads of sent rows are purged after 30 days. Contract version 1 in `docs/integrations/fund-easy-sync.md`. |
| CSP | None exists today (`public/_headers` only sets caching; `next.config.ts` has no headers). No CSP is added in Phase 4; README notes the origins a future CSP must allow (`https://checkout.razorpay.com` script, `https://api.razorpay.com` + `https://*.razorpay.com` frames/connect). |
| Emails | Still deferred (no sending domain). UI copy says so. |

---
## File Map

| Path | Responsibility |
|---|---|
| `supabase/migrations/*_payments_schema.sql` | feature flags, token counters, receipt sequence, new `registrations` columns, `private.payment_orders`, `private.payment_events` (append-only), `event_seat_counts.attending` |
| `supabase/migrations/*_payments_rpcs.sql` | `register_for_event` v2 (paid holds, field reset, `refund_pending`, promoted ids), `promote_waitlist` v2 (paid holds), `cancel_registration` v2, `attach_payment_order` |
| `supabase/migrations/*_payments_service.sql` | service-role functions `confirm_payment`, `expire_holds`, `claim_refund`, `mark_refunded` + `public` invoker wrappers |
| `supabase/migrations/*_sync_outbox.sql` | `private.external_sync_outbox`, enqueue trigger, `claim_sync_batch`, `complete_sync` |
| `supabase/tests/payments-schema.sql`, `payments-rpc.sql`, `payments-service.sql`, `sync-outbox.sql` | rolled-back assertion scripts |
| `lib/payments/config.ts` | feature flag + secret presence (`paymentsConfig()`), sync/cron config |
| `lib/payments/crypto.ts` | WebCrypto HMAC-SHA256 hex, constant-time compare, checkout + webhook signature checks |
| `lib/payments/razorpay.ts` | REST client: create order, fetch order/payment, refund; zod-validated responses; `RazorpayError` |
| `lib/payments/money.ts` | `formatInr(paise)` |
| `lib/payments/confirm.ts` | shared "re-fetch + check notes + `confirm_payment`" core used by verify and webhook |
| `lib/payments/actions.ts` | server actions `createPaymentOrder`, `verifyPayment` |
| `lib/payments/webhook.ts` | pure webhook handler (signature, routing, ignore-foreign) used by the route |
| `lib/payments/refunds.ts` | `refundRegistration()` (service role, behind the flag; admin UI in Phase 5) |
| `lib/payments/checkout.ts` | browser-only: load `checkout.js`, build options, open Checkout as a promise |
| `lib/supabase/admin.ts` | service-role client factory (server-only) |
| `lib/sync/contract.ts` | Fund Easy envelope v1 types, signing (`v1=` HMAC over `timestamp.body`) |
| `lib/sync/processor.ts` | claim → POST → complete loop with backoff classification and a time budget |
| `lib/cron/tick.ts`, `lib/cron/request.ts` | the tick (expire holds, drain outbox) and the internal cron request builder |
| `app/api/payments/webhook/route.ts` | Razorpay webhook endpoint |
| `app/api/cron/tick/route.ts` | secret-protected cron endpoint |
| `cloudflare/worker.ts` | custom worker entry: OpenNext `fetch` + `scheduled` |
| `lib/registration/*` | errors (new codes), types (`holdExpiresAt`, visible statuses), CTA (pay / complete payment / refund pending), tickets mapping, actions (paid registration) |
| `lib/tickets/view.ts`, `lib/tickets/list.ts` | ticket notices (pay / processing / expired / refund states), receipts, labels |
| `components/payments/*` | `PayButton`, `HoldCountdown`, `PaymentPanel`, `AutoRefresh`, `usePayFlow` |
| `components/registration/*`, `components/tickets/*` | paid CTA states, paid form submit, ticket notices, cancel copy for paid seats |
| `docs/integrations/fund-easy-sync.md` | the sync contract (request, HMAC, idempotency, responses, retries) |
| `docs/integrations/fund-easy-patch/**` | PROPOSED, NOT APPLIED Fund Easy migration, Edge Function, config snippet, pgTAP sketch |

## Task overview

1. Payment data model migration (flags, counters, ledger, receipts, attending count)
2. Registration RPCs v2 (paid holds, resets, cancel, attach order)
3. Service-role payment functions (confirm, expire holds, refunds)
4. Fund Easy sync outbox (table, trigger, claim/complete)
5. Payment config, crypto, Razorpay REST client, admin client
6. Typed errors, statuses, CTA states and ticket mapping for payments
7. Server actions: paid registration, `createPaymentOrder`, `verifyPayment`
8. Razorpay webhook route
9. Refund helper (behind the flag)
10. Fund Easy sync contract + outbox processor
11. Cron tick route + custom worker `scheduled` handler
12. Checkout UI on the registration page and event CTA
13. Ticket page, My tickets and attending count for payments
14. Fund Easy contract doc + PROPOSED patch (docs only)
15. Live DB verification, docs, whole-branch review, merge, deploy, USER CHECKLIST

---
### Task 1: Payment data model migration (flags, counters, ledger, receipts, attending count)

**Files:**
- Create: `supabase/migrations/20261010000001_payments_schema.sql` (renamed to the live version in Step 5), `supabase/tests/payments-schema.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: `public.events`, `public.registrations` (Phase 3), `private.is_society_admin(uuid)`, `private.new_ticket_code()`.
- Produces (later SQL tasks rely on these exact names):
  - `private.feature_flags(key text pk in ('payments'), enabled bool default false, updated_at)`; `private.flag_enabled(p_key text) returns boolean`
  - `private.event_token_counters(event_id uuid pk → events, last_token int)`; `private.next_token(p_event_id uuid) returns int` (caller holds the event row lock)
  - `private.receipt_seq`; `private.next_receipt_number() returns text` → `STW-YYYY-NNNNNN`
  - new `public.registrations` columns: `paid_at timestamptz`, `receipt_number text unique`, `razorpay_refund_id text unique`, `refunded_at timestamptz`, `refund_claimed_until timestamptz`, `cancel_reason text in ('user','hold_expired','late_payment_no_seat')` (review fixes add `'refunded'`); checks `registrations_money_shape`, `registrations_order_shape`, `registrations_payment_shape`
  - `private.payment_orders(razorpay_order_id text pk, registration_id uuid → registrations ON DELETE RESTRICT, amount_paise int > 0, status in ('created','paid','refunded'), razorpay_payment_id text unique, receipt_number text unique, razorpay_refund_id text unique, created_at, paid_at, refunded_at)`
  - `private.payment_events(id bigint identity, registration_id uuid → registrations ON DELETE RESTRICT, source in ('client_verify','webhook','refund_api'), razorpay_event_id text unique, razorpay_event, razorpay_order_id, razorpay_payment_id, razorpay_refund_id, amount_paise, currency, outcome, details jsonb ≤ 2 KiB, received_at)` — append-only (update/delete/truncate raise 42501). `outcome` ∈ `confirmed, late_confirmed, refund_needed, already_processed, duplicate_payment, amount_mismatch, refunded, already_refunded, ledger_refund`.
  - `public.event_seat_counts(event_id, seats_taken, waitlisted, attending)` — `attending` = confirmed only; `seats_taken` = confirmed + live holds (unchanged)

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull --ff-only
git checkout -b phase4-payments
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20261010000001_payments_schema.sql`:

```sql
-- Phase 4 (part 1): payment data model. Nothing here charges anyone: the 'payments' flag starts OFF.
-- New tables live in the unexposed `private` schema: no client can reach them; service-role access goes
-- through security-definer functions added in parts 3-4.

grant usage on schema private to service_role;

-- 1. Feature flags, flipped by the project owner with SQL only (README "Enabling payments").
create table private.feature_flags (
  key text primary key check (key in ('payments')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.feature_flags (key, enabled) values ('payments', false);
revoke all on private.feature_flags from public, anon, authenticated, service_role;

create or replace function private.flag_enabled(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select f.enabled from private.feature_flags f where f.key = p_key), false);
$$;
revoke execute on function private.flag_enabled(text) from public, anon, authenticated, service_role;

-- 2. Token numbers are never reused (a cascaded account deletion used to free its number):
--    one counter per event, bumped only while the caller holds the event row lock.
create table private.event_token_counters (
  event_id uuid primary key references public.events(id) on delete cascade,
  last_token int not null check (last_token >= 0)
);
revoke all on private.event_token_counters from public, anon, authenticated, service_role;
insert into private.event_token_counters (event_id, last_token)
  select r.event_id, max(r.token_number) from public.registrations r
  where r.token_number is not null
  group by r.event_id;

create or replace function private.next_token(p_event_id uuid) returns int
language sql volatile set search_path = '' as $$
  insert into private.event_token_counters as c (event_id, last_token)
  values (p_event_id, coalesce((select max(r.token_number) from public.registrations r where r.event_id = p_event_id), 0) + 1)
  on conflict (event_id) do update set last_token = c.last_token + 1
  returning c.last_token;
$$;
revoke execute on function private.next_token(uuid) from public, anon, authenticated, service_role;

-- 3. Receipt numbers for accepted payments: STW-<IST year>-<6+ digits>.
create sequence private.receipt_seq;
revoke all on sequence private.receipt_seq from public, anon, authenticated, service_role;

create or replace function private.next_receipt_number() returns text
language sql volatile set search_path = '' as $$
  select 'STW-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-'
         || lpad(s.n::text, greatest(6, length(s.n::text)), '0')
  from (select nextval('private.receipt_seq') as n) s;
$$;
revoke execute on function private.next_receipt_number() from public, anon, authenticated, service_role;

-- 4. Registration payment fields (Phase 3 already added amount_paise, hold_expires_at and the Razorpay ids).
alter table public.registrations
  add column paid_at timestamptz,
  add column receipt_number text unique check (receipt_number ~ '^STW-[0-9]{4}-[0-9]{6,}$'),
  add column razorpay_refund_id text unique check (razorpay_refund_id ~ '^rfnd_[A-Za-z0-9]{6,40}$'),
  add column refunded_at timestamptz,
  add column refund_claimed_until timestamptz,
  add column cancel_reason text check (cancel_reason in ('user', 'hold_expired', 'late_payment_no_seat')),
  add constraint registrations_money_shape
    check (status not in ('refund_needed', 'refunded') or razorpay_payment_id is not null),
  add constraint registrations_order_shape
    check (razorpay_order_id is null or razorpay_order_id ~ '^order_[A-Za-z0-9]{6,40}$'),
  add constraint registrations_payment_shape
    check (razorpay_payment_id is null or razorpay_payment_id ~ '^pay_[A-Za-z0-9]{6,40}$');

-- 5. Payment ledger: one row per Razorpay order we created. Survives re-registration (the registration row only
--    shows the current attempt). ON DELETE RESTRICT: an account that ever created an order cannot vanish by cascade.
create table private.payment_orders (
  razorpay_order_id text primary key check (razorpay_order_id ~ '^order_[A-Za-z0-9]{6,40}$'),
  registration_id uuid not null references public.registrations(id) on delete restrict,
  amount_paise int not null check (amount_paise > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'refunded')),
  razorpay_payment_id text unique check (razorpay_payment_id ~ '^pay_[A-Za-z0-9]{6,40}$'),
  receipt_number text unique,
  razorpay_refund_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);
create index payment_orders_registration_idx on private.payment_orders (registration_id, created_at desc);
revoke all on private.payment_orders from public, anon, authenticated, service_role;

-- 6. Append-only log of every payment signal we acted on. razorpay_event_id (x-razorpay-event-id) makes webhook
--    deliveries idempotent. `details` holds a whitelisted subset only (status, method): never card/contact data.
create table private.payment_events (
  id bigint generated always as identity primary key,
  registration_id uuid references public.registrations(id) on delete restrict,
  source text not null check (source in ('client_verify', 'webhook', 'refund_api')),
  razorpay_event_id text unique check (char_length(razorpay_event_id) <= 100),
  razorpay_event text check (char_length(razorpay_event) <= 60),
  razorpay_order_id text check (char_length(razorpay_order_id) <= 60),
  razorpay_payment_id text check (char_length(razorpay_payment_id) <= 60),
  razorpay_refund_id text check (char_length(razorpay_refund_id) <= 60),
  amount_paise int,
  currency text check (currency ~ '^[A-Z]{3}$'),
  outcome text not null check (outcome in ('confirmed', 'late_confirmed', 'refund_needed', 'already_processed',
    'duplicate_payment', 'amount_mismatch', 'refunded', 'already_refunded', 'ledger_refund')),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 2048),
  received_at timestamptz not null default now()
);
create index payment_events_registration_idx on private.payment_events (registration_id, received_at desc);
-- Phase 5 admin "needs attention" list: payments we kept but could not attach to a seat.
create index payment_events_attention_idx on private.payment_events (received_at desc)
  where outcome in ('duplicate_payment', 'amount_mismatch');
revoke all on private.payment_events from public, anon, authenticated, service_role;

create or replace function private.payment_events_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'payment_events is append-only' using errcode = '42501';
end $$;
revoke execute on function private.payment_events_append_only() from public, anon, authenticated, service_role;
create trigger payment_events_no_change before update or delete on private.payment_events
  for each row execute function private.payment_events_append_only();
create trigger payment_events_no_truncate before truncate on private.payment_events
  for each statement execute function private.payment_events_append_only();

-- 7. Seat counts gain `attending` (confirmed only). seats_taken still counts live holds, so capacity is never oversold.
drop view public.event_seat_counts;
drop function private.event_seat_counts();
create function private.event_seat_counts()
returns table (event_id uuid, seats_taken int, waitlisted int, attending int)
language sql stable security definer set search_path = '' as $$
  select e.id,
         (count(r.id) filter (where r.status = 'confirmed'
                                 or (r.status = 'pending_payment' and r.hold_expires_at > now())))::int,
         (count(r.id) filter (where r.status = 'waitlisted'))::int,
         (count(r.id) filter (where r.status = 'confirmed'))::int
  from public.events e
  left join public.registrations r on r.event_id = e.id
  where e.status = 'published' or private.is_society_admin(e.society_id)
  group by e.id;
$$;
revoke execute on function private.event_seat_counts() from public;
grant execute on function private.event_seat_counts() to anon, authenticated;

create view public.event_seat_counts with (security_invoker = true) as
  select c.event_id, c.seats_taken, c.waitlisted, c.attending from private.event_seat_counts() as c;
revoke all on public.event_seat_counts from anon, authenticated;
grant select on public.event_seat_counts to anon, authenticated;
```

- [ ] **Step 3: Write the assertion script**

Create `supabase/tests/payments-schema.sql`:

```sql
-- Phase 4 Task 1: payment data model. Run as ONE execute_sql call; rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004a1', 'p4-a1@test.local', 'authenticated', 'authenticated', '{"full_name":"Pay One"}'),
  ('00000000-0000-0000-0000-0000000004a2', 'p4-a2@test.local', 'authenticated', 'authenticated', '{"full_name":"Pay Two"}'),
  ('00000000-0000-0000-0000-0000000004a3', 'p4-a3@test.local', 'authenticated', 'authenticated', '{"full_name":"Pay Three"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id in ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004a2',
               '00000000-0000-0000-0000-0000000004a3');

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix, price_paise)
select s.id, 81, 'p4-schema', 'p4-schema', now() + interval '10 days', now() + interval '10 days 6 hours',
       'published', 5, 'RAS-81', 19900
from public.societies s where s.slug = 'ras';

do $$
declare
  ev uuid;
  a1 constant uuid := '00000000-0000-0000-0000-0000000004a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000004a2';
  a3 constant uuid := '00000000-0000-0000-0000-0000000004a3';
  t1 int;
  t2 int;
  t3 int;
  r2 uuid;
  r3 uuid;
  rc text;
  c record;
begin
  select id into ev from public.events where slug = 'p4-schema';

  -- flags start OFF
  assert not private.flag_enabled('payments'), 'payments flag is on by default';
  assert not private.flag_enabled('nope'), 'unknown flag reads as on';

  -- token counter: monotonic, never reused after a delete
  t1 := private.next_token(ev);
  t2 := private.next_token(ev);
  assert t1 = 1 and t2 = 2, format('tokens %s %s', t1, t2);
  insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
    values (ev, a1, 'confirmed', private.new_ticket_code(), t1, now());
  insert into public.registrations (event_id, user_id, status, ticket_code, token_number, confirmed_at)
    values (ev, a2, 'confirmed', private.new_ticket_code(), t2, now()) returning id into r2;
  delete from public.registrations where id = r2;
  t3 := private.next_token(ev);
  assert t3 = 3, 'token number reused after a delete: ' || t3;

  -- receipts
  rc := private.next_receipt_number();
  assert rc ~ ('^STW-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-[0-9]{6,}$'), 'bad receipt ' || rc;
  assert private.next_receipt_number() <> rc, 'receipt numbers repeat';

  -- money shape: refund states need a payment id; ids must look like Razorpay ids
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, amount_paise)
      values (ev, a3, 'refund_needed', private.new_ticket_code(), 19900);
    assert false, 'refund_needed without a payment id accepted';
  exception when check_violation then null; end;
  begin
    insert into public.registrations (event_id, user_id, status, ticket_code, hold_expires_at, razorpay_order_id)
      values (ev, a3, 'pending_payment', private.new_ticket_code(), now() + interval '15 minutes', 'not-an-order');
    assert false, 'malformed order id accepted';
  exception when check_violation then null; end;

  -- a live hold counts toward capacity but not toward attending
  insert into public.registrations (event_id, user_id, status, ticket_code, amount_paise, hold_expires_at, razorpay_order_id)
    values (ev, a3, 'pending_payment', private.new_ticket_code(), 19900, now() + interval '15 minutes', 'order_P4SCHEMA0001')
    returning id into r3;
  select * into c from public.event_seat_counts where event_id = ev;
  assert c.seats_taken = 2 and c.attending = 1 and c.waitlisted = 0, format('counts %s', row_to_json(c));

  -- ledger: an order blocks deleting the account by cascade (ON DELETE RESTRICT)
  insert into private.payment_orders (razorpay_order_id, registration_id, amount_paise)
    values ('order_P4SCHEMA0001', r3, 19900);
  begin
    delete from auth.users where id = a3;
    assert false, 'account with a payment order was deleted by cascade';
  exception when foreign_key_violation then null; end;

  -- payment_events is append-only and webhook event ids are unique
  insert into private.payment_events (registration_id, source, razorpay_event_id, razorpay_order_id, outcome)
    values (r3, 'webhook', 'evt_P4SCHEMA0001', 'order_P4SCHEMA0001', 'confirmed');
  begin
    update private.payment_events set outcome = 'refunded' where razorpay_event_id = 'evt_P4SCHEMA0001';
    assert false, 'payment_events row updated';
  exception when insufficient_privilege then null; end;
  begin
    delete from private.payment_events where razorpay_event_id = 'evt_P4SCHEMA0001';
    assert false, 'payment_events row deleted';
  exception when insufficient_privilege then null; end;
  begin
    insert into private.payment_events (source, razorpay_event_id, outcome) values ('webhook', 'evt_P4SCHEMA0001', 'confirmed');
    assert false, 'duplicate razorpay_event_id accepted';
  exception when unique_violation then null; end;

  -- no client (or service_role) privilege on the private tables and helpers
  assert not has_table_privilege('anon', 'private.payment_events', 'select'), 'anon reads payment_events';
  assert not has_table_privilege('authenticated', 'private.payment_events', 'select'), 'authenticated reads payment_events';
  assert not has_table_privilege('authenticated', 'private.payment_orders', 'select'), 'authenticated reads payment_orders';
  assert not has_table_privilege('authenticated', 'private.feature_flags', 'update'), 'authenticated can flip flags';
  assert not has_table_privilege('service_role', 'private.feature_flags', 'update'), 'service_role can flip flags';
  assert not has_function_privilege('authenticated', 'private.next_token(uuid)', 'execute'), 'authenticated runs next_token';
  assert not has_function_privilege('anon', 'private.next_receipt_number()', 'execute'), 'anon runs next_receipt_number';
  assert not has_function_privilege('authenticated', 'private.flag_enabled(text)', 'execute'), 'authenticated reads flags';
  assert has_table_privilege('anon', 'public.event_seat_counts', 'select'), 'anon lost seat counts';
  assert not has_table_privilege('anon', 'public.event_seat_counts', 'insert'), 'anon can write seat counts';
end $$;

rollback;
select 'payments-schema: all assertions passed' as result;
```

- [ ] **Step 4: Apply the migration to the live project**

Run MCP `apply_migration` (project `nfrdsdnrtsbttyrmfppy`, name `payments_schema`) with the file's contents. Expected: success. (Additive: no existing row changes except the token-counter backfill.)

- [ ] **Step 5: Align the file name with the recorded version**

Run MCP `list_migrations`; take the version `V` recorded for `payments_schema`, then:

```bash
git mv supabase/migrations/20261010000001_payments_schema.sql supabase/migrations/V_payments_schema.sql
```

(literally replace `V` with the reported 14-digit version).

- [ ] **Step 6: Run the assertion scripts and the advisors**

Run `supabase/tests/payments-schema.sql` as ONE MCP `execute_sql` call. Expected: one row `payments-schema: all assertions passed`. Re-run `supabase/tests/registrations-rpc.sql` and `supabase/tests/registrations-rls.sql` the same way (Phase 3 behaviour unchanged — both still pass). Run MCP `get_advisors` type `security` (no new findings) and type `performance` (at most INFO unused-index for the three new indexes).

- [ ] **Step 7: Regenerate types and run the gate**

Run MCP `generate_typescript_types` (project `nfrdsdnrtsbttyrmfppy`) and overwrite `lib/supabase/database.types.ts` with the output. Then:

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
```

Expected: all pass (the new columns are additive).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations supabase/tests/payments-schema.sql lib/supabase/database.types.ts
git commit -m "feat(db): payment ledger, token counters, receipts and attending count

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Registration RPCs v2 (paid holds, resets, cancel, attach order)

**Files:**
- Create: `supabase/migrations/20261010000002_payments_rpcs.sql` (renamed in Step 5), `supabase/tests/payments-rpc.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes (Task 1): `private.flag_enabled(text)`, `private.next_token(uuid)`, `private.payment_orders`, the new registration columns. Phase 3: `private.seats_taken(uuid)`, `private.validate_answers(jsonb, jsonb)`, `private.compact_waitlist(uuid)`, `private.new_ticket_code()`, the `public` invoker wrappers `register_for_event(uuid, jsonb)` / `cancel_registration(uuid)` (unchanged signatures; `create or replace` of the `private` bodies keeps their ACLs).
- Produces:
  - `public.register_for_event(p_event_id uuid, p_answers jsonb)` → `jsonb {registration_id uuid, status 'confirmed'|'waitlisted'|'pending_payment', waitlist_position int|null, hold_expires_at timestamptz|null, amount_paise int, promoted uuid[]}`; raises (P0001 message) the Phase 3 codes plus `refund_pending`. `paid_event` still raised for `price_paise > 0` while the `payments` flag is off.
  - `public.cancel_registration(p_registration_id uuid)` → `jsonb {registration_id, event_id, promoted int, status 'cancelled'|'refund_needed'}`; no longer raises `paid_cancel_not_supported`.
  - `private.promote_waitlist(uuid) returns setof uuid` — paid published events (flag on) promote into a 15-minute `pending_payment` hold; nothing is promoted once the event has started.
  - `public.attach_payment_order(p_registration_id uuid, p_order_id text, p_amount_paise int)` → `jsonb {order_id text, hold_expires_at timestamptz}`; `authenticated` only; raises `not_signed_in`, `invalid_order`, `registration_not_found`, `hold_expired`, `amount_mismatch`.
  - **REVIEW AMENDMENT (migration `20261010154416_payments_review_fixes`, supersedes the line above and the attach SQL/tests below):** attach is now **server-only**: `public.attach_payment_order(p_user_id uuid, p_registration_id uuid, p_order_id text, p_amount_paise int)` → same `jsonb`; executable by `service_role` only (private body and public wrapper; `anon`/`authenticated` have no EXECUTE; the 3-arg versions are dropped). `p_user_id` is the session user's id, passed by the server; a foreign user id gets `registration_not_found`. Raises `not_signed_in` (null user), `payments_disabled` (flag off), `invalid_order`, `registration_not_found`, `hold_expired`, `amount_mismatch`. Reason: a user-callable attach let anyone write unbounded / foreign (Fund Easy) order ids into the ledger.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261010000002_payments_rpcs.sql`:

```sql
-- Phase 4 (part 2): paid registration. Same lock order as Phase 3 everywhere: events row, then registrations rows.

-- 1. Waitlist promotion: free events confirm the head; paid events (payments switched on) give it a 15-minute
--    payment hold. Nothing moves once the event has started. CALLER MUST HOLD the event row lock.
create or replace function private.promote_waitlist(p_event_id uuid) returns setof uuid
language plpgsql set search_path = '' as $$
declare
  cap int;
  price int;
  starts timestamptz;
  head_id uuid;
  head_token int;
begin
  select e.capacity, e.price_paise, e.starts_at into cap, price, starts
    from public.events e where e.id = p_event_id and e.status = 'published';
  if not found or now() >= starts then
    return;
  end if;
  if price > 0 and not private.flag_enabled('payments') then
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
    if price > 0 then
      update public.registrations r
         set status = 'pending_payment', waitlist_position = null, hold_expires_at = now() + interval '15 minutes',
             amount_paise = price, razorpay_order_id = null, razorpay_payment_id = null, razorpay_refund_id = null,
             paid_at = null, receipt_number = null, refunded_at = null, refund_claimed_until = null, cancel_reason = null
       where r.id = head_id;
    else
      update public.registrations r
         set status = 'confirmed', waitlist_position = null, confirmed_at = now(),
             token_number = coalesce(head_token, private.next_token(p_event_id))
       where r.id = head_id;
    end if;
    perform private.compact_waitlist(p_event_id);
    return next head_id;
  end loop;
end $$;
revoke execute on function private.promote_waitlist(uuid) from public, anon, authenticated, service_role;

-- 2. Register: free -> confirmed; paid (flag on) -> 15-minute pending_payment hold; full -> waitlisted.
--    Re-registration is allowed from cancelled, refunded or an expired hold, and resets every payment field.
create or replace function private.register_for_event(p_event_id uuid, p_answers jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  ev public.events%rowtype;
  existing public.registrations%rowtype;
  had_row boolean;
  paid boolean;
  new_status public.registration_status;
  pos int;
  tok int;
  hold timestamptz;
  rid uuid;
  promoted uuid[];
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
  paid := ev.price_paise > 0;
  if paid and not private.flag_enabled('payments') then
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
  if had_row then
    if existing.status = 'refund_needed' then
      raise exception 'refund_pending' using errcode = 'P0001';
    end if;
    if existing.status not in ('cancelled', 'refunded')
       and not (existing.status = 'pending_payment' and existing.hold_expires_at <= now()) then
      raise exception 'already_registered' using errcode = 'P0001';
    end if;
  end if;

  -- Anyone already waiting goes first if seats have freed up (e.g. capacity was raised or a hold expired).
  select coalesce(array_agg(p.id), '{}') into promoted from private.promote_waitlist(ev.id) as p(id);

  if private.seats_taken(ev.id) < ev.capacity then
    pos := null;
    if paid then
      new_status := 'pending_payment';
      hold := now() + interval '15 minutes';
      tok := case when had_row then existing.token_number end;
    else
      new_status := 'confirmed';
      hold := null;
      tok := case when had_row and existing.token_number is not null then existing.token_number
                  else private.next_token(ev.id) end;
    end if;
  else
    new_status := 'waitlisted';
    hold := null;
    tok := case when had_row then existing.token_number end;
    select coalesce(max(r.waitlist_position), 0) + 1 into pos
      from public.registrations r where r.event_id = ev.id and r.status = 'waitlisted';
  end if;

  if had_row then
    update public.registrations r
       set status = new_status, answers = v_answers, ticket_code = private.new_ticket_code(),
           token_number = tok, waitlist_position = pos, hold_expires_at = hold,
           amount_paise = case when paid then ev.price_paise else 0 end,
           razorpay_order_id = null, razorpay_payment_id = null, razorpay_refund_id = null,
           paid_at = null, receipt_number = null, refunded_at = null, refund_claimed_until = null, cancel_reason = null,
           confirmed_at = case when new_status = 'confirmed' then now() end,
           cancelled_at = null, checked_in_at = null, checked_in_by = null
     where r.id = existing.id
     returning r.id into rid;
  else
    insert into public.registrations (event_id, user_id, status, answers, ticket_code, token_number, waitlist_position,
                                      hold_expires_at, amount_paise, confirmed_at)
    values (ev.id, uid, new_status, v_answers, private.new_ticket_code(), tok, pos, hold,
            case when paid then ev.price_paise else 0 end,
            case when new_status = 'confirmed' then now() end)
    returning id into rid;
  end if;

  return jsonb_build_object(
    'registration_id', rid, 'status', new_status, 'waitlist_position', pos, 'hold_expires_at', hold,
    'amount_paise', case when paid then ev.price_paise else 0 end, 'promoted', to_jsonb(promoted));
end $$;

-- 3. Cancel: a live hold is released; a paid confirmed seat becomes refund_needed (seat released, no automatic
--    refund); free seats and waitlist places are cancelled as before. The freed seat promotes the waitlist.
create or replace function private.cancel_registration(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_event_id uuid;
  ev public.events%rowtype;
  reg public.registrations%rowtype;
  new_status public.registration_status;
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

  if reg.status not in ('confirmed', 'waitlisted', 'pending_payment') or reg.checked_in_at is not null then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  if reg.status <> 'pending_payment' and now() >= ev.starts_at then
    raise exception 'event_started' using errcode = 'P0001';
  end if;

  new_status := case when reg.status = 'confirmed' and reg.razorpay_payment_id is not null
                     then 'refund_needed'::public.registration_status
                     else 'cancelled'::public.registration_status end;
  update public.registrations r
     set status = new_status, cancelled_at = now(), cancel_reason = 'user', waitlist_position = null
   where r.id = reg.id;
  if reg.status = 'waitlisted' then
    perform private.compact_waitlist(ev.id);
  end if;
  select count(*)::int into promoted from private.promote_waitlist(ev.id);

  return jsonb_build_object('registration_id', reg.id, 'event_id', ev.id, 'promoted', promoted, 'status', new_status);
end $$;

-- 4. Link a Razorpay order (created by our server for this hold) to the user's own live hold. Idempotent: if the
--    hold already has an order, that order is returned and the new one is only recorded in the ledger (so a
--    payment to it is still matched). Every order is recorded, so late payments always find their registration.
create or replace function private.attach_payment_order(p_registration_id uuid, p_order_id text, p_amount_paise int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  v_event_id uuid;
  reg public.registrations%rowtype;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if p_order_id is null or p_order_id !~ '^order_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;
  select r.event_id into v_event_id from public.registrations r where r.id = p_registration_id and r.user_id = uid;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;
  perform 1 from public.events e where e.id = v_event_id for update;
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;
  if reg.status <> 'pending_payment' or reg.hold_expires_at <= now() then
    raise exception 'hold_expired' using errcode = 'P0001';
  end if;
  if reg.amount_paise <= 0 or p_amount_paise is distinct from reg.amount_paise then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  insert into private.payment_orders (razorpay_order_id, registration_id, amount_paise)
  values (p_order_id, reg.id, reg.amount_paise)
  on conflict (razorpay_order_id) do nothing;
  if not exists (select 1 from private.payment_orders o
                 where o.razorpay_order_id = p_order_id and o.registration_id = reg.id) then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;

  if reg.razorpay_order_id is null then
    update public.registrations r set razorpay_order_id = p_order_id where r.id = reg.id;
    return jsonb_build_object('order_id', p_order_id, 'hold_expires_at', reg.hold_expires_at);
  end if;
  return jsonb_build_object('order_id', reg.razorpay_order_id, 'hold_expires_at', reg.hold_expires_at);
end $$;
revoke execute on function private.attach_payment_order(uuid, text, int) from public, anon, service_role;
grant execute on function private.attach_payment_order(uuid, text, int) to authenticated;

create function public.attach_payment_order(p_registration_id uuid, p_order_id text, p_amount_paise int) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.attach_payment_order(p_registration_id, p_order_id, p_amount_paise);
$$;
revoke execute on function public.attach_payment_order(uuid, text, int) from public, anon, service_role;
grant execute on function public.attach_payment_order(uuid, text, int) to authenticated;
```

- [ ] **Step 2: Write the assertion script**

Create `supabase/tests/payments-rpc.sql`:

```sql
-- Phase 4 Task 2: paid registration RPCs. Run as ONE execute_sql call; rolls back.
begin;

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004b1', 'p4-b1@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee One"}'),
  ('00000000-0000-0000-0000-0000000004b2', 'p4-b2@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee Two"}'),
  ('00000000-0000-0000-0000-0000000004b3', 'p4-b3@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee Three"}'),
  ('00000000-0000-0000-0000-0000000004b4', 'p4-b4@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee Four"}'),
  ('00000000-0000-0000-0000-0000000004b5', 'p4-b5@test.local', 'authenticated', 'authenticated', '{"full_name":"Bee Five"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id::text like '00000000-0000-0000-0000-0000000004b%';

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix, price_paise)
select s.id, v.step, v.slug, v.slug, now() + interval '10 days', now() + interval '10 days 6 hours', 'published',
       v.capacity, 'RAS-' || v.step, v.price
from public.societies s,
  (values (82, 'p4-paid', 2, 19900), (83, 'p4-free', 5, 0)) as v(step, slug, capacity, price)
where s.slug = 'ras';

do $$
declare
  paid uuid;
  free uuid;
  b1 constant uuid := '00000000-0000-0000-0000-0000000004b1';
  b2 constant uuid := '00000000-0000-0000-0000-0000000004b2';
  b3 constant uuid := '00000000-0000-0000-0000-0000000004b3';
  b4 constant uuid := '00000000-0000-0000-0000-0000000004b4';
  b5 constant uuid := '00000000-0000-0000-0000-0000000004b5';
  r jsonb;
  reg public.registrations%rowtype;
  r1 uuid;
  r2 uuid;
  r3 uuid;
  c record;
  tok_before int;
begin
  select id into paid from public.events where slug = 'p4-paid';
  select id into free from public.events where slug = 'p4-free';

  -- flag OFF: paid events are still refused
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.register_for_event(paid, '{}');
    assert false, 'paid event accepted with the flag off';
  exception when others then if sqlerrm <> 'paid_event' then raise; end if; end;
  reset role;

  update private.feature_flags set enabled = true where key = 'payments';

  -- flag ON, capacity 2: two holds, then the waitlist (holds count toward capacity)
  set local role authenticated;
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'pending_payment' and (r->>'amount_paise')::int = 19900, 'b1: ' || r::text;
  assert (r->>'hold_expires_at')::timestamptz between now() + interval '14 minutes' and now() + interval '16 minutes', 'b1 hold ' || r::text;
  r1 := (r->>'registration_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', b2, 'role', 'authenticated')::text, true);
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'pending_payment', 'b2: ' || r::text;
  r2 := (r->>'registration_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', b3, 'role', 'authenticated')::text, true);
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'waitlisted' and (r->>'waitlist_position')::int = 1, 'b3: ' || r::text;
  r3 := (r->>'registration_id')::uuid;
  reset role;
  select * into c from public.event_seat_counts where event_id = paid;
  assert c.seats_taken = 2 and c.attending = 0 and c.waitlisted = 1, format('counts %s', row_to_json(c));
  select * into reg from public.registrations where id = r1;
  assert reg.token_number is null and reg.razorpay_order_id is null, 'hold got a token or an order';

  -- attach an order: own live hold only, exact amount, idempotent
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.attach_payment_order(r1, 'order_P4RPC000001', 19900);
  assert r->>'order_id' = 'order_P4RPC000001', 'attach: ' || r::text;
  r := public.attach_payment_order(r1, 'order_P4RPC000002', 19900);
  assert r->>'order_id' = 'order_P4RPC000001', 'second attach replaced the order: ' || r::text;
  begin
    perform public.attach_payment_order(r1, 'order_P4RPC000003', 100);
    assert false, 'wrong amount accepted';
  exception when others then if sqlerrm <> 'amount_mismatch' then raise; end if; end;
  begin
    perform public.attach_payment_order(r1, 'nope', 19900);
    assert false, 'malformed order accepted';
  exception when others then if sqlerrm <> 'invalid_order' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', b2, 'role', 'authenticated')::text, true);
  begin
    perform public.attach_payment_order(r1, 'order_P4RPC000004', 19900);
    assert false, 'attached an order to someone else''s hold';
  exception when others then if sqlerrm <> 'registration_not_found' then raise; end if; end;
  reset role;
  assert (select count(*) from private.payment_orders where registration_id = r1) = 2, 'both orders must be in the ledger';

  -- b1's hold expires: a new registration promotes the waitlist head (b3) into a hold, and is itself waitlisted
  update public.registrations set hold_expires_at = now() - interval '1 second' where id = r1;
  perform set_config('request.jwt.claims', json_build_object('sub', b4, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'waitlisted', 'b4: ' || r::text;
  assert (r->'promoted') @> to_jsonb(array[r3]), 'promoted ids missing: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = r3;
  assert reg.status = 'pending_payment' and reg.hold_expires_at > now() and reg.amount_paise = 19900, 'b3 not given a hold';

  -- b1 (expired hold) may register again; every payment field is reset
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'waitlisted' and (r->>'registration_id')::uuid = r1, 'b1 re-register: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = r1;
  assert reg.razorpay_order_id is null and reg.hold_expires_at is null, 'payment fields not reset';

  -- b2 cancels a live hold: released, waitlist head (b4) gets a hold
  perform set_config('request.jwt.claims', json_build_object('sub', b2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.cancel_registration(r2);
  assert r->>'status' = 'cancelled' and (r->>'promoted')::int = 1, 'cancel hold: ' || r::text;
  reset role;
  assert (select cancel_reason from public.registrations where id = r2) = 'user', 'cancel reason not recorded';
  assert (select status from public.registrations where event_id = paid and user_id = b4) = 'pending_payment', 'b4 not promoted';

  -- a paid confirmed seat cancelled by its owner becomes refund_needed and frees the seat
  update public.registrations
     set status = 'confirmed', razorpay_order_id = 'order_P4RPC000009', razorpay_payment_id = 'pay_P4RPC000009',
         paid_at = now(), confirmed_at = now(), hold_expires_at = null, token_number = private.next_token(paid)
   where id = r3;
  perform set_config('request.jwt.claims', json_build_object('sub', b3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.cancel_registration(r3);
  assert r->>'status' = 'refund_needed' and (r->>'promoted')::int = 1, 'paid cancel: ' || r::text;
  -- refund_needed blocks re-registration
  begin
    perform public.register_for_event(paid, '{}');
    assert false, 're-registered with a refund pending';
  exception when others then if sqlerrm <> 'refund_pending' then raise; end if; end;
  reset role;
  assert (select status from public.registrations where id = r1) = 'pending_payment', 'b1 not promoted after paid cancel';

  -- after the refund, re-registration works and resets the money fields
  update public.registrations set status = 'refunded', razorpay_refund_id = 'rfnd_P4RPC000009', refunded_at = now() where id = r3;
  perform set_config('request.jwt.claims', json_build_object('sub', b3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.register_for_event(paid, '{}');
  assert r->>'status' = 'waitlisted', 'b3 after refund: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = r3;
  assert reg.razorpay_payment_id is null and reg.razorpay_refund_id is null and reg.refunded_at is null
     and reg.receipt_number is null and reg.cancel_reason is null, 'refunded row not reset';

  -- free events: tokens come from the counter and are never reused
  perform set_config('request.jwt.claims', json_build_object('sub', b5, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.register_for_event(free, '{}');
  assert r->>'status' = 'confirmed' and (r->>'amount_paise')::int = 0, 'free: ' || r::text;
  reset role;
  select token_number into tok_before from public.registrations where event_id = free and user_id = b5;
  delete from public.registrations where event_id = free and user_id = b5;
  set local role authenticated;
  r := public.register_for_event(free, '{}');
  reset role;
  assert (select token_number from public.registrations where event_id = free and user_id = b5) = tok_before + 1,
    'free token reused after a delete';

  -- grants
  assert not has_function_privilege('anon', 'public.attach_payment_order(uuid, text, integer)', 'execute'), 'anon can attach orders';
  assert has_function_privilege('authenticated', 'public.attach_payment_order(uuid, text, integer)', 'execute'), 'users cannot attach orders';
  assert not has_function_privilege('service_role', 'private.attach_payment_order(uuid, text, integer)', 'execute'), 'service_role runs attach';

  -- capacity never exceeded by confirmed + live holds
  set constraints all immediate;
  assert (select count(*) from public.registrations x where x.event_id = paid
          and (x.status = 'confirmed' or (x.status = 'pending_payment' and x.hold_expires_at > now()))) <= 2,
    'paid event over capacity';
end $$;

rollback;
select 'payments-rpc: all assertions passed' as result;
```

- [ ] **Step 3: Apply the migration**

Run MCP `apply_migration` (name `payments_rpcs`). Expected: success.

- [ ] **Step 4: Run the assertion scripts**

Run `supabase/tests/payments-rpc.sql` as ONE `execute_sql` call → `payments-rpc: all assertions passed`. Re-run `supabase/tests/registrations-rpc.sql` (Phase 3 free behaviour) — it must still pass. If its `p3-paid` assertion expects `paid_event`, it still does (the flag is off on the live DB). If one of its cancel assertions expected `paid_cancel_not_supported`, change that assertion to expect status `refund_needed` from `cancel_registration` and note it in the commit message; no other Phase 3 assertion may change.

- [ ] **Step 5: Rename, advisors, types**

`list_migrations` → `git mv supabase/migrations/20261010000002_payments_rpcs.sql supabase/migrations/V_payments_rpcs.sql` (V = recorded version). `get_advisors` `security`: no new findings. Regenerate `lib/supabase/database.types.ts` with `generate_typescript_types` (adds `attach_payment_order` to `Functions`).

- [ ] **Step 6: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add supabase/migrations supabase/tests lib/supabase/database.types.ts
git commit -m "feat(db): paid registration holds, refund-needed cancels and order attachment

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Service-role payment functions (confirm, expire holds, refunds)

**Files:**
- Create: `supabase/migrations/20261010000003_payments_service.sql` (renamed in Step 4), `supabase/tests/payments-service.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: Task 1 ledger/flags/counters/receipts; Task 2 `private.promote_waitlist(uuid)`, `public.register_for_event`, `public.attach_payment_order`; Phase 3 `private.seats_taken(uuid)`, `private.compact_waitlist(uuid)`.
- Produces (`service_role` only; `public` wrappers have identical signatures):
  - `public.confirm_payment(p_registration_id uuid, p_order_id text, p_payment_id text, p_amount_paise int, p_currency text, p_source text, p_event_id text default null, p_event_name text default null, p_details jsonb default '{}')` → `jsonb {outcome, registration_id?, status?}` where `outcome` ∈ `confirmed | late_confirmed | refund_needed | already_processed | duplicate_payment | amount_mismatch | duplicate_event | unknown_order`. `p_source` ∈ `client_verify | webhook`.
  - `public.expire_holds(p_limit int default 50)` → `jsonb {events int, expired int, promoted int}` (expired holds → `cancelled` / `hold_expired`; also promotes waitlists of events with free seats).
  - `public.claim_refund(p_registration_id uuid)` → `jsonb {registration_id, payment_id, amount_paise}`; raises `registration_not_found`, `not_refundable`, `refund_in_progress` (2-minute lease).
  - `public.mark_refunded(p_registration_id uuid, p_payment_id text, p_refund_id text, p_amount_paise int, p_source text, p_event_id text default null)` → `jsonb {outcome, registration_id?, status?, promoted?}` where `outcome` ∈ `refunded | already_refunded | ledger_refund | duplicate_event | unknown_registration | unknown_payment`. `p_source` ∈ `webhook | refund_api`.
  - **REVIEW AMENDMENT (migration `20261010154416_payments_review_fixes`):** `confirm_payment` additionally (a) returns `already_processed` for any replay of the applied payment id, even with another amount; (b) returns `amount_mismatch` (row untouched, logged) when the paid order's amount differs from what the seat costs now (live hold → `registrations.amount_paise`, otherwise `events.price_paise`): a stale old-price order never pays for a new-price seat; (c) never confirms a live hold on an event that is no longer `published` (→ `refund_needed`); (d) never revives a place the user cancelled (`cancel_reason = 'user'` → `refund_needed`, reason stays `user`); (e) stores only `details.status|method|error_code` (DB check `payment_events_details_keys`); (f) raises `invalid_source`, `invalid_payment`, `invalid_event`, `payment_conflict` (permanent errors: the webhook answers 200). `mark_refunded` adds outcome **`partial_refund`** (refund amount ≠ amount paid: logged only, seat and ledger untouched, on the Phase 5 attention list with `duplicate_payment` / `amount_mismatch`) and a full refund of a seat sets `cancel_reason = 'refunded'` (new allowed value) when none was set. `private.payment_orders` gained the state-shape check `payment_orders_state_shape`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261010000003_payments_service.sql`:

```sql
-- Phase 4 (part 3): server-side payment state transitions. security definer in `private`, executable only by
-- service_role (the Worker, after it verified the Razorpay signature and re-fetched the payment), reached through
-- security-invoker wrappers in `public`. Lock order: events row, registrations row, then the ledger.

create index registrations_hold_idx on public.registrations (hold_expires_at) where status = 'pending_payment';

-- 1. Confirm a captured payment. Idempotent across client verify, webhook deliveries and retries.
create or replace function private.confirm_payment(
  p_registration_id uuid, p_order_id text, p_payment_id text, p_amount_paise int, p_currency text,
  p_source text, p_event_id text default null, p_event_name text default null, p_details jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ord private.payment_orders%rowtype;
  ev public.events%rowtype;
  reg public.registrations%rowtype;
  v_outcome text;
  new_status public.registration_status;
  receipt text;
begin
  if p_source is null or p_source not in ('client_verify', 'webhook') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid_payment' using errcode = 'P0001';
  end if;
  select o.* into ord from private.payment_orders o
   where o.razorpay_order_id = p_order_id and o.registration_id = p_registration_id;
  if not found then
    -- Not an order we created for this registration (Fund Easy shares the Razorpay account): store nothing.
    return jsonb_build_object('outcome', 'unknown_order');
  end if;

  select e.* into ev from public.events e
   where e.id = (select r.event_id from public.registrations r where r.id = ord.registration_id)
   for update;
  select r.* into reg from public.registrations r where r.id = ord.registration_id for update;
  select o.* into ord from private.payment_orders o where o.razorpay_order_id = p_order_id for update;

  -- Checked under the locks, so two deliveries of the same webhook event serialise here.
  if p_event_id is not null and exists (select 1 from private.payment_events pe where pe.razorpay_event_id = p_event_id) then
    return jsonb_build_object('outcome', 'duplicate_event', 'registration_id', reg.id, 'status', reg.status);
  end if;

  if p_currency is distinct from 'INR' or p_amount_paise is distinct from ord.amount_paise then
    v_outcome := 'amount_mismatch';
  elsif ord.razorpay_payment_id = p_payment_id or reg.razorpay_payment_id = p_payment_id then
    v_outcome := 'already_processed';
  elsif ord.razorpay_payment_id is not null or reg.razorpay_payment_id is not null or reg.status = 'confirmed' then
    -- The seat is already paid for (or free now): keep the money on record for a manual refund (Phase 5 list).
    v_outcome := 'duplicate_payment';
  else
    -- reg.status is pending_payment (live or expired), cancelled or waitlisted.
    if reg.status = 'pending_payment' and reg.hold_expires_at > now() then
      v_outcome := 'confirmed';
    elsif ev.status = 'published' and now() < ev.starts_at and private.seats_taken(ev.id) < ev.capacity then
      v_outcome := 'late_confirmed';
    else
      v_outcome := 'refund_needed';
    end if;
    new_status := case when v_outcome = 'refund_needed' then 'refund_needed'::public.registration_status
                       else 'confirmed'::public.registration_status end;
    receipt := private.next_receipt_number();
    update public.registrations r
       set status = new_status, razorpay_order_id = p_order_id, razorpay_payment_id = p_payment_id,
           amount_paise = ord.amount_paise, paid_at = now(), receipt_number = receipt,
           hold_expires_at = null, waitlist_position = null,
           confirmed_at = case when new_status = 'confirmed' then now() else r.confirmed_at end,
           token_number = case when new_status = 'confirmed' then coalesce(r.token_number, private.next_token(ev.id))
                               else r.token_number end,
           cancelled_at = case when new_status = 'confirmed' then null else coalesce(r.cancelled_at, now()) end,
           cancel_reason = case when new_status = 'confirmed' then null else 'late_payment_no_seat' end
     where r.id = reg.id;
    if reg.status = 'waitlisted' then
      perform private.compact_waitlist(ev.id);
    end if;
    update private.payment_orders o
       set status = 'paid', razorpay_payment_id = p_payment_id, receipt_number = receipt, paid_at = now()
     where o.razorpay_order_id = p_order_id;
  end if;

  insert into private.payment_events (registration_id, source, razorpay_event_id, razorpay_event, razorpay_order_id,
                                      razorpay_payment_id, amount_paise, currency, outcome, details)
  values (reg.id, p_source, p_event_id, left(p_event_name, 60), p_order_id, p_payment_id, p_amount_paise,
          case when p_currency ~ '^[A-Z]{3}$' then p_currency end, v_outcome,
          case when jsonb_typeof(p_details) = 'object' and octet_length(p_details::text) <= 2048 then p_details
               else '{}'::jsonb end);

  return jsonb_build_object('outcome', v_outcome, 'registration_id', reg.id,
                            'status', (select r.status from public.registrations r where r.id = reg.id));
end $$;

-- 2. Release expired holds (cancelled, reason hold_expired) and promote waitlists of events with free seats.
--    At most 50 events per call so one cron tick stays short.
create or replace function private.expire_holds(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
  n_expired int := 0;
  n_promoted int := 0;
  n_events int := 0;
  k int;
begin
  for v_event in
    select x.event_id from (
      select r.event_id from public.registrations r
       where r.status = 'pending_payment' and r.hold_expires_at <= now()
      union
      select r.event_id from public.registrations r
        join public.events e on e.id = r.event_id
       where r.status = 'waitlisted' and e.status = 'published' and e.starts_at > now()
         and private.seats_taken(e.id) < e.capacity
    ) x
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  loop
    perform 1 from public.events e where e.id = v_event for update;
    update public.registrations r
       set status = 'cancelled', cancelled_at = now(), cancel_reason = 'hold_expired'
     where r.event_id = v_event and r.status = 'pending_payment' and r.hold_expires_at <= now();
    get diagnostics k = row_count;
    n_expired := n_expired + k;
    select count(*)::int into k from private.promote_waitlist(v_event);
    n_promoted := n_promoted + k;
    n_events := n_events + 1;
  end loop;
  return jsonb_build_object('events', n_events, 'expired', n_expired, 'promoted', n_promoted);
end $$;

-- 3. Refunds. claim_refund takes a 2-minute lease so two callers never both call Razorpay; mark_refunded records
--    the result (from the refund API response or the refund.processed webhook) idempotently.
create or replace function private.claim_refund(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  reg public.registrations%rowtype;
begin
  perform 1 from public.events e
   where e.id = (select r.event_id from public.registrations r where r.id = p_registration_id) for update;
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;
  if reg.status not in ('refund_needed', 'confirmed') or reg.razorpay_payment_id is null or reg.razorpay_refund_id is not null then
    raise exception 'not_refundable' using errcode = 'P0001';
  end if;
  if reg.refund_claimed_until is not null and reg.refund_claimed_until > now() then
    raise exception 'refund_in_progress' using errcode = 'P0001';
  end if;
  update public.registrations r set refund_claimed_until = now() + interval '2 minutes' where r.id = reg.id;
  return jsonb_build_object('registration_id', reg.id, 'payment_id', reg.razorpay_payment_id, 'amount_paise', reg.amount_paise);
end $$;

create or replace function private.mark_refunded(
  p_registration_id uuid, p_payment_id text, p_refund_id text, p_amount_paise int, p_source text,
  p_event_id text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  reg public.registrations%rowtype;
  v_outcome text;
  promoted int := 0;
begin
  if p_source is null or p_source not in ('webhook', 'refund_api') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]{6,40}$'
     or p_refund_id is null or p_refund_id !~ '^rfnd_[A-Za-z0-9]{6,40}$' then
    raise exception 'invalid_refund' using errcode = 'P0001';
  end if;
  perform 1 from public.events e
   where e.id = (select r.event_id from public.registrations r where r.id = p_registration_id) for update;
  select r.* into reg from public.registrations r where r.id = p_registration_id for update;
  if not found then
    return jsonb_build_object('outcome', 'unknown_registration');
  end if;
  if p_event_id is not null and exists (select 1 from private.payment_events pe where pe.razorpay_event_id = p_event_id) then
    return jsonb_build_object('outcome', 'duplicate_event', 'registration_id', reg.id, 'status', reg.status);
  end if;

  if reg.razorpay_payment_id = p_payment_id then
    if reg.status = 'refunded' then
      v_outcome := 'already_refunded';
    else
      update public.registrations r
         set status = 'refunded', razorpay_refund_id = p_refund_id, refunded_at = now(), refund_claimed_until = null,
             cancelled_at = coalesce(r.cancelled_at, now()), waitlist_position = null
       where r.id = reg.id;
      v_outcome := 'refunded';
      if reg.status = 'confirmed' then
        select count(*)::int into promoted from private.promote_waitlist(reg.event_id);
      end if;
    end if;
  elsif exists (select 1 from private.payment_orders o where o.registration_id = reg.id and o.razorpay_payment_id = p_payment_id)
        or exists (select 1 from private.payment_events pe where pe.registration_id = reg.id and pe.razorpay_payment_id = p_payment_id) then
    -- A refund of an older or duplicate payment of this registration: ledger only, the seat is untouched.
    v_outcome := 'ledger_refund';
  else
    return jsonb_build_object('outcome', 'unknown_payment', 'registration_id', reg.id);
  end if;

  update private.payment_orders o
     set status = 'refunded', razorpay_refund_id = coalesce(o.razorpay_refund_id, p_refund_id),
         refunded_at = coalesce(o.refunded_at, now())
   where o.razorpay_payment_id = p_payment_id;
  insert into private.payment_events (registration_id, source, razorpay_event_id, razorpay_event, razorpay_payment_id,
                                      razorpay_refund_id, amount_paise, currency, outcome)
  values (reg.id, p_source, p_event_id, case when p_source = 'webhook' then 'refund.processed' end, p_payment_id,
          p_refund_id, p_amount_paise, 'INR', v_outcome);

  return jsonb_build_object('outcome', v_outcome, 'registration_id', reg.id, 'promoted', promoted,
                            'status', (select r.status from public.registrations r where r.id = reg.id));
end $$;

-- 4. Grants: service_role only, through security-invoker wrappers in public.
revoke execute on function
  private.confirm_payment(uuid, text, text, int, text, text, text, text, jsonb),
  private.expire_holds(int),
  private.claim_refund(uuid),
  private.mark_refunded(uuid, text, text, int, text, text)
from public, anon, authenticated;
grant execute on function
  private.confirm_payment(uuid, text, text, int, text, text, text, text, jsonb),
  private.expire_holds(int),
  private.claim_refund(uuid),
  private.mark_refunded(uuid, text, text, int, text, text)
to service_role;

create function public.confirm_payment(
  p_registration_id uuid, p_order_id text, p_payment_id text, p_amount_paise int, p_currency text,
  p_source text, p_event_id text default null, p_event_name text default null, p_details jsonb default '{}'::jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.confirm_payment(p_registration_id, p_order_id, p_payment_id, p_amount_paise, p_currency,
                                 p_source, p_event_id, p_event_name, p_details);
$$;
create function public.expire_holds(p_limit int default 50) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.expire_holds(p_limit);
$$;
create function public.claim_refund(p_registration_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.claim_refund(p_registration_id);
$$;
create function public.mark_refunded(
  p_registration_id uuid, p_payment_id text, p_refund_id text, p_amount_paise int, p_source text,
  p_event_id text default null)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.mark_refunded(p_registration_id, p_payment_id, p_refund_id, p_amount_paise, p_source, p_event_id);
$$;

revoke execute on function
  public.confirm_payment(uuid, text, text, int, text, text, text, text, jsonb),
  public.expire_holds(int),
  public.claim_refund(uuid),
  public.mark_refunded(uuid, text, text, int, text, text)
from public, anon, authenticated;
grant execute on function
  public.confirm_payment(uuid, text, text, int, text, text, text, text, jsonb),
  public.expire_holds(int),
  public.claim_refund(uuid),
  public.mark_refunded(uuid, text, text, int, text, text)
to service_role;
```

- [ ] **Step 2: Write the assertion script**

Create `supabase/tests/payments-service.sql`:

```sql
-- Phase 4 Task 3: confirm / expire / refund. Run as ONE execute_sql call; rolls back.
begin;

update private.feature_flags set enabled = true where key = 'payments';

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004c1', 'p4-c1@test.local', 'authenticated', 'authenticated', '{"full_name":"Cee One"}'),
  ('00000000-0000-0000-0000-0000000004c2', 'p4-c2@test.local', 'authenticated', 'authenticated', '{"full_name":"Cee Two"}'),
  ('00000000-0000-0000-0000-0000000004c3', 'p4-c3@test.local', 'authenticated', 'authenticated', '{"full_name":"Cee Three"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id::text like '00000000-0000-0000-0000-0000000004c%';

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix, price_paise)
select s.id, v.step, v.slug, v.slug, now() + interval '10 days', now() + interval '10 days 6 hours', 'published',
       v.capacity, 'RAS-' || v.step, 19900
from public.societies s,
  (values (84, 'p4-svc-a', 1), (85, 'p4-svc-b', 1), (86, 'p4-svc-c', 2)) as v(step, slug, capacity)
where s.slug = 'ras';

do $$
declare
  ea uuid;
  eb uuid;
  ec uuid;
  c1 constant uuid := '00000000-0000-0000-0000-0000000004c1';
  c2 constant uuid := '00000000-0000-0000-0000-0000000004c2';
  c3 constant uuid := '00000000-0000-0000-0000-0000000004c3';
  ra1 uuid;
  ra2 uuid;
  rb2 uuid;
  rc3 uuid;
  r jsonb;
  reg public.registrations%rowtype;
begin
  select id into ea from public.events where slug = 'p4-svc-a';
  select id into eb from public.events where slug = 'p4-svc-b';
  select id into ec from public.events where slug = 'p4-svc-c';

  -- c1 holds the only seat of A and attaches order O1; c2 joins A's waitlist; c2 holds B (order O2); c3 holds C (O3)
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ra1 := (public.register_for_event(ea, '{}')->>'registration_id')::uuid;
  perform public.attach_payment_order(ra1, 'order_P4SVCA00001', 19900);
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  ra2 := (public.register_for_event(ea, '{}')->>'registration_id')::uuid;
  rb2 := (public.register_for_event(eb, '{}')->>'registration_id')::uuid;
  perform public.attach_payment_order(rb2, 'order_P4SVCB00002', 19900);
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  rc3 := (public.register_for_event(ec, '{}')->>'registration_id')::uuid;
  perform public.attach_payment_order(rc3, 'order_P4SVCC00003', 19900);
  reset role;
  assert (select status from public.registrations where id = ra2) = 'waitlisted', 'c2 should wait on A';

  -- users cannot confirm, expire or refund; service_role can (through the public wrappers)
  assert not has_function_privilege('authenticated', 'public.confirm_payment(uuid, text, text, integer, text, text, text, text, jsonb)', 'execute'),
    'users can confirm payments';
  assert not has_function_privilege('anon', 'public.confirm_payment(uuid, text, text, integer, text, text, text, text, jsonb)', 'execute'),
    'anon can confirm payments';
  assert not has_function_privilege('authenticated', 'public.expire_holds(integer)', 'execute'), 'users can expire holds';
  assert not has_function_privilege('authenticated', 'public.claim_refund(uuid)', 'execute'), 'users can claim refunds';
  assert not has_function_privilege('authenticated', 'public.mark_refunded(uuid, text, text, integer, text, text)', 'execute'),
    'users can mark refunds';
  assert has_function_privilege('service_role', 'public.confirm_payment(uuid, text, text, integer, text, text, text, text, jsonb)', 'execute'),
    'service_role cannot confirm';

  set local role service_role;

  -- confirm inside a live hold: seat, token, receipt
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA00001', 19900, 'INR', 'client_verify');
  assert r->>'outcome' = 'confirmed' and r->>'status' = 'confirmed', 'confirm: ' || r::text;
  -- idempotent: client retry, then the webhook, then a webhook redelivery
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA00001', 19900, 'INR', 'client_verify');
  assert r->>'outcome' = 'already_processed', 'client retry: ' || r::text;
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA00001', 19900, 'INR', 'webhook', 'evt_P4SVC0000001', 'order.paid');
  assert r->>'outcome' = 'already_processed', 'webhook after verify: ' || r::text;
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA00001', 19900, 'INR', 'webhook', 'evt_P4SVC0000001', 'order.paid');
  assert r->>'outcome' = 'duplicate_event', 'webhook redelivery: ' || r::text;
  -- a second, different payment for the same paid seat is kept on record, not applied
  r := public.confirm_payment(ra1, 'order_P4SVCA00001', 'pay_P4SVCA0DUP1', 19900, 'INR', 'webhook', 'evt_P4SVC0000002', 'order.paid');
  assert r->>'outcome' = 'duplicate_payment', 'duplicate payment: ' || r::text;
  -- foreign / unknown order ids store nothing
  r := public.confirm_payment(ra1, 'order_FUNDEASY0001', 'pay_FUNDEASY0001', 19900, 'INR', 'webhook', 'evt_FE000000001', 'order.paid');
  assert r->>'outcome' = 'unknown_order', 'foreign order: ' || r::text;
  -- wrong amount or currency never confirms
  r := public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', 100, 'INR', 'client_verify');
  assert r->>'outcome' = 'amount_mismatch' and r->>'status' = 'pending_payment', 'amount mismatch: ' || r::text;
  r := public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', 19900, 'USD', 'client_verify');
  assert r->>'outcome' = 'amount_mismatch', 'currency mismatch: ' || r::text;
  reset role;

  select * into reg from public.registrations where id = ra1;
  assert reg.status = 'confirmed' and reg.token_number is not null and reg.receipt_number ~ '^STW-' and reg.paid_at is not null
     and reg.razorpay_payment_id = 'pay_P4SVCA00001', 'confirmed row incomplete';
  assert (select count(*) from private.payment_events where registration_id = ra1) = 4,
    'expected 4 logged events for A (confirmed, 2x already_processed, duplicate_payment)';
  assert not exists (select 1 from private.payment_events where razorpay_order_id = 'order_FUNDEASY0001'), 'foreign order logged';

  -- holds expire: B (c2) and C (c3)
  update public.registrations set hold_expires_at = now() - interval '1 second' where id in (rb2, rc3);
  set local role service_role;
  r := public.expire_holds(50);
  reset role;
  assert (r->>'expired')::int >= 2, 'expire_holds: ' || r::text;
  assert (select status from public.registrations where id = rb2) = 'cancelled'
     and (select cancel_reason from public.registrations where id = rb2) = 'hold_expired', 'B hold not expired';

  -- late payment WITH a free seat (C has capacity 2): honoured
  set local role service_role;
  r := public.confirm_payment(rc3, 'order_P4SVCC00003', 'pay_P4SVCC00003', 19900, 'INR', 'webhook', 'evt_P4SVC0000003', 'order.paid');
  assert r->>'outcome' = 'late_confirmed' and r->>'status' = 'confirmed', 'late with seat: ' || r::text;
  reset role;

  -- late payment WITHOUT a seat: c3 takes B's only seat first, then c2's old order is paid -> refund_needed
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.register_for_event(eb, '{}');
  reset role;
  set local role service_role;
  r := public.confirm_payment(rb2, 'order_P4SVCB00002', 'pay_P4SVCB00002', 19900, 'INR', 'webhook', 'evt_P4SVC0000004', 'order.paid');
  assert r->>'outcome' = 'refund_needed' and r->>'status' = 'refund_needed', 'late without seat: ' || r::text;
  reset role;
  select * into reg from public.registrations where id = rb2;
  assert reg.receipt_number is not null and reg.cancel_reason = 'late_payment_no_seat' and reg.token_number is null,
    'refund_needed row incomplete';

  -- refunds: lease, idempotent marking, seat released to the waitlist (c2 on A)
  set local role service_role;
  r := public.claim_refund(ra1);
  assert r->>'payment_id' = 'pay_P4SVCA00001' and (r->>'amount_paise')::int = 19900, 'claim: ' || r::text;
  begin
    perform public.claim_refund(ra1);
    assert false, 'second claim inside the lease accepted';
  exception when others then if sqlerrm <> 'refund_in_progress' then raise; end if; end;
  r := public.mark_refunded(ra1, 'pay_P4SVCA00001', 'rfnd_P4SVCA00001', 19900, 'refund_api');
  assert r->>'outcome' = 'refunded' and (r->>'promoted')::int = 1, 'mark refunded: ' || r::text;
  r := public.mark_refunded(ra1, 'pay_P4SVCA00001', 'rfnd_P4SVCA00001', 19900, 'webhook', 'evt_P4SVC0000005');
  assert r->>'outcome' = 'already_refunded', 'webhook after refund api: ' || r::text;
  r := public.mark_refunded(ra1, 'pay_P4SVCA00001', 'rfnd_P4SVCA00001', 19900, 'webhook', 'evt_P4SVC0000005');
  assert r->>'outcome' = 'duplicate_event', 'refund webhook redelivery: ' || r::text;
  r := public.mark_refunded(ra1, 'pay_P4SVCA0DUP1', 'rfnd_P4SVCA0DUP1', 19900, 'refund_api');
  assert r->>'outcome' = 'ledger_refund', 'duplicate payment refund: ' || r::text;
  r := public.mark_refunded(ra1, 'pay_UNRELATED001', 'rfnd_UNRELATED001', 19900, 'webhook', 'evt_P4SVC0000006');
  assert r->>'outcome' = 'unknown_payment', 'unrelated refund: ' || r::text;
  begin
    perform public.claim_refund(ra1);
    assert false, 'refunded row claimable';
  exception when others then if sqlerrm <> 'not_refundable' then raise; end if; end;
  reset role;
  assert (select status from public.registrations where id = ra1) = 'refunded', 'A not refunded';
  assert (select status from public.registrations where id = ra2) = 'pending_payment', 'waitlisted c2 not given the freed seat';
  assert (select status from private.payment_orders where razorpay_order_id = 'order_P4SVCA00001') = 'refunded', 'ledger not refunded';

  -- capacity under pending holds: never more confirmed + live holds than capacity
  assert not exists (select 1 from public.events e where e.slug like 'p4-svc-%'
                     and (select count(*) from public.registrations x where x.event_id = e.id
                          and (x.status = 'confirmed' or (x.status = 'pending_payment' and x.hold_expires_at > now()))) > e.capacity),
    'an event is over capacity';
end $$;

rollback;
select 'payments-service: all assertions passed' as result;
```

- [ ] **Step 3: Apply the migration and run the scripts**

MCP `apply_migration` (name `payments_service`). Run `supabase/tests/payments-service.sql` (ONE `execute_sql` call) → `payments-service: all assertions passed`. Re-run `payments-rpc.sql` and `payments-schema.sql` → both still pass.

- [ ] **Step 4: Rename, advisors, types**

`list_migrations` → `git mv supabase/migrations/20261010000003_payments_service.sql supabase/migrations/V_payments_service.sql`. `get_advisors` `security`: no new findings (the wrappers are security invoker; nothing is executable by `anon`/`authenticated`). Regenerate `lib/supabase/database.types.ts`.

- [ ] **Step 5: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add supabase/migrations supabase/tests lib/supabase/database.types.ts
git commit -m "feat(db): idempotent payment confirmation, hold expiry and refund bookkeeping

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Fund Easy sync outbox (table, trigger, claim/complete)

**Files:**
- Create: `supabase/migrations/20261010000004_sync_outbox.sql` (renamed in Step 4), `supabase/tests/sync-outbox.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)

**Interfaces:**
- Consumes: Tasks 1-3 (registration columns, `register_for_event`, `cancel_registration`, `attach_payment_order`, `confirm_payment`, `mark_refunded`).
- **REVIEW AMENDMENT:** `attach_payment_order` is server-only now (Task 2 amendment): in the assertion script call `public.attach_payment_order(<user id>, <registration id>, <order id>, <amount>)` under `set local role service_role`, not as `authenticated`. `cancel_reason` may also be `refunded` (full refund of a seat); the payload passes it through.
- Produces:
  - `private.external_sync_outbox(id uuid, seq bigint identity, registration_id uuid (no FK), event_type in ('registration.confirmed','registration.cancelled','payment.refunded'), idempotency_key text unique, payload jsonb ≤ 8 KiB, status in ('pending','failed','sent','dead'), attempts int, next_attempt_at, locked_until, last_error ≤ 500 chars, created_at, sent_at)`
  - trigger `registrations_enqueue_sync` (after insert / update of status / delete) → one row per transition: → `confirmed` ⇒ `registration.confirmed`; `confirmed` → `cancelled|refund_needed` ⇒ `registration.cancelled`; → `refunded` ⇒ `payment.refunded`; delete of a `confirmed` row ⇒ `registration.cancelled` (`cancel_reason: "account_deleted"`).
  - Payload `data` shape (Task 10 wraps it in the v1 envelope): `{ registration: {id, status, ticket_code?, token?, amount_paise, currency:"INR", receipt_number?, razorpay_order_id?, razorpay_payment_id?, razorpay_refund_id?, confirmed_at?, paid_at?, cancelled_at?, refunded_at?, cancel_reason?}, event: {id, slug, title, starts_at, ends_at, venue, capacity, price_paise}, attendee?: {email, full_name} }` — nulls stripped; `ticket_code`, `token`, `attendee` only on `registration.confirmed`.
  - `public.claim_sync_batch(p_limit int default 10)` → `jsonb` array of `{id, event_type, idempotency_key, payload, attempts, created_at}` (≤ 25; oldest first; head-of-line per registration; 2-minute lease; purges payloads of rows sent > 30 days ago)
  - `public.complete_sync(p_id uuid, p_ok boolean, p_permanent boolean default false, p_error text default null)` → `text` new status (`sent | failed | dead`); backoff 1 min × 2^(attempts−1), cap 6 h; `dead` when permanent or attempts ≥ 10.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261010000004_sync_outbox.sql`:

```sql
-- Phase 4 (part 4): one-way outbound sync of registrations to Fund Easy. A trigger snapshots each transition into
-- a private outbox; the Worker's cron drains it (service_role only). Registration and payment never wait for it.

create table private.external_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  registration_id uuid not null,  -- no FK: a deleted free registration still owes Fund Easy a cancellation
  event_type text not null
    check (event_type in ('registration.confirmed', 'registration.cancelled', 'payment.refunded')),
  idempotency_key text not null unique check (char_length(idempotency_key) <= 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8192),
  status text not null default 'pending' check (status in ('pending', 'failed', 'sent', 'dead')),
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index external_sync_outbox_due_idx on private.external_sync_outbox (next_attempt_at)
  where status in ('pending', 'failed');
create index external_sync_outbox_registration_idx on private.external_sync_outbox (registration_id, seq);
revoke all on private.external_sync_outbox from public, anon, authenticated, service_role;

-- Snapshot of one transition. Minimal personal data: email + full name only when a seat is confirmed (Fund Easy
-- needs them to find or create the attendee's account); never phone, answers or IEEE id.
create or replace function private.enqueue_registration_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations%rowtype;
  kind text;
  ev public.events%rowtype;
  v_email text;
  v_name text;
  v_token text;
  v_payload jsonb;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'confirmed' then
      return null;
    end if;
    r := old;
    kind := 'registration.cancelled';
  else
    r := new;
    if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
      kind := 'registration.confirmed';
    elsif tg_op = 'UPDATE' and old.status = 'confirmed' and new.status in ('cancelled', 'refund_needed') then
      kind := 'registration.cancelled';
    elsif tg_op = 'UPDATE' and new.status = 'refunded' and old.status is distinct from 'refunded' then
      kind := 'payment.refunded';
    else
      return null;
    end if;
  end if;

  select e.* into ev from public.events e where e.id = r.event_id;
  v_token := case when r.token_number is null then null
                  when ev.token_prefix = '' then lpad(r.token_number::text, greatest(4, length(r.token_number::text)), '0')
                  else ev.token_prefix || '-' || lpad(r.token_number::text, greatest(4, length(r.token_number::text)), '0') end;
  if kind = 'registration.confirmed' then
    select u.email into v_email from auth.users u where u.id = r.user_id;
    select p.full_name into v_name from public.profiles p where p.id = r.user_id;
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'registration', jsonb_build_object(
      'id', r.id,
      'status', case when tg_op = 'DELETE' then 'cancelled' else r.status::text end,
      'ticket_code', case when kind = 'registration.confirmed' then r.ticket_code end,
      'token', case when kind = 'registration.confirmed' then v_token end,
      'amount_paise', r.amount_paise,
      'currency', 'INR',
      'receipt_number', r.receipt_number,
      'razorpay_order_id', r.razorpay_order_id,
      'razorpay_payment_id', r.razorpay_payment_id,
      'razorpay_refund_id', r.razorpay_refund_id,
      'confirmed_at', r.confirmed_at,
      'paid_at', r.paid_at,
      'cancelled_at', case when tg_op = 'DELETE' then now() else r.cancelled_at end,
      'refunded_at', r.refunded_at,
      'cancel_reason', case when tg_op = 'DELETE' then 'account_deleted' else r.cancel_reason end),
    'event', jsonb_build_object(
      'id', ev.id, 'slug', ev.slug, 'title', left(ev.title, 200), 'starts_at', ev.starts_at, 'ends_at', ev.ends_at,
      'venue', left(ev.venue, 200), 'capacity', ev.capacity, 'price_paise', ev.price_paise),
    'attendee', case when kind = 'registration.confirmed'
                     then jsonb_build_object('email', v_email, 'full_name', left(v_name, 200)) end));

  insert into private.external_sync_outbox (registration_id, event_type, idempotency_key, payload)
  values (r.id, kind,
          r.id::text || ':' || kind || ':' || ((extract(epoch from clock_timestamp()) * 1000000)::bigint)::text,
          v_payload)
  on conflict (idempotency_key) do nothing;
  return null;
end $$;
revoke execute on function private.enqueue_registration_sync() from public, anon, authenticated, service_role;

create trigger registrations_enqueue_sync
  after insert or update of status or delete on public.registrations
  for each row execute function private.enqueue_registration_sync();

-- Claim up to 25 due rows (oldest first). A row waits while an earlier row of the same registration is still
-- pending/failed, so Fund Easy sees confirm -> cancel -> refund in order. Claimed rows get a 2-minute lease.
create or replace function private.claim_sync_batch(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  batch jsonb;
begin
  -- Retention: payloads of rows sent more than 30 days ago (they carry an email) are emptied.
  update private.external_sync_outbox o set payload = '{}'::jsonb
   where o.status = 'sent' and o.sent_at < now() - interval '30 days' and o.payload <> '{}'::jsonb;

  with picked as (
    select o.id from private.external_sync_outbox o
     where o.status in ('pending', 'failed') and o.next_attempt_at <= now()
       and (o.locked_until is null or o.locked_until < now())
       and not exists (select 1 from private.external_sync_outbox p
                        where p.registration_id = o.registration_id and p.seq < o.seq
                          and p.status in ('pending', 'failed'))
     order by o.seq
     limit least(greatest(coalesce(p_limit, 10), 1), 25)
     for update skip locked
  ), claimed as (
    update private.external_sync_outbox o
       set locked_until = now() + interval '2 minutes', attempts = o.attempts + 1
      from picked
     where o.id = picked.id
    returning o.id, o.seq, o.event_type, o.idempotency_key, o.payload, o.attempts, o.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'event_type', c.event_type, 'idempotency_key', c.idempotency_key,
           'payload', c.payload, 'attempts', c.attempts, 'created_at', c.created_at) order by c.seq), '[]'::jsonb)
    into batch
    from claimed c;
  return batch;
end $$;

create or replace function private.complete_sync(p_id uuid, p_ok boolean, p_permanent boolean default false,
                                                 p_error text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  update private.external_sync_outbox o
     set status = case when p_ok then 'sent'
                       when coalesce(p_permanent, false) or o.attempts >= 10 then 'dead'
                       else 'failed' end,
         sent_at = case when p_ok then now() else o.sent_at end,
         locked_until = null,
         last_error = case when p_ok then null else left(coalesce(nullif(p_error, ''), 'error'), 500) end,
         next_attempt_at = case when p_ok then o.next_attempt_at
                                else now() + least(interval '1 minute' * power(2, greatest(o.attempts - 1, 0)),
                                                   interval '6 hours') end
   where o.id = p_id and o.status in ('pending', 'failed')
  returning o.status into v_status;
  if not found then
    raise exception 'outbox_row_not_found' using errcode = 'P0001';
  end if;
  return v_status;
end $$;

revoke execute on function private.claim_sync_batch(int), private.complete_sync(uuid, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function private.claim_sync_batch(int), private.complete_sync(uuid, boolean, boolean, text)
  to service_role;

create function public.claim_sync_batch(p_limit int default 10) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select private.claim_sync_batch(p_limit);
$$;
create function public.complete_sync(p_id uuid, p_ok boolean, p_permanent boolean default false, p_error text default null)
returns text language sql volatile security invoker set search_path = '' as $$
  select private.complete_sync(p_id, p_ok, p_permanent, p_error);
$$;
revoke execute on function public.claim_sync_batch(int), public.complete_sync(uuid, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.claim_sync_batch(int), public.complete_sync(uuid, boolean, boolean, text)
  to service_role;
```

- [ ] **Step 2: Write the assertion script**

Create `supabase/tests/sync-outbox.sql`:

```sql
-- Phase 4 Task 4: Fund Easy outbox. Run as ONE execute_sql call; rolls back.
begin;

update private.feature_flags set enabled = true where key = 'payments';
-- Isolate this script's rows from anything already queued on the live database.
update private.external_sync_outbox set locked_until = now() + interval '1 hour' where status in ('pending', 'failed');

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004d1', 'p4-d1@test.local', 'authenticated', 'authenticated', '{"full_name":"Dee One"}'),
  ('00000000-0000-0000-0000-0000000004d2', 'p4-d2@test.local', 'authenticated', 'authenticated', '{"full_name":"Dee Two"}');
update public.profiles set college = 'CEK', branch = 'Civil', year = '1st year', onboarded = true
  where id::text like '00000000-0000-0000-0000-0000000004d%';

insert into public.events (society_id, step_number, slug, title, starts_at, ends_at, status, capacity, token_prefix, price_paise)
select s.id, v.step, v.slug, v.slug, now() + interval '10 days', now() + interval '10 days 6 hours', 'published', 5,
       'RAS-' || v.step, v.price
from public.societies s, (values (87, 'p4-sync-free', 0), (88, 'p4-sync-paid', 19900)) as v(step, slug, price)
where s.slug = 'ras';

do $$
declare
  ef uuid;
  ep uuid;
  d1 constant uuid := '00000000-0000-0000-0000-0000000004d1';
  d2 constant uuid := '00000000-0000-0000-0000-0000000004d2';
  rf uuid;
  rp uuid;
  o record;
  b jsonb;
  s text;
  first_d1 uuid;
  first_d2 uuid;
begin
  select id into ef from public.events where slug = 'p4-sync-free';
  select id into ep from public.events where slug = 'p4-sync-paid';

  -- free: confirm -> cancel -> confirm again
  perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rf := (public.register_for_event(ef, '{}')->>'registration_id')::uuid;
  perform public.cancel_registration(rf);
  perform public.register_for_event(ef, '{}');
  reset role;
  assert (select array_agg(event_type order by seq) from private.external_sync_outbox where registration_id = rf)
       = array['registration.confirmed', 'registration.cancelled', 'registration.confirmed'], 'free transitions not queued in order';
  select * into o from private.external_sync_outbox where registration_id = rf order by seq limit 1;
  assert o.payload #>> '{attendee,email}' = 'p4-d1@test.local' and o.payload #>> '{attendee,full_name}' = 'Dee One',
    'confirmed payload lacks the attendee';
  assert o.payload #>> '{registration,ticket_code}' ~ '^[A-Z2-7]{26}$' and o.payload #>> '{registration,token}' ~ '^RAS-87-[0-9]{4}$',
    'confirmed payload lacks ticket code/token: ' || o.payload::text;
  assert o.payload #>> '{event,slug}' = 'p4-sync-free' and (o.payload #>> '{registration,amount_paise}')::int = 0, 'event block wrong';
  assert not (o.payload ? 'phone') and not (o.payload->'registration' ? 'answers'), 'payload carries extra personal data';
  select * into o from private.external_sync_outbox where registration_id = rf order by seq offset 1 limit 1;
  assert not (o.payload ? 'attendee') and not (o.payload->'registration' ? 'ticket_code'), 'cancel payload carries personal data';
  assert o.payload #>> '{registration,cancel_reason}' = 'user', 'cancel reason missing';

  -- paid: hold (nothing queued) -> confirm -> cancel (refund_needed) -> refunded
  perform set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  rp := (public.register_for_event(ep, '{}')->>'registration_id')::uuid;
  perform public.attach_payment_order(rp, 'order_P4SYNC00001', 19900);
  reset role;
  assert not exists (select 1 from private.external_sync_outbox where registration_id = rp), 'a hold was queued';
  set local role service_role;
  perform public.confirm_payment(rp, 'order_P4SYNC00001', 'pay_P4SYNC00001', 19900, 'INR', 'client_verify');
  reset role;
  set local role authenticated;
  perform public.cancel_registration(rp);
  reset role;
  set local role service_role;
  perform public.mark_refunded(rp, 'pay_P4SYNC00001', 'rfnd_P4SYNC00001', 19900, 'refund_api');
  reset role;
  assert (select array_agg(event_type order by seq) from private.external_sync_outbox where registration_id = rp)
       = array['registration.confirmed', 'registration.cancelled', 'payment.refunded'], 'paid transitions not queued in order';
  select * into o from private.external_sync_outbox where registration_id = rp order by seq limit 1;
  assert o.payload #>> '{registration,receipt_number}' ~ '^STW-' and o.payload #>> '{registration,razorpay_payment_id}' = 'pay_P4SYNC00001'
     and (o.payload #>> '{registration,amount_paise}')::int = 19900, 'paid confirm payload incomplete: ' || o.payload::text;
  select * into o from private.external_sync_outbox where registration_id = rp order by seq desc limit 1;
  assert o.payload #>> '{registration,razorpay_refund_id}' = 'rfnd_P4SYNC00001', 'refund payload incomplete';

  -- deleting a confirmed free row (account deletion cascade) queues a cancellation
  delete from public.registrations where id = rf;
  select * into o from private.external_sync_outbox where registration_id = rf order by seq desc limit 1;
  assert o.event_type = 'registration.cancelled' and o.payload #>> '{registration,cancel_reason}' = 'account_deleted',
    'delete not queued';

  -- claim: oldest first, one row per registration (head-of-line), leased
  set local role service_role;
  b := public.claim_sync_batch(10);
  reset role;
  assert jsonb_array_length(b) = 2, 'expected the head row of each registration: ' || b::text;
  first_d1 := (select (x->>'id')::uuid from jsonb_array_elements(b) x where x->>'idempotency_key' like rf::text || ':%');
  first_d2 := (select (x->>'id')::uuid from jsonb_array_elements(b) x where x->>'idempotency_key' like rp::text || ':%');
  assert (b->0->>'attempts')::int = 1 and b->0->>'event_type' = 'registration.confirmed', 'claim shape: ' || b::text;
  set local role service_role;
  assert jsonb_array_length(public.claim_sync_batch(10)) = 0, 'leased or blocked rows claimed again';

  -- success, transient failure (backoff), permanent failure (dead)
  s := public.complete_sync(first_d1, true);
  assert s = 'sent', 'sent: ' || s;
  s := public.complete_sync(first_d2, false, false, repeat('x', 900));
  assert s = 'failed', 'failed: ' || s;
  reset role;
  select * into o from private.external_sync_outbox where id = first_d2;
  assert o.next_attempt_at between now() + interval '59 seconds' and now() + interval '61 seconds', 'first retry not in 1 minute';
  assert char_length(o.last_error) = 500 and o.locked_until is null, 'error not truncated / lease kept';
  set local role service_role;
  b := public.claim_sync_batch(10);
  assert jsonb_array_length(b) = 1 and b->0->>'idempotency_key' like rf::text || ':registration.cancelled:%',
    'd1 second row should be next, d2 waits for its retry: ' || b::text;
  s := public.complete_sync((b->0->>'id')::uuid, false, true, 'HTTP 422 conflict');
  assert s = 'dead', 'permanent failure not dead: ' || s;
  reset role;
  update private.external_sync_outbox set attempts = 10, next_attempt_at = now() where id = first_d2;
  set local role service_role;
  b := public.claim_sync_batch(10);
  assert exists (select 1 from jsonb_array_elements(b) x where (x->>'id')::uuid = first_d2), 'retry not claimed';
  s := public.complete_sync(first_d2, false, false, 'HTTP 503');
  assert s = 'dead', 'not dead after 10+ attempts: ' || s;
  begin
    perform public.complete_sync(first_d1, true);
    assert false, 'completed a sent row twice';
  exception when others then if sqlerrm <> 'outbox_row_not_found' then raise; end if; end;
  reset role;

  -- no client access
  assert not has_table_privilege('authenticated', 'private.external_sync_outbox', 'select'), 'users read the outbox';
  assert not has_table_privilege('service_role', 'private.external_sync_outbox', 'select'), 'service_role reads the outbox directly';
  assert not has_function_privilege('authenticated', 'public.claim_sync_batch(integer)', 'execute'), 'users claim the outbox';
  assert not has_function_privilege('anon', 'public.complete_sync(uuid, boolean, boolean, text)', 'execute'), 'anon completes rows';
  assert has_function_privilege('service_role', 'public.claim_sync_batch(integer)', 'execute'), 'service_role cannot claim';
  assert not exists (select 1 from private.external_sync_outbox where octet_length(payload::text) > 8192), 'oversized payload';
end $$;

rollback;
select 'sync-outbox: all assertions passed' as result;
```

- [ ] **Step 3: Apply the migration and run the scripts**

MCP `apply_migration` (name `sync_outbox`). Run `supabase/tests/sync-outbox.sql` → `sync-outbox: all assertions passed`. Re-run `payments-schema.sql`, `payments-rpc.sql`, `payments-service.sql`, `registrations-rpc.sql` → all pass (the trigger only adds outbox rows, which roll back).

- [ ] **Step 4: Rename, advisors, types**

`list_migrations` → `git mv supabase/migrations/20261010000004_sync_outbox.sql supabase/migrations/V_sync_outbox.sql`. `get_advisors` `security`: no new findings. Regenerate `lib/supabase/database.types.ts`.

- [ ] **Step 5: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add supabase/migrations supabase/tests lib/supabase/database.types.ts
git commit -m "feat(db): outbound sync outbox for Fund Easy

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Payment config, crypto, Razorpay REST client, admin client

**Files:**
- Create: `lib/payments/config.ts`, `lib/payments/crypto.ts`, `lib/payments/razorpay.ts`, `lib/payments/money.ts`, `lib/supabase/admin.ts`
- Create: `tests/payments/config.test.ts`, `tests/payments/crypto.test.ts`, `tests/payments/razorpay.test.ts`, `tests/payments/money.test.ts`
- Modify: `.env.example` (document the new variables, no values), `.gitignore` (ensure `.dev.vars` is ignored)

**Interfaces:**
- Consumes: `publicEnv` (`lib/env.ts`), `Database` (`lib/supabase/database.types.ts`).
- Produces:
  - `config.ts` (server-only): `type PaymentsConfig = { enabled: false } | { enabled: true; keyId: string; keySecret: string; webhookSecret: string; serviceRoleKey: string }`; `type SyncConfig = { enabled: false } | { enabled: true; url: string; secret: string; serviceRoleKey: string }`; `readPaymentsConfig(env: Env): PaymentsConfig`; `readSyncConfig(env: Env): SyncConfig`; `readCronSecret(env: Env): string | null`; `paymentsConfig()`, `syncConfig()`, `cronSecret()` (read `process.env`); `type Env = Record<string, string | undefined>`.
  - `crypto.ts` (isomorphic, no imports): `hmacSha256Hex(secret: string, message: string): Promise<string>`; `timingSafeEqualHex(a: string, b: string): boolean`; `verifyCheckoutSignature(secret, orderId, paymentId, signature): Promise<boolean>`; `verifyWebhookSignature(secret, rawBody, signature): Promise<boolean>`.
  - `razorpay.ts`: `RAZORPAY_API`, `ORDER_ID`, `PAYMENT_ID`, `REFUND_ID` regexes; `interface RazorpayCredentials { keyId: string; keySecret: string }`; `type FetchLike = (url: string, init: RequestInit) => Promise<Response>`; `class RazorpayError extends Error { status: number; code: string }`; `type RazorpayOrder = { id; amount; currency; status; notes: Record<string,string> }`, `RazorpayPayment = { id; order_id: string | null; amount; currency; status; method?: string | null; notes }`, `RazorpayRefund = { id; payment_id; amount; status; notes }`; `createOrder(creds, f, { amountPaise, receipt, notes })`, `fetchOrder(creds, f, id)`, `fetchPayment(creds, f, id)`, `refundPayment(creds, f, paymentId, { amountPaise, notes })` — all `Promise<…>`, throwing `RazorpayError`.
  - `money.ts`: `formatInr(paise: number): string` → `"₹199"`, `"₹1,999.50"`.
  - `admin.ts` (server-only): `type AdminClient = SupabaseClient<Database>`; `createAdminClient(serviceRoleKey: string): AdminClient`.

- [ ] **Step 1: Write the failing tests**

Create `tests/payments/crypto.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, timingSafeEqualHex, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/payments/crypto";

const SECRET = "test_secret_0123456789";
const ref = (msg: string, secret = SECRET) => createHmac("sha256", secret).update(msg, "utf8").digest("hex");

describe("hmacSha256Hex", () => {
  it("matches Node's HMAC-SHA256 (ASCII and UTF-8)", async () => {
    expect(await hmacSha256Hex(SECRET, "hello")).toBe(ref("hello"));
    expect(await hmacSha256Hex(SECRET, "₹199 · st(AI)rway")).toBe(ref("₹199 · st(AI)rway"));
    expect(await hmacSha256Hex(SECRET, "")).toBe(ref(""));
  });
});

describe("timingSafeEqualHex", () => {
  it("compares equal strings only", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(timingSafeEqualHex("abcd", "abc")).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(true);
  });
});

describe("verifyCheckoutSignature", () => {
  const order = "order_IluGWxBm9U8zJ8";
  const payment = "pay_IluGWxBm9U8zJ9";
  it("accepts HMAC(order_id|payment_id) with the key secret", async () => {
    expect(await verifyCheckoutSignature(SECRET, order, payment, ref(`${order}|${payment}`))).toBe(true);
  });
  it("rejects a signature for other ids, another secret, upper case or junk", async () => {
    expect(await verifyCheckoutSignature(SECRET, order, payment, ref(`${payment}|${order}`))).toBe(false);
    expect(await verifyCheckoutSignature(SECRET, order, payment, ref(`${order}|${payment}`, "other_secret_000000"))).toBe(false);
    expect(await verifyCheckoutSignature(SECRET, order, payment, ref(`${order}|${payment}`).toUpperCase())).toBe(false);
    expect(await verifyCheckoutSignature(SECRET, order, payment, "")).toBe(false);
    expect(await verifyCheckoutSignature(SECRET, order, payment, "zz".repeat(32))).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const body = '{"event":"order.paid","payload":{}}';
  it("accepts HMAC(raw body) with the webhook secret", async () => {
    expect(await verifyWebhookSignature(SECRET, body, ref(body))).toBe(true);
  });
  it("rejects a re-serialised body, a missing header and another secret", async () => {
    expect(await verifyWebhookSignature(SECRET, JSON.stringify(JSON.parse(body), null, 1), ref(body))).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, null)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, body, ref(body, "other_secret_000000"))).toBe(false);
  });
});
```

Create `tests/payments/razorpay.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createOrder, fetchOrder, fetchPayment, RAZORPAY_API, RazorpayError, refundPayment, type FetchLike,
} from "@/lib/payments/razorpay";

const CREDS = { keyId: "rzp_test_ABCDEFGH1234", keySecret: "s3cr3t_value_xyz" };

function fakeFetch(status: number, body: unknown) {
  const f = vi.fn<FetchLike>(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  return f;
}
const init = (f: ReturnType<typeof fakeFetch>, i = 0) => f.mock.calls[i][1];
const url = (f: ReturnType<typeof fakeFetch>, i = 0) => f.mock.calls[i][0];

const ORDER = { id: "order_P4TEST000001", amount: 19900, currency: "INR", status: "created", notes: { source: "stairway", registration_id: "r1" } };
const PAYMENT = { id: "pay_P4TEST000001", order_id: "order_P4TEST000001", amount: 19900, currency: "INR", status: "captured", method: "upi", notes: [] };

describe("createOrder", () => {
  it("POSTs amount, INR, receipt and notes with Basic auth", async () => {
    const f = fakeFetch(200, ORDER);
    const o = await createOrder(CREDS, f, { amountPaise: 19900, receipt: "stw-r1", notes: { source: "stairway", registration_id: "r1" } });
    expect(o).toEqual(ORDER);
    expect(url(f)).toBe(`${RAZORPAY_API}/orders`);
    expect(init(f).method).toBe("POST");
    expect((init(f).headers as Record<string, string>).authorization)
      .toBe(`Basic ${Buffer.from(`${CREDS.keyId}:${CREDS.keySecret}`).toString("base64")}`);
    expect(JSON.parse(String(init(f).body))).toEqual({
      amount: 19900, currency: "INR", receipt: "stw-r1", notes: { source: "stairway", registration_id: "r1" },
    });
    expect(init(f).signal).toBeInstanceOf(AbortSignal);
  });
  it("refuses amounts Razorpay would reject without calling it", async () => {
    const f = fakeFetch(200, ORDER);
    await expect(createOrder(CREDS, f, { amountPaise: 99, receipt: "x", notes: {} })).rejects.toMatchObject({ code: "BAD_AMOUNT" });
    await expect(createOrder(CREDS, f, { amountPaise: 1.5, receipt: "x", notes: {} })).rejects.toMatchObject({ code: "BAD_AMOUNT" });
    expect(f).not.toHaveBeenCalled();
  });
  it("truncates the receipt to Razorpay's 40 characters", async () => {
    const f = fakeFetch(200, ORDER);
    await createOrder(CREDS, f, { amountPaise: 19900, receipt: "x".repeat(60), notes: {} });
    expect(JSON.parse(String(init(f).body)).receipt).toHaveLength(40);
  });
});

describe("errors", () => {
  it("carries Razorpay's error code and status, never the body or the secret", async () => {
    const f = fakeFetch(400, { error: { code: "BAD_REQUEST_ERROR", description: `bad key ${CREDS.keySecret}` } });
    const err = await createOrder(CREDS, f, { amountPaise: 19900, receipt: "x", notes: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(RazorpayError);
    expect(err).toMatchObject({ status: 400, code: "BAD_REQUEST_ERROR" });
    expect(String(err.message)).not.toContain(CREDS.keySecret);
  });
  it("maps network failures and malformed responses", async () => {
    const boom = vi.fn<FetchLike>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchPayment(CREDS, boom, PAYMENT.id)).rejects.toMatchObject({ code: "NETWORK" });
    await expect(fetchPayment(CREDS, fakeFetch(200, "not json"), PAYMENT.id)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    await expect(fetchPayment(CREDS, fakeFetch(200, { id: "nope" }), PAYMENT.id)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    await expect(fetchPayment(CREDS, fakeFetch(502, ""), PAYMENT.id)).rejects.toMatchObject({ status: 502, code: "HTTP_502" });
  });
  it("never puts a malformed id into a URL", async () => {
    const f = fakeFetch(200, PAYMENT);
    await expect(fetchPayment(CREDS, f, "pay_../../orders")).rejects.toMatchObject({ code: "BAD_ID" });
    await expect(fetchOrder(CREDS, f, "order_x?y=1")).rejects.toMatchObject({ code: "BAD_ID" });
    await expect(refundPayment(CREDS, f, "nope", { amountPaise: 100, notes: {} })).rejects.toMatchObject({ code: "BAD_ID" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("fetch and refund", () => {
  it("GETs a payment and normalises empty notes ([] in Razorpay's API) to {}", async () => {
    const f = fakeFetch(200, PAYMENT);
    const p = await fetchPayment(CREDS, f, PAYMENT.id);
    expect(url(f)).toBe(`${RAZORPAY_API}/payments/${PAYMENT.id}`);
    expect(init(f).method).toBe("GET");
    expect(init(f).body).toBeUndefined();
    expect(p).toMatchObject({ id: PAYMENT.id, order_id: ORDER.id, status: "captured", currency: "INR", notes: {} });
  });
  it("GETs an order with string notes", async () => {
    const f = fakeFetch(200, { ...ORDER, notes: { source: "stairway", registration_id: "r1", n: 5 } });
    const o = await fetchOrder(CREDS, f, ORDER.id);
    expect(o.notes).toEqual({ source: "stairway", registration_id: "r1", n: "5" });
  });
  it("POSTs a full refund with notes", async () => {
    const f = fakeFetch(200, { id: "rfnd_P4TEST000001", payment_id: PAYMENT.id, amount: 19900, status: "processed", notes: {} });
    const r = await refundPayment(CREDS, f, PAYMENT.id, { amountPaise: 19900, notes: { source: "stairway", registration_id: "r1" } });
    expect(url(f)).toBe(`${RAZORPAY_API}/payments/${PAYMENT.id}/refund`);
    expect(JSON.parse(String(init(f).body))).toEqual({
      amount: 19900, speed: "normal", notes: { source: "stairway", registration_id: "r1" },
    });
    expect(r.id).toBe("rfnd_P4TEST000001");
  });
});
```

Create `tests/payments/config.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readCronSecret, readPaymentsConfig, readSyncConfig } from "@/lib/payments/config";

const FULL = {
  PAYMENTS_ENABLED: "true",
  RAZORPAY_KEY_ID: "rzp_test_ABCDEFGH1234",
  RAZORPAY_KEY_SECRET: "key_secret_value_123",
  RAZORPAY_WEBHOOK_SECRET: "webhook_secret_value",
  SUPABASE_SERVICE_ROLE_KEY: "service_role_key_value_000000",
};

describe("readPaymentsConfig", () => {
  it("is enabled only with the flag and every secret", () => {
    expect(readPaymentsConfig(FULL)).toEqual({
      enabled: true, keyId: FULL.RAZORPAY_KEY_ID, keySecret: FULL.RAZORPAY_KEY_SECRET,
      webhookSecret: FULL.RAZORPAY_WEBHOOK_SECRET, serviceRoleKey: FULL.SUPABASE_SERVICE_ROLE_KEY,
    });
  });
  it("stays off without the flag, with a non-'true' flag, or with any secret missing or blank", () => {
    expect(readPaymentsConfig({})).toEqual({ enabled: false });
    expect(readPaymentsConfig({ ...FULL, PAYMENTS_ENABLED: undefined })).toEqual({ enabled: false });
    expect(readPaymentsConfig({ ...FULL, PAYMENTS_ENABLED: "1" })).toEqual({ enabled: false });
    for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
      expect(readPaymentsConfig({ ...FULL, [k]: undefined })).toEqual({ enabled: false });
      expect(readPaymentsConfig({ ...FULL, [k]: "   " })).toEqual({ enabled: false });
    }
  });
  it("rejects a key id that is not a Razorpay key id", () => {
    expect(readPaymentsConfig({ ...FULL, RAZORPAY_KEY_ID: "pk_live_123" })).toEqual({ enabled: false });
  });
});

describe("readSyncConfig", () => {
  const SYNC = {
    FUND_EASY_SYNC_ENABLED: "true",
    FUND_EASY_SYNC_URL: "https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync",
    STAIRWAY_SYNC_SECRET: "x".repeat(32),
    SUPABASE_SERVICE_ROLE_KEY: "service_role_key_value_000000",
  };
  it("needs the flag, an https URL, a 32+ character secret and the service role key", () => {
    expect(readSyncConfig(SYNC)).toEqual({
      enabled: true, url: SYNC.FUND_EASY_SYNC_URL, secret: SYNC.STAIRWAY_SYNC_SECRET, serviceRoleKey: SYNC.SUPABASE_SERVICE_ROLE_KEY,
    });
    expect(readSyncConfig({ ...SYNC, FUND_EASY_SYNC_URL: "http://example.com/x" })).toEqual({ enabled: false });
    expect(readSyncConfig({ ...SYNC, FUND_EASY_SYNC_URL: "not a url" })).toEqual({ enabled: false });
    expect(readSyncConfig({ ...SYNC, STAIRWAY_SYNC_SECRET: "short" })).toEqual({ enabled: false });
    expect(readSyncConfig({ ...SYNC, FUND_EASY_SYNC_ENABLED: "false" })).toEqual({ enabled: false });
  });
});

describe("readCronSecret", () => {
  it("returns a 32+ character secret or null", () => {
    expect(readCronSecret({ CRON_SECRET: "c".repeat(32) })).toBe("c".repeat(32));
    expect(readCronSecret({ CRON_SECRET: "short" })).toBeNull();
    expect(readCronSecret({})).toBeNull();
  });
});
```

Create `tests/payments/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatInr } from "@/lib/payments/money";

describe("formatInr", () => {
  it("formats paise as rupees with Indian grouping", () => {
    expect(formatInr(19900)).toBe("₹199");
    expect(formatInr(199950)).toBe("₹1,999.50");
    expect(formatInr(10000000)).toBe("₹1,00,000");
    expect(formatInr(0)).toBe("₹0");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/payments`
Expected: FAIL — the four modules do not exist.

- [ ] **Step 3: Implement**

Create `lib/payments/crypto.ts`:

```ts
// HMAC-SHA256 with WebCrypto (available in Workers, browsers and Node 20+). No Node `crypto`, no Buffer.

const enc = new TextEncoder();
const HEX64 = /^[0-9a-f]{64}$/;

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  let out = "";
  for (const b of sig) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Constant-time for equal lengths (signatures are always 64 hex characters, so the length leaks nothing). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Razorpay Checkout success: signature = HMAC-SHA256(`${order_id}|${payment_id}`, key secret), lower-case hex. */
export async function verifyCheckoutSignature(secret: string, orderId: string, paymentId: string, signature: string): Promise<boolean> {
  if (!HEX64.test(signature)) return false;
  return timingSafeEqualHex(await hmacSha256Hex(secret, `${orderId}|${paymentId}`), signature);
}

/** Razorpay webhook: `x-razorpay-signature` = HMAC-SHA256(raw request body, webhook secret). Never re-serialise the body. */
export async function verifyWebhookSignature(secret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature || !HEX64.test(signature)) return false;
  return timingSafeEqualHex(await hmacSha256Hex(secret, rawBody), signature);
}
```

Create `lib/payments/razorpay.ts`:

```ts
import { z } from "zod";

// Razorpay REST API v1 over fetch (the Node SDK does not run on Workers). Responses are validated with zod;
// errors carry only the HTTP status and Razorpay's error code, never the response body, key or secret.

export const RAZORPAY_API = "https://api.razorpay.com/v1";
export const ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
export const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;
export const REFUND_ID = /^rfnd_[A-Za-z0-9]{6,40}$/;
const TIMEOUT_MS = 8000;

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class RazorpayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Razorpay request failed (${status} ${code})`);
    this.name = "RazorpayError";
  }
}

// Razorpay returns `notes: []` when there are none; values may be numbers. Normalise to Record<string, string>.
const Notes = z
  .record(z.string(), z.union([z.string(), z.number()]))
  .transform((n) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, String(v)])))
  .catch({});

const OrderSchema = z.object({
  id: z.string().regex(ORDER_ID),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  notes: Notes,
});
const PaymentSchema = z.object({
  id: z.string().regex(PAYMENT_ID),
  order_id: z.string().nullable(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  method: z.string().nullish(),
  notes: Notes,
});
const RefundSchema = z.object({
  id: z.string().regex(REFUND_ID),
  payment_id: z.string().regex(PAYMENT_ID),
  amount: z.number().int(),
  status: z.string(),
  notes: Notes,
});

export type RazorpayOrder = z.output<typeof OrderSchema>;
export type RazorpayPayment = z.output<typeof PaymentSchema>;
export type RazorpayRefund = z.output<typeof RefundSchema>;

async function call<T>(
  creds: RazorpayCredentials,
  f: FetchLike,
  method: "GET" | "POST",
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await f(`${RAZORPAY_API}${path}`, {
      method,
      headers: {
        authorization: `Basic ${btoa(`${creds.keyId}:${creds.keySecret}`)}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new RazorpayError(0, "NETWORK");
  }
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const code = (json as { error?: { code?: unknown } } | null)?.error?.code;
    throw new RazorpayError(res.status, typeof code === "string" ? code.slice(0, 60) : `HTTP_${res.status}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new RazorpayError(res.status, "BAD_RESPONSE");
  return parsed.data;
}

function checkId(id: string, re: RegExp) {
  if (!re.test(id)) throw new RazorpayError(0, "BAD_ID");
}

/** Razorpay's minimum is ₹1 (100 paise). The amount always comes from registrations.amount_paise. */
export function createOrder(
  creds: RazorpayCredentials,
  f: FetchLike,
  input: { amountPaise: number; receipt: string; notes: Record<string, string> },
): Promise<RazorpayOrder> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) {
    return Promise.reject(new RazorpayError(0, "BAD_AMOUNT"));
  }
  return call(creds, f, "POST", "/orders", OrderSchema, {
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  });
}

export async function fetchOrder(creds: RazorpayCredentials, f: FetchLike, id: string): Promise<RazorpayOrder> {
  checkId(id, ORDER_ID);
  return call(creds, f, "GET", `/orders/${id}`, OrderSchema);
}

export async function fetchPayment(creds: RazorpayCredentials, f: FetchLike, id: string): Promise<RazorpayPayment> {
  checkId(id, PAYMENT_ID);
  return call(creds, f, "GET", `/payments/${id}`, PaymentSchema);
}

/** Full refunds only (a second full refund is refused by Razorpay, so a retry can never double-refund). */
export async function refundPayment(
  creds: RazorpayCredentials,
  f: FetchLike,
  paymentId: string,
  input: { amountPaise: number; notes: Record<string, string> },
): Promise<RazorpayRefund> {
  checkId(paymentId, PAYMENT_ID);
  return call(creds, f, "POST", `/payments/${paymentId}/refund`, RefundSchema, {
    amount: input.amountPaise,
    speed: "normal",
    notes: input.notes,
  });
}
```

Create `lib/payments/config.ts`:

```ts
import "server-only";

// Feature flags + secret presence. Everything money-related is OFF unless the flag is exactly "true" AND every
// secret it needs is present. Secrets are read from process.env (OpenNext copies Worker secrets into it per request)
// and are never logged, returned to the browser (except the public key id) or put in NEXT_PUBLIC_* variables.

export type Env = Record<string, string | undefined>;

export type PaymentsConfig =
  | { enabled: false }
  | { enabled: true; keyId: string; keySecret: string; webhookSecret: string; serviceRoleKey: string };

export type SyncConfig = { enabled: false } | { enabled: true; url: string; secret: string; serviceRoleKey: string };

const KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/;
const val = (v: string | undefined, min = 8): string | null => {
  const t = v?.trim();
  return t && t.length >= min ? t : null;
};

export function readPaymentsConfig(env: Env): PaymentsConfig {
  if (env.PAYMENTS_ENABLED !== "true") return { enabled: false };
  const keyId = val(env.RAZORPAY_KEY_ID);
  const keySecret = val(env.RAZORPAY_KEY_SECRET);
  const webhookSecret = val(env.RAZORPAY_WEBHOOK_SECRET);
  const serviceRoleKey = val(env.SUPABASE_SERVICE_ROLE_KEY, 20);
  if (!keyId || !KEY_ID.test(keyId) || !keySecret || !webhookSecret || !serviceRoleKey) return { enabled: false };
  return { enabled: true, keyId, keySecret, webhookSecret, serviceRoleKey };
}

export function readSyncConfig(env: Env): SyncConfig {
  if (env.FUND_EASY_SYNC_ENABLED !== "true") return { enabled: false };
  const raw = val(env.FUND_EASY_SYNC_URL);
  const secret = val(env.STAIRWAY_SYNC_SECRET, 32);
  const serviceRoleKey = val(env.SUPABASE_SERVICE_ROLE_KEY, 20);
  if (!raw || !secret || !serviceRoleKey) return { enabled: false };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { enabled: false };
  }
  if (url.protocol !== "https:") return { enabled: false };
  return { enabled: true, url: url.toString(), secret, serviceRoleKey };
}

export function readCronSecret(env: Env): string | null {
  return val(env.CRON_SECRET, 32);
}

export const paymentsConfig = (): PaymentsConfig => readPaymentsConfig(process.env);
export const syncConfig = (): SyncConfig => readSyncConfig(process.env);
export const cronSecret = (): string | null => readCronSecret(process.env);
```

Create `lib/payments/money.ts`:

```ts
const whole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Paise → "₹199" / "₹1,999.50" (Indian digit grouping). */
export function formatInr(paise: number): string {
  return paise % 100 === 0 ? whole.format(paise / 100) : exact.format(paise / 100);
}
```

Create `lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

export type AdminClient = SupabaseClient<Database>;

/**
 * Service-role client (bypasses RLS). Only for: confirming a verified payment, the Razorpay webhook, refunds and the
 * cron tick. It may only call the service_role RPCs (confirm_payment, expire_holds, claim_refund, mark_refunded,
 * claim_sync_batch, complete_sync); never use it for anything a signed-in user's own client can do.
 */
export function createAdminClient(serviceRoleKey: string): AdminClient {
  return createClient<Database>(publicEnv.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
```

Append to `.env.example`:

```bash
# --- Phase 4: payments + Fund Easy sync (all OFF unless set). Put real values in Cloudflare Worker secrets
# --- (Workers & Pages > stairway > Settings > Variables and Secrets) and locally in .dev.vars. Never commit them.
# PAYMENTS_ENABLED=true
# RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
# RAZORPAY_KEY_SECRET=
# RAZORPAY_WEBHOOK_SECRET=
# SUPABASE_SERVICE_ROLE_KEY=
# CRON_SECRET=            # 32+ random characters
# FUND_EASY_SYNC_ENABLED=true
# FUND_EASY_SYNC_URL=https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync
# STAIRWAY_SYNC_SECRET=   # 32+ random characters, same value as Fund Easy's STAIRWAY_SYNC_SECRET
```

Ensure `.gitignore` contains a line `.dev.vars` (add it if `git check-ignore .dev.vars` prints nothing).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/payments`
Expected: PASS (4 files).

- [ ] **Step 5: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add lib/payments lib/supabase/admin.ts tests/payments .env.example .gitignore
git commit -m "feat(payments): config flags, WebCrypto signatures and Razorpay REST client

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Typed errors, statuses, CTA states and ticket mapping for payments

**Files:**
- Modify: `lib/registration/errors.ts`, `lib/registration/types.ts`, `lib/registration/cta.ts`, `lib/registration/tickets.ts`, `lib/registration/server.ts` (`getMyRegistration` only), `lib/tickets/list.ts` (`statusLabel` only), `components/registration/RegisterCta.tsx`, `components/registration/RegistrationUnavailable.tsx`, `app/events/[slug]/register/page.tsx` (one condition)
- Create: `lib/payments/countdown.ts`, `components/payments/HoldCountdown.tsx`, `tests/payments/countdown.test.ts`
- Test: `tests/registration/errors.test.ts`, `tests/registration/cta.test.ts`, `tests/registration/tickets.test.ts`, `tests/registration/server.test.ts`, `tests/tickets/list.test.ts`

**Interfaces:**
- Consumes: `formatInr` (Task 5); DB columns from Task 1 (`hold_expires_at`, `amount_paise`, `receipt_number`, `paid_at`, `refunded_at`, `cancel_reason`); DB error codes `refund_pending`, `hold_expired` (Task 2).
- Produces:
  - `RegistrationErrorCode` gains `"refund_pending" | "hold_expired" | "payment_cancelled" | "payment_failed" | "payment_unverified" | "payment_processing" | "payment_review" | "checkout_unavailable"` (the `Recovery` union is unchanged and `RECOVERY_ACTIONS` stays exhaustive).
  - `MyRegistration` gains `holdExpiresAt?: string | null`; `VISIBLE_STATUSES = ["pending_payment","confirmed","waitlisted","refund_needed","refunded"] as const`.
  - `CtaInput.paymentsEnabled?: boolean`; `CtaState` gains `{ kind: "pay"; href: string; pricePaise: number }`, `{ kind: "complete_payment"; registrationId: string; holdExpiresAt: string }`, `{ kind: "refund_pending"; registrationId: string }`.
  - `TicketRow` gains optional `amount_paise?`, `hold_expires_at?`, `receipt_number?`, `paid_at?`, `refunded_at?`, `cancel_reason?`; `TicketSummary` gains `amountPaise: number; holdExpiresAt: string | null`; `TicketDetail` gains `receiptNumber: string | null; paidAt: string | null; refundedAt: string | null; cancelReason: string | null`. `TICKET_SELECT` selects the new columns; `TICKET_LIST_SELECT` still never selects `ticket_code`.
  - `holdRemaining(expiresAt: string, now: number): { expired: boolean; totalSeconds: number; label: string }` (`"14:05"`).
  - `<HoldCountdown expiresAt: string; className?: string; refreshOnExpiry?: boolean />` (client; refreshes the route once at zero).

- [ ] **Step 1: Write the failing tests**

Create `tests/payments/countdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { holdRemaining } from "@/lib/payments/countdown";

const END = "2026-10-10T10:15:00Z";
const at = (iso: string) => Date.parse(iso);

describe("holdRemaining", () => {
  it("counts down in m:ss, flooring seconds", () => {
    expect(holdRemaining(END, at("2026-10-10T10:00:00Z"))).toEqual({ expired: false, totalSeconds: 900, label: "15:00" });
    expect(holdRemaining(END, at("2026-10-10T10:14:55.900Z"))).toEqual({ expired: false, totalSeconds: 4, label: "0:04" });
  });
  it("is expired at and after the end, and for an invalid timestamp", () => {
    expect(holdRemaining(END, at(END)).expired).toBe(true);
    expect(holdRemaining(END, at("2026-10-10T11:00:00Z"))).toEqual({ expired: true, totalSeconds: 0, label: "0:00" });
    expect(holdRemaining("nope", 0).expired).toBe(true);
  });
});
```

In `tests/registration/errors.test.ts`, add `RECOVERIES` to the existing import from `@/lib/registration/errors` at the top of the file, then append:

```ts
describe("payment errors", () => {
  it("maps the new RPC codes", () => {
    expect(errorFromDb({ message: "refund_pending", code: "P0001" })).toMatchObject({ code: "refund_pending", recovery: "tickets" });
    expect(errorFromDb({ message: "hold_expired", code: "P0001" })).toMatchObject({ code: "hold_expired", recovery: "reload" });
  });
  it("keeps internal attach errors generic", () => {
    expect(errorFromDb({ message: "amount_mismatch", code: "P0001" }).code).toBe("unknown");
    expect(errorFromDb({ message: "invalid_order", code: "P0001" }).code).toBe("unknown");
  });
  it("gives every code a message and a known recovery", () => {
    for (const c of REGISTRATION_ERROR_CODES) {
      const e = registrationError(c);
      expect(e.message.length).toBeGreaterThan(10);
      expect(RECOVERIES).toContain(e.recovery);
    }
  });
  it("offers a retry for a cancelled or failed checkout and My tickets when the outcome is still open", () => {
    expect(registrationError("payment_cancelled").recovery).toBe("retry");
    expect(registrationError("payment_failed").recovery).toBe("retry");
    expect(registrationError("checkout_unavailable").recovery).toBe("retry");
    expect(registrationError("payment_processing").recovery).toBe("tickets");
    expect(registrationError("payment_unverified").recovery).toBe("tickets");
    expect(registrationError("payment_review").recovery).toBe("tickets");
  });
});
```

In `tests/registration/cta.test.ts`, replace the test `"shows the ticket for confirmed and pending registrations, even after the event"` so the pending case passes no `holdExpiresAt` (unchanged expectation `registered`), and append:

```ts
describe("ctaState with payments", () => {
  const paid = (p: Partial<CtaInput> = {}, e: Partial<CtaEvent> = {}) => at({ paymentsEnabled: true, ...p }, { pricePaise: 19900, ...e });
  const LATER = new Date(NOW + 10 * 60_000).toISOString();
  const EARLIER = new Date(NOW - 60_000).toISOString();

  it("keeps 'paid soon' while payments are off", () => {
    expect(ctaState(at({}, { pricePaise: 19900 }))).toEqual({ kind: "paid_soon" });
    expect(ctaState(at({ paymentsEnabled: false }, { pricePaise: 19900 }))).toEqual({ kind: "paid_soon" });
  });
  it("offers Pay with the price, the waitlist when full, and sign-in when signed out", () => {
    expect(ctaState(paid())).toEqual({ kind: "pay", href: "/events/seeing-machines/register", pricePaise: 19900 });
    expect(ctaState(paid({}, { seatsLeft: 0 }))).toEqual({ kind: "join_waitlist", href: "/events/seeing-machines/register" });
    expect(ctaState(paid({ signedIn: false })).kind).toBe("sign_in");
  });
  it("shows Complete payment for a live hold and Pay again once it expired", () => {
    expect(ctaState(paid({ registration: { id: "r1", status: "pending_payment", waitlistPosition: null, holdExpiresAt: LATER } })))
      .toEqual({ kind: "complete_payment", registrationId: "r1", holdExpiresAt: LATER });
    expect(ctaState(paid({ registration: { id: "r1", status: "pending_payment", waitlistPosition: null, holdExpiresAt: EARLIER } })).kind)
      .toBe("pay");
  });
  it("shows the refund state and blocks a new registration while a refund is pending", () => {
    expect(ctaState(paid({ registration: { id: "r1", status: "refund_needed", waitlistPosition: null } })))
      .toEqual({ kind: "refund_pending", registrationId: "r1" });
  });
  it("lets a refunded or cancelled member register again", () => {
    expect(ctaState(paid({ registration: { id: "r1", status: "refunded", waitlistPosition: null } })).kind).toBe("pay");
    expect(ctaState(paid({ registration: { id: "r1", status: "cancelled", waitlistPosition: null } })).kind).toBe("pay");
  });
  it("still prefers the ticket over closed / external states", () => {
    expect(ctaState(paid({ now: Date.parse("2026-12-01T00:00:00Z"), registration: { id: "r1", status: "confirmed", waitlistPosition: null } })))
      .toEqual({ kind: "registered", registrationId: "r1" });
  });
});
```

In `tests/registration/server.test.ts`, change the `getMyRegistration filters to the user's active rows` test to:

```ts
  it("getMyRegistration filters to the user's active and refund-pending rows", async () => {
    const calls = fakeDb({ data: { id: RID, status: "waitlisted", waitlist_position: 2, hold_expires_at: null }, error: null });
    expect(await getMyRegistration(EID, UID)).toEqual({ id: RID, status: "waitlisted", waitlistPosition: 2, holdExpiresAt: null });
    expect(calls).toContainEqual(["in", "status", ["pending_payment", "confirmed", "waitlisted", "refund_needed"]]);
  });
```

(keep whatever other assertions that test already makes on `eq` calls).

In `tests/tickets/list.test.ts`, change `expect(statusLabel("refund_needed", null).label).toBe("Refunded");` to:

```ts
    expect(statusLabel("refund_needed", null)).toEqual({ label: "Refund pending", tone: "orange" });
```

Append to `tests/registration/tickets.test.ts`:

```ts
describe("payment fields", () => {
  it("defaults the payment fields of a Phase 3 row", () => {
    const t = rowToTicket(row)!;
    expect(t).toMatchObject({ amountPaise: 0, holdExpiresAt: null, receiptNumber: null, paidAt: null, refundedAt: null, cancelReason: null });
  });
  it("maps amount, hold, receipt and refund fields", () => {
    const t = rowToTicket({
      ...row, status: "refunded", amount_paise: 19900, hold_expires_at: null, receipt_number: "STW-2026-000012",
      paid_at: "2026-10-01T10:00:00Z", refunded_at: "2026-10-02T10:00:00Z", cancel_reason: "user",
    })!;
    expect(t).toMatchObject({
      amountPaise: 19900, receiptNumber: "STW-2026-000012", paidAt: "2026-10-01T10:00:00Z",
      refundedAt: "2026-10-02T10:00:00Z", cancelReason: "user",
    });
    expect(toSummary(t)).toMatchObject({ amountPaise: 19900, holdExpiresAt: null });
    expect(toSummary(t)).not.toHaveProperty("receiptNumber");
  });
  it("selects the payment columns but never the ticket code in lists", () => {
    expect(TICKET_SELECT).toContain("hold_expires_at");
    expect(TICKET_SELECT).toContain("receipt_number");
    expect(TICKET_LIST_SELECT).toContain("hold_expires_at");
    expect(TICKET_LIST_SELECT).not.toContain("ticket_code");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/payments/countdown.test.ts tests/registration tests/tickets/list.test.ts`
Expected: FAIL (missing module `countdown`, unknown codes, missing CTA kinds, old labels).

- [ ] **Step 3: Implement**

Create `lib/payments/countdown.ts`:

```ts
export interface HoldRemaining {
  expired: boolean;
  totalSeconds: number;
  /** "m:ss" */
  label: string;
}

/** Time left on a seat hold. Invalid timestamps read as expired (the server is the authority anyway). */
export function holdRemaining(expiresAt: string, now: number): HoldRemaining {
  const end = Date.parse(expiresAt);
  const total = Number.isFinite(end) ? Math.max(0, Math.floor((end - now) / 1000)) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return { expired: total === 0, totalSeconds: total, label: `${m}:${String(s).padStart(2, "0")}` };
}
```

Create `components/payments/HoldCountdown.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClock } from "@/components/providers/ClockProvider";
import { holdRemaining } from "@/lib/payments/countdown";
import { cn } from "@/lib/utils";

/**
 * Live "m:ss" left on a seat hold. Screen readers get minute-level text only (polite), never every tick. At zero it
 * refreshes the server-rendered route once, so the page shows the expired state from the server (never client state).
 */
export function HoldCountdown({
  expiresAt,
  className,
  refreshOnExpiry = true,
}: {
  expiresAt: string;
  className?: string;
  refreshOnExpiry?: boolean;
}) {
  const router = useRouter();
  const { now: clockNow } = useClock();
  const [tick, setTick] = useState(clockNow);
  const refreshed = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setTick(now);
      if (refreshOnExpiry && !refreshed.current && holdRemaining(expiresAt, now).expired) {
        refreshed.current = true;
        clearInterval(id);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, refreshOnExpiry, router]);

  const left = holdRemaining(expiresAt, Math.max(tick, clockNow));
  const minutes = Math.ceil(left.totalSeconds / 60);
  return (
    <span className={cn("mono tabular", className)}>
      <span aria-hidden="true">{left.label}</span>
      <span className="sr-only" role="timer" aria-live="polite">
        {left.expired ? "Seat hold expired" : `${minutes} minute${minutes === 1 ? "" : "s"} left to pay`}
      </span>
    </span>
  );
}
```

In `lib/registration/errors.ts`:
- Replace `REGISTRATION_ERROR_CODES` with:

```ts
export const REGISTRATION_ERROR_CODES = [
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "invalid_input", "already_registered", "registration_not_found", "not_cancellable",
  "paid_cancel_not_supported", "event_started", "profile_save_failed", "busy", "network", "unknown",
  "refund_pending", "hold_expired", "payment_cancelled", "payment_failed", "payment_unverified", "payment_processing",
  "payment_review", "checkout_unavailable",
] as const;
```

- Add these entries to `COPY` (after `unknown`):

```ts
  refund_pending: {
    message: "Your refund for this session is still being processed, so you can't register again yet.",
    recovery: "tickets",
  },
  hold_expired: {
    message: "Your 15-minute seat hold ran out before the payment finished. Reload to start again.",
    recovery: "reload",
  },
  payment_cancelled: {
    message: "The payment was cancelled. Your seat stays held until the timer runs out, so you can try again.",
    recovery: "retry",
  },
  payment_failed: {
    message: "The payment didn't go through. You can try again or use another payment method.",
    recovery: "retry",
  },
  payment_unverified: {
    message: "We couldn't verify this payment here. If money left your account it is safe: My tickets shows the final status within a few minutes.",
    recovery: "tickets",
  },
  payment_processing: {
    message: "Your payment is still being confirmed. My tickets shows the result in a minute or two.",
    recovery: "tickets",
  },
  payment_review: {
    message: "We received a payment we couldn't match to a seat. The organisers will check it and refund it if needed.",
    recovery: "tickets",
  },
  checkout_unavailable: {
    message: "The payment window couldn't load. Check your connection or pause content blockers, then try again.",
    recovery: "retry",
  },
```

- Replace `DB_CODES` with (the comment above it changes to "Codes the RPCs raise as the exception message (errcode P0001)."):

```ts
const DB_CODES: ReadonlySet<string> = new Set<RegistrationErrorCode>([
  "not_signed_in", "not_onboarded", "event_not_found", "paid_event", "not_open_yet", "registration_closed",
  "invalid_answers", "already_registered",
  "registration_not_found", "not_cancellable", "paid_cancel_not_supported", "event_started",
  "refund_pending", "hold_expired",
]);
```

In `lib/registration/types.ts` add:

```ts
/** Statuses shown in My tickets and on the ticket page (cancelled rows drop out). */
export const VISIBLE_STATUSES = ["pending_payment", "confirmed", "waitlisted", "refund_needed", "refunded"] as const;
```

and add to `MyRegistration`:

```ts
  /** End of a pending_payment seat hold (ISO), else null/undefined. */
  holdExpiresAt?: string | null;
```

In `lib/registration/cta.ts`:
- Add to `CtaInput`:

```ts
  /** Payments switched on (lib/payments/config.ts). When off, paid events show "Paid registration opens soon". */
  paymentsEnabled?: boolean;
```

- Extend `CtaState` with three members:

```ts
  | { kind: "pay"; href: string; pricePaise: number }
  | { kind: "complete_payment"; registrationId: string; holdExpiresAt: string }
  | { kind: "refund_pending"; registrationId: string };
```

- Replace the doc comment and body of `ctaState` with:

```ts
/**
 * Precedence: a pending refund; then an active registration (ticket / waitlist / live hold → Complete payment), even
 * after the event; an expired hold counts as no registration (the cron cancels it within minutes); then closed;
 * external-form mode; not-yet-open; paid while payments are off; then sign-in / waitlist / Pay / Register.
 */
export function ctaState(i: CtaInput): CtaState {
  const reg = i.registration;
  if (reg?.status === "refund_needed") return { kind: "refund_pending", registrationId: reg.id };
  const holdEnd = reg?.status === "pending_payment" && reg.holdExpiresAt ? Date.parse(reg.holdExpiresAt) : null;
  const holdExpired = holdEnd !== null && !(holdEnd > i.now);
  const r = reg && isActiveStatus(reg.status) && !holdExpired ? reg : null;
  if (r?.status === "waitlisted") return { kind: "waitlisted", registrationId: r.id, position: r.waitlistPosition ?? 0 };
  if (r?.status === "pending_payment" && r.holdExpiresAt) {
    return { kind: "complete_payment", registrationId: r.id, holdExpiresAt: r.holdExpiresAt };
  }
  if (r) return { kind: "registered", registrationId: r.id };

  const win = registrationWindow(i.event, i.now);
  if (win === "closed") return { kind: "closed" };
  const external = i.externalUrl ? safeFormUrl(i.externalUrl) : null;
  if (external) return { kind: "external", href: external };
  if (win === "not_open") return { kind: "opens", opensAt: i.event.registrationOpensAt ?? i.event.start };
  const paid = i.event.pricePaise > 0;
  if (paid && !i.paymentsEnabled) return { kind: "paid_soon" };

  const href = registerPath(i.event.slug);
  const full = i.event.seatsLeft <= 0;
  if (!i.signedIn) return { kind: "sign_in", href: loginPath(href), full };
  if (full) return { kind: "join_waitlist", href };
  return paid ? { kind: "pay", href, pricePaise: i.event.pricePaise } : { kind: "register", href };
}
```

In `lib/registration/tickets.ts`:
- Replace `TICKET_SELECT` with:

```ts
export const TICKET_SELECT =
  "id, status, waitlist_position, ticket_code, token_number, checked_in_at, amount_paise, hold_expires_at, receipt_number, paid_at, refunded_at, cancel_reason, event:events(id, slug, title, topic, step_number, starts_at, ends_at, price_paise, ticket_type, token_prefix, society:societies(short_name, color))";
```

(`TICKET_LIST_SELECT` keeps its definition: it removes `ticket_code, ` and `checked_in_at, `.)
- Add to `TicketRow` (after `checked_in_at`):

```ts
  amount_paise?: number;
  hold_expires_at?: string | null;
  receipt_number?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  cancel_reason?: string | null;
```

- Add to `TicketSummary` (after `ticketType`):

```ts
  /** Amount charged for this seat in paise (0 for free sessions). */
  amountPaise: number;
  /** End of a live payment hold (pending_payment only), else null. */
  holdExpiresAt: string | null;
```

- Add to `TicketDetail`:

```ts
  receiptNumber: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  cancelReason: string | null;
```

- In `rowToTicket`, add to the returned object (after `checkedInAt: r.checked_in_at,`):

```ts
    amountPaise: r.amount_paise ?? 0,
    holdExpiresAt: r.status === "pending_payment" ? r.hold_expires_at ?? null : null,
    receiptNumber: r.receipt_number ?? null,
    paidAt: r.paid_at ?? null,
    refundedAt: r.refunded_at ?? null,
    cancelReason: r.cancel_reason ?? null,
```

- In `toSummary`, add `amountPaise: t.amountPaise, holdExpiresAt: t.holdExpiresAt,` after `ticketType: t.ticketType,`.

If any existing test builds a `TicketSummary` or `TicketDetail` object literal directly (not through `rowToTicket`/`rowToSummary`), add `amountPaise: 0, holdExpiresAt: null` (and for details `receiptNumber: null, paidAt: null, refundedAt: null, cancelReason: null`) to that literal.

In `lib/registration/server.ts`, replace `getMyRegistration` with:

```ts
/** The user's active (or refund-pending) registration for an event, or null (none, or it could not be read). */
export async function getMyRegistration(eventId: string, userId: string): Promise<MyRegistration | null> {
  if (!isUuid(eventId) || !isUuid(userId)) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("registrations")
    .select("id, status, waitlist_position, hold_expires_at")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES, "refund_needed"])
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, status: data.status, waitlistPosition: data.waitlist_position, holdExpiresAt: data.hold_expires_at };
}
```

In `lib/tickets/list.ts`, replace the two refund cases of `statusLabel` with:

```ts
    case "refund_needed":
      return { label: "Refund pending", tone: "orange" };
    case "refunded":
      return { label: "Refunded", tone: "outline" };
```

In `components/registration/RegisterCta.tsx`:
- Change the lucide import to `import { ArrowRight, Check, Clock, CreditCard, ExternalLink, Hourglass, Lock, LogIn } from "lucide-react";` and add `import { formatInr } from "@/lib/payments/money";` and `import { HoldCountdown } from "@/components/payments/HoldCountdown";`.
- Add these cases before `case "opens":`:

```tsx
    case "pay":
      return (
        <Button href={state.href} variant="ink" size="lg" className="w-full" trackAs="register_click" trackProps={trackProps}>
          Pay {formatInr(state.pricePaise)} · Register <ArrowRight size={18} strokeWidth={2} aria-hidden />
        </Button>
      );
    case "complete_payment":
      return (
        <div className="grid gap-2">
          <p role="status" className="mono font-bold">
            Seat held for you · <HoldCountdown expiresAt={state.holdExpiresAt} /> left to pay
          </p>
          <Button href={ticketPath(state.registrationId)} variant="primary" size="lg" className="w-full">
            <CreditCard size={18} strokeWidth={2} aria-hidden /> Complete payment
          </Button>
        </div>
      );
    case "refund_pending":
      return (
        <div className="grid gap-2">
          <p role="status" className={note}>
            <Hourglass size={18} strokeWidth={2} aria-hidden /> Your refund for this session is being processed
          </p>
          <Button href={ticketPath(state.registrationId)} variant="secondary" size="lg" className="w-full">
            View status
          </Button>
        </div>
      );
```

In `components/registration/RegistrationUnavailable.tsx`:
- Change the `UnavailableState` type to `Exclude<CtaState, { kind: "register" } | { kind: "join_waitlist" } | { kind: "pay" }>;` and its doc comment to "CTA states in which /events/[slug]/register shows a notice instead of the form."
- Add these cases before `default:` in `copy()`:

```tsx
    case "complete_payment":
      return {
        text: "Your seat is held while you pay.",
        Icon: Hourglass,
        action: { label: "Complete payment", href: ticketPath(state.registrationId) },
      };
    case "refund_pending":
      return {
        text: "Your refund for this session is still being processed, so you can't register again yet.",
        Icon: Hourglass,
        action: { label: "View status", href: ticketPath(state.registrationId) },
      };
```

In `app/events/[slug]/register/page.tsx`, change the condition before `return page(<RegistrationUnavailable …/>)` to:

```tsx
  if (state.kind !== "register" && state.kind !== "join_waitlist" && state.kind !== "pay") {
```

(Task 12 wires `paymentsEnabled` and the paid form; until then `pay` is never produced because `paymentsEnabled` is not passed.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run`
Expected: PASS (all files, including the updated Phase 3 tests).

- [ ] **Step 5: Gate and commit**

```bash
npx tsc --noEmit && npx eslint .
git add lib/registration lib/payments/countdown.ts lib/tickets/list.ts components/payments components/registration "app/events/[slug]/register/page.tsx" tests
git commit -m "feat(registration): payment error codes, Pay / Complete payment / refund CTA states

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Server actions: paid registration, `createPaymentOrder`, `verifyPayment`

**Files:**
- Create: `lib/payments/confirm.ts`, `lib/payments/actions.ts`, `tests/payments/confirm.test.ts`, `tests/payments/actions.test.ts`
- Modify: `lib/registration/actions.ts`, `tests/registration/actions.test.ts`

**Interfaces:**
- Consumes: Task 5 (`paymentsConfig`, `verifyCheckoutSignature`, `createOrder`, `fetchOrder`, `fetchPayment`, `ORDER_ID`, `PAYMENT_ID`, `RazorpayError`, `FetchLike`, `RazorpayCredentials`, `createAdminClient`, `AdminClient`); Task 6 error codes; RPCs `attach_payment_order` (Task 2), `confirm_payment` (Task 3); `getAuthState`, `createClient`.
- Produces:
  - `confirm.ts`: `type ConfirmOutcome = "confirmed" | "late_confirmed" | "refund_needed" | "already_processed" | "duplicate_payment" | "amount_mismatch" | "duplicate_event" | "unknown_order" | "not_captured" | "foreign"`; `interface ConfirmInput { registrationId: string; orderId: string; paymentId: string; source: "client_verify" | "webhook"; eventId?: string | null; eventName?: string | null; orderNotes?: Record<string, string> }`; `confirmVerifiedPayment(deps: { creds: RazorpayCredentials; fetch: FetchLike; db: AdminClient }, input: ConfirmInput): Promise<{ outcome: ConfirmOutcome; status: RegistrationStatus | null }>` (throws on RPC/Razorpay failure; error text never includes DB messages).
  - `actions.ts` (`"use server"`): `interface CheckoutData { keyId; orderId; amountPaise; currency: "INR"; name: "st(AI)rway"; description; prefill: { name; email }; notes: { source: "stairway"; registration_id: string }; holdExpiresAt: string; registrationId: string }`; `type CreateOrderResult = { ok: true; checkout: CheckoutData } | { ok: false; error: RegistrationError }`; `type VerifyResult = { ok: true; status: "confirmed" | "processing" | "refund_needed" } | { ok: false; error: RegistrationError }`; `createPaymentOrder(registrationId: string): Promise<CreateOrderResult>`; `verifyPayment(input: { registrationId; orderId; paymentId; signature }): Promise<VerifyResult>`.
  - `RegisterResult` success status now `"confirmed" | "waitlisted" | "pending_payment"`.
- **REVIEW AMENDMENTS (Tasks 1-3 review, `.superpowers/sdd/p4-review-1-3.md`) — these override the code below:**
  - **I-1 attach is server-only.** `createPaymentOrder` must call `attach_payment_order` through the **admin (service-role) client** (`createAdminClient()`), passing the **session user's id** taken from `getAuthState()` — never a client-supplied id: `admin.rpc("attach_payment_order", { p_user_id: user.id, p_registration_id: row.id, p_order_id: order.id, p_amount_paise: row.amount_paise })`. The session client still reads the user's own row (RLS) first. Tests assert the admin client receives exactly that call and the session client never calls `attach_payment_order`. New DB error `payments_disabled` maps to the "paid registration opens soon" error.
  - **I-4 hold expiry vs in-flight payment (no DB grace period).** `createPaymentOrder` refuses to create (or hand out) an order when fewer than **120 s** remain on the hold (`hold_expired` error, so the user re-registers for a fresh hold) and returns `holdExpiresAt`; the Checkout options set `timeout` (seconds) = seconds left on the hold minus a **60 s** margin (computed in `lib/payments/checkout.ts` / `usePayFlow` from `holdExpiresAt`, never ≤ 0), so Razorpay closes the modal before the hold lapses. A payment that still lands late is handled by `confirm_payment` (late_confirmed / refund_needed).
  - `confirm_payment` outcomes are unchanged in name; `amount_mismatch` now also covers a stale-price order (see the Task 3 amendment). `confirm.ts` must treat raised `invalid_source` / `invalid_payment` / `invalid_event` / `payment_conflict` as permanent (webhook → 200 + log), not as retryable.

- [ ] **Step 1: Write the failing tests**

Create `tests/payments/confirm.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { confirmVerifiedPayment } from "@/lib/payments/confirm";
import type { FetchLike } from "@/lib/payments/razorpay";

const CREDS = { keyId: "rzp_test_ABCDEFGH1234", keySecret: "secret_value_000" };
const RID = "33333333-3333-4333-8333-333333333333";
const ORDER = "order_P4CONF000001";
const PAY = "pay_P4CONF000001";

function razorpay(payment: Record<string, unknown> = {}, order: Record<string, unknown> = {}) {
  return vi.fn<FetchLike>(async (url) =>
    url.includes("/payments/")
      ? Response.json({ id: PAY, order_id: ORDER, amount: 19900, currency: "INR", status: "captured", method: "upi", notes: {}, ...payment })
      : Response.json({ id: ORDER, amount: 19900, currency: "INR", status: "paid", notes: { source: "stairway", registration_id: RID }, ...order }));
}
function fakeDb(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) };
}
const input = { registrationId: RID, orderId: ORDER, paymentId: PAY, source: "client_verify" as const };
const ok = { data: { outcome: "confirmed", registration_id: RID, status: "confirmed" }, error: null };

describe("confirmVerifiedPayment", () => {
  it("re-fetches the payment and the order, then confirms with the captured amount and currency", async () => {
    const f = razorpay();
    const db = fakeDb(ok);
    expect(await confirmVerifiedPayment({ creds: CREDS, fetch: f, db: db as never }, input)).toEqual({ outcome: "confirmed", status: "confirmed" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(db.rpc).toHaveBeenCalledWith("confirm_payment", {
      p_registration_id: RID, p_order_id: ORDER, p_payment_id: PAY, p_amount_paise: 19900, p_currency: "INR",
      p_source: "client_verify", p_event_id: undefined, p_event_name: undefined, p_details: { status: "captured", method: "upi" },
    });
  });
  it("trusts order notes from a signed webhook body instead of fetching the order", async () => {
    const f = razorpay();
    const db = fakeDb(ok);
    await confirmVerifiedPayment({ creds: CREDS, fetch: f, db: db as never }, {
      ...input, source: "webhook", eventId: "evt_1", eventName: "order.paid", orderNotes: { source: "stairway", registration_id: RID },
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({ p_source: "webhook", p_event_id: "evt_1", p_event_name: "order.paid" }));
  });
  it("treats another order's payment, Fund Easy notes or another registration as foreign, without touching the DB", async () => {
    for (const f of [
      razorpay({ order_id: "order_OTHER0000001" }),
      razorpay({}, { notes: { source: "fundeasy", registration_id: RID } }),
      razorpay({}, { notes: { source: "stairway", registration_id: "44444444-4444-4444-8444-444444444444" } }),
      razorpay({}, { notes: [] }),
    ]) {
      const db = fakeDb(ok);
      expect((await confirmVerifiedPayment({ creds: CREDS, fetch: f, db: db as never }, input)).outcome).toBe("foreign");
      expect(db.rpc).not.toHaveBeenCalled();
    }
  });
  it("does not confirm a payment that is not captured yet", async () => {
    const db = fakeDb(ok);
    const res = await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay({ status: "authorized" }), db: db as never }, input);
    expect(res).toEqual({ outcome: "not_captured", status: null });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("passes Razorpay's captured amount and currency so the database refuses a mismatch", async () => {
    const db = fakeDb({ data: { outcome: "amount_mismatch", registration_id: RID, status: "pending_payment" }, error: null });
    const res = await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay({ amount: 100, currency: "USD" }), db: db as never }, input);
    expect(res.outcome).toBe("amount_mismatch");
    expect(db.rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({ p_amount_paise: 100, p_currency: "USD" }));
  });
  it("throws a message without database text when the RPC fails or returns junk", async () => {
    const failing = fakeDb({ data: null, error: { message: "secret table detail", code: "XX000" } });
    const err = await confirmVerifiedPayment({ creds: CREDS, fetch: razorpay(), db: failing as never }, input).catch((e) => e);
    expect(String(err.message)).not.toContain("secret table detail");
    await expect(confirmVerifiedPayment({ creds: CREDS, fetch: razorpay(), db: fakeDb({ data: { nope: 1 }, error: null }) as never }, input))
      .rejects.toThrow();
  });
});
```

Create `tests/payments/actions.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getAuthState: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/payments/config", () => ({ paymentsConfig: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentsConfig } from "@/lib/payments/config";
import { createPaymentOrder, verifyPayment } from "@/lib/payments/actions";

const UID = "11111111-1111-4111-8111-111111111111";
const RID = "33333333-3333-4333-8333-333333333333";
const ORDER = "order_P4ACT0000001";
const PAY = "pay_P4ACT0000001";
const CFG = {
  enabled: true, keyId: "rzp_test_ABCDEFGH1234", keySecret: "key_secret_value_123",
  webhookSecret: "webhook_secret_value", serviceRoleKey: "service_role_key_value_000000",
} as const;
const sig = (o = ORDER, p = PAY) => createHmac("sha256", CFG.keySecret).update(`${o}|${p}`).digest("hex");
const future = () => new Date(Date.now() + 10 * 60_000).toISOString();

type Res = { data: unknown; error: unknown };
function sessionDb(row: Res, rpc: Record<string, Res> = {}) {
  const rpcCalls: [string, unknown][] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(row);
  const db = {
    from: () => b,
    rpc: (name: string, args: unknown) => {
      rpcCalls.push([name, args]);
      return Promise.resolve(rpc[name] ?? { data: null, error: null });
    },
  };
  vi.mocked(createClient).mockResolvedValue(db as never);
  return rpcCalls;
}
function adminDb(result: Res) {
  const rpc = vi.fn(async () => result);
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
  return rpc;
}
function razorpay(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const f = vi.fn(handler);
  vi.stubGlobal("fetch", f);
  return f;
}
const pendingRow = (over: Record<string, unknown> = {}): Res => ({
  data: { id: RID, status: "pending_payment", amount_paise: 19900, hold_expires_at: future(), razorpay_order_id: null,
          event: { title: "Seeing Machines", slug: "seeing-machines" }, ...over },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(paymentsConfig).mockReturnValue(CFG as never);
  vi.mocked(getAuthState).mockResolvedValue({
    user: { id: UID, email: "asha@example.com" },
    profile: { handle: "asha", fullName: "Asha", avatarUrl: null, onboarded: true },
  } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("createPaymentOrder", () => {
  it("is refused while payments are off, without calling Razorpay", async () => {
    vi.mocked(paymentsConfig).mockReturnValue({ enabled: false });
    const f = razorpay(() => Response.json({}));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "paid_event" } });
    expect(f).not.toHaveBeenCalled();
  });
  it("needs a session and the user's own live hold", async () => {
    vi.mocked(getAuthState).mockResolvedValueOnce({ user: null, profile: null } as never);
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
    sessionDb({ data: null, error: null });
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "registration_not_found" } });
    sessionDb(pendingRow({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "hold_expired" } });
    sessionDb(pendingRow({ status: "confirmed" }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "hold_expired" } });
    expect(await createPaymentOrder("not-a-uuid")).toMatchObject({ ok: false, error: { code: "registration_not_found" } });
  });
  it("creates an order for the amount stored on the hold, attaches it and returns checkout data without secrets", async () => {
    const rpcCalls = sessionDb(pendingRow(), { attach_payment_order: { data: { order_id: ORDER, hold_expires_at: future() }, error: null } });
    const f = razorpay(() => Response.json({ id: ORDER, amount: 19900, currency: "INR", status: "created", notes: {} }));
    const res = await createPaymentOrder(RID);
    expect(res).toMatchObject({
      ok: true,
      checkout: {
        keyId: CFG.keyId, orderId: ORDER, amountPaise: 19900, currency: "INR", name: "st(AI)rway",
        description: "Seeing Machines", prefill: { name: "Asha", email: "asha@example.com" },
        notes: { source: "stairway", registration_id: RID }, registrationId: RID,
      },
    });
    const body = JSON.parse(String(f.mock.calls[0][1].body));
    expect(body).toEqual({ amount: 19900, currency: "INR", receipt: `stw-${RID}`, notes: { source: "stairway", registration_id: RID } });
    expect(rpcCalls).toEqual([["attach_payment_order", { p_registration_id: RID, p_order_id: ORDER, p_amount_paise: 19900 }]]);
    const text = JSON.stringify(res);
    for (const s of [CFG.keySecret, CFG.webhookSecret, CFG.serviceRoleKey]) expect(text).not.toContain(s);
  });
  it("reuses the hold's existing order (no new Razorpay order)", async () => {
    sessionDb(pendingRow({ razorpay_order_id: ORDER }));
    const f = razorpay(() => Response.json({}));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: true, checkout: { orderId: ORDER } });
    expect(f).not.toHaveBeenCalled();
  });
  it("uses the order the database kept when two tabs raced", async () => {
    sessionDb(pendingRow(), { attach_payment_order: { data: { order_id: "order_FIRSTTAB0001", hold_expires_at: future() }, error: null } });
    razorpay(() => Response.json({ id: ORDER, amount: 19900, currency: "INR", status: "created", notes: {} }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: true, checkout: { orderId: "order_FIRSTTAB0001" } });
  });
  it("maps Razorpay and attach failures to typed errors", async () => {
    sessionDb(pendingRow());
    razorpay(() => Response.json({ error: { code: "BAD_REQUEST_ERROR" } }, { status: 400 }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "checkout_unavailable" } });
    razorpay(() => {
      throw new TypeError("fetch failed");
    });
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "network" } });
    sessionDb(pendingRow(), { attach_payment_order: { data: null, error: { message: "hold_expired", code: "P0001" } } });
    razorpay(() => Response.json({ id: ORDER, amount: 19900, currency: "INR", status: "created", notes: {} }));
    expect(await createPaymentOrder(RID)).toMatchObject({ ok: false, error: { code: "hold_expired" } });
  });
});

describe("verifyPayment", () => {
  const good = () => ({ registrationId: RID, orderId: ORDER, paymentId: PAY, signature: sig() });
  const rzpOk = (payment: Record<string, unknown> = {}) =>
    razorpay((url) =>
      url.includes("/payments/")
        ? Response.json({ id: PAY, order_id: ORDER, amount: 19900, currency: "INR", status: "captured", method: "upi", notes: {}, ...payment })
        : Response.json({ id: ORDER, amount: 19900, currency: "INR", status: "paid", notes: { source: "stairway", registration_id: RID } }));
  const own = () => sessionDb({ data: { id: RID, event: { slug: "seeing-machines" } }, error: null });

  it("rejects malformed input and bad signatures before any service-role call", async () => {
    own();
    expect(await verifyPayment({ ...good(), signature: "nope" })).toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    expect(await verifyPayment({ ...good(), signature: sig(ORDER, "pay_OTHER0000001") }))
      .toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    expect(await verifyPayment(null)).toMatchObject({ ok: false, error: { code: "payment_unverified" } });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("only verifies the user's own registration", async () => {
    sessionDb({ data: null, error: null });
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "registration_not_found" } });
  });
  it("confirms a verified, captured payment through the service-role RPC and refreshes the pages", async () => {
    own();
    rzpOk();
    const rpc = adminDb({ data: { outcome: "confirmed", registration_id: RID, status: "confirmed" }, error: null });
    expect(await verifyPayment(good())).toEqual({ ok: true, status: "confirmed" });
    expect(createAdminClient).toHaveBeenCalledWith(CFG.serviceRoleKey);
    expect(rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({ p_source: "client_verify", p_order_id: ORDER }));
    expect(revalidatePath).toHaveBeenCalledWith("/events/seeing-machines");
  });
  it("maps every outcome", async () => {
    const cases: [Record<string, unknown>, unknown][] = [
      [{ outcome: "late_confirmed", status: "confirmed" }, { ok: true, status: "confirmed" }],
      [{ outcome: "refund_needed", status: "refund_needed" }, { ok: true, status: "refund_needed" }],
      [{ outcome: "already_processed", status: "confirmed" }, { ok: true, status: "confirmed" }],
      [{ outcome: "already_processed", status: "refund_needed" }, { ok: true, status: "refund_needed" }],
      [{ outcome: "duplicate_payment", status: "confirmed" }, { ok: false, error: { code: "payment_review" } }],
      [{ outcome: "amount_mismatch", status: "pending_payment" }, { ok: false, error: { code: "payment_review" } }],
      [{ outcome: "unknown_order" }, { ok: false, error: { code: "payment_unverified" } }],
    ];
    for (const [data, expected] of cases) {
      own();
      rzpOk();
      adminDb({ data: { registration_id: RID, ...data }, error: null });
      expect(await verifyPayment(good())).toMatchObject(expected as object);
    }
  });
  it("reports 'processing' for an authorised-but-not-captured payment or when Razorpay is unreachable", async () => {
    own();
    rzpOk({ status: "authorized" });
    adminDb({ data: null, error: null });
    expect(await verifyPayment(good())).toEqual({ ok: true, status: "processing" });
    own();
    razorpay(() => {
      throw new TypeError("fetch failed");
    });
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "payment_processing" } });
  });
  it("is refused while payments are off", async () => {
    vi.mocked(paymentsConfig).mockReturnValue({ enabled: false });
    expect(await verifyPayment(good())).toMatchObject({ ok: false, error: { code: "paid_event" } });
  });
});
```

In `tests/registration/actions.test.ts`:
- Add after the existing `vi.mock(...)` lines:

```ts
vi.mock("@/lib/payments/config", () => ({ paymentsConfig: vi.fn(() => ({ enabled: false })) }));
```

- Add `import { paymentsConfig } from "@/lib/payments/config";` to the imports, and append inside the `registerForEvent` describe block (use the file's existing `fakeDb`, `signedIn`, `openEvent` helpers and the valid-values helper the other success tests use — call it `valid()` below; adapt the name to the file):

```ts
  it("registers for a paid event when payments are on and returns the hold", async () => {
    vi.mocked(paymentsConfig).mockReturnValueOnce({ enabled: true } as never);
    signedIn();
    const { rpcCalls } = fakeDb(
      { events: openEvent({ price_paise: 19900 }), "profiles:update": { data: [{ id: UID }], error: null },
        "profile_private:update": { data: [{ user_id: UID }], error: null } },
      { register_for_event: { data: { registration_id: RID, status: "pending_payment", waitlist_position: null,
          hold_expires_at: "2026-10-10T10:15:00Z", amount_paise: 19900, promoted: [] }, error: null } },
    );
    expect(await registerForEvent("seeing-machines", valid())).toEqual({ ok: true, registrationId: RID, status: "pending_payment" });
    expect(rpcCalls[0][0]).toBe("register_for_event");
  });
  it("still refuses a paid event while payments are off", async () => {
    signedIn();
    fakeDb({ events: openEvent({ price_paise: 19900 }) });
    expect(await registerForEvent("seeing-machines", valid())).toMatchObject({ ok: false, error: { code: "paid_event" } });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/payments/confirm.test.ts tests/payments/actions.test.ts tests/registration/actions.test.ts`
Expected: FAIL (modules missing; paid registration still refused).

- [ ] **Step 3: Implement**

Create `lib/payments/confirm.ts`:

```ts
import { z } from "zod";
import type { AdminClient } from "@/lib/supabase/admin";
import { REGISTRATION_STATUSES, type RegistrationStatus } from "@/lib/registration/types";
import { fetchOrder, fetchPayment, type FetchLike, type RazorpayCredentials } from "./razorpay";

// The single path from "Razorpay says paid" to a seat, shared by the client verify action and the webhook. Before the
// database is touched: the payment is re-fetched from Razorpay (its order must match), the order's server-set notes
// must name st(AI)rway and this registration (the account is shared with Fund Easy), and the payment must be captured.
// The amount and currency Razorpay captured go to confirm_payment, which refuses anything but the order's amount in INR.

export type ConfirmOutcome =
  | "confirmed" | "late_confirmed" | "refund_needed" | "already_processed" | "duplicate_payment"
  | "amount_mismatch" | "duplicate_event" | "unknown_order" | "not_captured" | "foreign";

export interface ConfirmInput {
  registrationId: string;
  orderId: string;
  paymentId: string;
  source: "client_verify" | "webhook";
  eventId?: string | null;
  eventName?: string | null;
  /** Notes of the order entity from a signature-verified webhook body (trusted); otherwise the order is fetched. */
  orderNotes?: Record<string, string>;
}

const RpcResult = z.object({
  outcome: z.enum([
    "confirmed", "late_confirmed", "refund_needed", "already_processed", "duplicate_payment",
    "amount_mismatch", "duplicate_event", "unknown_order",
  ]),
  status: z.enum(REGISTRATION_STATUSES).optional(),
});

export async function confirmVerifiedPayment(
  deps: { creds: RazorpayCredentials; fetch: FetchLike; db: AdminClient },
  input: ConfirmInput,
): Promise<{ outcome: ConfirmOutcome; status: RegistrationStatus | null }> {
  const payment = await fetchPayment(deps.creds, deps.fetch, input.paymentId);
  if (payment.order_id !== input.orderId) return { outcome: "foreign", status: null };
  const notes = input.orderNotes ?? (await fetchOrder(deps.creds, deps.fetch, input.orderId)).notes;
  if (notes.source !== "stairway" || notes.registration_id !== input.registrationId) return { outcome: "foreign", status: null };
  if (payment.status !== "captured") return { outcome: "not_captured", status: null };

  const { data, error } = await deps.db.rpc("confirm_payment", {
    p_registration_id: input.registrationId,
    p_order_id: input.orderId,
    p_payment_id: input.paymentId,
    p_amount_paise: payment.amount,
    p_currency: payment.currency,
    p_source: input.source,
    p_event_id: input.eventId ?? undefined,
    p_event_name: input.eventName ?? undefined,
    p_details: { status: payment.status, method: payment.method ?? null },
  });
  // Never echo database text (it may name tables or values).
  if (error) throw new Error(`confirm_payment failed (${error.code ?? "no code"})`);
  const parsed = RpcResult.safeParse(data);
  if (!parsed.success) throw new Error("confirm_payment returned an unexpected shape");
  return { outcome: parsed.data.outcome, status: parsed.data.status ?? null };
}
```

Create `lib/payments/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthState } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorFromDb, registrationError, type RegistrationError, type RegistrationErrorCode } from "@/lib/registration/errors";
import { paymentsConfig } from "./config";
import { confirmVerifiedPayment, type ConfirmOutcome } from "./confirm";
import { verifyCheckoutSignature } from "./crypto";
import { createOrder, ORDER_ID, PAYMENT_ID, RazorpayError, type FetchLike } from "./razorpay";

// Server actions are public POST endpoints: each re-checks the flag and the session, validates input with zod, and
// returns UI-shaped data only. The order amount is the hold's amount_paise (set by register_for_event from
// events.price_paise), never a client value. The service role is used only after the checkout signature verified.

export interface CheckoutData {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: "INR";
  name: "st(AI)rway";
  description: string;
  prefill: { name: string; email: string };
  notes: { source: "stairway"; registration_id: string };
  holdExpiresAt: string;
  registrationId: string;
}
export type CreateOrderResult = { ok: true; checkout: CheckoutData } | { ok: false; error: RegistrationError };
export type VerifyResult =
  | { ok: true; status: "confirmed" | "processing" | "refund_needed" }
  | { ok: false; error: RegistrationError };

const IdSchema = z.guid();
const AttachResult = z.object({ order_id: z.string().regex(ORDER_ID) });
const VerifyInput = z.object({
  registrationId: z.guid(),
  orderId: z.string().regex(ORDER_ID),
  paymentId: z.string().regex(PAYMENT_ID),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});
// Resolved at call time so tests (and OpenNext) see the current global fetch.
const httpFetch: FetchLike = (url, init) => fetch(url, init);

function fail(code: RegistrationErrorCode): { ok: false; error: RegistrationError } {
  return { ok: false, error: registrationError(code) };
}

function refresh(slug: string | null) {
  try {
    if (slug) {
      revalidatePath(`/events/${slug}`);
      revalidatePath(`/events/${slug}/register`);
    }
    revalidatePath("/me", "layout");
  } catch {
    // Best effort: every page renders per request anyway.
  }
}

const slugOf = (event: unknown): string | null => {
  const s = (event as { slug?: unknown } | null)?.slug;
  return typeof s === "string" && /^[a-z0-9-]{2,80}$/.test(s) ? s : null;
};

/** Creates (or reuses) the Razorpay order for the user's own live hold and returns what Checkout needs. */
export async function createPaymentOrder(registrationId: string): Promise<CreateOrderResult> {
  try {
    const cfg = paymentsConfig();
    if (!cfg.enabled) return fail("paid_event");
    const id = IdSchema.safeParse(registrationId);
    if (!id.success) return fail("registration_not_found");
    const { user, profile } = await getAuthState();
    if (!user) return fail("not_signed_in");

    const db = await createClient();
    const { data: row, error } = await db
      .from("registrations")
      .select("id, status, amount_paise, hold_expires_at, razorpay_order_id, event:events(title, slug)")
      .eq("id", id.data)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return { ok: false, error: errorFromDb(error) };
    if (!row) return fail("registration_not_found");
    const holdEnd = row.hold_expires_at ? Date.parse(row.hold_expires_at) : NaN;
    if (row.status !== "pending_payment" || !(holdEnd > Date.now()) || !row.hold_expires_at) return fail("hold_expired");
    if (!(row.amount_paise > 0)) return fail("unknown");

    let orderId = row.razorpay_order_id;
    if (!orderId) {
      const notes = { source: "stairway", registration_id: row.id };
      const order = await createOrder({ keyId: cfg.keyId, keySecret: cfg.keySecret }, httpFetch, {
        amountPaise: row.amount_paise,
        receipt: `stw-${row.id}`,
        notes,
      });
      if (order.amount !== row.amount_paise || order.currency !== "INR") return fail("unknown");
      const { data: att, error: attErr } = await db.rpc("attach_payment_order", {
        p_registration_id: row.id,
        p_order_id: order.id,
        p_amount_paise: row.amount_paise,
      });
      if (attErr) return { ok: false, error: errorFromDb(attErr) };
      const parsed = AttachResult.safeParse(att);
      if (!parsed.success) return fail("unknown");
      orderId = parsed.data.order_id;
    }

    const title = (row.event as { title?: unknown } | null)?.title;
    return {
      ok: true,
      checkout: {
        keyId: cfg.keyId,
        orderId,
        amountPaise: row.amount_paise,
        currency: "INR",
        name: "st(AI)rway",
        description: typeof title === "string" && title ? title.slice(0, 120) : "Session registration",
        prefill: { name: profile?.fullName ?? "", email: user.email },
        notes: { source: "stairway", registration_id: row.id },
        holdExpiresAt: row.hold_expires_at,
        registrationId: row.id,
      },
    };
  } catch (e) {
    if (e instanceof RazorpayError) return fail(e.code === "NETWORK" ? "network" : "checkout_unavailable");
    return fail("unknown");
  }
}

function fromOutcome(outcome: ConfirmOutcome, status: string | null): VerifyResult {
  switch (outcome) {
    case "confirmed":
    case "late_confirmed":
      return { ok: true, status: "confirmed" };
    case "refund_needed":
      return { ok: true, status: "refund_needed" };
    case "already_processed":
    case "duplicate_event":
      if (status === "confirmed") return { ok: true, status: "confirmed" };
      if (status === "refund_needed" || status === "refunded") return { ok: true, status: "refund_needed" };
      return { ok: true, status: "processing" };
    case "not_captured":
      return { ok: true, status: "processing" };
    case "duplicate_payment":
    case "amount_mismatch":
      return fail("payment_review");
    case "unknown_order":
    case "foreign":
      return fail("payment_unverified");
  }
}

/**
 * Called by Checkout's success handler. Verifies the signature with the key secret, checks the registration is the
 * user's own, then confirms through the shared core. Whatever happens here, the webhook confirms independently.
 */
export async function verifyPayment(input: unknown): Promise<VerifyResult> {
  try {
    const cfg = paymentsConfig();
    if (!cfg.enabled) return fail("paid_event");
    const v = VerifyInput.safeParse(input);
    if (!v.success) return fail("payment_unverified");
    const { user } = await getAuthState();
    if (!user) return fail("not_signed_in");

    const db = await createClient();
    const { data: own, error } = await db
      .from("registrations")
      .select("id, event:events(slug)")
      .eq("id", v.data.registrationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return { ok: false, error: errorFromDb(error) };
    if (!own) return fail("registration_not_found");
    if (!(await verifyCheckoutSignature(cfg.keySecret, v.data.orderId, v.data.paymentId, v.data.signature))) {
      return fail("payment_unverified");
    }

    const res = await confirmVerifiedPayment(
      { creds: { keyId: cfg.keyId, keySecret: cfg.keySecret }, fetch: httpFetch, db: createAdminClient(cfg.serviceRoleKey) },
      { registrationId: own.id, orderId: v.data.orderId, paymentId: v.data.paymentId, source: "client_verify" },
    );
    refresh(slugOf(own.event));
    return fromOutcome(res.outcome, res.status);
  } catch {
    // Razorpay or the database was unreachable: the webhook still confirms; My tickets shows the outcome.
    return fail("payment_processing");
  }
}
```

In `lib/registration/actions.ts`:
- Add `import { paymentsConfig } from "@/lib/payments/config";`.
- Change `RegisterResult`'s success member to `{ ok: true; registrationId: string; status: "confirmed" | "waitlisted" | "pending_payment" }`.
- In `RegisterRpcResult`, change `status: z.enum(["confirmed", "waitlisted"])` to `status: z.enum(["confirmed", "waitlisted", "pending_payment"])`.
- Replace `if (ev.price_paise > 0) return fail("paid_event");` with:

```ts
    // Paid sessions need payments switched on (the RPC also checks its own database flag).
    if (ev.price_paise > 0 && !paymentsConfig().enabled) return fail("paid_event");
```

- Update the doc comment of `registerForEvent` to say a paid session returns `pending_payment` (a 15-minute hold) and the client then calls `createPaymentOrder`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/payments tests/registration`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add lib/payments lib/registration/actions.ts tests/payments tests/registration/actions.test.ts
git commit -m "feat(payments): order creation and checkout verification actions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Razorpay webhook route

**Files:**
- Create: `lib/payments/webhook.ts`, `app/api/payments/webhook/route.ts`, `tests/payments/webhook.test.ts`, `tests/auth/middleware-matcher.test.ts`
- Modify: `middleware.ts` (`matcher` only)

**Interfaces:**
- Consumes: `verifyWebhookSignature` (Task 5), `confirmVerifiedPayment` (Task 7), `ORDER_ID`/`PAYMENT_ID`/`REFUND_ID`, `paymentsConfig`, `createAdminClient`, RPC `mark_refunded` (Task 3).
- Produces:
  - `MAX_WEBHOOK_BYTES = 65536`
  - `interface WebhookDeps { webhookSecret: string; creds: RazorpayCredentials; fetch: FetchLike; db: () => AdminClient }` (`db` is lazy: ignored events never create a client)
  - `interface WebhookRequest { rawBody: string; signature: string | null; eventId: string | null }`
  - `handleRazorpayWebhook(deps, req): Promise<{ status: number; body: { ok: boolean; result: string } }>` — 413 too large, 401 bad signature, 400 unparseable JSON, 200 for handled or ignored events (`result` = outcome or `ignored:<reason>`), 503 when an `order.paid` payment is not captured yet (Razorpay retries); throws on DB failure (route answers 500 so Razorpay retries).
  - `POST /api/payments/webhook` (404 while payments are off; no other methods).

- [ ] **Step 1: Write the failing tests**

Create `tests/payments/webhook.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleRazorpayWebhook, MAX_WEBHOOK_BYTES, type WebhookDeps } from "@/lib/payments/webhook";
import type { FetchLike } from "@/lib/payments/razorpay";

const SECRET = "webhook_secret_value";
const RID = "33333333-3333-4333-8333-333333333333";
const ORDER = "order_P4HOOK000001";
const PAY = "pay_P4HOOK000001";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

const orderPaid = (notes: unknown = { source: "stairway", registration_id: RID }, paymentOrder = ORDER) =>
  JSON.stringify({
    entity: "event", event: "order.paid", contains: ["payment", "order"],
    payload: {
      payment: { entity: { id: PAY, order_id: paymentOrder, amount: 19900, currency: "INR", status: "captured", email: "x@y.z", contact: "+91" } },
      order: { entity: { id: ORDER, amount: 19900, amount_paid: 19900, currency: "INR", status: "paid", notes } },
    },
  });
const refundProcessed = (notes: unknown = { source: "stairway", registration_id: RID }) =>
  JSON.stringify({
    entity: "event", event: "refund.processed",
    payload: { refund: { entity: { id: "rfnd_P4HOOK000001", payment_id: PAY, amount: 19900, status: "processed", notes } } },
  });

function deps(rpcResult: { data: unknown; error: unknown } = { data: { outcome: "confirmed", status: "confirmed" }, error: null }, payment: Record<string, unknown> = {}) {
  const rpc = vi.fn(async () => rpcResult);
  const db = vi.fn(() => ({ rpc }) as never);
  const fetch = vi.fn<FetchLike>(async () =>
    Response.json({ id: PAY, order_id: ORDER, amount: 19900, currency: "INR", status: "captured", method: "upi", notes: {}, ...payment }));
  const d: WebhookDeps = { webhookSecret: SECRET, creds: { keyId: "rzp_test_ABCDEFGH1234", keySecret: "k_secret_000000" }, fetch, db };
  return { d, rpc, db, fetch };
}
const req = (rawBody: string, signature: string | null = sign(rawBody), eventId: string | null = "evt_P4HOOK000001") =>
  ({ rawBody, signature, eventId });

describe("handleRazorpayWebhook", () => {
  it("rejects oversize bodies and bad signatures before parsing or touching the DB", async () => {
    const { d, db } = deps();
    expect((await handleRazorpayWebhook(d, req("x".repeat(MAX_WEBHOOK_BYTES + 1)))).status).toBe(413);
    expect((await handleRazorpayWebhook(d, req(orderPaid(), "0".repeat(64)))).status).toBe(401);
    expect((await handleRazorpayWebhook(d, req(orderPaid(), null))).status).toBe(401);
    expect(db).not.toHaveBeenCalled();
  });
  it("confirms an order.paid for our order using the signed order notes and the event id", async () => {
    const { d, rpc, fetch } = deps();
    const res = await handleRazorpayWebhook(d, req(orderPaid()));
    expect(res).toEqual({ status: 200, body: { ok: true, result: "confirmed" } });
    expect(fetch).toHaveBeenCalledTimes(1); // the payment is re-fetched; the order notes come from the signed body
    expect(rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({
      p_registration_id: RID, p_order_id: ORDER, p_payment_id: PAY, p_source: "webhook",
      p_event_id: "evt_P4HOOK000001", p_event_name: "order.paid",
    }));
  });
  it("acknowledges and ignores Fund Easy's orders, other events and malformed payloads without a DB call", async () => {
    for (const body of [
      orderPaid({ source: "fundeasy", campaign: "x" }),
      orderPaid([]),
      orderPaid({ source: "stairway", registration_id: "not-a-uuid" }),
      orderPaid(undefined, "order_OTHER000001"),
      JSON.stringify({ event: "payment.captured", payload: {} }),
      JSON.stringify({ event: "order.paid", payload: { order: {} } }),
      refundProcessed({ source: "fundeasy" }),
    ]) {
      const { d, db } = deps();
      const res = await handleRazorpayWebhook(d, req(body));
      expect(res.status).toBe(200);
      expect(res.body.result).toMatch(/^ignored:/);
      expect(db).not.toHaveBeenCalled();
    }
  });
  it("answers 400 for a signed body that is not JSON", async () => {
    const { d } = deps();
    expect((await handleRazorpayWebhook(d, req("not json"))).status).toBe(400);
  });
  it("asks Razorpay to retry while the payment is not captured", async () => {
    const { d, rpc } = deps(undefined, { status: "authorized" });
    expect((await handleRazorpayWebhook(d, req(orderPaid()))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes duplicate deliveries to the database, which answers duplicate_event", async () => {
    const { d } = deps({ data: { outcome: "duplicate_event", status: "confirmed" }, error: null });
    expect(await handleRazorpayWebhook(d, req(orderPaid()))).toEqual({ status: 200, body: { ok: true, result: "duplicate_event" } });
  });
  it("drops a malformed event id instead of storing it", async () => {
    const { d, rpc } = deps();
    await handleRazorpayWebhook(d, req(orderPaid(), undefined, "evt with spaces"));
    expect(rpc).toHaveBeenCalledWith("confirm_payment", expect.objectContaining({ p_event_id: undefined }));
  });
  it("records refund.processed for our refunds", async () => {
    const { d, rpc } = deps({ data: { outcome: "refunded", status: "refunded" }, error: null });
    const res = await handleRazorpayWebhook(d, req(refundProcessed()));
    expect(res).toEqual({ status: 200, body: { ok: true, result: "refunded" } });
    expect(rpc).toHaveBeenCalledWith("mark_refunded", {
      p_registration_id: RID, p_payment_id: PAY, p_refund_id: "rfnd_P4HOOK000001", p_amount_paise: 19900,
      p_source: "webhook", p_event_id: "evt_P4HOOK000001",
    });
  });
  it("throws (so the route answers 500 and Razorpay retries) when the database fails", async () => {
    const { d } = deps({ data: null, error: { message: "boom", code: "XX000" } });
    await expect(handleRazorpayWebhook(d, req(refundProcessed()))).rejects.toThrow();
  });
});
```

Create `tests/auth/middleware-matcher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

const re = new RegExp(`^${config.matcher[0]}$`);

describe("middleware matcher", () => {
  it("still runs for pages and the payment actions' pages", () => {
    for (const p of ["/", "/me/tickets", "/events/seeing-machines/register", "/api/other"]) expect(re.test(p)).toBe(true);
  });
  it("skips the Razorpay webhook and the cron endpoint (no session refresh, less CPU)", () => {
    expect(re.test("/api/payments/webhook")).toBe(false);
    expect(re.test("/api/cron/tick")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/payments/webhook.test.ts tests/auth/middleware-matcher.test.ts`
Expected: FAIL (module missing; matcher still matches the webhook).

- [ ] **Step 3: Implement**

Create `lib/payments/webhook.ts`:

```ts
import { z } from "zod";
import type { AdminClient } from "@/lib/supabase/admin";
import { confirmVerifiedPayment } from "./confirm";
import { verifyWebhookSignature } from "./crypto";
import { ORDER_ID, PAYMENT_ID, REFUND_ID, type FetchLike, type RazorpayCredentials } from "./razorpay";

// Razorpay webhook, kept CPU-light for Workers: size cap → signature over the RAW body → one JSON.parse → notes
// check. The Razorpay account is shared with Fund Easy, so anything that is not an order/refund we created
// (notes.source = "stairway" + a registration id) is acknowledged with 200 and ignored, before any DB call.

export const MAX_WEBHOOK_BYTES = 64 * 1024;

export interface WebhookDeps {
  webhookSecret: string;
  creds: RazorpayCredentials;
  fetch: FetchLike;
  /** Created lazily: ignored events never build a service-role client. */
  db: () => AdminClient;
}
export interface WebhookRequest {
  rawBody: string;
  signature: string | null;
  /** `x-razorpay-event-id`: unique per event, repeated on redelivery. */
  eventId: string | null;
}
export interface WebhookResponse {
  status: number;
  body: { ok: boolean; result: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
const Notes = z.record(z.string(), z.unknown()).catch({});
const Envelope = z.object({ event: z.string().max(60), payload: z.record(z.string(), z.unknown()) });
const OrderPaid = z.object({
  order: z.object({ entity: z.object({ id: z.string().regex(ORDER_ID), notes: Notes }) }),
  payment: z.object({ entity: z.object({ id: z.string().regex(PAYMENT_ID), order_id: z.string().nullable() }) }),
});
const RefundProcessed = z.object({
  refund: z.object({
    entity: z.object({
      id: z.string().regex(REFUND_ID),
      payment_id: z.string().regex(PAYMENT_ID),
      amount: z.number().int(),
      notes: Notes,
    }),
  }),
});
const MarkResult = z.object({ outcome: z.string().max(40) });

const ignored = (reason: string): WebhookResponse => ({ status: 200, body: { ok: true, result: `ignored:${reason}` } });

/** Our notes: source "stairway" and a registration uuid. Returns the registration id, or null. */
function ourRegistration(notes: Record<string, unknown>): string | null {
  return notes.source === "stairway" && typeof notes.registration_id === "string" && UUID.test(notes.registration_id)
    ? notes.registration_id
    : null;
}

export async function handleRazorpayWebhook(deps: WebhookDeps, req: WebhookRequest): Promise<WebhookResponse> {
  if (req.rawBody.length > MAX_WEBHOOK_BYTES) return { status: 413, body: { ok: false, result: "too_large" } };
  if (!(await verifyWebhookSignature(deps.webhookSecret, req.rawBody, req.signature))) {
    return { status: 401, body: { ok: false, result: "bad_signature" } };
  }
  let json: unknown;
  try {
    json = JSON.parse(req.rawBody);
  } catch {
    return { status: 400, body: { ok: false, result: "bad_json" } };
  }
  const env = Envelope.safeParse(json);
  if (!env.success) return ignored("malformed");
  const eventId = req.eventId && EVENT_ID.test(req.eventId) ? req.eventId : null;

  if (env.data.event === "order.paid") {
    const p = OrderPaid.safeParse(env.data.payload);
    if (!p.success) return ignored("malformed");
    const order = p.data.order.entity;
    const payment = p.data.payment.entity;
    const registrationId = ourRegistration(order.notes);
    if (!registrationId) return ignored("not_ours");
    if (payment.order_id !== order.id) return ignored("mismatch");
    const res = await confirmVerifiedPayment(
      { creds: deps.creds, fetch: deps.fetch, db: deps.db() },
      {
        registrationId,
        orderId: order.id,
        paymentId: payment.id,
        source: "webhook",
        eventId,
        eventName: "order.paid",
        orderNotes: { source: "stairway", registration_id: registrationId },
      },
    );
    if (res.outcome === "not_captured") return { status: 503, body: { ok: false, result: "not_captured" } };
    return { status: 200, body: { ok: true, result: res.outcome } };
  }

  if (env.data.event === "refund.processed") {
    const p = RefundProcessed.safeParse(env.data.payload);
    if (!p.success) return ignored("malformed");
    const refund = p.data.refund.entity;
    const registrationId = ourRegistration(refund.notes);
    if (!registrationId) return ignored("not_ours");
    const { data, error } = await deps.db().rpc("mark_refunded", {
      p_registration_id: registrationId,
      p_payment_id: refund.payment_id,
      p_refund_id: refund.id,
      p_amount_paise: refund.amount,
      p_source: "webhook",
      p_event_id: eventId ?? undefined,
    });
    if (error) throw new Error(`mark_refunded failed (${error.code ?? "no code"})`);
    const parsed = MarkResult.safeParse(data);
    return { status: 200, body: { ok: true, result: parsed.success ? parsed.data.outcome : "recorded" } };
  }

  return ignored("event_not_handled");
}
```

Create `app/api/payments/webhook/route.ts`:

```ts
import { paymentsConfig } from "@/lib/payments/config";
import { handleRazorpayWebhook, MAX_WEBHOOK_BYTES } from "@/lib/payments/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

// Razorpay webhook (configure: URL https://<host>/api/payments/webhook, events order.paid + refund.processed,
// secret = RAZORPAY_WEBHOOK_SECRET). Only POST is exported, so other methods get 405. Bodies are never logged.

export async function POST(request: Request): Promise<Response> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return new Response(null, { status: 404 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return Response.json({ ok: false, result: "too_large" }, { status: 413 });
  const rawBody = await request.text();
  try {
    const res = await handleRazorpayWebhook(
      {
        webhookSecret: cfg.webhookSecret,
        creds: { keyId: cfg.keyId, keySecret: cfg.keySecret },
        fetch: (url, init) => fetch(url, init),
        db: () => createAdminClient(cfg.serviceRoleKey),
      },
      {
        rawBody,
        signature: request.headers.get("x-razorpay-signature"),
        eventId: request.headers.get("x-razorpay-event-id"),
      },
    );
    return Response.json(res.body, { status: res.status });
  } catch (e) {
    // Name only (never the message: it could carry ids); Razorpay retries on 5xx.
    console.error("razorpay webhook failed:", e instanceof Error ? e.name : "unknown");
    return Response.json({ ok: false, result: "retry" }, { status: 500 });
  }
}
```

In `middleware.ts`, replace the `matcher` with:

```ts
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest|api/payments/webhook|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
```

and add above `export const config` the comment: `// The Razorpay webhook and the cron endpoint carry no session and must stay cheap: no session refresh there.`

Then run `npx next typegen`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/payments tests/auth`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add lib/payments/webhook.ts app/api/payments middleware.ts tests/payments/webhook.test.ts tests/auth/middleware-matcher.test.ts
git commit -m "feat(payments): Razorpay webhook (order.paid, refund.processed) that ignores foreign orders

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Refund helper (behind the flag)

**Files:**
- Create: `lib/payments/refunds.ts`, `tests/payments/refunds.test.ts`

**Interfaces:**
- Consumes: RPCs `claim_refund`, `mark_refunded` (Task 3); `refundPayment`, `RazorpayError`, `FetchLike`, `RazorpayCredentials` (Task 5); `paymentsConfig`, `createAdminClient`.
- Produces (server-only module, **not** a server action — callers must authorise; Phase 5 will call it from a super-admin-only action):
  - `type RefundResult = { ok: true; outcome: "refunded" | "already_refunded"; refundId: string } | { ok: false; reason: "disabled" | "not_found" | "not_refundable" | "in_progress" | "razorpay_error" | "db_error" }`
  - `refundRegistration(deps: { creds: RazorpayCredentials; fetch: FetchLike; db: AdminClient }, registrationId: string): Promise<RefundResult>`
  - `refundRegistrationById(registrationId: string): Promise<RefundResult>` (reads `paymentsConfig()`; `disabled` when off)
- **REVIEW AMENDMENTS:** (M-9) after `claim_refund` succeeds — especially when a previous lease lapsed — first `GET /v1/payments/{payment_id}/refunds` and, if a processed refund for the full amount already exists, record it with `mark_refunded` instead of POSTing a second refund (no double refund after a crashed attempt). (I-3) `mark_refunded` may return `partial_refund` (amount ≠ paid; seat kept); the helper always refunds the full `amount_paise` from `claim_refund` and maps `partial_refund` to `{ ok: false, reason: "razorpay_error" }` so an admin looks at it.

- [ ] **Step 1: Write the failing test**

Create `tests/payments/refunds.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments/config", () => ({ paymentsConfig: vi.fn(() => ({ enabled: false })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { refundRegistration, refundRegistrationById } from "@/lib/payments/refunds";
import type { FetchLike } from "@/lib/payments/razorpay";

const RID = "33333333-3333-4333-8333-333333333333";
const PAY = "pay_P4REF0000001";
const CREDS = { keyId: "rzp_test_ABCDEFGH1234", keySecret: "k_secret_000000" };
type Res = { data: unknown; error: unknown };

function fakeDb(results: Record<string, Res>) {
  const rpc = vi.fn(async (name: string) => results[name] ?? { data: null, error: null });
  return { db: { rpc } as never, rpc };
}
const okRefund = () =>
  vi.fn<FetchLike>(async () => Response.json({ id: "rfnd_P4REF0000001", payment_id: PAY, amount: 19900, status: "processed", notes: {} }));
const claimed = { data: { registration_id: RID, payment_id: PAY, amount_paise: 19900 }, error: null };

describe("refundRegistration", () => {
  it("claims, refunds the full amount with our notes, then records it", async () => {
    const { db, rpc } = fakeDb({ claim_refund: claimed, mark_refunded: { data: { outcome: "refunded", status: "refunded" }, error: null } });
    const f = okRefund();
    expect(await refundRegistration({ creds: CREDS, fetch: f, db }, RID)).toEqual({ ok: true, outcome: "refunded", refundId: "rfnd_P4REF0000001" });
    expect(JSON.parse(String(f.mock.calls[0][1].body))).toEqual({ amount: 19900, speed: "normal", notes: { source: "stairway", registration_id: RID } });
    expect(rpc).toHaveBeenLastCalledWith("mark_refunded", {
      p_registration_id: RID, p_payment_id: PAY, p_refund_id: "rfnd_P4REF0000001", p_amount_paise: 19900, p_source: "refund_api",
    });
  });
  it("maps claim refusals without calling Razorpay", async () => {
    for (const [message, reason] of [
      ["registration_not_found", "not_found"], ["not_refundable", "not_refundable"], ["refund_in_progress", "in_progress"], ["boom", "db_error"],
    ] as const) {
      const { db } = fakeDb({ claim_refund: { data: null, error: { message, code: "P0001" } } });
      const f = okRefund();
      expect(await refundRegistration({ creds: CREDS, fetch: f, db }, RID)).toEqual({ ok: false, reason });
      expect(f).not.toHaveBeenCalled();
    }
    const { db } = fakeDb({});
    expect(await refundRegistration({ creds: CREDS, fetch: okRefund(), db }, "nope")).toEqual({ ok: false, reason: "not_found" });
  });
  it("reports a Razorpay failure (the 2-minute lease then allows a retry) and does not mark anything", async () => {
    const { db, rpc } = fakeDb({ claim_refund: claimed });
    const f = vi.fn<FetchLike>(async () => Response.json({ error: { code: "BAD_REQUEST_ERROR" } }, { status: 400 }));
    expect(await refundRegistration({ creds: CREDS, fetch: f, db }, RID)).toEqual({ ok: false, reason: "razorpay_error" });
    expect(rpc).not.toHaveBeenCalledWith("mark_refunded", expect.anything());
  });
  it("reports db_error if recording fails after Razorpay refunded (the refund.processed webhook records it later)", async () => {
    const { db } = fakeDb({ claim_refund: claimed, mark_refunded: { data: null, error: { message: "x", code: "XX000" } } });
    expect(await refundRegistration({ creds: CREDS, fetch: okRefund(), db }, RID)).toEqual({ ok: false, reason: "db_error" });
  });
});

describe("refundRegistrationById", () => {
  it("does nothing while payments are off", async () => {
    expect(await refundRegistrationById(RID)).toEqual({ ok: false, reason: "disabled" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/payments/refunds.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `lib/payments/refunds.ts`:

```ts
import "server-only";
import { z } from "zod";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { paymentsConfig } from "./config";
import { RazorpayError, refundPayment, type FetchLike, type RazorpayCredentials } from "./razorpay";

// Full refunds initiated from st(AI)rway. NOT a server action (it would be a public endpoint): the Phase 5 admin
// dashboard calls it from a super-admin-only action. Never automatic: a user cancelling a paid seat only sets
// refund_needed. claim_refund takes a 2-minute lease so two admins never both call Razorpay; Razorpay itself refuses
// a second full refund, so a retry after a crash cannot double-refund.

export type RefundResult =
  | { ok: true; outcome: "refunded" | "already_refunded"; refundId: string }
  | { ok: false; reason: "disabled" | "not_found" | "not_refundable" | "in_progress" | "razorpay_error" | "db_error" };

const Claim = z.object({ payment_id: z.string(), amount_paise: z.number().int().positive() });
const Mark = z.object({ outcome: z.string() });
const CLAIM_ERRORS: Record<string, "not_found" | "not_refundable" | "in_progress"> = {
  registration_not_found: "not_found",
  not_refundable: "not_refundable",
  refund_in_progress: "in_progress",
};

export async function refundRegistration(
  deps: { creds: RazorpayCredentials; fetch: FetchLike; db: AdminClient },
  registrationId: string,
): Promise<RefundResult> {
  if (!z.guid().safeParse(registrationId).success) return { ok: false, reason: "not_found" };

  const { data: claimData, error: claimErr } = await deps.db.rpc("claim_refund", { p_registration_id: registrationId });
  if (claimErr) return { ok: false, reason: CLAIM_ERRORS[claimErr.message?.trim() ?? ""] ?? "db_error" };
  const claim = Claim.safeParse(claimData);
  if (!claim.success) return { ok: false, reason: "db_error" };

  let refundId: string;
  try {
    const refund = await refundPayment(deps.creds, deps.fetch, claim.data.payment_id, {
      amountPaise: claim.data.amount_paise,
      notes: { source: "stairway", registration_id: registrationId },
    });
    refundId = refund.id;
  } catch (e) {
    if (e instanceof RazorpayError) return { ok: false, reason: "razorpay_error" };
    throw e;
  }

  const { data, error } = await deps.db.rpc("mark_refunded", {
    p_registration_id: registrationId,
    p_payment_id: claim.data.payment_id,
    p_refund_id: refundId,
    p_amount_paise: claim.data.amount_paise,
    p_source: "refund_api",
  });
  if (error) return { ok: false, reason: "db_error" };
  const mark = Mark.safeParse(data);
  const outcome = mark.success && mark.data.outcome === "already_refunded" ? "already_refunded" : "refunded";
  return { ok: true, outcome, refundId };
}

/** Flag-checked entry point for the (Phase 5) admin action. The caller must already have authorised the admin. */
export async function refundRegistrationById(registrationId: string): Promise<RefundResult> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return { ok: false, reason: "disabled" };
  return refundRegistration(
    {
      creds: { keyId: cfg.keyId, keySecret: cfg.keySecret },
      fetch: (url, init) => fetch(url, init),
      db: createAdminClient(cfg.serviceRoleKey),
    },
    registrationId,
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/payments/refunds.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add lib/payments/refunds.ts tests/payments/refunds.test.ts
git commit -m "feat(payments): leased full-refund helper for the admin dashboard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Fund Easy sync contract + outbox processor

**Files:**
- Create: `lib/sync/contract.ts`, `lib/sync/processor.ts`, `tests/sync/contract.test.ts`, `tests/sync/processor.test.ts`

**Interfaces:**
- Consumes: `hmacSha256Hex` (Task 5), `FetchLike` (Task 5), `AdminClient` (Task 5), RPCs `claim_sync_batch` / `complete_sync` and the payload shape from Task 4.
- Produces:
  - `contract.ts`: `CONTRACT_VERSION = 1`; `SYNC_EVENT_TYPES`; `type SyncEventType`; `interface OutboxRow { id: string; event_type: SyncEventType; idempotency_key: string; payload: Record<string, unknown>; attempts: number; created_at: string }`; `interface SyncEnvelope { contract_version: 1; id: string; idempotency_key: string; type: SyncEventType; occurred_at: string; source: "stairway"; data: Record<string, unknown> }`; header names `SIGNATURE_HEADER = "x-stairway-signature"`, `TIMESTAMP_HEADER = "x-stairway-timestamp"`, `IDEMPOTENCY_HEADER = "idempotency-key"`; `buildEnvelope(row): SyncEnvelope`; `signBody(secret, timestampSeconds, body): Promise<string>` → `"v1=<hex>"` over `` `${timestamp}.${body}` ``; `buildSyncRequest(secret, envelope, nowMs): Promise<RequestInit>`; `type DeliveryOutcome = { ok: true } | { ok: false; permanent: boolean; error: string }`; `classifyResponse(status: number, bodyText: string): DeliveryOutcome`.
  - `processor.ts`: `interface ProcessReport { claimed; sent; failed; dead; skipped }` (numbers); `processOutbox(deps: { db: AdminClient; fetch: FetchLike; url: string; secret: string; now?: () => number; budgetMs?: number; limit?: number }): Promise<ProcessReport>` (defaults: limit 10, budget 20 000 ms, per-request timeout 5 000 ms; throws if the claim RPC fails).

- [ ] **Step 1: Write the failing tests**

Create `tests/sync/contract.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildEnvelope, buildSyncRequest, classifyResponse, CONTRACT_VERSION, IDEMPOTENCY_HEADER, signBody,
  SIGNATURE_HEADER, TIMESTAMP_HEADER, type OutboxRow,
} from "@/lib/sync/contract";

const SECRET = "s".repeat(32);
const ROW: OutboxRow = {
  id: "55555555-5555-4555-8555-555555555555",
  event_type: "registration.confirmed",
  idempotency_key: "33333333-3333-4333-8333-333333333333:registration.confirmed:1760000000000000",
  payload: { registration: { id: "33333333-3333-4333-8333-333333333333", status: "confirmed" }, event: { slug: "seeing-machines" } },
  attempts: 1,
  created_at: "2026-10-10T10:00:00+00:00",
};

describe("envelope", () => {
  it("wraps the outbox payload in contract v1", () => {
    expect(CONTRACT_VERSION).toBe(1);
    expect(buildEnvelope(ROW)).toEqual({
      contract_version: 1, id: ROW.id, idempotency_key: ROW.idempotency_key, type: "registration.confirmed",
      occurred_at: ROW.created_at, source: "stairway", data: ROW.payload,
    });
  });
});

describe("signing", () => {
  it("signs `${timestamp}.${body}` with HMAC-SHA256 as v1=<hex>", async () => {
    const body = JSON.stringify(buildEnvelope(ROW));
    const expected = `v1=${createHmac("sha256", SECRET).update(`1760000000.${body}`).digest("hex")}`;
    expect(await signBody(SECRET, 1760000000, body)).toBe(expected);
  });
  it("builds a POST with the exact signed body and headers", async () => {
    const env = buildEnvelope(ROW);
    const init = await buildSyncRequest(SECRET, env, 1760000000500);
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe("POST");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers[TIMESTAMP_HEADER]).toBe("1760000000");
    expect(headers[IDEMPOTENCY_HEADER]).toBe(ROW.idempotency_key);
    expect(headers[SIGNATURE_HEADER]).toBe(await signBody(SECRET, 1760000000, String(init.body)));
    expect(JSON.parse(String(init.body))).toEqual(env);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("classifyResponse", () => {
  it("treats 2xx as delivered", () => {
    for (const s of [200, 201, 202, 204]) expect(classifyResponse(s, "")).toEqual({ ok: true });
  });
  it("retries timeouts, rate limits, server errors and auth failures (fixable configuration)", () => {
    for (const s of [401, 403, 408, 425, 429, 500, 502, 503, 504]) {
      expect(classifyResponse(s, "")).toMatchObject({ ok: false, permanent: false });
    }
  });
  it("dead-letters other client errors", () => {
    for (const s of [400, 404, 409, 410, 413, 422]) expect(classifyResponse(s, "")).toMatchObject({ ok: false, permanent: true });
  });
  it("keeps only the status and a short error code from the body", () => {
    expect(classifyResponse(422, '{"error":"conflict_existing_order","detail":"asha@example.com"}'))
      .toEqual({ ok: false, permanent: true, error: "HTTP 422 conflict_existing_order" });
    expect(classifyResponse(500, "<html>stack trace with secrets</html>")).toEqual({ ok: false, permanent: false, error: "HTTP 500" });
    expect(classifyResponse(400, `{"error":"${"x".repeat(200)}"}`).ok).toBe(false);
    expect((classifyResponse(400, `{"error":"${"x".repeat(200)}"}`) as { error: string }).error.length).toBeLessThanOrEqual(80);
  });
});
```

Create `tests/sync/processor.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { processOutbox } from "@/lib/sync/processor";
import type { FetchLike } from "@/lib/payments/razorpay";

const URL_ = "https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync";
const SECRET = "s".repeat(32);
const row = (n: number, type = "registration.confirmed") => ({
  id: `55555555-5555-4555-8555-55555555555${n}`, event_type: type, idempotency_key: `k${n}`,
  payload: { registration: { id: `r${n}` } }, attempts: 1, created_at: "2026-10-10T10:00:00+00:00",
});

function fakeDb(batch: unknown, claimError: unknown = null) {
  const completes: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_sync_batch") return { data: batch, error: claimError };
    completes.push(args);
    return { data: args.p_ok ? "sent" : args.p_permanent ? "dead" : "failed", error: null };
  });
  return { db: { rpc } as never, rpc, completes };
}

describe("processOutbox", () => {
  it("does nothing for an empty batch", async () => {
    const { db } = fakeDb([]);
    const f = vi.fn<FetchLike>();
    expect(await processOutbox({ db, fetch: f, url: URL_, secret: SECRET })).toEqual({ claimed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 });
    expect(f).not.toHaveBeenCalled();
  });
  it("posts each claimed row in order and completes it by outcome", async () => {
    const { db, rpc, completes } = fakeDb([row(1), row(2, "registration.cancelled"), row(3, "payment.refunded"), row(4)]);
    const statuses = [200, 503, 422];
    const f = vi.fn<FetchLike>(async () => {
      const s = statuses.shift();
      if (s === undefined) throw new TypeError("fetch failed");
      return new Response(s === 422 ? '{"error":"conflict_existing_order"}' : "{}", { status: s });
    });
    const report = await processOutbox({ db, fetch: f, url: URL_, secret: SECRET });
    expect(report).toEqual({ claimed: 4, sent: 1, failed: 2, dead: 1, skipped: 0 });
    expect(rpc).toHaveBeenNthCalledWith(1, "claim_sync_batch", { p_limit: 10 });
    expect(f.mock.calls.map((c) => JSON.parse(String(c[1].body)).idempotency_key)).toEqual(["k1", "k2", "k3", "k4"]);
    expect(f.mock.calls[0][0]).toBe(URL_);
    expect(completes).toEqual([
      { p_id: row(1).id, p_ok: true, p_permanent: false, p_error: undefined },
      { p_id: row(2).id, p_ok: false, p_permanent: false, p_error: "HTTP 503" },
      { p_id: row(3).id, p_ok: false, p_permanent: true, p_error: "HTTP 422 conflict_existing_order" },
      { p_id: row(4).id, p_ok: false, p_permanent: false, p_error: "network" },
    ]);
  });
  it("stops sending when the time budget is spent (leased rows come back after 2 minutes)", async () => {
    const { db, completes } = fakeDb([row(1), row(2), row(3)]);
    let t = 0;
    const now = () => t;
    const f = vi.fn<FetchLike>(async () => {
      t += 15_000;
      return new Response("{}", { status: 200 });
    });
    const report = await processOutbox({ db, fetch: f, url: URL_, secret: SECRET, now, budgetMs: 20_000 });
    expect(report).toMatchObject({ claimed: 3, sent: 2, skipped: 1 });
    expect(completes).toHaveLength(2);
  });
  it("throws when the claim fails and ignores a malformed batch row", async () => {
    await expect(processOutbox({ db: fakeDb(null, { code: "XX000", message: "x" }).db, fetch: vi.fn<FetchLike>(), url: URL_, secret: SECRET }))
      .rejects.toThrow(/claim_sync_batch/);
    await expect(processOutbox({ db: fakeDb([{ id: "nope" }]).db, fetch: vi.fn<FetchLike>(), url: URL_, secret: SECRET }))
      .rejects.toThrow(/unexpected/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/sync`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

Create `lib/sync/contract.ts`:

```ts
import { hmacSha256Hex } from "@/lib/payments/crypto";

// st(AI)rway -> Fund Easy outbound sync, contract version 1 (docs/integrations/fund-easy-sync.md is the spec the
// receiving endpoint implements). Every request: POST JSON envelope, signed with HMAC-SHA256 over
// `${timestamp}.${rawBody}` using STAIRWAY_SYNC_SECRET; the receiver rejects timestamps more than 5 minutes off.

export const CONTRACT_VERSION = 1 as const;
export const SYNC_EVENT_TYPES = ["registration.confirmed", "registration.cancelled", "payment.refunded"] as const;
export type SyncEventType = (typeof SYNC_EVENT_TYPES)[number];

export const SIGNATURE_HEADER = "x-stairway-signature";
export const TIMESTAMP_HEADER = "x-stairway-timestamp";
export const IDEMPOTENCY_HEADER = "idempotency-key";
const REQUEST_TIMEOUT_MS = 5000;

export interface OutboxRow {
  id: string;
  event_type: SyncEventType;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
}

export interface SyncEnvelope {
  contract_version: typeof CONTRACT_VERSION;
  /** Outbox row id: the same on every retry of this message. */
  id: string;
  idempotency_key: string;
  type: SyncEventType;
  occurred_at: string;
  source: "stairway";
  data: Record<string, unknown>;
}

export function buildEnvelope(row: OutboxRow): SyncEnvelope {
  return {
    contract_version: CONTRACT_VERSION,
    id: row.id,
    idempotency_key: row.idempotency_key,
    type: row.event_type,
    occurred_at: row.created_at,
    source: "stairway",
    data: row.payload,
  };
}

export async function signBody(secret: string, timestampSeconds: number, body: string): Promise<string> {
  return `v1=${await hmacSha256Hex(secret, `${timestampSeconds}.${body}`)}`;
}

export async function buildSyncRequest(secret: string, envelope: SyncEnvelope, nowMs: number): Promise<RequestInit> {
  const body = JSON.stringify(envelope);
  const ts = Math.floor(nowMs / 1000);
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "stairway-sync/1",
      [TIMESTAMP_HEADER]: String(ts),
      [SIGNATURE_HEADER]: await signBody(secret, ts, body),
      [IDEMPOTENCY_HEADER]: envelope.idempotency_key,
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

export type DeliveryOutcome = { ok: true } | { ok: false; permanent: boolean; error: string };

/** 401/403 are retried: they mean a secret or clock problem we can fix without losing the message. */
const TRANSIENT_4XX = new Set([401, 403, 408, 425, 429]);
const CODE = /^[a-z0-9_.-]{1,60}$/i;

export function classifyResponse(status: number, bodyText: string): DeliveryOutcome {
  if (status >= 200 && status < 300) return { ok: true };
  let code = "";
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown };
    if (typeof parsed?.error === "string" && CODE.test(parsed.error)) code = ` ${parsed.error}`;
  } catch {
    // Not JSON: keep only the status.
  }
  const error = `HTTP ${status}${code}`;
  const permanent = status >= 400 && status < 500 && !TRANSIENT_4XX.has(status);
  return { ok: false, permanent, error };
}
```

Create `lib/sync/processor.ts`:

```ts
import { z } from "zod";
import type { FetchLike } from "@/lib/payments/razorpay";
import type { AdminClient } from "@/lib/supabase/admin";
import { buildEnvelope, buildSyncRequest, classifyResponse, SYNC_EVENT_TYPES, type DeliveryOutcome } from "./contract";

// Drains the Fund Easy outbox: claim (≤ 10 rows, 2-minute lease) -> signed POST -> complete. Bounded by a wall-clock
// budget so a cron tick stays short; rows left over keep their lease and are claimed again after it lapses.
// Never blocks registration or payment: it only runs from the cron tick.

export interface ProcessReport {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
  skipped: number;
}

const Batch = z.array(
  z.object({
    id: z.guid(),
    event_type: z.enum(SYNC_EVENT_TYPES),
    idempotency_key: z.string().min(1).max(200),
    payload: z.record(z.string(), z.unknown()),
    attempts: z.number().int(),
    created_at: z.string(),
  }),
);

export async function processOutbox(deps: {
  db: AdminClient;
  fetch: FetchLike;
  url: string;
  secret: string;
  now?: () => number;
  budgetMs?: number;
  limit?: number;
}): Promise<ProcessReport> {
  const now = deps.now ?? Date.now;
  const start = now();
  const budget = deps.budgetMs ?? 20_000;
  const report: ProcessReport = { claimed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 };

  const { data, error } = await deps.db.rpc("claim_sync_batch", { p_limit: deps.limit ?? 10 });
  if (error) throw new Error(`claim_sync_batch failed (${error.code ?? "no code"})`);
  const batch = Batch.safeParse(data);
  if (!batch.success) throw new Error("claim_sync_batch returned an unexpected shape");
  report.claimed = batch.data.length;

  for (const row of batch.data) {
    if (now() - start >= budget) {
      report.skipped++;
      continue;
    }
    let outcome: DeliveryOutcome;
    try {
      const init = await buildSyncRequest(deps.secret, buildEnvelope(row), now());
      const res = await deps.fetch(deps.url, init);
      outcome = classifyResponse(res.status, await res.text().catch(() => ""));
    } catch (e) {
      outcome = { ok: false, permanent: false, error: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network" };
    }
    const { data: status, error: completeError } = await deps.db.rpc("complete_sync", {
      p_id: row.id,
      p_ok: outcome.ok,
      p_permanent: !outcome.ok && outcome.permanent,
      p_error: outcome.ok ? undefined : outcome.error,
    });
    if (completeError || status === "failed") report.failed++;
    else if (status === "sent") report.sent++;
    else if (status === "dead") report.dead++;
    else report.failed++;
  }
  return report;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/sync`
Expected: PASS.

- [ ] **Step 5: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add lib/sync tests/sync
git commit -m "feat(sync): signed Fund Easy contract v1 and outbox processor with backoff classification

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Cron tick route + custom worker `scheduled` handler

**Files:**
- Create: `lib/cron/request.ts`, `lib/cron/tick.ts`, `app/api/cron/tick/route.ts`, `cloudflare/worker.ts`
- Create: `tests/cron/request.test.ts`, `tests/cron/tick.test.ts`, `tests/cron/route.test.ts`
- Modify: `wrangler.jsonc`, `tsconfig.json` (exclude `cloudflare`), `eslint.config.mjs` (ignore `cloudflare/**`), `cloudflare-env.d.ts` (regenerated)

**Interfaces:**
- Consumes: `paymentsConfig`, `syncConfig`, `cronSecret` (Task 5), `timingSafeEqualHex` (Task 5), `createAdminClient`, RPC `expire_holds` (Task 3), `processOutbox` (Task 10).
- Produces:
  - `lib/cron/request.ts` (no imports, bundled into the worker entry): `CRON_PATH = "/api/cron/tick"`; `interface CronEnv { CRON_SECRET?: string; PAYMENTS_ENABLED?: string; FUND_EASY_SYNC_ENABLED?: string }`; `cronEnabled(env: CronEnv): boolean`; `cronRequest(env: CronEnv, origin?: string): Request`.
  - `lib/cron/tick.ts`: `interface TickReport { holds: { events: number; expired: number; promoted: number } | null; sync: ProcessReport | null; errors: string[] }`; `runTick(deps: { payments: boolean; sync: { url: string; secret: string } | null; db: () => AdminClient; fetch: FetchLike; now?: () => number }): Promise<TickReport>`.
  - `POST /api/cron/tick` — `Authorization: Bearer <CRON_SECRET>`; 404 without a configured secret, 401 on a wrong one; JSON counts only (no ids, no personal data); 500 when a step failed.
  - Worker: `scheduled()` every 5 minutes (`triggers.crons = ["*/5 * * * *"]`), returning at once unless `CRON_SECRET` and a feature flag are set.

- [ ] **Step 1: Write the failing tests**

Create `tests/cron/request.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CRON_PATH, cronEnabled, cronRequest } from "@/lib/cron/request";

const SECRET = "c".repeat(32);

describe("cronEnabled", () => {
  it("needs a 32+ character secret and at least one feature flag", () => {
    expect(cronEnabled({ CRON_SECRET: SECRET, PAYMENTS_ENABLED: "true" })).toBe(true);
    expect(cronEnabled({ CRON_SECRET: SECRET, FUND_EASY_SYNC_ENABLED: "true" })).toBe(true);
    expect(cronEnabled({ CRON_SECRET: SECRET })).toBe(false);
    expect(cronEnabled({ CRON_SECRET: "short", PAYMENTS_ENABLED: "true" })).toBe(false);
    expect(cronEnabled({ PAYMENTS_ENABLED: "true" })).toBe(false);
    expect(cronEnabled({ CRON_SECRET: SECRET, PAYMENTS_ENABLED: "TRUE" })).toBe(false);
  });
});

describe("cronRequest", () => {
  it("is an authenticated POST to the tick route", () => {
    const r = cronRequest({ CRON_SECRET: SECRET });
    expect(r.method).toBe("POST");
    expect(new URL(r.url).pathname).toBe(CRON_PATH);
    expect(r.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
  });
});
```

Create `tests/cron/tick.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runTick } from "@/lib/cron/tick";
import type { FetchLike } from "@/lib/payments/razorpay";

function fakeDb(results: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn(async (name: string) => results[name] ?? { data: null, error: null });
  const factory = vi.fn(() => ({ rpc }) as never);
  return { factory, rpc };
}
const SYNC = { url: "https://fe.example/functions/v1/external-sync", secret: "s".repeat(32) };

describe("runTick", () => {
  it("does nothing (not even a DB client) when nothing is enabled", async () => {
    const { factory } = fakeDb({});
    expect(await runTick({ payments: false, sync: null, db: factory, fetch: vi.fn<FetchLike>() }))
      .toEqual({ holds: null, sync: null, errors: [] });
    expect(factory).not.toHaveBeenCalled();
  });
  it("expires holds when payments are on", async () => {
    const { factory, rpc } = fakeDb({ expire_holds: { data: { events: 2, expired: 3, promoted: 1 }, error: null } });
    const r = await runTick({ payments: true, sync: null, db: factory, fetch: vi.fn<FetchLike>() });
    expect(r).toEqual({ holds: { events: 2, expired: 3, promoted: 1 }, sync: null, errors: [] });
    expect(rpc).toHaveBeenCalledWith("expire_holds", { p_limit: 50 });
    expect(rpc).not.toHaveBeenCalledWith("claim_sync_batch", expect.anything());
  });
  it("drains the outbox when sync is on, and keeps going after a failed step", async () => {
    const { factory } = fakeDb({
      expire_holds: { data: null, error: { code: "57014", message: "timeout" } },
      claim_sync_batch: { data: [], error: null },
    });
    const r = await runTick({ payments: true, sync: SYNC, db: factory, fetch: vi.fn<FetchLike>() });
    expect(r.errors).toEqual(["expire_holds:57014"]);
    expect(r.sync).toEqual({ claimed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 });
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it("reports a failed sync claim without throwing", async () => {
    const { factory } = fakeDb({ claim_sync_batch: { data: null, error: { code: "XX000", message: "x" } } });
    const r = await runTick({ payments: false, sync: SYNC, db: factory, fetch: vi.fn<FetchLike>() });
    expect(r.errors).toEqual(["sync:Error"]);
  });
});
```

Create `tests/cron/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/payments/config", () => ({ cronSecret: vi.fn(), paymentsConfig: vi.fn(), syncConfig: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ rpc: vi.fn() })) }));
vi.mock("@/lib/cron/tick", () => ({ runTick: vi.fn() }));

import { cronSecret, paymentsConfig, syncConfig } from "@/lib/payments/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTick } from "@/lib/cron/tick";
import { POST } from "@/app/api/cron/tick/route";

const SECRET = "c".repeat(32);
const call = (auth?: string) =>
  POST(new Request("https://stairway.internal/api/cron/tick", { method: "POST", headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cronSecret).mockReturnValue(SECRET);
  vi.mocked(paymentsConfig).mockReturnValue({ enabled: false });
  vi.mocked(syncConfig).mockReturnValue({ enabled: false });
  vi.mocked(runTick).mockResolvedValue({ holds: null, sync: null, errors: [] });
});

describe("POST /api/cron/tick", () => {
  it("is not found without a configured secret and unauthorised with a wrong one", async () => {
    vi.mocked(cronSecret).mockReturnValueOnce(null);
    expect((await call(`Bearer ${SECRET}`)).status).toBe(404);
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${"x".repeat(32)}`)).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401);
    expect(runTick).not.toHaveBeenCalled();
  });
  it("skips when nothing is enabled", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: true });
    expect(runTick).not.toHaveBeenCalled();
  });
  it("runs the tick with the service-role key and returns counts only", async () => {
    vi.mocked(paymentsConfig).mockReturnValue({
      enabled: true, keyId: "rzp_test_ABCDEFGH1234", keySecret: "k".repeat(16), webhookSecret: "w".repeat(16), serviceRoleKey: "srk_" + "x".repeat(20),
    });
    vi.mocked(syncConfig).mockReturnValue({ enabled: true, url: "https://fe.example/x", secret: "s".repeat(32), serviceRoleKey: "srk_" + "x".repeat(20) });
    vi.mocked(runTick).mockResolvedValue({ holds: { events: 1, expired: 1, promoted: 0 }, sync: null, errors: [] });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, holds: { events: 1, expired: 1, promoted: 0 }, sync: null, errors: [] });
    const deps = vi.mocked(runTick).mock.calls[0][0];
    expect(deps.payments).toBe(true);
    expect(deps.sync).toEqual({ url: "https://fe.example/x", secret: "s".repeat(32) });
    deps.db();
    expect(createAdminClient).toHaveBeenCalledWith("srk_" + "x".repeat(20));
  });
  it("answers 500 when a step failed", async () => {
    vi.mocked(syncConfig).mockReturnValue({ enabled: true, url: "https://fe.example/x", secret: "s".repeat(32), serviceRoleKey: "srk_" + "x".repeat(20) });
    vi.mocked(runTick).mockResolvedValue({ holds: null, sync: null, errors: ["sync:Error"] });
    expect((await call(`Bearer ${SECRET}`)).status).toBe(500);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/cron`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

Create `lib/cron/request.ts`:

```ts
// Shared by the Next route and the custom worker entry (cloudflare/worker.ts), so it imports nothing.

export const CRON_PATH = "/api/cron/tick";

export interface CronEnv {
  CRON_SECRET?: string;
  PAYMENTS_ENABLED?: string;
  FUND_EASY_SYNC_ENABLED?: string;
}

/** Checked in scheduled() before Next is touched, so an idle tick costs almost no CPU. */
export function cronEnabled(env: CronEnv): boolean {
  const secretOk = typeof env.CRON_SECRET === "string" && env.CRON_SECRET.trim().length >= 32;
  return secretOk && (env.PAYMENTS_ENABLED === "true" || env.FUND_EASY_SYNC_ENABLED === "true");
}

/** In-process request to the tick route (handled by the same Worker; the host is never resolved). */
export function cronRequest(env: CronEnv, origin = "https://stairway.internal"): Request {
  return new Request(new URL(CRON_PATH, origin), {
    method: "POST",
    headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}`, "x-stairway-cron": "1" },
  });
}
```

Create `lib/cron/tick.ts`:

```ts
import { z } from "zod";
import type { FetchLike } from "@/lib/payments/razorpay";
import type { AdminClient } from "@/lib/supabase/admin";
import { processOutbox, type ProcessReport } from "@/lib/sync/processor";

// One cron tick: release expired holds + promote waitlists (payments on), then drain the Fund Easy outbox (sync on).
// Each step is isolated: a failure is reported (name/code only) and the next step still runs.

export interface TickReport {
  holds: { events: number; expired: number; promoted: number } | null;
  sync: ProcessReport | null;
  errors: string[];
}

const Holds = z.object({ events: z.number().int(), expired: z.number().int(), promoted: z.number().int() });

export async function runTick(deps: {
  payments: boolean;
  sync: { url: string; secret: string } | null;
  db: () => AdminClient;
  fetch: FetchLike;
  now?: () => number;
}): Promise<TickReport> {
  const report: TickReport = { holds: null, sync: null, errors: [] };
  if (!deps.payments && !deps.sync) return report;
  const db = deps.db();

  if (deps.payments) {
    const { data, error } = await db.rpc("expire_holds", { p_limit: 50 });
    const parsed = Holds.safeParse(data);
    if (error) report.errors.push(`expire_holds:${error.code ?? "error"}`);
    else if (!parsed.success) report.errors.push("expire_holds:shape");
    else report.holds = parsed.data;
  }

  if (deps.sync) {
    try {
      report.sync = await processOutbox({ db, fetch: deps.fetch, url: deps.sync.url, secret: deps.sync.secret, now: deps.now });
    } catch (e) {
      report.errors.push(`sync:${e instanceof Error ? e.name : "error"}`);
    }
  }
  return report;
}
```

Create `app/api/cron/tick/route.ts`:

```ts
import { runTick } from "@/lib/cron/tick";
import { cronSecret, paymentsConfig, syncConfig } from "@/lib/payments/config";
import { timingSafeEqualHex } from "@/lib/payments/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Called every 5 minutes by the Worker's scheduled() handler (cloudflare/worker.ts) with the CRON_SECRET bearer token;
// can also be called manually (curl) for a one-off run. Responds with counts only.

export async function POST(request: Request): Promise<Response> {
  const secret = cronSecret();
  if (!secret) return new Response(null, { status: 404 });
  const auth = request.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!timingSafeEqualHex(given, secret)) return Response.json({ ok: false }, { status: 401 });

  const pay = paymentsConfig();
  const sync = syncConfig();
  const serviceRoleKey = pay.enabled ? pay.serviceRoleKey : sync.enabled ? sync.serviceRoleKey : null;
  if (!serviceRoleKey) return Response.json({ ok: true, skipped: true });

  const report = await runTick({
    payments: pay.enabled,
    sync: sync.enabled ? { url: sync.url, secret: sync.secret } : null,
    db: () => createAdminClient(serviceRoleKey),
    fetch: (url, init) => fetch(url, init),
  });
  return Response.json({ ok: report.errors.length === 0, ...report }, { status: report.errors.length ? 500 : 200 });
}
```

Create `cloudflare/worker.ts`:

```ts
// Custom Worker entry (OpenNext "custom worker" pattern). `opennextjs-cloudflare build` generates .open-next/worker.js
// (default export { fetch } plus Durable Object classes); this file re-uses its fetch handler unchanged and adds the
// Cron Trigger. Wrangler bundles it (wrangler.jsonc "main"). Excluded from tsc/eslint: .open-next exists only after
// a build. scheduled() returns at once unless a feature flag and CRON_SECRET are set, so idle ticks cost ~0 CPU.
// @ts-expect-error generated at build time
import handler from "../.open-next/worker.js";
import { cronEnabled, cronRequest, type CronEnv } from "../lib/cron/request";

// @ts-expect-error generated at build time
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch: handler.fetch,
  async scheduled(_controller: unknown, env: CronEnv, ctx: Ctx) {
    if (!cronEnabled(env)) return;
    ctx.waitUntil(
      handler.fetch(cronRequest(env), env, ctx).then((res: Response) => {
        if (!res.ok) console.error("cron tick failed:", res.status);
      }),
    );
  },
};
```

Modify `wrangler.jsonc`: change `"main": ".open-next/worker.js"` to `"main": "cloudflare/worker.ts"` and add after `"observability"`:

```jsonc
  "triggers": { "crons": ["*/5 * * * *"] },
```

Modify `tsconfig.json`: change `"exclude": ["node_modules"]` to `"exclude": ["node_modules", "cloudflare"]`.

Modify `eslint.config.mjs`: add `"cloudflare/**",` to the `globalIgnores([...])` list (after `".wrangler/**",`).

Then:

```bash
npx next typegen
npm run cf-typegen
```

(`cf-typegen` regenerates `cloudflare-env.d.ts` for the new trigger; commit the regenerated file.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/cron`
Expected: PASS.

- [ ] **Step 5: Verify the Worker bundles with the custom entry (no deploy)**

Make sure no `next dev` / `workerd` process holds `.open-next` (stop the preview server if one runs), then:

```bash
npx opennextjs-cloudflare build
npx wrangler deploy --dry-run --outdir ../stairway-dryrun
```

Expected: build succeeds; the dry run prints `Total Upload: … / gzip: …` and lists the cron trigger `*/5 * * * *`. Record the gzip size in `.superpowers/sdd/progress.md` (Free plan cap is 3 072 KiB; Paid is 10 MiB). Then delete `../stairway-dryrun`. If the dry run reports that `.open-next/worker.js` has no export named `DOShardedTagCache` / `BucketCachePurge` / `DOQueueHandler`, remove that name from the re-export line in `cloudflare/worker.ts` (OpenNext only emits the ones it generated) and re-run.

- [ ] **Step 6: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add lib/cron app/api/cron cloudflare wrangler.jsonc tsconfig.json eslint.config.mjs cloudflare-env.d.ts tests/cron
git commit -m "feat(cron): 5-minute Cron Trigger for hold expiry and Fund Easy sync

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Checkout UI on the registration page and event CTA

**Files:**
- Create: `lib/payments/checkout.ts`, `lib/payments/flow.ts`, `components/payments/usePayFlow.ts`, `components/payments/PayButton.tsx`, `tests/payments/checkout.test.ts`, `tests/payments/flow.test.ts`
- Modify: `components/registration/RegistrationForm.tsx`, `app/events/[slug]/register/page.tsx`, `app/events/[slug]/page.tsx`

**Interfaces:**
- Consumes: `CheckoutData`, `CreateOrderResult`, `VerifyResult`, `createPaymentOrder`, `verifyPayment` (Task 7); `ORDER_ID`, `PAYMENT_ID` (Task 5); `formatInr` (Task 5); `ctaState` with `paymentsEnabled` and the `pay` state (Task 6); `paymentsConfig` (Task 5); `track` (`lib/analytics.ts`); `ErrorPanel`; `ticketPath`.
- Produces:
  - `checkout.ts` (browser): `CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js"`; `type CheckoutOutcome = { kind: "paid"; orderId: string; paymentId: string; signature: string } | { kind: "dismissed" } | { kind: "unavailable" }`; `parseCheckoutSuccess(v: unknown): { orderId; paymentId; signature } | null`; `checkoutOptions(data: CheckoutData, handlers: { onSuccess(r: unknown): void; onDismiss(): void }): Record<string, unknown>`; `loadCheckoutScript(host?): Promise<boolean>` (one `<script>` per page, injected on demand only when a payment starts); `openCheckout(data: CheckoutData): Promise<CheckoutOutcome>`; `resetCheckoutLoader()` (tests).
  - `flow.ts`: `type FlowStep = { kind: "navigate"; href: string } | { kind: "error"; error: RegistrationError }`; `afterCheckout(kind: CheckoutOutcome["kind"], abandonTo: string | null): FlowStep | null`; `afterVerify(res: VerifyResult, ticketHref: string): FlowStep`.
  - `usePayFlow(opts: { step: number; abandonTo?: (registrationId: string) => string }): { pay(registrationId: string): Promise<void>; phase: "idle" | "creating" | "checkout" | "verifying"; busy: boolean; error: RegistrationError | null }`.
  - `<PayButton registrationId amountPaise step here />` (client).
  - `RegistrationForm` prop `paid?: { pricePaise: number; step: number }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/payments/checkout.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_SRC, checkoutOptions, loadCheckoutScript, parseCheckoutSuccess, resetCheckoutLoader } from "@/lib/payments/checkout";
import type { CheckoutData } from "@/lib/payments/actions";

const DATA: CheckoutData = {
  keyId: "rzp_test_ABCDEFGH1234", orderId: "order_P4UI00000001", amountPaise: 19900, currency: "INR", name: "st(AI)rway",
  description: "Seeing Machines", prefill: { name: "Asha", email: "asha@example.com" },
  notes: { source: "stairway", registration_id: "33333333-3333-4333-8333-333333333333" },
  holdExpiresAt: "2026-10-10T10:15:00Z", registrationId: "33333333-3333-4333-8333-333333333333",
};

type FakeScript = { src: string; async: boolean; onload?: () => void; onerror?: () => void; remove: () => void };
function fakeHost() {
  const scripts: FakeScript[] = [];
  const host = {
    document: {
      createElement: () => ({ src: "", async: false, remove: vi.fn() }) as FakeScript,
      head: { appendChild: (s: FakeScript) => (scripts.push(s), s) },
    },
  };
  return { host: host as never, scripts };
}

afterEach(() => resetCheckoutLoader());

describe("checkoutOptions", () => {
  it("passes only server-provided values, our notes and the handlers", () => {
    const onSuccess = vi.fn();
    const onDismiss = vi.fn();
    const o = checkoutOptions(DATA, { onSuccess, onDismiss });
    expect(o).toMatchObject({
      key: DATA.keyId, order_id: DATA.orderId, amount: 19900, currency: "INR", name: "st(AI)rway", description: "Seeing Machines",
      prefill: { name: "Asha", email: "asha@example.com" }, notes: DATA.notes,
    });
    expect(o.handler).toBe(onSuccess);
    expect((o.modal as { ondismiss: unknown }).ondismiss).toBe(onDismiss);
    expect(JSON.stringify(o)).not.toContain("secret");
  });
});

describe("parseCheckoutSuccess", () => {
  it("accepts Razorpay's success payload and rejects anything else", () => {
    const ok = { razorpay_payment_id: "pay_P4UI00000001", razorpay_order_id: "order_P4UI00000001", razorpay_signature: "a".repeat(64) };
    expect(parseCheckoutSuccess(ok)).toEqual({ paymentId: "pay_P4UI00000001", orderId: "order_P4UI00000001", signature: "a".repeat(64) });
    expect(parseCheckoutSuccess({ ...ok, razorpay_signature: "nope" })).toBeNull();
    expect(parseCheckoutSuccess(null)).toBeNull();
  });
});

describe("loadCheckoutScript", () => {
  it("injects checkout.js once and resolves when it loads", async () => {
    const { host, scripts } = fakeHost();
    const a = loadCheckoutScript(host);
    const b = loadCheckoutScript(host);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(CHECKOUT_SRC);
    scripts[0].onload?.();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
  });
  it("resolves false on a load error and lets a later attempt retry", async () => {
    const { host, scripts } = fakeHost();
    const a = loadCheckoutScript(host);
    scripts[0].onerror?.();
    expect(await a).toBe(false);
    expect(scripts[0].remove).toHaveBeenCalled();
    void loadCheckoutScript(host);
    expect(scripts).toHaveLength(2);
  });
  it("does not inject anything when Razorpay is already present", async () => {
    const { host, scripts } = fakeHost();
    expect(await loadCheckoutScript({ ...(host as object), Razorpay: function () {} } as never)).toBe(true);
    expect(scripts).toHaveLength(0);
  });
});
```

Create `tests/payments/flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { afterCheckout, afterVerify } from "@/lib/payments/flow";
import { registrationError } from "@/lib/registration/errors";

const T = "/me/tickets/33333333-3333-4333-8333-333333333333";

describe("afterCheckout", () => {
  it("continues after a payment", () => expect(afterCheckout("paid", null)).toBeNull());
  it("shows a retryable error on the page that owns the flow", () => {
    expect(afterCheckout("dismissed", null)).toEqual({ kind: "error", error: registrationError("payment_cancelled") });
    expect(afterCheckout("unavailable", null)).toEqual({ kind: "error", error: registrationError("checkout_unavailable") });
  });
  it("moves to the ticket page (Complete payment + countdown) when the form opened Checkout", () => {
    expect(afterCheckout("dismissed", `${T}?new=1`)).toEqual({ kind: "navigate", href: `${T}?new=1` });
  });
});

describe("afterVerify", () => {
  it("goes to the ticket for every success and for outcomes the ticket page explains", () => {
    expect(afterVerify({ ok: true, status: "confirmed" }, T)).toEqual({ kind: "navigate", href: `${T}?paid=1` });
    expect(afterVerify({ ok: true, status: "processing" }, T)).toEqual({ kind: "navigate", href: `${T}?paid=1` });
    expect(afterVerify({ ok: false, error: registrationError("payment_processing") }, T)).toEqual({ kind: "navigate", href: `${T}?paid=1` });
    expect(afterVerify({ ok: false, error: registrationError("payment_review") }, T).kind).toBe("navigate");
  });
  it("stays to show errors with another recovery", () => {
    expect(afterVerify({ ok: false, error: registrationError("not_signed_in") }, T)).toEqual({ kind: "error", error: registrationError("not_signed_in") });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/payments/checkout.test.ts tests/payments/flow.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the browser modules**

Create `lib/payments/checkout.ts`:

```ts
import { z } from "zod";
import type { CheckoutData } from "./actions";
import { ORDER_ID, PAYMENT_ID } from "./razorpay";

// Razorpay Checkout in the browser. checkout.js is injected on demand, only when a member starts a payment
// (registration form or ticket page): no third-party script on any other page. Every value passed to Checkout comes
// from createPaymentOrder (server), never from page state.

export const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayInstance = { open(): void; on(event: string, cb: (r: unknown) => void): void };
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;
interface CheckoutHost {
  Razorpay?: RazorpayCtor;
  document: { createElement(tag: "script"): HTMLScriptElement; head: { appendChild(node: HTMLScriptElement): unknown } };
}

export type CheckoutOutcome =
  | { kind: "paid"; orderId: string; paymentId: string; signature: string }
  | { kind: "dismissed" }
  | { kind: "unavailable" };

const Success = z.object({
  razorpay_payment_id: z.string().regex(PAYMENT_ID),
  razorpay_order_id: z.string().regex(ORDER_ID),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/),
});

export function parseCheckoutSuccess(v: unknown): { orderId: string; paymentId: string; signature: string } | null {
  const r = Success.safeParse(v);
  return r.success
    ? { orderId: r.data.razorpay_order_id, paymentId: r.data.razorpay_payment_id, signature: r.data.razorpay_signature }
    : null;
}

export function checkoutOptions(
  data: CheckoutData,
  handlers: { onSuccess(r: unknown): void; onDismiss(): void },
): Record<string, unknown> {
  return {
    key: data.keyId,
    order_id: data.orderId,
    amount: data.amountPaise,
    currency: data.currency,
    name: data.name,
    description: data.description,
    prefill: data.prefill,
    notes: data.notes,
    theme: { color: "#1C3FD0" },
    retry: { enabled: true },
    modal: { ondismiss: handlers.onDismiss, confirm_close: true, escape: true },
    handler: handlers.onSuccess,
  };
}

let loading: Promise<boolean> | null = null;

export function resetCheckoutLoader() {
  loading = null;
}

export function loadCheckoutScript(host: CheckoutHost = window as unknown as CheckoutHost): Promise<boolean> {
  if (host.Razorpay) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise<boolean>((resolve) => {
    const s = host.document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      loading = null;
      s.remove();
      resolve(false);
    };
    host.document.head.appendChild(s);
  });
  return loading;
}

/** Opens Checkout; resolves once with the outcome. A failed attempt keeps the modal open (Razorpay's retry). */
export async function openCheckout(data: CheckoutData): Promise<CheckoutOutcome> {
  if (!(await loadCheckoutScript())) return { kind: "unavailable" };
  const Razorpay = (window as unknown as CheckoutHost).Razorpay;
  if (!Razorpay) return { kind: "unavailable" };
  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const done = (o: CheckoutOutcome) => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };
    try {
      const rzp = new Razorpay(
        checkoutOptions(data, {
          onSuccess: (r) => {
            const p = parseCheckoutSuccess(r);
            done(p ? { kind: "paid", ...p } : { kind: "dismissed" });
          },
          onDismiss: () => done({ kind: "dismissed" }),
        }),
      );
      rzp.open();
    } catch {
      done({ kind: "unavailable" });
    }
  });
}
```

Create `lib/payments/flow.ts`:

```ts
import { registrationError, type RegistrationError } from "@/lib/registration/errors";
import type { VerifyResult } from "./actions";
import type { CheckoutOutcome } from "./checkout";

// Pure decisions of the pay flow (usePayFlow), kept separate so they are unit-tested.

export type FlowStep = { kind: "navigate"; href: string } | { kind: "error"; error: RegistrationError };

/** null = paid, carry on to verification. `abandonTo` = where the form sends people who closed Checkout. */
export function afterCheckout(kind: CheckoutOutcome["kind"], abandonTo: string | null): FlowStep | null {
  if (kind === "paid") return null;
  if (abandonTo) return { kind: "navigate", href: abandonTo };
  return { kind: "error", error: registrationError(kind === "unavailable" ? "checkout_unavailable" : "payment_cancelled") };
}

/** Success, and outcomes the ticket page explains from the server's state, go to the ticket. */
export function afterVerify(res: VerifyResult, ticketHref: string): FlowStep {
  if (res.ok || res.error.recovery === "tickets") return { kind: "navigate", href: `${ticketHref}?paid=1` };
  return { kind: "error", error: res.error };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/payments/checkout.test.ts tests/payments/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the hook, the button and the wiring**

Create `components/payments/usePayFlow.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { createPaymentOrder, verifyPayment, type CreateOrderResult, type VerifyResult } from "@/lib/payments/actions";
import { openCheckout } from "@/lib/payments/checkout";
import { afterCheckout, afterVerify, type FlowStep } from "@/lib/payments/flow";
import { ticketPath } from "@/lib/registration/cta";
import { registrationError, type RegistrationError } from "@/lib/registration/errors";

export type PayPhase = "idle" | "creating" | "checkout" | "verifying";

/**
 * Order (server) -> Razorpay Checkout -> signature verify (server) -> ticket page. The ticket page always renders the
 * server's status, so a closed tab, a failed verify or a network error never leaves a wrong state on screen.
 * Analytics carry the step number and error codes only, never registration, order or payment ids.
 */
export function usePayFlow(opts: { step: number; abandonTo?: (registrationId: string) => string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [error, setError] = useState<RegistrationError | null>(null);
  const running = useRef(false);
  const { step, abandonTo } = opts;

  const apply = useCallback(
    (s: FlowStep) => {
      if (s.kind === "navigate") {
        router.push(s.href);
        return;
      }
      setError(s.error);
      setPhase("idle");
      running.current = false;
    },
    [router],
  );

  const pay = useCallback(
    async (registrationId: string) => {
      if (running.current) return;
      running.current = true;
      setError(null);
      setPhase("creating");
      track("payment_start", { step });

      let order: CreateOrderResult;
      try {
        order = await createPaymentOrder(registrationId);
      } catch {
        order = { ok: false, error: registrationError("network") };
      }
      if (!order.ok) {
        track("payment_error", { step, code: order.error.code });
        if (order.error.code === "hold_expired") router.refresh();
        apply({ kind: "error", error: order.error });
        return;
      }

      setPhase("checkout");
      const outcome = await openCheckout(order.checkout);
      const next = afterCheckout(outcome.kind, abandonTo ? abandonTo(registrationId) : null);
      if (next || outcome.kind !== "paid") {
        track("payment_dismissed", { step, kind: outcome.kind });
        apply(next ?? { kind: "error", error: registrationError("payment_cancelled") });
        return;
      }

      setPhase("verifying");
      let res: VerifyResult;
      try {
        res = await verifyPayment({
          registrationId, orderId: outcome.orderId, paymentId: outcome.paymentId, signature: outcome.signature,
        });
      } catch {
        res = { ok: false, error: registrationError("payment_processing") };
      }
      track(res.ok ? "payment_success" : "payment_error", res.ok ? { step, status: res.status } : { step, code: res.error.code });
      apply(afterVerify(res, ticketPath(registrationId)));
    },
    [abandonTo, apply, router, step],
  );

  return { pay, phase, busy: phase !== "idle", error };
}
```

Create `components/payments/PayButton.tsx`:

```tsx
"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { ErrorPanel } from "@/components/registration/ErrorPanel";
import { formatInr } from "@/lib/payments/money";
import { usePayFlow, type PayPhase } from "./usePayFlow";

const BUSY_TEXT: Record<Exclude<PayPhase, "idle">, string> = {
  creating: "Preparing your payment…",
  checkout: "Waiting for Razorpay…",
  verifying: "Confirming your payment…",
};

/** "Pay ₹X" for a live hold (ticket page). aria-disabled (not disabled) while busy, so focus is never dropped. */
export function PayButton({
  registrationId, amountPaise, step, here,
}: {
  registrationId: string;
  amountPaise: number;
  step: number;
  /** This ticket's path (Sign in returns here). */
  here: string;
}) {
  const { pay, phase, busy, error } = usePayFlow({ step });
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="btn btn-primary btn-lg justify-self-start"
        aria-disabled={busy}
        onClick={() => {
          if (!busy) void pay(registrationId);
        }}
      >
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <CreditCard size={18} strokeWidth={2} aria-hidden />}
        {busy ? BUSY_TEXT[phase as Exclude<PayPhase, "idle">] : `Pay ${formatInr(amountPaise)}`}
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {busy ? BUSY_TEXT[phase as Exclude<PayPhase, "idle">] : ""}
      </p>
      {error && <ErrorPanel error={error} here={here} fallbackUrl={null} onRetry={() => void pay(registrationId)} />}
    </div>
  );
}
```

In `components/registration/RegistrationForm.tsx`:
- Add imports: `import { formatInr } from "@/lib/payments/money";` and `import { usePayFlow } from "@/components/payments/usePayFlow";`.
- Add the prop `paid` to the component signature and its type: `paid?: { pricePaise: number; step: number };`.
- After `const [busy, startTransition] = useTransition();` add:

```tsx
  // Paid sessions: after the hold is created, Checkout opens straight away. Closing it lands on the ticket page,
  // which shows "Complete payment" with the hold's countdown (the form itself cannot register twice).
  const { pay } = usePayFlow({ step: paid?.step ?? 0, abandonTo: (id) => `${ticketPath(id)}?new=1` });
```

- Replace the success branch inside `startTransition` (`if (res.ok) { … }`) with:

```tsx
      if (res.ok) {
        if (res.status === "pending_payment") {
          // Inside the transition, so the button stays busy while Checkout opens and the payment is verified.
          await pay(res.registrationId);
          return;
        }
        // Inside the transition, so the button stays busy until the ticket page has loaded.
        router.push(`${ticketPath(res.registrationId)}?new=1`);
        return;
      }
```

- Replace the aside's first `<p className="mono font-bold">…</p>` and the following `<p className="mt-2 text-sm text-ink-2">…</p>` with:

```tsx
          <p className="mono font-bold">
            {waitlist
              ? "Event is full — you'll join the waitlist"
              : paid
                ? `Paid registration · ${formatInr(paid.pricePaise)}`
                : "Free registration"}
          </p>
          <p className="mt-2 text-sm text-ink-2">
            {waitlist
              ? paid
                ? "No payment now. If a seat frees up you get 15 minutes to pay; My tickets shows your place."
                : "If a seat frees up you move up automatically; My tickets shows your place."
              : paid
                ? "Continuing holds your seat for 15 minutes while you pay securely with Razorpay (UPI, cards, netbanking)."
                : "Your ticket appears in My tickets straight after you confirm."}{" "}
            We don&apos;t send a confirmation email.
          </p>
```

- Replace the submit button's label expression `{busy ? "Saving…" : waitlist ? "Join the waitlist" : "Confirm registration"}` with:

```tsx
            {busy
              ? paid && !waitlist ? "Opening payment…" : "Saving…"
              : waitlist
                ? "Join the waitlist"
                : paid
                  ? `Continue to payment · ${formatInr(paid.pricePaise)}`
                  : "Confirm registration"}
```

In `app/events/[slug]/register/page.tsx`:
- Add `import { paymentsConfig } from "@/lib/payments/config";`.
- Change the `ctaState(...)` call to pass `paymentsEnabled: paymentsConfig().enabled`.
- Add to `<RegistrationForm …>` the prop `paid={ev.pricePaise > 0 ? { pricePaise: ev.pricePaise, step: ev.step } : undefined}`.

In `app/events/[slug]/page.tsx`:
- Add `import { paymentsConfig } from "@/lib/payments/config";` and add `paymentsEnabled: paymentsConfig().enabled,` to the `ctaState({ … })` argument.

- [ ] **Step 6: Manual check (flags off — no secrets needed)**

Start the dev server via the Browser pane (`preview_start`, name from `.claude/launch.json`) and open a paid event if one exists, else temporarily nothing: with `PAYMENTS_ENABLED` unset the event page must still show "Paid registration opens soon" and `/events/<slug>/register` the "Paid registration for this session opens soon." notice; free events unchanged. Confirm in the Network panel that no request goes to `checkout.razorpay.com` on any page. Stop the dev server afterwards (it holds `.open-next`/workerd otherwise).

- [ ] **Step 7: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add lib/payments/checkout.ts lib/payments/flow.ts components/payments components/registration/RegistrationForm.tsx "app/events/[slug]" tests/payments
git commit -m "feat(payments): Razorpay Checkout on the registration form behind the payments flag

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Ticket page, My tickets and attending count for payments

**Files:**
- Create: `components/payments/PaymentPanel.tsx`, `components/payments/AutoRefresh.tsx`
- Modify: `lib/tickets/view.ts`, `lib/tickets/list.ts`, `lib/registration/server.ts` (`getMyTickets`, `getTicket`), `components/tickets/TicketCard.tsx`, `components/tickets/TicketListItem.tsx`, `components/tickets/CancelRegistration.tsx`, `app/me/tickets/[id]/page.tsx`, `app/me/tickets/page.tsx` (comment), `lib/site/load.ts`, `lib/events/mappers.ts`, `lib/events/types.ts`, `app/events/[slug]/page.tsx`
- Test: `tests/tickets/view.test.ts`, `tests/tickets/list.test.ts`, `tests/registration/server.test.ts`, `tests/events/mappers.test.ts`

**Interfaces:**
- Consumes: Task 6 (`TicketDetail` payment fields, `VISIBLE_STATUSES`, `HoldCountdown`), Task 12 (`PayButton`), `formatInr`, `paymentsConfig`, `longDate`.
- Produces:
  - `type TicketNotice = { kind: "none" } | { kind: "waitlisted"; position: number | null; paid: boolean } | { kind: "pay"; holdExpiresAt: string; amountPaise: number } | { kind: "processing" } | { kind: "hold_expired" } | { kind: "refund_needed"; amount: string; latePayment: boolean } | { kind: "refunded"; amount: string; refundedOn: string | null } | { kind: "cancelled" }`
  - `ticketNotice(t, now: number, justPaid?: boolean): TicketNotice`
  - `TicketCardData` gains `notice: TicketNotice` and `receipt: { number: string; amount: string } | null`; `TicketView` gains `notice: TicketNotice`; `ticketView(ticket, name, settings, ev, now, justPaid = false)`.
  - `CancelBlock = "checked_in" | "inactive" | "started"`; `cancelBlock(t: { status; checkedInAt; event: { start } }, now)`.
  - `ticketHeading(status)`: confirmed "Your ticket", waitlisted "Your waitlist place", pending_payment "Complete your payment", refund_needed "Refund pending", refunded "Refunded", cancelled "Registration cancelled".
  - `TicketListRow` gains `holdExpiresAt: string | null`; `ticketListRow(t, now?)`, `ticketGroups(list, now)` passes `now`; `passLabel` returns `"No entry pass"` for refund/cancelled statuses.
  - `getMyTickets` lists `VISIBLE_STATUSES`; `getTicket` returns the user's own row in any status.
  - `EventView.attending?: number` (confirmed only); `rowToEventView(r, seatsTaken, attending = seatsTaken)`.
  - `<PaymentPanel registrationId holdExpiresAt amountPaise step here />`, `<AutoRefresh intervalMs? maxMs? />`; `CancelRegistration` props gain `hold?: boolean`, `paidAmount?: string`.

- [ ] **Step 1: Write the failing tests**

In `tests/tickets/view.test.ts`:
- Add `ticketHeading, ticketNotice` to the import from `@/lib/tickets/view`.
- Replace the whole `describe("cancelBlock (mirrors cancel_registration)", …)` block with:

```ts
describe("cancelBlock (mirrors cancel_registration)", () => {
  const base = { status: "confirmed" as const, checkedInAt: null, event: { start: future } };
  it("allows confirmed (free or paid), waitlisted and held registrations before the start", () => {
    expect(cancelBlock(base, NOW)).toBeNull();
    expect(cancelBlock({ ...base, status: "waitlisted" }, NOW)).toBeNull();
    expect(cancelBlock({ ...base, status: "pending_payment" }, NOW)).toBeNull();
  });
  it("lets a hold be released even after the start, but nothing else", () => {
    expect(cancelBlock({ ...base, status: "pending_payment", event: { start: past } }, NOW)).toBeNull();
    expect(cancelBlock({ ...base, event: { start: past } }, NOW)).toBe("started");
    expect(cancelBlock({ ...base, event: { start: new Date(NOW).toISOString() } }, NOW)).toBe("started");
  });
  it("refuses checked-in and inactive registrations", () => {
    expect(cancelBlock({ ...base, checkedInAt: "2026-10-06T00:00:00Z" }, NOW)).toBe("checked_in");
    for (const status of ["cancelled", "refunded", "refund_needed"] as const) {
      expect(cancelBlock({ ...base, status }, NOW)).toBe("inactive");
    }
  });
});

describe("ticketNotice", () => {
  const t = (over: Record<string, unknown> = {}) => ({
    status: "pending_payment" as const, waitlistPosition: null, holdExpiresAt: future, amountPaise: 19900,
    cancelReason: null, refundedAt: null, event: { pricePaise: 19900 }, ...over,
  });
  it("asks for payment while the hold is live, and says it expired afterwards", () => {
    expect(ticketNotice(t(), NOW)).toEqual({ kind: "pay", holdExpiresAt: future, amountPaise: 19900 });
    expect(ticketNotice(t({ holdExpiresAt: past }), NOW)).toEqual({ kind: "hold_expired" });
    expect(ticketNotice(t({ status: "cancelled", cancelReason: "hold_expired" }), NOW)).toEqual({ kind: "hold_expired" });
    expect(ticketNotice(t({ status: "cancelled", cancelReason: "user" }), NOW)).toEqual({ kind: "cancelled" });
  });
  it("shows 'confirming' right after Checkout succeeded", () => {
    expect(ticketNotice(t(), NOW, true)).toEqual({ kind: "processing" });
  });
  it("explains refunds and the waitlist", () => {
    expect(ticketNotice(t({ status: "refund_needed", cancelReason: "late_payment_no_seat" }), NOW))
      .toEqual({ kind: "refund_needed", amount: "₹199", latePayment: true });
    expect(ticketNotice(t({ status: "refund_needed", cancelReason: "user" }), NOW)).toMatchObject({ latePayment: false });
    expect(ticketNotice(t({ status: "refunded", refundedAt: "2026-10-05T04:30:00Z" }), NOW)).toMatchObject({ kind: "refunded", amount: "₹199" });
    expect(ticketNotice(t({ status: "waitlisted", waitlistPosition: 2 }), NOW)).toEqual({ kind: "waitlisted", position: 2, paid: true });
    expect(ticketNotice(t({ status: "confirmed" }), NOW)).toEqual({ kind: "none" });
  });
});

describe("ticketHeading", () => {
  it("names every state", () => {
    expect(ticketHeading("confirmed")).toBe("Your ticket");
    expect(ticketHeading("pending_payment")).toBe("Complete your payment");
    expect(ticketHeading("refund_needed")).toBe("Refund pending");
    expect(ticketHeading("refunded")).toBe("Refunded");
    expect(ticketHeading("cancelled")).toBe("Registration cancelled");
  });
});
```

- In the `TicketCard` describe, change the `card()` helper's defaults to add `notice: { kind: "none" }, receipt: null,` (before `...over`), and replace the test `"keeps the header and perforation for waitlisted and pending tickets, still without QR, code or token"` with:

```ts
  it("keeps the header and perforation for waitlisted and pending tickets, still without QR, code or token", () => {
    const cases = [
      { status: "waitlisted" as const, notice: { kind: "waitlisted" as const, position: 2, paid: false }, text: "You&#x27;re on the waitlist" },
      { status: "pending_payment" as const, notice: { kind: "pay" as const, holdExpiresAt: future, amountPaise: 19900 }, text: "Payment pending" },
    ];
    for (const c of cases) {
      const out = html(card({ status: c.status, notice: c.notice, waitlistPosition: 2, pass: { kind: "none" }, token: "RAS-01-0007" }));
      expect(out).toContain('<header class="ticket-h">');
      expect(out).toContain('class="perf"');
      expect(out).not.toContain("<svg");
      expect(out).not.toContain(CODE);
      expect(out).not.toContain("RAS-01-0007");
      expect(out).toContain(c.text);
    }
  });

  it("explains expired holds and refunds, and prints the receipt", () => {
    const expired = html(card({ status: "cancelled", notice: { kind: "hold_expired" }, pass: { kind: "none" }, qrRows: null, code: null }));
    expect(expired).toContain("Seat hold expired");
    const refund = html(card({ status: "refund_needed", notice: { kind: "refund_needed", amount: "₹199", latePayment: true },
      pass: { kind: "none" }, qrRows: null, code: null, receipt: { number: "STW-2026-000012", amount: "₹199" } }));
    expect(refund).toContain("Refund pending");
    expect(refund).toContain("₹199 will be refunded");
    expect(refund).toContain("STW-2026-000012");
    const paid = html(card({ receipt: { number: "STW-2026-000013", amount: "₹199" } }));
    expect(paid).toContain("STW-2026-000013 · ₹199 paid");
  });
```

- In the `"shows a waitlist state with no QR, no token and no code"` test, add `notice: { kind: "waitlisted", position: 3, paid: false },` to its `card({...})` argument.
- In the `ticketView` describe, add:

```ts
  it("adds the receipt and the notice", () => {
    const v = ticketView({ ...base, amountPaise: 19900, receiptNumber: "STW-2026-000012", event: { ...base.event, pricePaise: 19900 } },
      "Asha", settings, { venue: "Lab 2" }, NOW);
    expect(v.card.receipt).toEqual({ number: "STW-2026-000012", amount: "₹199" });
    expect(v.notice).toEqual({ kind: "none" });
    const p = ticketView({ ...base, status: "pending_payment", amountPaise: 19900, holdExpiresAt: future }, "Asha", settings, null, NOW, true);
    expect(p.notice).toEqual({ kind: "processing" });
    expect(p.heading).toBe("Complete your payment");
  });
```

In `tests/tickets/list.test.ts` add:

```ts
describe("payment rows", () => {
  it("names refund and cancelled rows without a pass", () => {
    expect(passLabel({ status: "refunded", ticketType: "qr", token: null })).toBe("No entry pass");
    expect(passLabel({ status: "refund_needed", ticketType: "token", token: null })).toBe("No entry pass");
  });
  it("carries a live hold's end so the list can count down, and drops an expired one", () => {
    const live = { ...mk("h", "pending_payment", "2026-10-10T04:00:00Z", "2026-10-10T11:00:00Z"), holdExpiresAt: "2026-10-07T00:10:00Z" };
    expect(ticketListRow(live, NOW).holdExpiresAt).toBe("2026-10-07T00:10:00Z");
    expect(ticketListRow({ ...live, holdExpiresAt: "2026-10-06T23:59:00Z" }, NOW).holdExpiresAt).toBeNull();
    expect(ticketListRow(mk("c", "confirmed", "2026-10-10T04:00:00Z", "2026-10-10T11:00:00Z"), NOW).holdExpiresAt).toBeNull();
  });
});
```

(add `ticketListRow` to the file's import from `@/lib/tickets/list` if it is not imported yet).

In `tests/registration/server.test.ts`:
- In `"getTicket returns the detail with its code, or null"`, add `expect(calls.some((c) => c[0] === "in")).toBe(false);` after the `toContainEqual` line (any own status is shown).
- Add:

```ts
  it("getMyTickets lists active and refund rows", async () => {
    const calls = fakeDb({ data: [], error: null });
    await getMyTickets(UID);
    expect(calls).toContainEqual(["in", "status", ["pending_payment", "confirmed", "waitlisted", "refund_needed", "refunded"]]);
  });
```

In `tests/events/mappers.test.ts` add:

```ts
  it("keeps the attending (confirmed) count separate from seats taken", () => {
    expect(rowToEventView(row, 12).attending).toBe(12);
    expect(rowToEventView(row, 12, 9).attending).toBe(9);
    expect(rowToEventView(row, 12, 9).seatsFilled).toBe(12);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/tickets tests/registration/server.test.ts tests/events/mappers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the view logic**

In `lib/tickets/view.ts`:
- Add imports: `import { formatInr } from "@/lib/payments/money";` and add `longDate` to the existing `@/lib/weekends` import (it already imports `longDate, pad2, timeOf`).
- Replace the `CancelBlock` type, `CANCEL_BLOCK_COPY` and `cancelBlock` with:

```ts
/** Why the registration can't be cancelled here, mirroring cancel_registration's refusals; null when it can. */
export type CancelBlock = "checked_in" | "inactive" | "started";

export const CANCEL_BLOCK_COPY: Record<CancelBlock, string> = {
  checked_in: "You've already checked in, so this registration can't be cancelled.",
  inactive: "This registration is no longer active.",
  started: "This session has already started, so the registration can't be cancelled any more.",
};

export function cancelBlock(
  t: Pick<TicketDetail, "status" | "checkedInAt"> & { event: Pick<TicketDetail["event"], "start"> },
  now: number,
): CancelBlock | null {
  if (t.checkedInAt) return "checked_in";
  if (t.status !== "confirmed" && t.status !== "waitlisted" && t.status !== "pending_payment") return "inactive";
  // A payment hold can always be released; seats and waitlist places only before the start.
  if (t.status !== "pending_payment" && !(Date.parse(t.event.start) > now)) return "started";
  return null;
}
```

- Replace `ticketHeading` with:

```ts
const HEADINGS: Record<RegistrationStatus, string> = {
  confirmed: "Your ticket",
  waitlisted: "Your waitlist place",
  pending_payment: "Complete your payment",
  refund_needed: "Refund pending",
  refunded: "Refunded",
  cancelled: "Registration cancelled",
};

/** Page title / h1 for the ticket's state. */
export function ticketHeading(status: RegistrationStatus): string {
  return HEADINGS[status];
}
```

- Add after `ticketHeading`:

```ts
/** What the ticket explains instead of a door pass (every status but confirmed). */
export type TicketNotice =
  | { kind: "none" }
  | { kind: "waitlisted"; position: number | null; paid: boolean }
  | { kind: "pay"; holdExpiresAt: string; amountPaise: number }
  | { kind: "processing" }
  | { kind: "hold_expired" }
  | { kind: "refund_needed"; amount: string; latePayment: boolean }
  | { kind: "refunded"; amount: string; refundedOn: string | null }
  | { kind: "cancelled" };

/** `justPaid` = Checkout just reported success (?paid=1): show "confirming" until the server's status changes. */
export function ticketNotice(
  t: Pick<TicketDetail, "status" | "waitlistPosition" | "holdExpiresAt" | "amountPaise" | "cancelReason" | "refundedAt"> & {
    event: Pick<TicketDetail["event"], "pricePaise">;
  },
  now: number,
  justPaid = false,
): TicketNotice {
  switch (t.status) {
    case "confirmed":
      return { kind: "none" };
    case "waitlisted":
      return { kind: "waitlisted", position: t.waitlistPosition, paid: t.event.pricePaise > 0 };
    case "pending_payment": {
      if (justPaid) return { kind: "processing" };
      const end = t.holdExpiresAt;
      return end && Date.parse(end) > now ? { kind: "pay", holdExpiresAt: end, amountPaise: t.amountPaise } : { kind: "hold_expired" };
    }
    case "refund_needed":
      return { kind: "refund_needed", amount: formatInr(t.amountPaise), latePayment: t.cancelReason === "late_payment_no_seat" };
    case "refunded":
      return { kind: "refunded", amount: formatInr(t.amountPaise), refundedOn: t.refundedAt ? longDate(t.refundedAt) : null };
    case "cancelled":
      return t.cancelReason === "hold_expired" ? { kind: "hold_expired" } : { kind: "cancelled" };
  }
}
```

- In `TicketCardData`, add after `checkedInAt: string | null;`:

```ts
  /** What to say instead of a door pass (kind "none" for a confirmed seat). */
  notice: TicketNotice;
  /** Receipt of an accepted payment, e.g. { number: "STW-2026-000012", amount: "₹199" }. */
  receipt: { number: string; amount: string } | null;
```

- In `TicketView`, add `notice: TicketNotice;`.
- Change `ticketView`'s signature to add a last parameter `justPaid = false`, and inside it compute:

```ts
  const notice = ticketNotice(ticket, now, justPaid);
  const receipt = ticket.receiptNumber && ticket.amountPaise > 0
    ? { number: ticket.receiptNumber, amount: formatInr(ticket.amountPaise) }
    : null;
```

  then add `notice, receipt,` to the returned `card` object and `notice,` to the returned view object.

In `lib/tickets/list.ts`:
- In `passLabel`, add as the first line of the body:

```ts
  if (t.status === "refund_needed" || t.status === "refunded" || t.status === "cancelled") return "No entry pass";
```

- In `TicketListRow`, add `/** End of a live payment hold (shown as a countdown), else null. */ holdExpiresAt: string | null;`.
- Change `ticketListRow` to:

```ts
export function ticketListRow(t: TicketSummary, now: number = Date.now()): TicketListRow {
  const e = t.event;
  const hold = t.status === "pending_payment" && t.holdExpiresAt && Date.parse(t.holdExpiresAt) > now ? t.holdExpiresAt : null;
  return {
    id: t.id,
    href: ticketPath(t.id),
    eyebrow: `${e.societyShort} · Step ${pad2(e.step)}`,
    title: e.title,
    when: `${shortDate(e.start)}, ${timeOf(e.start)} IST`,
    status: statusLabel(t.status, t.waitlistPosition),
    pass: passLabel(t),
    holdExpiresAt: hold,
  };
}
```

- In `ticketGroups`, map with `(t) => ticketListRow(t, now)` for both lists.

In `lib/registration/server.ts`:
- Import `VISIBLE_STATUSES` from `./types` (alongside `ACTIVE_STATUSES`).
- In `getMyTickets`, change `.in("status", [...ACTIVE_STATUSES])` to `.in("status", [...VISIBLE_STATUSES])` and its doc comment to "Active, refund-pending and refunded tickets of the user, without ticket codes, soonest first."
- In `getTicket`, delete the `.in("status", [...ACTIVE_STATUSES])` line and change the doc comment to "The user's own registration in any status (with its code: the page shows it only for a confirmed seat), or null when there is no such row (not theirs, malformed id). Throws if the read fails."

- [ ] **Step 4: Implement the components and pages**

Create `components/payments/AutoRefresh.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server page every few seconds for a short while (payment confirming). Bounded, because each refresh
 * is a full server render on the Worker. The status shown always comes from the server.
 */
export function AutoRefresh({ intervalMs = 5000, maxMs = 45000 }: { intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      if (Date.now() - start > maxMs) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, maxMs, router]);
  return (
    <p role="status" aria-live="polite" className="box-2 p-4 font-semibold">
      Confirming your payment with Razorpay… this page updates by itself. If it takes longer, My tickets shows the result.
    </p>
  );
}
```

Create `components/payments/PaymentPanel.tsx`:

```tsx
import { formatInr } from "@/lib/payments/money";
import { HoldCountdown } from "./HoldCountdown";
import { PayButton } from "./PayButton";

/** "Complete payment" for a live hold on the ticket page: countdown + Pay button (Checkout loads only on click). */
export function PaymentPanel({
  registrationId, holdExpiresAt, amountPaise, step, here,
}: {
  registrationId: string;
  holdExpiresAt: string;
  amountPaise: number;
  step: number;
  here: string;
}) {
  return (
    <section aria-labelledby="pay-h" className="box grid gap-4 p-5 shadow-hard">
      <h2 id="pay-h" className="mono font-bold">Complete payment</h2>
      <p className="text-ink-2">
        Your seat is held for <HoldCountdown expiresAt={holdExpiresAt} className="font-bold text-ink" /> more. Pay{" "}
        {formatInr(amountPaise)} with UPI, card or netbanking to confirm it.
      </p>
      <PayButton registrationId={registrationId} amountPaise={amountPaise} step={step} here={here} />
      <p className="text-xs text-ink-3">
        Payments are processed by Razorpay. When the timer runs out the seat is released; a payment that still arrives is
        confirmed if a seat is free, otherwise refunded.
      </p>
    </section>
  );
}
```

In `components/tickets/TicketCard.tsx`:
- Import the type: change `import { QUIET_ZONE, type TicketCardData } from "@/lib/tickets/view";` to `import { QUIET_ZONE, type TicketCardData, type TicketNotice } from "@/lib/tickets/view";`.
- Add above `export function TicketCard`:

```tsx
const panel = "border-2 border-ink bg-paper-2 p-5 text-center";

/** Every non-confirmed state: never a QR, code or token. */
function NoticeBlock({ notice }: { notice: TicketNotice }) {
  switch (notice.kind) {
    case "none":
      return null;
    case "waitlisted":
      return (
        <div className={panel}>
          <p className="mono">You&apos;re on the waitlist</p>
          {notice.position != null && (
            <p className="mt-2 font-display text-5xl tabular">
              <span className="sr-only">Position </span>#{notice.position}
            </p>
          )}
          <p className="mt-2 text-sm text-ink-2">
            This is not an entry ticket yet.{" "}
            {notice.paid
              ? "If a seat frees up you get 15 minutes to pay, and this page becomes your ticket."
              : "If a seat frees up you move up automatically, and this page becomes your ticket."}{" "}
            We don&apos;t send emails yet, so check back here.
          </p>
        </div>
      );
    case "pay":
      return (
        <div className={panel}>
          <p className="mono">Payment pending</p>
          <p className="mt-2 text-sm text-ink-2">Your seat is held for 15 minutes. This is not an entry ticket until the payment is confirmed.</p>
        </div>
      );
    case "processing":
      return (
        <div className={panel}>
          <p className="mono">Confirming your payment</p>
          <p className="mt-2 text-sm text-ink-2">This usually takes a few seconds. This is not an entry ticket until it is confirmed.</p>
        </div>
      );
    case "hold_expired":
      return (
        <div className={panel}>
          <p className="mono">Seat hold expired</p>
          <p className="mt-2 text-sm text-ink-2">
            The 15 minutes ran out before a payment arrived, so the seat was released. If money left your account it is
            not lost: it is confirmed here if a seat is free, or refunded.
          </p>
        </div>
      );
    case "refund_needed":
      return (
        <div className={panel}>
          <p className="mono">Refund pending</p>
          <p className="mt-2 text-sm text-ink-2">
            {notice.latePayment
              ? `Your payment arrived after the seat was released, so ${notice.amount} will be refunded to your original payment method.`
              : `You cancelled this paid seat. The organisers will refund ${notice.amount} to your original payment method.`}{" "}
            Refunds are not automatic and can take a few days.
          </p>
        </div>
      );
    case "refunded":
      return (
        <div className={panel}>
          <p className="mono">Refunded</p>
          <p className="mt-2 text-sm text-ink-2">
            {notice.amount} was refunded{notice.refundedOn ? ` on ${notice.refundedOn}` : ""}. Banks can take 5–7 working days to show it.
          </p>
        </div>
      );
    case "cancelled":
      return (
        <div className={panel}>
          <p className="mono">Registration cancelled</p>
          <p className="mt-2 text-sm text-ink-2">This registration is no longer active.</p>
        </div>
      );
  }
}
```

- Replace the whole `) : t.status === "waitlisted" ? ( … ) : ( … )}` tail of the door-pass conditional (the waitlist block and the "Payment pending" block) with `) : (<NoticeBlock notice={t.notice} />)}` so the conditional reads `confirmed && qr ? … : confirmed && token ? … : <NoticeBlock … />`.
- In the `<dl className="grid gap-2 text-sm">`, add after the Name row:

```tsx
          {t.receipt && (
            <div><dt className="mono text-ink-3">Receipt</dt><dd className="tabular">{t.receipt.number} · {t.receipt.amount} paid</dd></div>
          )}
```

In `components/tickets/TicketListItem.tsx`:
- Add `import { HoldCountdown } from "@/components/payments/HoldCountdown";`.
- After `<span className="mt-1 block text-sm text-ink-2">{row.pass}</span>` add:

```tsx
        {row.holdExpiresAt && (
          <span className="mt-1 block text-sm font-semibold">
            Complete payment · <HoldCountdown expiresAt={row.holdExpiresAt} refreshOnExpiry={false} /> left
          </span>
        )}
```

In `components/tickets/CancelRegistration.tsx`:
- Add to the props destructuring and type: `hold = false, paidAmount,` with types `/** A pending_payment seat hold. */ hold?: boolean;` and `/** Formatted amount of a paid confirmed seat (cancelling makes it refund_needed). */ paidAmount?: string;`.
- Change `const label = waitlisted ? "Leave the waitlist" : "Cancel registration";` to:

```tsx
  const label = waitlisted ? "Leave the waitlist" : hold ? "Release my held seat" : "Cancel registration";
```

- Replace the question paragraph's text expression with:

```tsx
        {waitlisted
          ? "Leave the waitlist? You'll lose your place."
          : hold
            ? "Release your held seat? You can register again while seats remain."
            : paidAmount
              ? `Cancel your paid seat? It goes to the next person, and the organisers will refund ${paidAmount} to your original payment method (not automatic; it can take a few days).`
              : "Cancel your registration? Your seat goes to the next person on the waitlist, and you may not get it back."}
```

- Update the component's doc comment: "Two-step cancel. Free seats and waitlist places are cancelled; a payment hold is released; a paid seat becomes refund_needed (refunded by the organisers)."

Replace the body of `app/me/tickets/[id]/page.tsx`'s default export (keep everything above `export default` except: add the imports `import { paymentsConfig } from "@/lib/payments/config";`, `import { formatInr } from "@/lib/payments/money";`, `import { PaymentPanel } from "@/components/payments/PaymentPanel";`, `import { AutoRefresh } from "@/components/payments/AutoRefresh";`) with:

```tsx
export default async function TicketPage({ params, searchParams }: PageProps<"/me/tickets/[id]">) {
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  // A malformed id can never be a ticket: 404 without touching the session or the database.
  const id = parseId(raw);
  if (!id) notFound();
  // Session first: signed-out (or not onboarded) visitors are redirected before anything is looked up.
  const { user, profile } = await requireOnboarded(ticketPath(id));

  const [ticket, { settings, events }] = await Promise.all([loadTicket(id, user.id), getSiteData()]);
  if (!ticket) notFound();

  const ev = events.find((e) => e.id === ticket.event.id) ?? null;
  // ?paid=1: Checkout reported success; the server status below is still the authority.
  const justPaid = sp.paid === "1";
  const view = ticketView(ticket, profile.fullName, settings, ev, requestNow(), justPaid);
  const confirmed = ticket.status === "confirmed";
  const waitlisted = ticket.status === "waitlisted";
  const held = ticket.status === "pending_payment";
  const active = confirmed || waitlisted || held;
  const here = ticketPath(ticket.id);

  return (
    <div className="grid gap-8">
      <Link href="/me/tickets" className="mono inline-flex min-h-11 items-center gap-2 justify-self-start font-bold text-ink-3 hover:text-ink">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden /> All tickets
      </Link>
      <h1 className="text-3xl font-semibold md:text-4xl">{view.heading}</h1>
      {(sp.new === "1" || justPaid) && (confirmed || waitlisted) && (
        <NewTicketBanner confirmed={confirmed} position={ticket.waitlistPosition} />
      )}
      {view.notice.kind === "processing" && <AutoRefresh />}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-start">
        <TicketCard t={view.card} />
        <div className="grid gap-6">
          {view.notice.kind === "pay" &&
            (paymentsConfig().enabled ? (
              <PaymentPanel
                registrationId={ticket.id}
                holdExpiresAt={view.notice.holdExpiresAt}
                amountPaise={view.notice.amountPaise}
                step={ticket.event.step}
                here={here}
              />
            ) : (
              <p role="status" className="box-2 p-4">
                Payments are paused right now. Your seat stays held until the timer runs out; please try again shortly.
              </p>
            ))}
          {active && (
            <TicketActions
              ev={ev}
              png={view.png}
              filename={ticketFilename(ticket.event.slug)}
              shareText={`I'm climbing st(AI)rway: ${view.card.eyebrow}, ${ticket.event.title}`}
              upcoming={view.upcoming}
            />
          )}
          {ev && (
            <Link href={`/events/${encodeURIComponent(ev.slug)}`} className="btn btn-secondary justify-self-start">
              Session details
            </Link>
          )}
          {active && (
            <CancelRegistration
              registrationId={ticket.id}
              waitlisted={waitlisted}
              hold={held}
              paidAmount={confirmed && ticket.amountPaise > 0 ? formatInr(ticket.amountPaise) : undefined}
              blocked={view.cancelBlocked}
              here={here}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

In `app/me/tickets/page.tsx`, change the comment `// getMyTickets returns active registrations only, so a cancelled one simply drops out of both lists.` to `// getMyTickets returns active and refund rows; a cancelled registration drops out of both lists.`

Attending count (confirmed only):
- `lib/events/types.ts`: add to `EventView` after `seatsFilled: number;`: `/** Confirmed attendees only (seatsFilled also counts live payment holds). */ attending?: number;`
- `lib/events/mappers.ts`: change the signature to `export function rowToEventView(r: EventRow, seatsTaken: number, attending: number = seatsTaken): EventView {` and add `attending,` after `seatsFilled: seatsTaken,`.
- `lib/site/load.ts`: change `db.from("event_seat_counts").select("event_id, seats_taken")` to `.select("event_id, seats_taken, attending")`; after `seatMap` add `const attendingMap = new Map(orThrow(seats, "seat counts").map((s) => [s.event_id, s.attending ?? 0]));`; and change the events mapping to `rowToEventView(r, seatMap.get(r.id) ?? 0, attendingMap.get(r.id) ?? 0)`.
- `app/events/[slug]/page.tsx`: change `count: ev.seatsFilled,` to `count: ev.attending ?? ev.seatsFilled,`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Manual check (flags off)**

Dev server (`preview_start`): sign in, open `/me/tickets` and an existing free ticket — unchanged (Confirmed, QR, cancel works). Open a non-existent ticket id → 404. Stop the dev server.

- [ ] **Step 7: Gate and commit**

```bash
npx tsc --noEmit && npx eslint .
git add lib/tickets lib/registration/server.ts lib/site/load.ts lib/events components/payments components/tickets app/me "app/events/[slug]/page.tsx" tests
git commit -m "feat(tickets): Complete payment with countdown, hold expiry, refund states, receipts; attending counts confirmed only

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Fund Easy contract doc + PROPOSED patch (docs only)

**Files:**
- Create: `docs/integrations/fund-easy-sync.md`
- Create: `docs/integrations/fund-easy-patch/README.md`, `docs/integrations/fund-easy-patch/supabase/migrations/00000000000064_external_sync.sql`, `docs/integrations/fund-easy-patch/supabase/functions/external-sync/index.ts`, `docs/integrations/fund-easy-patch/supabase/functions/external-sync/verify.ts`, `docs/integrations/fund-easy-patch/supabase/functions/external-sync/verify_test.ts`, `docs/integrations/fund-easy-patch/supabase/config.toml.snippet`, `docs/integrations/fund-easy-patch/supabase/tests/database/042_external_sync.test.sql`
- Modify: `tsconfig.json` and `eslint.config.mjs` (exclude/ignore `docs/integrations/fund-easy-patch` — it is Deno code for another repository)

**Interfaces:**
- Consumes: the v1 envelope and headers from Task 10 (`contract_version`, `id`, `idempotency_key`, `type`, `occurred_at`, `source`, `data`; `x-stairway-timestamp`, `x-stairway-signature: v1=<hex>`, `idempotency-key`); the payload shape from Task 4; Fund Easy schema facts (read-only study of `C:\fund easy\supabase\migrations\00000000000054_ticketing_core.sql`, `…061_ticketing_extras.sql`, `…008/016 handle_new_user`): `events(slug ^[a-z0-9-]{3,80}$, title ≤120, venue 1..160, category, status, created_by → profiles)`, `ticket_tiers(active, capacity > 0)`, `ticket_orders(status held|paid|expired|failed|refunded, partial unique one active per (event,user), razorpay ids unique, receipt_id)`, `tickets(order_id unique, code unique)`, `receipts(ticket_order_id unique, receipt_number unique)`, `ticket_refunds(one live per order)`, `issue_ticket()` queues an email (so the import does NOT call it), `public_event_tiers`/`reserve_ticket` skip inactive tiers, `create_ticket_refund` and `cancel_event` refund through Fund Easy's Razorpay keys.
- Produces: documentation only. **Nothing in `C:\fund easy\` is created, changed, deployed or pushed.**

- [ ] **Step 1: Write the contract**

Create `docs/integrations/fund-easy-sync.md`:

````markdown
# st(AI)rway → Fund Easy sync — contract v1

Status: st(AI)rway side implemented (Phase 4, flagged off). Fund Easy side: **PROPOSED, NOT APPLIED** — see
`docs/integrations/fund-easy-patch/`.

## Purpose

Registrations (free and paid) and payments happen on st(AI)rway. Each confirmed, cancelled or refunded registration is
pushed one way to Fund Easy so it shows as a Fund Easy event ticket (Manage events → Attendees) and Fund Easy's door
scanner accepts the same QR. Fund Easy never calls st(AI)rway (reverse sync is out of scope).

## Transport

- `POST https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync` (Supabase Edge Function, `verify_jwt = false`).
- Body: one JSON envelope (≤ 16 KiB), `content-type: application/json`.
- Sender: the st(AI)rway Worker's 5-minute cron (`lib/sync/processor.ts`), at most 10 messages per run, 5 s timeout each.

## Headers

| Header | Value |
|---|---|
| `x-stairway-timestamp` | Unix time in seconds when the request was signed |
| `x-stairway-signature` | `v1=` + lower-case hex HMAC-SHA256 of `` `${timestamp}.${rawBody}` `` with the shared secret `STAIRWAY_SYNC_SECRET` (≥ 32 random characters, set on both sides, never in git) |
| `idempotency-key` | equal to the envelope's `idempotency_key` |

The receiver MUST: read the raw body before parsing; reject a timestamp more than 300 s from its clock; compute the
HMAC over exactly `timestamp + "." + rawBody`; compare in constant time; reject when `idempotency-key` differs from
the envelope's key.

## Envelope

```json
{
  "contract_version": 1,
  "id": "6f3c…-outbox-row-uuid",
  "idempotency_key": "<registration uuid>:registration.confirmed:<µs timestamp>",
  "type": "registration.confirmed",
  "occurred_at": "2026-10-10T10:00:00+00:00",
  "source": "stairway",
  "data": { "registration": { … }, "event": { … }, "attendee": { … } }
}
```

`type` is one of `registration.confirmed`, `registration.cancelled`, `payment.refunded`. `id` and `idempotency_key` are
identical on every retry of the same message. A new transition (e.g. confirmed again after a cancel) has a new key.

### `data.registration`

| Field | Type | When |
|---|---|---|
| `id` | uuid — st(AI)rway registration id; Fund Easy's `ticket_orders.external_id` | always |
| `status` | `confirmed` \| `cancelled` \| `refund_needed` \| `refunded` | always |
| `ticket_code` | 26-char base32 (`^[A-Z2-7]{26}$`); the QR content. Fund Easy stores it as `tickets.code` | confirmed |
| `token` | door token like `RAS-05-0042` (informational) | confirmed, token events |
| `amount_paise` | integer ≥ 0 (0 = free) | always |
| `currency` | `"INR"` | always |
| `receipt_number` | `STW-YYYY-NNNNNN` | paid |
| `razorpay_order_id`, `razorpay_payment_id` | Razorpay ids (shared Razorpay account) | paid |
| `razorpay_refund_id` | `rfnd_…` | refunded |
| `confirmed_at`, `paid_at`, `cancelled_at`, `refunded_at` | ISO timestamps | when set |
| `cancel_reason` | `user` \| `hold_expired` \| `late_payment_no_seat` \| `refunded` \| `account_deleted` | cancelled |

### `data.event`

`id` (st(AI)rway event uuid; Fund Easy's `events.external_ref`), `slug`, `title` (≤ 200), `starts_at`, `ends_at`,
`venue` (≤ 200), `capacity`, `price_paise`.

### `data.attendee` (only on `registration.confirmed`)

`email`, `full_name`. No phone, answers or IEEE id are ever sent. Fund Easy finds the user by email or creates a
passwordless account (the person can use "forgot password").

## Receiver semantics

| `type` | Effect on Fund Easy |
|---|---|
| `registration.confirmed` | Upsert event by `external_ref` (slug `stw-<slug>`, category `workshop`, status `published`), upsert one inactive tier `st(AI)rway` (never sold on Fund Easy; capacity follows st(AI)rway), upsert order by `external_id` as `paid` with the Razorpay ids, insert/refresh the ticket with `code = ticket_code` (no Fund Easy confirmation email), insert the receipt with st(AI)rway's `receipt_number` for paid orders. |
| `registration.cancelled` | Ticket `cancelled` (unless already checked in). Free orders → `expired`. Paid orders stay `paid` until `payment.refunded`. Unknown registration → ignored. |
| `payment.refunded` | Order `refunded`, ticket `cancelled`, a `processed` `ticket_refunds` row with the Razorpay refund id. Unknown registration → ignored. |

Synced orders cannot be refunded or their event cancelled from Fund Easy (both raise; refunds happen on st(AI)rway).

## Responses

| Status | Body | Sender behaviour |
|---|---|---|
| 200 | `{"ok":true,"result":"imported"\|"duplicate"\|"cancelled"\|"refunded"\|"ignored", "replayed"?: true}` | sent |
| 400 | `{"ok":false,"error":"malformed"}` | dead-letter (permanent) |
| 401 | `{"ok":false,"error":"bad_signature"}` | retried (secret or clock problem) |
| 413 | `{"ok":false,"error":"too_large"}` | dead-letter |
| 422 | `{"ok":false,"error":"conflict_existing_order"\|"unsupported_version"\|"unsupported_type"}` | dead-letter |
| 5xx / timeout / network | any | retried |

The receiver records every processed `idempotency_key` with its result and returns that stored result (200,
`"replayed": true`) for a replay, without re-applying it. Error bodies carry a short machine code only, never personal
data; the sender stores at most `HTTP <status> <code>`.

## Retries, ordering, dead letters

- Backoff: 1, 2, 4, … minutes (doubling), capped at 6 hours; dead after 10 attempts or one permanent error.
- Ordering: the sender never sends a message while an earlier message of the same registration is still pending, so
  Fund Easy sees confirm → cancel → refund in order. The receiver still ignores a cancel/refund for an unknown
  registration (200 `ignored`).
- Requeue a dead message after fixing the cause (SQL editor on st(AI)rway's project):
  `update private.external_sync_outbox set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null where id = '<id>';`
- Payloads of sent messages are emptied after 30 days.

## Versioning

Additive fields may appear in v1 at any time; receivers ignore unknown fields. A breaking change bumps
`contract_version`; receivers answer 422 `unsupported_version` for a version they do not know.

## Manual test (after both sides are deployed with TEST data)

```bash
BODY='{"contract_version":1,"id":"00000000-0000-4000-8000-000000000001","idempotency_key":"manual-test-1","type":"registration.cancelled","occurred_at":"2026-10-10T10:00:00Z","source":"stairway","data":{"registration":{"id":"00000000-0000-4000-8000-0000000000aa","status":"cancelled"},"event":{"id":"00000000-0000-4000-8000-0000000000bb"}}}'
TS=$(date +%s)
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$STAIRWAY_SYNC_SECRET" -hex | sed 's/^.* //')
curl -sS -X POST "https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync" \
  -H "content-type: application/json" -H "x-stairway-timestamp: $TS" -H "x-stairway-signature: v1=$SIG" \
  -H "idempotency-key: manual-test-1" --data "$BODY"
# → 200 {"ok":true,"result":"ignored"} (unknown registration)
```
````

- [ ] **Step 2: Write the PROPOSED patch README**

Create `docs/integrations/fund-easy-patch/README.md`:

```markdown
# Fund Easy patch for the st(AI)rway sync — PROPOSED, NOT APPLIED

> **Do not apply without the user.** This folder is a ready-to-review copy of the files Fund Easy needs. It was written
> from a read-only study of `C:\fund easy\` (Vite + Supabase project `fidguqathrzitfbpknrd`). Nothing here has been
> run against Fund Easy's database or deployed.

## Pre-conditions (all required, in this order)

1. **Rotate or remove the seeded accounts** on the hosted Fund Easy project: `supabase/seed.sql` in its git history
   contains login-capable accounts with a plaintext password, including the super admin `admin@fundeasy.dev`.
2. **Private backup:** put `C:\fund easy\` in a PRIVATE GitHub repository (it has no remote today). Because the seed
   password is in the history, either rotate first and accept it, or rewrite history before pushing.
3. **Review** this patch (the user, or a reviewer the user names), especially the "Check during review" list.
4. Work on a branch in the Fund Easy repo (e.g. `stairway-sync`); merge only after the tests below pass.

## What it adds

| File (path inside the Fund Easy repo) | Purpose |
|---|---|
| `supabase/migrations/00000000000064_external_sync.sql` | `events.external_source/external_ref`, `ticket_orders.external_source/external_id`, `external_sync_receipts` (idempotency), `external_find_user()`, `import_external_ticket()` (service_role only), guards in `create_ticket_refund()` and `cancel_event()` |
| `supabase/functions/external-sync/index.ts`, `verify.ts`, `verify_test.ts` | Edge Function: HMAC + timestamp check, find-or-create the user, call the RPC, map errors to the contract's statuses |
| `supabase/config.toml` (append `config.toml.snippet`) | `verify_jwt = false` for `external-sync` (it authenticates with the HMAC) |
| `supabase/tests/database/042_external_sync.test.sql` | pgTAP tests (sketch; adjust ids/plan count when applying) |

## Apply (after the pre-conditions)

1. Copy the files into the Fund Easy repo at the paths above; append `config.toml.snippet` to `supabase/config.toml`.
2. Local: `supabase db reset` then `supabase test db` (pgTAP) and `deno test supabase/functions/external-sync/`.
3. Hosted: apply the migration (`supabase db push` or the MCP `apply_migration` on project `fidguqathrzitfbpknrd`);
   `supabase secrets set STAIRWAY_SYNC_SECRET=<32+ random chars>`;
   `supabase functions deploy external-sync --no-verify-jwt`.
4. Manual test from `docs/integrations/fund-easy-sync.md` → 200 `ignored`.
5. On st(AI)rway (Cloudflare secrets): `FUND_EASY_SYNC_URL=https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync`,
   `STAIRWAY_SYNC_SECRET=<same value>`, `FUND_EASY_SYNC_ENABLED=true` (plus `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
   Queued messages start flowing on the next 5-minute tick.

## Rollback

Set `FUND_EASY_SYNC_ENABLED` off on st(AI)rway (messages stay queued). On Fund Easy, `supabase functions delete
external-sync`; the added columns/table are inert without it. Imported rows are ordinary tickets/orders tagged
`external_source = 'stairway'`.

## Check during review

- `reserve_ticket` and `public_event_tiers` skip inactive tiers (verified in migrations 054/061), so the `st(AI)rway`
  tier is never sold on Fund Easy. Confirm the Fund Easy UI also hides it.
- Fund Easy's `razorpay-webhook` receives st(AI)rway's events too (shared Razorpay account). Before a sync it ignores
  our order ids (unknown); after a sync `confirm_ticket_order` finds an already-`paid` order with the same payment id
  and returns without side effects. Our refund notes use `source`/`registration_id`, never `refund_id`, so its refund
  lookup ignores them. Re-verify against the current webhook code.
- Synced events are `published` (organisers can manage and scan them) but have no buyable tier.
- A re-confirmation after a cancel keeps the first receipt on Fund Easy (receipts are one per order).
- Check-ins done on Fund Easy are not sent back to st(AI)rway (reverse sync is out of scope).
```

- [ ] **Step 3: Write the PROPOSED migration**

Create `docs/integrations/fund-easy-patch/supabase/migrations/00000000000064_external_sync.sql`:

```sql
-- PROPOSED — NOT APPLIED. st(AI)rway -> Fund Easy one-way sync (contract v1, docs/integrations/fund-easy-sync.md in
-- the st(AI)rway repo). Imports st(AI)rway registrations as Fund Easy event tickets. Follows this repo's conventions
-- (security definer, search_path public, explicit grants).

alter table events
  add column external_source text check (external_source in ('stairway')),
  add column external_ref text;
create unique index events_external_ref_key on events (external_source, external_ref) where external_ref is not null;

alter table ticket_orders
  add column external_source text check (external_source in ('stairway')),
  add column external_id text;
create unique index ticket_orders_external_id_key on ticket_orders (external_source, external_id) where external_id is not null;

-- Every processed message, so a replay returns the stored result without re-applying it.
create table external_sync_receipts (
  idempotency_key text primary key check (char_length(idempotency_key) <= 200),
  source text not null check (source in ('stairway')),
  event_type text not null,
  result jsonb not null,
  processed_at timestamptz not null default now()
);
alter table external_sync_receipts enable row level security;
revoke all on external_sync_receipts from public, anon, authenticated;

create or replace function external_find_user(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;
revoke execute on function external_find_user(text) from public, anon, authenticated;
grant execute on function external_find_user(text) to service_role;

create or replace function import_external_ticket(p_envelope jsonb, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := p_envelope->>'idempotency_key';
  v_type text := p_envelope->>'type';
  r jsonb := p_envelope->'data'->'registration';
  e jsonb := p_envelope->'data'->'event';
  v_ext_id text := p_envelope->'data'->'registration'->>'id';
  v_amount bigint := coalesce((p_envelope->'data'->'registration'->>'amount_paise')::bigint, 0);
  v_prior jsonb;
  v_event events%rowtype;
  v_tier ticket_tiers%rowtype;
  v_order ticket_orders%rowtype;
  v_creator uuid;
  v_receipt_id uuid;
  v_result jsonb;
begin
  if (p_envelope->>'contract_version') is distinct from '1' then
    raise exception 'unsupported_version';
  end if;
  if v_key is null or v_ext_id is null or r is null or e is null then
    raise exception 'malformed';
  end if;
  select s.result into v_prior from external_sync_receipts s where s.idempotency_key = v_key;
  if found then
    return v_prior || jsonb_build_object('replayed', true);
  end if;

  if v_type = 'registration.confirmed' then
    if p_user_id is null or coalesce(r->>'ticket_code', '') !~ '^[A-Z2-7]{26}$' then
      raise exception 'malformed';
    end if;

    select * into v_event from events where external_source = 'stairway' and external_ref = e->>'id' for update;
    if not found then
      select p.id into v_creator from profiles p where p.role = 'super_admin' order by p.created_at limit 1;
      if v_creator is null then
        raise exception 'no_super_admin';
      end if;
      insert into events (slug, title, description, category, venue, starts_at, ends_at, status, created_by,
                          external_source, external_ref)
      values (left('stw-' || (e->>'slug'), 80), left(e->>'title', 120), 'Registration and payment on st(AI)rway.',
              'workshop', left(coalesce(nullif(btrim(e->>'venue'), ''), 'IEEE SB CE Kidangoor'), 160),
              (e->>'starts_at')::timestamptz, (e->>'ends_at')::timestamptz, 'published', v_creator,
              'stairway', e->>'id')
      returning * into v_event;
    else
      update events
         set title = left(e->>'title', 120), starts_at = (e->>'starts_at')::timestamptz,
             ends_at = (e->>'ends_at')::timestamptz, updated_at = now()
       where id = v_event.id;
    end if;

    -- One inactive tier per synced event: never sold on Fund Easy (reserve_ticket / public_event_tiers skip inactive).
    select * into v_tier from ticket_tiers where event_id = v_event.id and name = 'st(AI)rway' for update;
    if not found then
      insert into ticket_tiers (event_id, name, description, price, capacity, active, sort_order)
      values (v_event.id, 'st(AI)rway', 'Registered on st(AI)rway.', greatest(coalesce((e->>'price_paise')::bigint, 0), 0),
              greatest(coalesce((e->>'capacity')::int, 1), 1), false, 0)
      returning * into v_tier;
    else
      update ticket_tiers
         set price = greatest(coalesce((e->>'price_paise')::bigint, 0), 0),
             capacity = greatest(coalesce((e->>'capacity')::int, 1), tier_taken(v_tier.id), 1)
       where id = v_tier.id;
    end if;

    select * into v_order from ticket_orders where external_source = 'stairway' and external_id = v_ext_id for update;
    if exists (select 1 from ticket_orders o where o.event_id = v_event.id and o.user_id = p_user_id
               and o.status in ('held', 'paid') and o.id is distinct from v_order.id) then
      raise exception 'conflict_existing_order';
    end if;
    if v_order.id is null then
      insert into ticket_orders (event_id, tier_id, user_id, amount, answers, status, razorpay_order_id, razorpay_payment_id,
                                 paid_at, external_source, external_id)
      values (v_event.id, v_tier.id, p_user_id, v_amount, '{}'::jsonb, 'paid', r->>'razorpay_order_id', r->>'razorpay_payment_id',
              coalesce((r->>'paid_at')::timestamptz, (r->>'confirmed_at')::timestamptz, now()), 'stairway', v_ext_id)
      returning * into v_order;
      v_result := jsonb_build_object('result', 'imported', 'order_id', v_order.id);
    else
      update ticket_orders
         set status = 'paid', user_id = p_user_id, amount = v_amount,
             razorpay_order_id = r->>'razorpay_order_id', razorpay_payment_id = r->>'razorpay_payment_id',
             paid_at = coalesce((r->>'paid_at')::timestamptz, (r->>'confirmed_at')::timestamptz, now())
       where id = v_order.id
      returning * into v_order;
      v_result := jsonb_build_object('result', 'duplicate', 'order_id', v_order.id);
    end if;

    -- The ticket is inserted directly, NOT through issue_ticket(), which would queue Fund Easy's own confirmation
    -- email. Its code is st(AI)rway's ticket code, so Fund Easy's scanner accepts the same QR.
    insert into tickets (order_id, event_id, tier_id, user_id, code)
    values (v_order.id, v_event.id, v_tier.id, p_user_id, r->>'ticket_code')
    on conflict (order_id) do update
      set code = excluded.code, user_id = excluded.user_id,
          status = case when tickets.status = 'checked_in' then tickets.status else 'valid' end;

    if v_amount > 0 and coalesce(r->>'receipt_number', '') <> '' and v_order.receipt_id is null then
      insert into receipts (ticket_order_id, receipt_number) values (v_order.id, r->>'receipt_number')
      returning id into v_receipt_id;
      update ticket_orders set receipt_id = v_receipt_id where id = v_order.id;
    end if;

  elsif v_type = 'registration.cancelled' then
    select * into v_order from ticket_orders where external_source = 'stairway' and external_id = v_ext_id for update;
    if not found then
      v_result := jsonb_build_object('result', 'ignored', 'reason', 'unknown_registration');
    else
      update tickets set status = 'cancelled' where order_id = v_order.id and status = 'valid';
      -- Free seats are released; paid seats stay 'paid' until the refund arrives from st(AI)rway.
      if v_order.amount = 0 or v_order.razorpay_payment_id is null then
        update ticket_orders set status = 'expired' where id = v_order.id and status = 'paid';
      end if;
      v_result := jsonb_build_object('result', 'cancelled', 'order_id', v_order.id);
    end if;

  elsif v_type = 'payment.refunded' then
    select * into v_order from ticket_orders where external_source = 'stairway' and external_id = v_ext_id for update;
    if not found then
      v_result := jsonb_build_object('result', 'ignored', 'reason', 'unknown_registration');
    else
      update ticket_orders set status = 'refunded' where id = v_order.id;
      update tickets set status = 'cancelled' where order_id = v_order.id and status = 'valid';
      if v_order.amount > 0 then
        insert into ticket_refunds (order_id, amount, reason, initiated_by, status, razorpay_refund_id, processed_at)
        values (v_order.id, v_order.amount, 'Refunded on st(AI)rway',
                (select ev.created_by from events ev where ev.id = v_order.event_id), 'processed',
                r->>'razorpay_refund_id', coalesce((r->>'refunded_at')::timestamptz, now()))
        on conflict do nothing;
      end if;
      v_result := jsonb_build_object('result', 'refunded', 'order_id', v_order.id);
    end if;

  else
    raise exception 'unsupported_type';
  end if;

  insert into external_sync_receipts (idempotency_key, source, event_type, result) values (v_key, 'stairway', v_type, v_result);
  return v_result;
end;
$$;
revoke execute on function import_external_ticket(jsonb, uuid) from public, anon, authenticated;
grant execute on function import_external_ticket(jsonb, uuid) to service_role;

-- Synced orders are refunded on st(AI)rway (shared Razorpay account); refunding them here would desynchronise both.
-- Same body as 00000000000054 plus the external_source guard.
create or replace function create_ticket_refund(p_order_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order ticket_orders%rowtype;
  v_refund_id uuid;
begin
  if not is_super_admin() then
    raise exception 'ticket refund: only a super admin can refund tickets';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'ticket refund: a reason is required';
  end if;
  select * into v_order from ticket_orders where id = p_order_id for update;
  if not found then
    raise exception 'ticket refund: order not found';
  end if;
  if v_order.external_source is not null then
    raise exception 'ticket refund: this ticket was sold on st(AI)rway; refund it there';
  end if;
  if v_order.amount = 0 or v_order.razorpay_payment_id is null then
    raise exception 'ticket refund: this ticket was free, so there is nothing to refund';
  end if;
  if v_order.status = 'refunded' and exists (select 1 from ticket_refunds where order_id = p_order_id and status <> 'failed') then
    raise exception 'ticket refund: this ticket is already being refunded';
  end if;
  if v_order.status not in ('paid', 'refunded') then
    raise exception 'ticket refund: only paid tickets can be refunded';
  end if;
  update ticket_orders set status = 'refunded' where id = p_order_id;
  update tickets set status = 'cancelled' where order_id = p_order_id;
  insert into ticket_refunds (order_id, amount, reason, initiated_by)
  values (p_order_id, v_order.amount, btrim(p_reason), auth.uid())
  returning id into v_refund_id;
  perform log_audit(auth.uid(), 'ticket.refund', 'ticket_orders', p_order_id, jsonb_build_object('refund_id', v_refund_id, 'reason', btrim(p_reason)));
  return v_refund_id;
end;
$$;
revoke execute on function create_ticket_refund(uuid, text) from public, anon;
grant execute on function create_ticket_refund(uuid, text) to authenticated;

-- Same body as 00000000000061 plus the external_source guard: synced events are cancelled on st(AI)rway.
create or replace function cancel_event(p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
  v_order ticket_orders%rowtype;
  v_refunds int := 0;
  v_holders int := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not is_super_admin() then
    raise exception 'event: only a super admin can cancel an event';
  end if;
  if v_reason = '' then
    raise exception 'event: give a reason; ticket holders see it';
  end if;
  select * into v_event from events where id = p_event_id for update;
  if not found then
    raise exception 'event: event not found';
  end if;
  if v_event.external_source is not null then
    raise exception 'event: this event is managed on st(AI)rway; cancel it there';
  end if;
  if v_event.status = 'cancelled' then
    raise exception 'event: this event is already cancelled';
  end if;

  update events set status = 'cancelled', updated_at = now() where id = p_event_id;
  update ticket_orders set status = 'expired' where event_id = p_event_id and status = 'held';

  for v_order in select * from ticket_orders where event_id = p_event_id and status = 'paid' for update loop
    v_holders := v_holders + 1;
    update tickets set status = 'cancelled' where order_id = v_order.id and status <> 'cancelled';
    if v_order.amount > 0 and v_order.razorpay_payment_id is not null then
      update ticket_orders set status = 'refunded' where id = v_order.id;
      insert into ticket_refunds (order_id, amount, reason, initiated_by)
      values (v_order.id, v_order.amount, 'Event cancelled: ' || v_reason, auth.uid());
      v_refunds := v_refunds + 1;
    end if;
    perform queue_notification(v_order.user_id, null, 'event_cancelled', 'Cancelled: ' || v_event.title,
      v_reason || '.' || coalesce((select ' Your ' || format_inr(v_order.amount) || ' will be refunded to your original payment method.'
                                   where v_order.amount > 0), ''),
      '/tickets', 'event-cancelled:' || p_event_id || ':' || v_order.user_id, true);
  end loop;

  perform log_audit(auth.uid(), 'event.cancel', 'events', p_event_id,
    jsonb_build_object('reason', v_reason, 'refunds', v_refunds, 'ticket_holders', v_holders));
  return jsonb_build_object('refunds', v_refunds, 'ticket_holders', v_holders);
end;
$$;
revoke execute on function cancel_event(uuid, text) from public, anon;
grant execute on function cancel_event(uuid, text) to authenticated;
```

- [ ] **Step 4: Write the PROPOSED Edge Function**

Create `docs/integrations/fund-easy-patch/supabase/functions/external-sync/verify.ts`:

```ts
// PROPOSED — NOT APPLIED. HMAC check for the st(AI)rway sync (contract v1).

const enc = new TextEncoder();
export const TOLERANCE_SECONDS = 300;

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `x-stairway-signature: v1=<hex HMAC-SHA256(`${timestamp}.${rawBody}`)>`, timestamp within ±300 s. */
export async function verifySignature(
  secret: string,
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  nowMs: number,
): Promise<boolean> {
  if (!timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^v1=[0-9a-f]{64}$/.test(signature)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  return safeEqual(`v1=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`, signature);
}
```

Create `docs/integrations/fund-easy-patch/supabase/functions/external-sync/verify_test.ts`:

```ts
// PROPOSED — NOT APPLIED. Run with: deno test supabase/functions/external-sync/
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { hmacHex, verifySignature } from "./verify.ts";

const SECRET = "s".repeat(32);
const BODY = '{"contract_version":1}';
// Same vector as st(AI)rway's lib/sync/contract.ts produces (computed with Node's crypto.createHmac).
const EXPECTED = "dfa18eb321e11ad2aec3a678f8f5ff130114131261505f0178a529a50b755af5";

Deno.test("matches the st(AI)rway signer", async () => {
  assertEquals(await hmacHex(SECRET, `1760000000.${BODY}`), EXPECTED);
});

Deno.test("accepts a fresh, correct signature", async () => {
  assert(await verifySignature(SECRET, BODY, "1760000000", `v1=${EXPECTED}`, 1760000100_000));
});

Deno.test("rejects stale timestamps, tampered bodies and malformed headers", async () => {
  assertFalse(await verifySignature(SECRET, BODY, "1760000000", `v1=${EXPECTED}`, 1760000301_000));
  assertFalse(await verifySignature(SECRET, BODY + " ", "1760000000", `v1=${EXPECTED}`, 1760000000_000));
  assertFalse(await verifySignature(SECRET, BODY, "1760000000", EXPECTED, 1760000000_000));
  assertFalse(await verifySignature(SECRET, BODY, null, `v1=${EXPECTED}`, 1760000000_000));
});
```

Create `docs/integrations/fund-easy-patch/supabase/functions/external-sync/index.ts`:

```ts
// PROPOSED — NOT APPLIED. st(AI)rway -> Fund Easy sync receiver (contract v1). verify_jwt = false: authenticated by
// HMAC + timestamp with STAIRWAY_SYNC_SECRET. The service role is used only inside this function.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { json, requireEnv } from "../_shared/http.ts";
import { verifySignature } from "./verify.ts";

const MAX_BODY = 16 * 1024;
const PERMANENT: Record<string, number> = {
  malformed: 400,
  conflict_existing_order: 422,
  unsupported_version: 422,
  unsupported_type: 422,
};

interface Envelope {
  contract_version: number;
  idempotency_key: string;
  type: string;
  data?: { attendee?: { email?: unknown; full_name?: unknown } };
}

async function findOrCreateUser(admin: SupabaseClient, email: string, name: string | undefined): Promise<string> {
  const { data: found, error } = await admin.rpc("external_find_user", { p_email: email });
  if (error) throw new Error("user lookup failed");
  if (typeof found === "string") return found;
  // Passwordless account; handle_new_user creates the profile from user_metadata.name. "Forgot password" sets one.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: name ? { name } : {},
  });
  if (!createError && created?.user) return created.user.id;
  // Created by a concurrent delivery: look it up again.
  const { data: again } = await admin.rpc("external_find_user", { p_email: email });
  if (typeof again === "string") return again;
  throw new Error("user create failed");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: "too_large" }, 413);
    const ok = await verifySignature(
      requireEnv("STAIRWAY_SYNC_SECRET"),
      raw,
      req.headers.get("x-stairway-timestamp"),
      req.headers.get("x-stairway-signature"),
      Date.now(),
    );
    if (!ok) return json({ ok: false, error: "bad_signature" }, 401);

    let env: Envelope;
    try {
      env = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "malformed" }, 400);
    }
    if (env?.contract_version !== 1) return json({ ok: false, error: "unsupported_version" }, 422);
    if (typeof env.idempotency_key !== "string" || req.headers.get("idempotency-key") !== env.idempotency_key) {
      return json({ ok: false, error: "malformed" }, 400);
    }

    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let userId: string | null = null;
    if (env.type === "registration.confirmed") {
      const email = env.data?.attendee?.email;
      const name = env.data?.attendee?.full_name;
      if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(email)) return json({ ok: false, error: "malformed" }, 400);
      userId = await findOrCreateUser(admin, email.trim(), typeof name === "string" ? name.slice(0, 120) : undefined);
    }

    const { data, error } = await admin.rpc("import_external_ticket", { p_envelope: env, p_user_id: userId });
    if (error) {
      const code = (error.message ?? "").trim();
      if (PERMANENT[code]) return json({ ok: false, error: code }, PERMANENT[code]);
      console.error("external-sync import failed", error.code);
      return json({ ok: false, error: "retry" }, 500);
    }
    return json({ ok: true, ...(data as Record<string, unknown>) }, 200);
  } catch (e) {
    console.error("external-sync failed", e instanceof Error ? e.name : "unknown");
    return json({ ok: false, error: "retry" }, 500);
  }
});
```

Create `docs/integrations/fund-easy-patch/supabase/config.toml.snippet`:

```toml
# PROPOSED — NOT APPLIED. Append to supabase/config.toml: the function authenticates with an HMAC, not a JWT.
[functions.external-sync]
verify_jwt = false
```

- [ ] **Step 5: Write the PROPOSED pgTAP sketch**

Create `docs/integrations/fund-easy-patch/supabase/tests/database/042_external_sync.test.sql`:

```sql
-- PROPOSED — NOT APPLIED (sketch; adjust ids and the plan count when applying). Run: supabase test db
begin;
select plan(12);

insert into auth.users (id, email) values
  ('f4200001-0000-0000-0000-000000000001', 'admin42@test.com'),
  ('f4200001-0000-0000-0000-000000000002', 'buyer42@test.com');
insert into profiles (id, name, email, phone, role) values
  ('f4200001-0000-0000-0000-000000000001', 'Admin 42', 'admin42@test.com', '1', 'super_admin'),
  ('f4200001-0000-0000-0000-000000000002', 'Buyer 42', 'buyer42@test.com', '2', 'student')
on conflict (id) do update set role = excluded.role;

create temp table env as select jsonb_build_object(
  'contract_version', 1, 'id', '00000000-0000-4000-8000-000000000001', 'idempotency_key', 'k-confirm-1',
  'type', 'registration.confirmed', 'occurred_at', now(), 'source', 'stairway',
  'data', jsonb_build_object(
    'registration', jsonb_build_object('id', 'reg-42', 'status', 'confirmed', 'ticket_code', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'amount_paise', 19900, 'currency', 'INR', 'receipt_number', 'STW-2026-000042',
      'razorpay_order_id', 'order_FE42TEST0001', 'razorpay_payment_id', 'pay_FE42TEST0001', 'confirmed_at', now(), 'paid_at', now()),
    'event', jsonb_build_object('id', 'evt-42', 'slug', 'seeing-machines', 'title', 'Seeing Machines',
      'starts_at', now() + interval '10 days', 'ends_at', now() + interval '10 days 6 hours', 'venue', 'Lab 2',
      'capacity', 60, 'price_paise', 19900),
    'attendee', jsonb_build_object('email', 'buyer42@test.com', 'full_name', 'Buyer 42'))) as e;

-- 1-5: import creates the event, an inactive tier, a paid order, the ticket with st(AI)rway's code and the receipt
select is((select import_external_ticket(e, 'f4200001-0000-0000-0000-000000000002')->>'result' from env), 'imported', 'confirmed imports');
select is((select count(*)::int from events where external_ref = 'evt-42' and slug = 'stw-seeing-machines'), 1, 'event upserted by external_ref');
select is((select active from ticket_tiers t join events ev on ev.id = t.event_id where ev.external_ref = 'evt-42'), false, 'tier is never sold on Fund Easy');
select is((select code from tickets t join ticket_orders o on o.id = t.order_id where o.external_id = 'reg-42'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'ticket code = st(AI)rway code');
select is((select r.receipt_number from receipts r join ticket_orders o on o.receipt_id = r.id where o.external_id = 'reg-42'), 'STW-2026-000042', 'receipt imported');

-- 6: a replay returns the stored result
select is((select (import_external_ticket(e, 'f4200001-0000-0000-0000-000000000002')->>'replayed')::boolean from env), true, 'replay is not re-applied');

-- 7: no Fund Easy confirmation email was queued for the synced ticket
select is((select count(*)::int from notifications where type = 'ticket_confirmed' and user_id = 'f4200001-0000-0000-0000-000000000002'), 0, 'no duplicate confirmation');

-- 8-9: refunds of synced orders are refused here; the st(AI)rway refund message applies
select set_config('request.jwt.claims', '{"sub":"f4200001-0000-0000-0000-000000000001"}', true);
select throws_like(
  $$ select create_ticket_refund((select id from ticket_orders where external_id = 'reg-42'), 'test') $$,
  '%sold on st(AI)rway%', 'Fund Easy cannot refund a synced order');
select is((select import_external_ticket(jsonb_build_object('contract_version', 1, 'idempotency_key', 'k-refund-1',
  'type', 'payment.refunded', 'data', jsonb_build_object(
    'registration', jsonb_build_object('id', 'reg-42', 'status', 'refunded', 'razorpay_refund_id', 'rfnd_FE42TEST0001', 'refunded_at', now()),
    'event', jsonb_build_object('id', 'evt-42'))), null)->>'result'), 'refunded', 'refund message applies');

-- 10: a cancel for an unknown registration is ignored
select is((select import_external_ticket(jsonb_build_object('contract_version', 1, 'idempotency_key', 'k-cancel-x',
  'type', 'registration.cancelled', 'data', jsonb_build_object(
    'registration', jsonb_build_object('id', 'reg-unknown', 'status', 'cancelled'),
    'event', jsonb_build_object('id', 'evt-42'))), null)->>'result'), 'ignored', 'unknown registration ignored');

-- 11-12: only service_role may call the import
select ok(not has_function_privilege('authenticated', 'import_external_ticket(jsonb, uuid)', 'execute'), 'authenticated cannot import');
select ok(not has_function_privilege('anon', 'external_find_user(text)', 'execute'), 'anon cannot look up users');

select * from finish();
rollback;
```

- [ ] **Step 6: Keep the Deno files out of st(AI)rway's toolchain**

In `tsconfig.json`, extend `exclude` to `["node_modules", "cloudflare", "docs/integrations/fund-easy-patch"]`. In `eslint.config.mjs`, add `"docs/integrations/fund-easy-patch/**",` to `globalIgnores([...])`. (Vitest only includes `tests/**/*.test.ts`, so `verify_test.ts` is never picked up.)

- [ ] **Step 7: Gate and commit**

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add docs/integrations tsconfig.json eslint.config.mjs
git commit -m "docs: Fund Easy sync contract v1 and proposed (not applied) Fund Easy patch

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Live DB verification, docs, whole-branch review, merge, deploy, USER CHECKLIST

**Files:**
- Modify: `README.md`, `design-system/MASTER.md`, `.superpowers/sdd/progress.md` (git-ignored ledger)
- (Controller-led) live DB checks, review, merge, deploy.

**Interfaces:**
- Consumes: everything above. Produces: docs + a deployed `main` with payments and sync still OFF.

- [ ] **Step 1: Docs (implementer)**

In `README.md`, insert after section `## 3c. Registration & tickets` (before `## 4. Deploy`):

```markdown
## 3d. Payments (Razorpay) and the Fund Easy sync — OFF until configured

**Pre-flight: the Cloudflare account must be on Workers Paid** before payments are switched on. On Workers Free every
request gets 10 ms of CPU and full page renders already exceed it intermittently (error 1102, see
`.superpowers/sdd/incident-1102.md`); a payment must never fail that way.

- Paid sessions (`events.price_paise > 0`) are registered and paid **on st(AI)rway** with Razorpay Checkout. Members are
  never sent to Fund Easy. Registering creates a 15-minute seat hold (`pending_payment`), which counts toward capacity;
  "Complete payment" with a countdown appears on the event page, the ticket and My tickets.
- Payment is confirmed twice, idempotently: by `verifyPayment` (Checkout's signature, then the payment is re-fetched from
  Razorpay) and by the webhook `POST /api/payments/webhook` (`order.paid`, `refund.processed`). A payment after the hold
  expired is honoured if a seat is free, otherwise the row becomes `refund_needed`. Receipts are `STW-YYYY-NNNNNN`.
- The Razorpay account is shared with Fund Easy: every order carries `notes.source = "stairway"`; the webhook ignores
  everything else with HTTP 200.
- Cancelling a paid seat makes it `refund_needed`; refunds are never automatic. `lib/payments/refunds.ts` performs a full
  refund (the admin button arrives with the Phase 5 dashboard).
- A Cloudflare Cron Trigger (every 5 minutes, `cloudflare/worker.ts` → `POST /api/cron/tick`) releases expired holds,
  promotes waitlists and drains the Fund Easy outbox. Idle when no flag is on.
- Fund Easy sync: one-way, signed, idempotent, retried with backoff (`docs/integrations/fund-easy-sync.md`). The Fund
  Easy side is a **proposed, not applied** patch in `docs/integrations/fund-easy-patch/`.
- Database: `private.payment_orders` (ledger), `private.payment_events` (append-only log), `private.external_sync_outbox`;
  assertion scripts `supabase/tests/payments-*.sql` and `supabase/tests/sync-outbox.sql`.
- Accounts that ever created a payment order cannot be deleted by cascade (ON DELETE RESTRICT); token numbers are never
  reused. **Deletion runbook:** this includes users who only opened Checkout (an order was created) but never paid. To
  delete such an account before Phase 5's admin anonymisation exists, a project owner must first anonymise or detach that
  user's `private.payment_orders` / `private.payment_events` rows by SQL (keep the money records), then delete the user.
- No Content-Security-Policy is set today. If one is added, allow `https://checkout.razorpay.com` (script) and
  `https://api.razorpay.com`, `https://*.razorpay.com` (frames and connections).

### Enabling payments (Razorpay TEST mode first)

All values are Cloudflare Worker **secrets** (`npx wrangler secret put NAME`, or Workers & Pages → stairway → Settings →
Variables and Secrets → type *Secret*). Use secrets even for the flags: plain-text variables added in the dashboard are
dropped by the next `wrangler deploy`.

| Secret | Value |
|---|---|
| `PAYMENTS_ENABLED` | `true` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → Account & Settings → API Keys (test mode) |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you type when adding the webhook (32+ random characters) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (project `nfrdsdnrtsbttyrmfppy`) |
| `CRON_SECRET` | 32+ random characters |

Then switch the database flag on (Supabase SQL editor):

```sql
update private.feature_flags set enabled = true, updated_at = now() where key = 'payments';
```

Razorpay webhook (Dashboard → Account & Settings → Webhooks → Add new): URL
`https://stairway.ieeesbcek.workers.dev/api/payments/webhook`, events `order.paid` and `refund.processed`, the secret
above. Do not change Fund Easy's webhook. Keep "automatic capture" on (Payment capture settings).

To switch payments off again: delete `PAYMENTS_ENABLED` (or set it to anything but `true`) and/or set the database flag to
`false`. Live holds keep counting until they expire.

### Enabling the Fund Easy sync

Only after the Fund Easy patch is applied (see its README): secrets `FUND_EASY_SYNC_ENABLED=true`,
`FUND_EASY_SYNC_URL=https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync`, `STAIRWAY_SYNC_SECRET`
(same value as on Fund Easy), plus `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. Registrations queued earlier are sent
on the next tick.
```

In section 5 (*Project structure*) of `README.md`, add under `lib/`: `payments/          Razorpay REST client, signatures, order/verify actions, webhook, refunds, Checkout loader`, `sync/              Fund Easy contract v1 and outbox processor`, `cron/              5-minute tick (hold expiry, outbox)`; under `app/`: `api/payments/webhook, api/cron/tick`; and a top-level line `cloudflare/worker.ts   custom Worker entry (OpenNext fetch + Cron Trigger)`.

In `design-system/MASTER.md`, under `## Components`, add:

```markdown
- **Payments:** "Pay ₹X" is the ink primary CTA on paid events; a live hold shows "Complete payment" with
  `components/payments/HoldCountdown.tsx` (mono m:ss, minute-level `role="timer"` text for screen readers, refreshes the
  route once at zero). `PaymentPanel` is a `.box` with a hard shadow; Checkout (`checkout.js`) loads only when a member
  starts paying. Status tags: Payment pending / Refund pending (orange), Refunded (outline). Receipts print as
  `STW-YYYY-NNNNNN · ₹X paid` on the ticket. No QR, code or token unless the seat is confirmed.
```

Gate and commit:

```bash
npx vitest run && npx tsc --noEmit && npx eslint .
git add README.md design-system/MASTER.md
git commit -m "docs: payments, cron and Fund Easy sync

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Live database re-verification (controller)**

Run each script as ONE MCP `execute_sql` call and confirm its pass row: `security-hardening.sql`, `profiles-rls.sql`, `registrations-rls.sql`, `registrations-rpc.sql`, `payments-schema.sql`, `payments-rpc.sql`, `payments-service.sql`, `sync-outbox.sql`. Confirm afterwards: `select enabled from private.feature_flags where key = 'payments'` → `false`; `select count(*) from private.external_sync_outbox` is what it was before (the scripts roll back); no `p4-*` events or `p4-*@test.local` users remain. Run `get_advisors` `security` (no new findings) and `performance` (only INFO unused-index for the new indexes). Record results in `.superpowers/sdd/progress.md`.

- [ ] **Step 3: Whole-branch review (controller)**

Use superpowers:requesting-code-review for `main..phase4-payments`. Focus areas: money paths (amount only from `registrations.amount_paise`; signature checks over the exact strings; payment re-fetch; order-notes check; currency); idempotency (`payment_events.razorpay_event_id`, `already_processed`, `duplicate_event`, refund lease); lock order (events → registrations → ledger) in every new function; late payment and duplicate payment handling; grants (`service_role`-only functions not executable by `anon`/`authenticated`; private tables unreadable); flags (nothing money-related runs with any secret missing; `register_for_event` still raises `paid_event` with the DB flag off); secrets never in responses, logs, `NEXT_PUBLIC_*` or client bundles (`grep -r "RAZORPAY_KEY_SECRET\|SERVICE_ROLE" .next/static` after a build must find nothing); CPU-lightness of webhook/cron/processor (no DB call for foreign events; batch and time limits); QR/code/token only for confirmed; analytics without ids; the Fund Easy patch is clearly marked NOT APPLIED and nothing touched `C:\fund easy\`. Fix findings in one wave, re-run the gate and Step 2.

- [ ] **Step 4: Merge and deploy (controller)**

Stop any `next dev` / `workerd` process holding `.open-next`. Use superpowers:finishing-a-development-branch to merge `phase4-payments` into `main` and push. Cloudflare Workers Builds should deploy automatically (watch the dashboard); if no new deployment appears within a few minutes:

```bash
CLOUDFLARE_ACCOUNT_ID=7a852bedf2056637d90bd9534e6cd7c1 npm run deploy
```

Smoke checks (payments still OFF; on Workers Free an occasional 503/1102 is the known incident — retry once):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://stairway.ieeesbcek.workers.dev/events/seeing-machines                 # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://stairway.ieeesbcek.workers.dev/api/payments/webhook            # 404 (payments off)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://stairway.ieeesbcek.workers.dev/api/cron/tick                   # 404 (no CRON_SECRET)
curl -s -o /dev/null -w "%{http_code}\n" https://stairway.ieeesbcek.workers.dev/api/payments/webhook                   # 405
npx wrangler deployments list | head -5   # the new version, with the */5 cron trigger in the dashboard (Settings → Triggers)
```

Update `.superpowers/sdd/progress.md` with the merge commit, the deployed version id and "Phase 4 deployed, flags OFF".

- [ ] **Step 5: USER CHECKLIST (hand to the user; nothing here may be done by the assistant)**

1. **Upgrade Cloudflare to Workers Paid** ($5/month: Workers & Pages → Plans). Pre-condition for enabling payments. Afterwards the assistant can add `"limits": { "cpu_ms": 5000 }` to `wrangler.jsonc` as a runaway guard.
2. **Razorpay TEST keys:** Razorpay Dashboard in *Test mode* → API Keys → generate. Add the five payment secrets and `PAYMENTS_ENABLED=true` in Cloudflare exactly as in README §3d (never paste them in chat).
3. **Webhook:** add `https://stairway.ieeesbcek.workers.dev/api/payments/webhook` (test mode) with events `order.paid`, `refund.processed` and the `RAZORPAY_WEBHOOK_SECRET` value. Leave Fund Easy's webhook as it is.
4. **Database flag:** run `update private.feature_flags set enabled = true, updated_at = now() where key = 'payments';` in the Supabase SQL editor.
5. **A test paid session:** e.g. `update public.events set price_paise = 100 where slug = '<an upcoming test session>';` (₹1), or ask the assistant to prepare a dedicated draft test event migration.
6. **Test-card run (phone + desktop):** register → "Continue to payment · ₹1" → Razorpay test checkout (card `4111 1111 1111 1111`, any future expiry, any CVV, choose *Success*; or UPI `success@razorpay`) → ticket shows Confirmed, QR and `STW-…` receipt; Razorpay Dashboard → Webhooks shows a 200 delivery. Also: close Checkout once and complete payment from My tickets; let one hold expire (wait > 15 minutes, then refresh: "Seat hold expired"); cancel the paid seat → "Refund pending".
7. **Fund Easy (later):** rotate/remove the seeded super-admin accounts, create the private GitHub backup, review `docs/integrations/fund-easy-patch/`, apply it, then add the three `FUND_EASY_*`/`STAIRWAY_SYNC_SECRET` secrets.
8. **Going live (later):** KYC → live keys + a live-mode webhook; repeat step 6 with a real ₹1 payment and refund it.
9. Decide what to do with the test registrations/payments (they are real rows on the live database; paid rows cannot be deleted by cascade).

---

## Self-review notes

- **Spec coverage:** paid registration on st(AI)rway with a 15-minute hold counted toward capacity (T2); order creation with the amount from the DB and `notes.source` (T7); Checkout loaded on demand only on paying pages (T12); signature verification + payment re-fetch + order-notes check + currency/amount check (T5, T7, T3); webhook `order.paid`/`refund.processed`, foreign events ignored with 200, raw-body HMAC, event-id idempotency (T8, T1, T3); confirmation idempotent across verify + webhook + retries (T3); late payment honoured or `refund_needed` (T3); cron expiry + waitlist promotion incl. paid holds and capacity raises (T2, T3, T11); "Complete payment" with countdown on event page, ticket and My tickets (T6, T12, T13); expired-hold messaging; `refund_needed`/`refunded` labels (T13); QR only for confirmed (unchanged gate, re-tested T13); attending counts confirmed only (T1, T13); receipts (T1, T3, T13, T4 payload); refunds data model + lease + Razorpay helper behind the flag, user cancel → `refund_needed` (T1-T3, T9); `payment_events` append-only with unique event id, no client access (T1); `external_sync_outbox` with enqueue trigger, backoff, dead letters, minimal PII, purge (T4, T10); cron with shared secret via a custom OpenNext worker entry (T11); Fund Easy contract + PROPOSED patch with pre-conditions (T14); account deletion RESTRICT, token non-reuse, re-registration reset (T1, T2); typed errors with the exhaustive Recovery pattern (T6); analytics without ids (T12); docs, review, merge, deploy, USER CHECKLIST incl. Workers Paid (T15).
- **Phase 3 deferred items resolved here:** user_id cascade vs payments (RESTRICT via the ledger), token reuse after deletion (counter), stale payment fields on re-registration (reset), refunded rows "already registered" (re-registration allowed; `refund_needed` → `refund_pending`), promoted ids not returned (`promoted` in the register result), capacity raise promotes only on the next register/cancel (cron). **Still open:** rate limiting (orders are reused per hold, so Razorpay order creation is bounded per registration; a general limiter remains a later item); token tickets guessable (unchanged; token is a door aid next to the QR).
- **Type consistency:** RPC names/args (`attach_payment_order(p_registration_id, p_order_id, p_amount_paise)`, `confirm_payment(p_registration_id, p_order_id, p_payment_id, p_amount_paise, p_currency, p_source, p_event_id, p_event_name, p_details)`, `mark_refunded(p_registration_id, p_payment_id, p_refund_id, p_amount_paise, p_source, p_event_id)`, `claim_refund(p_registration_id)`, `expire_holds(p_limit)`, `claim_sync_batch(p_limit)`, `complete_sync(p_id, p_ok, p_permanent, p_error)`) match their TS callers (T7-T11), checked by `tsc` against regenerated types. `CheckoutData`/`VerifyResult`/`CreateOrderResult` (T7) are used unchanged by T12. `TicketNotice`/`TicketCardData` (T13) match `TicketCard`. `CtaState` kinds (T6) match `RegisterCta` and `RegistrationUnavailable`.
- **Placeholders:** none; the only literal to substitute is the migration version `V` reported by `list_migrations` (Phase 3 convention).
