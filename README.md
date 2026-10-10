# st(AI)rway — Weekend AI Event Series

The website for **st(AI)rway**, a weekend AI series by the IEEE Student Branch, College of Engineering Kidangoor (IEEE SB CEK).

> Climb into the future of AI, one weekend at a time.

Built with Next.js 16 (App Router, TypeScript), Tailwind CSS 4 and Lucide icons. The look is "Cobalt Circuit" poster brutalism: a cobalt poster field with a cream double frame and extruded stair-step lettering for heroes and key bands, cream panels with ink outlines and hard shadows for reading (see `design-system/MASTER.md`). Type is Anton (display), Urbanist (body) and Space Mono (labels).

**Architecture.** The site is Next.js running as a Cloudflare Worker through OpenNext (`@opennextjs/cloudflare`). Supabase provides the data (Postgres with row-level security), auth and storage. Every page is rendered per request from the database, so content edits show up without a rebuild.

---

## 1. Run it locally

You need **Node.js 20.9+**.

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.

```bash
npm run dev      # http://localhost:3000
npm test         # unit tests + anonymous RLS checks against the live database
```

Visual check (needs Chrome): with the dev server on port 3123, `node scripts/visual-check.mjs [baseUrl] [outDir=.shots] [--keyboard]` screenshots every page type at 320, 375 and 1280 px, reports horizontal overflow (exit 1 if any) and, with `--keyboard`, walks the Tab order and flags clipped focus rings. Set `CHROME_PATH` if Chrome is not at the default Windows path.

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be present at **build time** as well as at runtime, because `lib/env.ts` validates them on import. Locally they come from `.env.local`; on Cloudflare Workers Builds, set them as build variables. The RLS tests in `tests/rls/` skip themselves when these are missing.

---

## 2. Edit the content

Content lives in Supabase. Until the admin dashboard ships, edit rows in the Supabase Table Editor (events, site blocks such as `settings`, and so on).

`npm run seed:generate` regenerates `supabase/seed.sql` from `supabase/seed-data/`. **That script is a destructive bootstrap: it truncates the content tables.** Never run it against a database that holds real registrations.

Event status ("climbed", "next up", "unlocks soon") is computed from each event's dates at request time; you never set it by hand. Use India Standard Time offsets in dates, e.g. `2026-10-10T09:30:00+05:30`.

The leaderboard (`data/leaderboard.ts`) and the quiz (`data/tracks.ts`) are still static files.

---

## 3. Images, logos and the registration link

- **Speaker / team photos:** put files in `public/speakers/` or `public/team/`, then reference the path (e.g. `/speakers/anjali.webp`) in the row's photo field. Without a photo, a gradient monogram is shown.
- **Gallery photos:** put files in `public/gallery/` and reference the path in the gallery row (keep the alt text descriptive). Items without `src` show generated artwork.
- **Sponsor logos:** `logo: "/sponsors/nimbus.svg"` in the sponsor content. Without one, the name is shown as a wordmark.
- **Favicon:** `app/icon.svg`. The app icon (`app/apple-icon.tsx`) and Open Graph images (`app/opengraph-image.tsx`, `app/events/[slug]/opengraph-image.tsx`) are generated automatically as cobalt poster cards; Anton and Space Mono are fetched from Google Fonts at render time (the card falls back to the built-in font if that fails).
- **Poster frame logos:** the frame's logo row shows only the text `IEEE SB CE KIDANGOOR` (`FRAME_ORG` in `lib/design/brand.ts`). There is no IEEE mark yet; when official cream logo SVGs exist, replace `LogoRow` in `components/ui/Poster.tsx`.
- **Sponsorship deck:** put the PDF in `public/` and set `sponsorDeckUrl` in the settings block. While it's empty, the button becomes "Request the deck" (email).

Use WebP/AVIF where you can; `next/image` handles resizing and lazy loading.

