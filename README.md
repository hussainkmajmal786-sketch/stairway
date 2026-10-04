# st(AI)rway — Weekend AI Event Series

The website for **st(AI)rway**, a weekend AI series by the IEEE Student Branch, College of Engineering Kidangoor (IEEE SB CEK).

> Climb into the future of AI, one weekend at a time.

Built with Next.js 16 (App Router, TypeScript), Tailwind CSS 4 and Lucide icons. The look is "paper brutalism": cream graph paper, ink outlines, hard shadows and flat colour blocks (see `design-system/MASTER.md`).

---

## 1. Run it locally

You need **Node.js 20.9+**.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. For a production check:

```bash
npm run build
```

```bash
npm start
```

---

## 2. Edit the content (no component changes needed)

Everything on the site comes from `/data`:

| File | What it controls |
|---|---|
| `data/event.ts` | Name, taglines, site URL, venue + map, registration mode/links, socials, contacts, announcement bar, analytics ID |
| `data/weekends.ts` | The 12 steps: dates, topic, level, format, agenda, outcomes, seats, speakers, resources, winners |
| `data/speakers.ts` | Speaker profiles |
| `data/team.ts` | Organising committee (with fun facts for the flip cards) |
| `data/sponsors.ts` | Sponsor tiers and partners |
| `data/faq.ts` | FAQ questions and answers |
| `data/testimonials.ts` | Participant quotes |
| `data/leaderboard.ts` | Leaderboard, streak badges, featured projects |
| `data/stats.ts` | The count-up numbers |
| `data/gallery.ts` | Gallery photos and captions |
| `data/tracks.ts` | Learning tracks + the "Which step should you start from?" quiz |

### Weekend status is automatic
You never set "completed / next / upcoming" by hand. Each weekend's `start`/`end` is compared with today's date:

- `end` in the past → **Climbed ✓** (shows resources)
- first weekend not yet finished → **Next up** (pulses; the countdown, announcement bar and spotlight all target it)
- the rest → **Unlocks soon**

Use India Standard Time offsets in dates, e.g. `"2026-10-10T09:30:00+05:30"`. To force a status, set `statusOverride: "completed"`.

### Example: add resources after a weekend
```ts
// data/weekends.ts → the weekend object
resources: {
  slides: "https://drive.google.com/…",
  code: "https://github.com/ieeesbcek/stairway-step-04",
  notebook: "https://colab.research.google.com/…",
  recording: "https://www.youtube.com/embed/VIDEO_ID", // use the /embed/ URL
},
seatsFilled: 60,
```

### Example: update seats
Change `seatsFilled`. Under 20% left turns the bar amber ("Only 12 seats left on this step"); 0 shows "Step full — join the waitlist".

---

## 3. Images, logos and the registration link

- **Speaker / team photos:** put files in `public/speakers/` or `public/team/`, then set `photo: "/speakers/anjali.webp"`. Without a photo, a gradient monogram is shown.
- **Gallery photos:** put files in `public/gallery/` and set `src: "/gallery/step-01-hall.webp"` (keep `alt` descriptive). Items without `src` show generated artwork.
- **Sponsor logos:** `logo: "/sponsors/nimbus.svg"` in `data/sponsors.ts`. Without one, the name is shown as a wordmark.
- **Favicon:** `app/icon.svg`. The app icon (`app/apple-icon.tsx`) and Open Graph images (`app/opengraph-image.tsx`, `app/weekend/[slug]/opengraph-image.tsx`) are generated automatically.
- **Sponsorship deck:** put the PDF in `public/` and set `sponsorDeckUrl`. While it's empty, the button becomes "Request the deck" (email).

Use WebP/AVIF where you can; `next/image` handles resizing and lazy loading.

### Registration
In `data/event.ts → registration`:

- `mode: "external"` sends every Register button straight to `googleFormUrl`.
- `mode: "onsite"` (default) uses the built-in form at `/register`, with validation, a success screen, confetti, add-to-calendar and a WhatsApp button. Set `endpoint` to any service that accepts a JSON POST (Formspree, Getform, a Google Apps Script web app, etc.).
  **While `endpoint` is empty the form runs in demo mode:** it shows success but sends nothing, and says so on screen.

The newsletter box works the same way via `newsletter.endpoint`.

### Analytics
Set `gaId: "G-XXXXXXX"` to enable Google Analytics 4. Register clicks, shares, sign-ups and completed registrations are tracked through `lib/analytics.ts`, which also forwards to Vercel Analytics if you add it.

---

## 4. Deploy for free

### Vercel (recommended)
1. Push this folder to a GitHub repository.
2. Go to https://vercel.com/new and import the repository. The defaults are correct.
3. Click **Deploy**. Every push to `main` redeploys.

### Netlify
1. Import the repository at https://app.netlify.com/start.
2. Build command `npm run build`. Netlify's Next.js runtime is detected automatically.

### Custom domain
1. In Vercel: **Project → Settings → Domains → Add** (e.g. `stairway.ieeesbcek.org`).
2. At your DNS provider, add the record Vercel shows. For a subdomain this is a `CNAME` to `cname.vercel-dns.com`.
3. Update `siteUrl` in `data/event.ts` so canonical URLs, the sitemap and OG images use the new domain.

---

## 5. Project structure

```
app/                 routes: /, /weekend/[slug], /gallery, /resources, /register,
                     /code-of-conduct, /privacy, 404, sitemap, robots, manifest, OG images
components/
  layout/            top bar, bottom dock, announcement strip, footer, easter egg
  sections/          every landing-page section (Hero, Stairway, Speakers, FAQ, …)
  ui/                Button, Countdown, Modal, Badges, Heading, Avatar, Logo, …
  weekend/           weekend detail page
  register/          registration form
  providers/         ClockProvider (live status), MotionProvider (scroll reveals)
data/                all editable content
lib/                 dates/status, calendar (.ics + Google), JSON-LD, hooks
design-system/       MASTER.md — tokens, motion and accessibility rules
```

---

## 6. Design decisions

- **Paper brutalism, calm motion.** Cream graph paper, 2px ink outlines, hard offset shadows and flat colour blocks make the site feel like a printed event board: readable, friendly and unmistakably student-made. Motion is limited to a blur-in wordmark, gentle fade-up reveals, a ticker and a blinking "next up" square.
- **The stairway is still the idea.** The roadmap is a list of twelve steps; on wide screens each row sits a little further right than the last, so the column reads as a staircase. The stair mark, the favicon and the 404 page all reuse the shape. "(AI)" always sits on a yellow block.
- **Colour carries meaning.** Green means climbed or beginner, blue intermediate, purple advanced, orange the Summit, red urgency ("In 06 days", errors, the active dock item), and yellow means "act here". Every tag has a text label, so colour is never the only signal.
- **Dock-first navigation.** A floating bottom dock works the same on phones and desktops, keeping Register one tap away everywhere.
- **Content lives in data, and time drives state.** Statuses, the countdown, the announcement strip and the spotlight all derive from dates, so the site stays correct week to week without anyone editing components.
- **Light and fast.** There's no animation library, no canvas and no smooth-scroll library. Every page is statically pre-rendered and the only client JavaScript is the interactive pieces.
- **Accessibility is designed in.** There's a skip link, a 3px blue focus ring, focus-trapped modals, semantic accordions, 44px touch targets, labelled forms that focus the first error, AA contrast throughout, a polite minute-level countdown announcement, and a full reduced-motion mode.

Easter egg: type **AI** anywhere on the page.
