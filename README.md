# st(AI)rway — Weekend AI Event Series

The website for **st(AI)rway**, a weekend AI series by the IEEE Student Branch, College of Engineering Kidangoor (IEEE SB CEK).

> Climb into the future of AI, one weekend at a time.

Built with Next.js 16 (App Router, TypeScript), Tailwind CSS 4 and Lucide icons. The look is "paper brutalism": cream graph paper, ink outlines, hard shadows and flat colour blocks (see `design-system/MASTER.md`).

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
- **Favicon:** `app/icon.svg`. The app icon (`app/apple-icon.tsx`) and Open Graph images (`app/opengraph-image.tsx`, `app/events/[slug]/opengraph-image.tsx`) are generated automatically.
- **Sponsorship deck:** put the PDF in `public/` and set `sponsorDeckUrl` in the settings block. While it's empty, the button becomes "Request the deck" (email).

Use WebP/AVIF where you can; `next/image` handles resizing and lazy loading.

### Registration
In the `registration` object in the `settings` site block:

- `mode: "external"` sends every Register button straight to `googleFormUrl`.
- `mode: "onsite"` (default) uses the built-in form at `/register`, with validation, a success screen, confetti, add-to-calendar and a WhatsApp button. Set `registration.endpoint` to any service that accepts a JSON POST (Formspree, Getform, a Google Apps Script web app, etc.).
  **While `endpoint` is empty the form runs in demo mode:** it shows success but sends nothing, and says so on screen.

The newsletter box works the same way via `newsletter.endpoint`.

### Analytics
Set `gaId` in the `settings` block to `"G-XXXXXXX"` to enable Google Analytics 4. Register clicks, shares, sign-ups and completed registrations are tracked through `lib/analytics.ts`, which also forwards to Vercel Analytics if you add it.

---

## 3b. Accounts & profiles

Sign-in is **Google only** for now. The email-code form is built but hidden: flip `EMAIL_LOGIN_ENABLED` in `lib/auth/config.ts` once a sending domain and custom SMTP are set up in Supabase (its built-in email only reaches project team members).

- `/login` signs in; new users go to `/onboarding` (name and photo prefilled from Google) and then `/me`.
- `/me` is the dashboard (Overview, Profile, Settings). `/me/profile` edits the public profile; `/me/settings` holds private details (phone, IEEE ID) and sign-out.
- `/u/[handle]` is a public-style profile page, but **visible to signed-in users only**; anonymous visitors are redirected to `/login`.
- `middleware.ts` refreshes the Supabase session on the edge. It only does work when a Supabase auth cookie is present, so anonymous traffic pays nothing.
- Row-level security is covered by two SQL assertion scripts in `supabase/tests/` (`profiles-rls.sql`, `security-hardening.sql`). Run each as a single query in the Supabase SQL editor or through the Supabase MCP `execute_sql`; they roll back and leave no data behind.
- Account deletion: users email the team for now.

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
app/                 routes: /, /events/[slug], /s/[society], /gallery, /resources, /register,
                     /login, /onboarding, /me (+ /me/profile, /me/settings), /u/[handle],
                     /auth/{callback,continue,signout}, /code-of-conduct, /privacy, 404, sitemap,
                     robots, manifest, OG images
middleware.ts        edge middleware: refreshes the Supabase session cookie
components/
  auth/              login panel, email-code form (hidden)
  dashboard/         sidebar shell for /me
  profile/           onboarding, profile and settings forms, avatar uploader, public profile view
  layout/            top bar, bottom dock, announcement strip, footer, easter egg
  sections/          every landing-page section (Hero, Stairway, Speakers, FAQ, ...)
  ui/                Button, Countdown, Modal, Badges, Heading, Avatar, Logo, ...
  weekend/           event detail page
  register/          registration form
  providers/         ClockProvider (live status), SiteDataProvider, MotionProvider
data/                static leaderboard and quiz data
lib/
  events/            event types, row mappers, status/colour helpers
  site/              site-content schema (zod), types and loader
  auth/              session lookup, auth config flag, safe `next` redirects, cookie helpers
  profile/           profile schema (zod), handle rules, form options, avatar crop, view mappers
  supabase/          browser, server, public and middleware clients, generated database types
supabase/            migrations, seed-data, the generated seed.sql and tests/ (SQL assertion scripts)
tests/               vitest unit tests (auth, profile, events, site); tests/rls checks anonymous access against Supabase
design-system/       MASTER.md - tokens, motion and accessibility rules
```

---

## 6. Design decisions

- **Paper brutalism, calm motion.** Cream graph paper, 2px ink outlines, hard offset shadows and flat colour blocks make the site feel like a printed event board: readable, friendly and unmistakably student-made. Motion is limited to a blur-in wordmark, gentle fade-up reveals, a ticker and a blinking "next up" square.
- **The stairway is still the idea.** The roadmap is a list of twelve steps; on wide screens each row sits a little further right than the last, so the column reads as a staircase. The stair mark, the favicon and the 404 page all reuse the shape. "(AI)" always sits on a yellow block.
- **Colour carries meaning.** Green means climbed or beginner, blue intermediate, purple advanced, orange the Summit, red urgency ("In 06 days", errors, the active dock item), and yellow means "act here". Every tag has a text label, so colour is never the only signal.
- **Dock-first navigation.** A floating bottom dock works the same on phones and desktops, keeping Register one tap away everywhere.
- **Content lives in the database, and time drives state.** Statuses, the countdown, the announcement strip and the spotlight all derive from dates, so the site stays correct week to week without anyone editing components.
- **Light and fast.** There's no animation library, no canvas and no smooth-scroll library. Pages are rendered on demand at the edge and the only client JavaScript is the interactive pieces.
- **Accessibility is designed in.** There's a skip link, a 3px blue focus ring, focus-trapped modals, semantic accordions, 44px touch targets, labelled forms that focus the first error, AA contrast throughout, a polite minute-level countdown announcement, and a full reduced-motion mode.

Easter egg: type **AI** anywhere on the page.