### Registration
Registration is per session at `/events/<slug>/register` (signed-in, onboarded members). The old `/register` and `/register?step=<slug>` URLs are a 307 route handler (`app/register/route.ts`, never cached) that redirects to the right session, or to the Google Form in external mode.

- Each event row carries its own `capacity`, `price_paise` (0 = free; paid sessions use Razorpay, see section 3d), `ticket_type` (`qr` or `token`), `token_prefix` (e.g. `RAS-01`), `registration_opens_at` / `registration_closes_at` (empty = open until the session starts) and `questions` (custom questions, see `lib/registration/questions.ts`; types `text`, `textarea`, `single_choice`, `multi_choice`, `checkbox`).
- In the `registration` object of the `settings` site block, `mode: "external"` sends every Register button to `googleFormUrl` (https only; it opens in a new tab). In the default `mode: "onsite"`, `googleFormUrl` is offered as a fallback when an on-site registration fails; the placeholder `your-form-id` is ignored.

The newsletter box posts to `newsletter.endpoint` (demo mode while it is empty).

### Analytics
Set `gaId` in the `settings` block to `"G-XXXXXXX"` to enable Google Analytics 4. Register clicks, shares and sign-ups are tracked through `lib/analytics.ts`, which also forwards to Vercel Analytics if you add it.

---

## 3b. Accounts & profiles

Sign-in is **Google only** for now. The email-code form is built but hidden: flip `EMAIL_LOGIN_ENABLED` in `lib/auth/config.ts` once a sending domain and custom SMTP are set up in Supabase (its built-in email only reaches project team members).

- `/login` signs in; new users go to `/onboarding` (name and photo prefilled from Google) and then `/me`.
- `/me` is the dashboard (Overview, Profile, Settings). `/me/profile` edits the public profile; `/me/settings` holds private details (phone, IEEE ID) and sign-out.
- `/u/[handle]` is a public-style profile page, but **visible to signed-in users only**; anonymous visitors are redirected to `/login`.
- `middleware.ts` refreshes the Supabase session on the edge. It only does work when a Supabase auth cookie is present, so anonymous traffic pays nothing.
- Row-level security is covered by SQL assertion scripts in `supabase/tests/` (`profiles-rls.sql`, `security-hardening.sql`, plus the registration scripts in section 3c). Run each as a single query in the Supabase SQL editor or through the Supabase MCP `execute_sql`; they roll back and leave no data behind.
- Account deletion: users email the team for now (accounts that opened a payment checkout need admin anonymisation first, see the deletion runbook in section 3d).

---

## 3c. Registration & tickets

- Users never write the `registrations` table. Two RPCs do: `register_for_event(event_id, answers)` and `cancel_registration(registration_id)`. The public functions are security-invoker wrappers over security-definer bodies in the private schema. Each locks the event row, so capacity is never exceeded, token numbers stay unique and waitlist order is first-come-first-served.
- Full sessions take a waitlist. When a confirmed attendee cancels, waitlist #1 is confirmed immediately inside the cancel RPC. **No emails are sent yet** (no sending domain); the ticket page and My tickets always show the current status.
- Tickets: QR tickets encode only an opaque 26-character code (no personal data); token tickets show `PREFIX-0042`. `/me/tickets` lists upcoming and past tickets; each ticket can be downloaded as a PNG, added to a calendar, and cancelled (free sessions, before the start).
- The event page has a "Who's going" panel with an "N attending" line. Signed-in members see names, photos and headlines for the first 24 attendees (from the `event_attendees` view); anonymous visitors only see the count.
- SQL assertion scripts: `supabase/tests/registrations-rls.sql` and `supabase/tests/registrations-rpc.sql` (run each as one query; they roll back).
- Per-event registration settings for the seeded events live in `supabase/seed-data/registration.ts`. `npx tsx scripts/generate-seed.ts --registration-sql` prints the matching targeted-update migration; never run `supabase/seed.sql` against the live database.

---

## 3d. Payments (Razorpay), holds and the Fund Easy sync — OFF until configured

**Pre-flight: the Cloudflare account must be on Workers Paid** before payments are switched on.
- **CPU:** on Workers Free every request gets 10 ms of CPU and full page renders already exceed it intermittently (error 1102); a payment must never fail that way.
- **Bundle size:** the unminified OpenNext Worker with the Phase 4 code was about 3104 KiB gzip, 32 KiB over the Workers **Free** cap (3072 KiB). `"minify": true` in `wrangler.jsonc` brings it to about 2774 KiB, so it deploys on Free as well (Workers Paid allows 10 MiB). Keep an eye on this number (`npx wrangler deploy --dry-run --outdir <tmp>` prints it) when adding dependencies.

What it does:
- Paid sessions (`events.price_paise > 0`) are registered and paid **on st(AI)rway** with Razorpay Checkout. Members are never sent to Fund Easy.
- **Holds:** registering creates a 15-minute seat hold (`pending_payment`) that counts toward capacity. "Complete payment" with a countdown appears on the event page, the ticket and My tickets. When the hold lapses the cron tick releases the seat and promotes the waitlist.
- **Confirmation** is idempotent and happens twice: by `verifyPayment` (Checkout signature, then the payment is re-fetched from Razorpay) and by the **webhook** `POST /api/payments/webhook` (`order.paid`, `refund.processed`). A payment after the hold expired is honoured if a seat is free, otherwise the row becomes `refund_needed`. Receipts are `STW-YYYY-NNNNNN`.
- **Shared Razorpay account:** every order carries `notes.source = "stairway"`; the webhook ignores everything else with HTTP 200.
- **Refunds** are never automatic. Cancelling a paid seat makes it `refund_needed` ("Refund pending"); `lib/payments/refunds.ts` performs a full refund (the admin button arrives with the Phase 5 dashboard). A refund started from st(AI)rway (the helper, later the admin button) shows "Refunded" once Razorpay processes it; a refund made by hand in the Razorpay dashboard is **not** tracked automatically (mark it via the Phase 5 admin tool; until then use the SQL function `mark_refunded` as the service role).
- **Cron:** a Cloudflare Cron Trigger (every 5 minutes, `cloudflare/worker.ts` -> `POST /api/cron/tick`, shared secret `CRON_SECRET`) releases expired holds, promotes waitlists and drains the Fund Easy outbox. It is idle when no flag is on.
- **Fund Easy sync:** one-way, signed, idempotent, retried with backoff (`docs/integrations/fund-easy-sync.md`). The Fund Easy side is a **proposed, NOT applied** patch in `docs/integrations/fund-easy-patch/`.
- **Database:** `private.payment_orders` (ledger), `private.payment_events` (append-only log), `private.external_sync_outbox`; assertion scripts `supabase/tests/payments-*.sql` and `supabase/tests/sync-outbox.sql`.
- **Deletion runbook:** accounts that ever created a payment order cannot be deleted by cascade (`ON DELETE RESTRICT`); this includes users who only opened Checkout and never paid. The "email us to delete my account" path therefore needs admin **anonymisation** (planned for Phase 5). Until then a project owner must first anonymise or detach that user's `private.payment_orders` / `private.payment_events` rows by SQL (keep the money records), then delete the user. Token numbers are never reused.
- No Content-Security-Policy is set today. If one is added, allow `https://checkout.razorpay.com` (script) and `https://api.razorpay.com`, `https://*.razorpay.com` (frames and connections).

### Enabling payments (Razorpay TEST mode first)

Payments need **two switches**, both on:

1. **Worker secret `PAYMENTS_ENABLED` = `true`**, together with the four credentials below. Anything missing means off.
2. **The database flag**, one line in the Supabase SQL editor:

```sql
update private.feature_flags set enabled = true, updated_at = now() where key = 'payments';
```

With either switch off, paid events keep "Paid registration opens soon" and `register_for_event` raises `paid_event`.

All values are Cloudflare Worker **secrets** (`npx wrangler secret put NAME`, or Workers & Pages -> stairway -> Settings -> Variables and Secrets -> type *Secret*), never plain-text variables: **plain-text variables added in the dashboard are dropped by the next `wrangler deploy`**. Never commit them or paste them in chat.

| Secret | Value |
|---|---|
| `PAYMENTS_ENABLED` | `true` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay Dashboard -> Account & Settings -> API Keys (**test mode** first) |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you type when adding the webhook (32+ random characters) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase -> Project Settings -> API -> `service_role` (project `nfrdsdnrtsbttyrmfppy`) |
| `CRON_SECRET` | 32+ random characters (required for payments to count as enabled) |

Required Razorpay settings:
- **Payment capture = Automatic (immediate)** — Dashboard -> Account & Settings -> Payment capture. The account is shared with Fund Easy, so check it, do not assume it. st(AI)rway never captures a payment itself: with manual or delayed capture every payment stays `authorized`, "Verify" says *processing*, `order.paid` never fires, the hold lapses and Razorpay refunds the money automatically after a few days.
- **Webhook** (Dashboard -> Account & Settings -> Webhooks -> Add new): URL `https://stairway.ieeesbcek.workers.dev/api/payments/webhook`, events **`order.paid`** and **`refund.processed`**, and the secret above. Do not change Fund Easy's webhook.
- Use **TEST mode** (test keys and a test-mode webhook) until the whole checklist in `docs/payments-go-live-checklist.md` has passed; only then switch to live keys and a live-mode webhook.

To switch payments off again: delete `PAYMENTS_ENABLED` (or set it to anything but `true`) and/or set the database flag to `false`. Live holds keep counting until they expire.

### Enabling the Fund Easy sync

Only after the Fund Easy patch is applied (see its README): secrets `FUND_EASY_SYNC_ENABLED=true`, `FUND_EASY_SYNC_URL=https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync`, `STAIRWAY_SYNC_SECRET` (same value as on Fund Easy), plus `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. Registrations queued earlier are sent on the next tick.

---

## 4. Deploy (Cloudflare Workers)

The site is deployed as a Worker via OpenNext. Log in once with `npx wrangler login`.

```bash
npm run preview   # build and run the Worker locally
npm run deploy    # build and deploy to Cloudflare
```

`npm run cf-typegen` regenerates `cloudflare-env.d.ts`. Run it whenever `wrangler.jsonc` changes.

Every build prints Next 16's "middleware is deprecated, use proxy" warning. **Ignore it and do not run the `middleware` → `proxy` codemod**: `proxy.ts` runs on the Node runtime, which OpenNext on Cloudflare does not support, so the session refresh would stop working. Keep `middleware.ts` (edge) as it is.

For automatic deploys on every push, connect the repo in the Cloudflare dashboard: **Workers & Pages -> `stairway` -> Settings -> Builds -> Connect**, branch `main`, with:
- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx wrangler deploy`
- Build variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same values as `.env.local`) and `NODE_VERSION=22`

Custom domain: add it under the Worker's **Settings -> Domains & Routes**, and update the site URL in the `settings` site block so canonical URLs, the sitemap and share images use it.

---

## 5. Project structure

```
app/                 routes: /, /events/[slug], /s/[society], /gallery, /resources,
                     /register (redirect), /events/[slug]/register, /me/tickets (+ /me/tickets/[id]),
                     /api/payments/webhook, /api/cron/tick, /login, /onboarding, /me (+ /me/profile, /me/settings), /u/[handle],
                     /auth/{callback,continue,signout}, /code-of-conduct, /privacy, 404, sitemap,
                     robots, manifest, OG images
middleware.ts        edge middleware: refreshes the Supabase session cookie
cloudflare/worker.ts custom Worker entry (OpenNext fetch + Cron Trigger)
components/
  auth/              login panel, email-code form (hidden)
  dashboard/         sidebar shell for /me
  profile/           onboarding, profile and settings forms, avatar uploader, public profile view
  layout/            top bar, bottom dock, announcement strip, footer, easter egg
  sections/          every landing-page section (Hero, Stairway, Speakers, FAQ, ...)
  ui/                Poster (FieldBand, Frame, Ghost, Bands), Logo (stair wordmark), Button, Countdown, Modal, Badges, Heading, Avatar, ...
  weekend/           event detail page
  registration/      registration form, questions, CTA, attending panel
  tickets/           ticket card, actions, list items
  providers/         ClockProvider (live status), SiteDataProvider, MotionProvider
data/                static leaderboard and quiz data
lib/
  events/            event types, row mappers, status/colour helpers
  site/              site-content schema (zod), types and loader
  auth/              session lookup, auth config flag, safe `next` redirects, cookie helpers
  payments/          Razorpay REST client, signatures, order/verify actions, webhook, refunds, Checkout loader
  sync/              Fund Easy contract v1 and outbox processor
  cron/              5-minute tick (hold expiry, outbox)
  registration/      registration schemas, CTA states, errors, server reads and actions
  tickets/           token format, QR matrix, PNG export
  dashboard/         dashboard nav active-state helper
  design/            design tokens (tokens.ts, the colour source of truth), contrast maths, ghost words, hero, dock and title helpers, brand constants
  profile/           profile schema (zod), handle rules, form options, avatar crop, view mappers
  supabase/          browser, server, public and middleware clients, generated database types
supabase/            migrations, seed-data, the generated seed.sql and tests/ (SQL assertion scripts)
scripts/             generate-seed.ts, visual-check.mjs (screenshots + overflow/focus-ring report)
tests/               vitest unit tests (auth, profile, events, site, registration, tickets, design incl. contrast guards); tests/rls checks anonymous access against Supabase
design-system/       MASTER.md - the Cobalt Circuit tokens, signatures, motion and accessibility rules
```

---

## 6. Design decisions

- **Poster brutalism, calm motion.** The hero is a framed cobalt poster: stair-step `st(AI)rway` lettering that climbs one step per glyph, a faint ghost word (CLIMB, STEP 04, SUMMIT), diagonal corner bands and a light print grain. Reading content, forms, dashboards and tickets stay on cream panels with 2px ink outlines and hard shadows. Motion is limited to the one-off stair climb-in, gentle fade-up reveals, a ticker and a blinking "next up" square.
- **The stairway is still the idea.** The roadmap is a list of twelve steps; on wide screens each row sits a little further right than the last, so the column reads as a staircase. The stair mark, the favicon and the 404 page all reuse the shape. "(AI)" always sits on a yellow block.
- **Colour carries meaning.** Cobalt is the poster field, yellow means "act here" and holds the (AI) block, green means climbed or beginner, sky blue intermediate, purple advanced, orange the Summit and red urgency or errors only. Ink text never sits on cobalt. Every tag has a text label, so colour is never the only signal. Colours live in `lib/design/tokens.ts`, and a test checks every documented text/background pair against WCAG.
- **Dock-first navigation.** A floating bottom dock works the same on phones and desktops, keeping Register one tap away everywhere.
- **Content lives in the database, and time drives state.** Statuses, the countdown, the announcement strip and the spotlight all derive from dates, so the site stays correct week to week without anyone editing components.
- **Light and fast.** There's no animation library, no canvas and no smooth-scroll library. Pages are rendered on demand at the edge and the only client JavaScript is the interactive pieces.
- **Accessibility is designed in.** There's a skip link, a 3px focus ring that turns yellow on cobalt, focus-trapped modals, semantic accordions, 44px touch targets, labelled forms that focus the first error, AA contrast throughout (tested), a polite minute-level countdown announcement, and a full reduced-motion mode in which the stair lettering renders in place. Ticket QR codes are always black on white with a 4-module quiet zone.

Easter egg: type **AI** anywhere on the page.
