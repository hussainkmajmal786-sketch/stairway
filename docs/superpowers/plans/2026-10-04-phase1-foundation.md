# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all site content into a Supabase database, give every society its own stairway page, rename weekend pages to `/events/[slug]`, and run the site as a server-rendered Next.js app on Cloudflare Workers with GitHub auto-deploy.

**Architecture:** A new Supabase project holds societies, tracks, events, speakers and site content behind row-level security. The Next.js root layout loads all public site data once per request through `getSiteData()` (server) and hands it to client components through `SiteDataProvider`; server components call `getSiteData()` directly. The app is built with OpenNext (`@opennextjs/cloudflare`) and deployed as a Cloudflare Worker; Cloudflare Workers Builds redeploys on every push to `main`.

**Tech Stack:** Next.js 16.3.8 (App Router), React 19, Tailwind 4, Supabase (`@supabase/supabase-js` 2.x, `@supabase/ssr` 0.12.x), zod 4, Vitest 5, tsx, `@opennextjs/cloudflare` 1.20.x, Wrangler 4.

**Spec:** `docs/superpowers/specs/2026-10-04-platform-backend-design.md` (sections 2, 3, 4-Public, 6, 7-Phase 1, 8).

## Global Constraints

- Next.js version stays `16.3.8`; OpenNext peer range requires `>=16.3.8`.
- **No `proxy.ts` / `middleware.ts`** — OpenNext does not support Node-runtime proxy.
- **No `export const runtime = "edge"`** anywhere (OpenNext requires the Node runtime).
- Supabase project region: `ap-south-1` (Mumbai), in org `dwujocxbckbcoezunblq`.
- Secrets never enter git. Public env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase "publishable"/anon key).
- Money is stored in **paise** (integer). Timestamps are `timestamptz`; display timezone `Asia/Kolkata`.
- Society slugs: `main`, `cs`, `ias`, `ras`, `wie`. Society colours (design tokens): main `yellow`, cs `blue`, ias `orange`, ras `green`, wie `purple`.
- UI style rules in `design-system/MASTER.md` apply (paper brutalism, ink borders, hard shadows, square corners, 44px touch targets below 1024px).
- Keep the site name exactly `st(AI)rway`.
- Every task ends with `npx tsc --noEmit`, `npx eslint .` and `npx vitest run` passing, then a commit ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Exception:** Tasks 4 and 5 change shared types before Task 6 rewires the components, so between them only the task's own Vitest files are the gate; Task 6 restores the full `tsc`/`eslint` gate.

## File Map

| Path | Responsibility |
|---|---|
| `supabase/migrations/20261004000001_foundation.sql` | Phase 1 schema, RLS, helper functions, storage bucket |
| `supabase/seed-data/*.ts` | Seed source content (moved from `/data`) + WIE sessions + society map |
| `scripts/generate-seed.ts` | Pure function `buildSeedSql()` + CLI writing `supabase/seed.sql` |
| `supabase/seed.sql` | Generated seed (committed) |
| `lib/env.ts` | Validated public env vars |
| `lib/supabase/database.types.ts` | Generated DB types |
| `lib/supabase/public.ts` | Cookie-less anon client for public reads |
| `lib/supabase/server.ts` | Cookie-aware server client (used from Phase 2) |
| `lib/supabase/browser.ts` | Browser client (used from Phase 2) |
| `lib/events/types.ts` | `EventView`, `EventWithStatus`, `SocietyView`, `TrackView` |
| `lib/events/mappers.ts` | DB rows → view types |
| `lib/events/status.ts` | Per-society status, next-session helpers |
| `lib/site/schema.ts` | zod schema + type for the `settings` site block |
| `lib/site/types.ts` | `SiteData` and content item types |
| `lib/site/load.ts` | `getSiteData()` (server, request-cached) |
| `components/providers/SiteDataProvider.tsx` | Client context exposing `SiteData` |
| `components/sections/Societies.tsx` | Home society cards + level quiz (replaces `Tracks.tsx`) |
| `app/s/[society]/page.tsx` | Society page with its stairway |
| `app/events/[slug]/*` | Event page + OG image (moved from `app/weekend/[slug]`) |
| `wrangler.jsonc`, `open-next.config.ts`, `cloudflare-env.d.ts` | Cloudflare Workers deployment |
| `tests/**` | Vitest unit + RLS integration tests |

---

### Task 1: Supabase project and foundation schema

**Files:**
- Create: `supabase/migrations/20261004000001_foundation.sql`

**Interfaces:**
- Produces: tables `societies`, `tracks`, `speakers`, `events`, `event_speakers`, `site_blocks`, `sponsors`, `team_members`, `faqs`, `testimonials`, `gallery_items`, `admin_roles`; enums `event_status`, `ticket_type`, `event_mode`, `admin_role`; functions `public.is_super_admin() returns boolean`, `public.is_society_admin(sid uuid) returns boolean`, `public.is_any_admin() returns boolean`; view `public.event_seat_counts(event_id uuid, seats_taken int)`; public storage bucket `media`.

- [ ] **Step 1: Create the Supabase project**

Use the Supabase MCP tools: `get_cost` (type `project`, org `dwujocxbckbcoezunblq`) → `confirm_cost` → `create_project` with name `stairway`, region `ap-south-1`, organization `dwujocxbckbcoezunblq`. Poll `get_project` until `status` is `ACTIVE_HEALTHY`. Record the project ref (call it `<REF>`) in the task notes; later tasks use it.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20261004000001_foundation.sql`:

```sql
-- st(AI)rway — Phase 1 foundation schema
create extension if not exists pgcrypto;

create type public.event_status as enum ('draft', 'published', 'cancelled');
create type public.ticket_type  as enum ('qr', 'token');
create type public.event_mode   as enum ('offline', 'online', 'hybrid');
create type public.admin_role   as enum ('super_admin', 'society_admin');

-- updated_at helper
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ───────── societies & tracks ─────────
create table public.societies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,20}$'),
  name text not null,
  short_name text not null,
  description text not null default '',
  logo_url text,
  color text not null check (color in ('yellow','blue','green','red','orange','purple')),
  sort_order int not null default 0,
  page_content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete cascade,
  name text not null,
  description text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (society_id, name)
);

-- ───────── speakers ─────────
create table public.speakers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  society_id uuid references public.societies(id) on delete set null,
  name text not null,
  designation text not null default '',
  organization text not null default '',
  photo_url text,
  bio text not null default '',
  topic text not null default '',
  links jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────── events ─────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete restrict,
  track_id uuid references public.tracks(id) on delete set null,
  step_number int not null check (step_number > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  title text not null,
  topic text not null default '',
  summary text not null default '',
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text not null default '',
  mode public.event_mode not null default 'offline',
  poster_url text,
  video_url text,
  level text not null default 'All levels'
    check (level in ('Beginner','Intermediate','Advanced','Expert','All levels')),
  formats text[] not null default '{}',
  agenda jsonb not null default '[]'::jsonb,
  outcomes text[] not null default '{}',
  prerequisites text[] not null default '{}',
  bring text[] not null default '{}',
  capacity int not null default 60 check (capacity >= 0),
  price_paise int not null default 0 check (price_paise >= 0),
  ticket_type public.ticket_type not null default 'qr',
  token_prefix text not null default '',
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  status public.event_status not null default 'draft',
  is_finale boolean not null default false,
  resources jsonb not null default '{}'::jsonb,
  winners jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (society_id, step_number),
  check (ends_at > starts_at)
);
create index events_society_start_idx on public.events (society_id, starts_at);

create table public.event_speakers (
  event_id uuid not null references public.events(id) on delete cascade,
  speaker_id uuid not null references public.speakers(id) on delete cascade,
  sort_order int not null default 0,
  primary key (event_id, speaker_id)
);

-- Phase 3 replaces this with real registration counts.
create view public.event_seat_counts with (security_invoker = true) as
  select e.id as event_id, 0::int as seats_taken from public.events e;

-- ───────── site content ─────────
create table public.site_blocks (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null default '',
  logo_url text,
  tier text not null,
  tier_size text not null default 'md' check (tier_size in ('xl','lg','md','sm')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  "group" text not null,
  photo_url text,
  fun_fact text not null default '',
  links jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null,
  name text not null,
  detail text not null default '',
  step_label text not null default '',
  photo_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  society_id uuid references public.societies(id) on delete set null,
  image_url text,
  caption text not null default '',
  alt text not null default '',
  ratio text not null default 'square' check (ratio in ('tall','wide','square')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────── admin roles ─────────
create table public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.admin_role not null,
  society_id uuid references public.societies(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((role = 'super_admin' and society_id is null) or (role = 'society_admin' and society_id is not null)),
  unique nulls not distinct (user_id, society_id)
);

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_roles r
                 where r.user_id = (select auth.uid()) and r.role = 'super_admin');
$$;

create or replace function public.is_society_admin(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_roles r
                 where r.user_id = (select auth.uid())
                   and (r.role = 'super_admin' or (r.role = 'society_admin' and r.society_id = sid)));
$$;

create or replace function public.is_any_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_roles r where r.user_id = (select auth.uid()));
$$;

-- updated_at triggers
do $$ declare t text; begin
  foreach t in array array['societies','tracks','speakers','events','sponsors','team_members','faqs','testimonials','gallery_items','site_blocks'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ───────── row-level security ─────────
alter table public.societies     enable row level security;
alter table public.tracks        enable row level security;
alter table public.speakers      enable row level security;
alter table public.events        enable row level security;
alter table public.event_speakers enable row level security;
alter table public.site_blocks   enable row level security;
alter table public.sponsors      enable row level security;
alter table public.team_members  enable row level security;
alter table public.faqs          enable row level security;
alter table public.testimonials  enable row level security;
alter table public.gallery_items enable row level security;
alter table public.admin_roles   enable row level security;

-- public reads
create policy "read societies"     on public.societies     for select using (true);
create policy "read tracks"        on public.tracks        for select using (true);
create policy "read speakers"      on public.speakers      for select using (true);
create policy "read site_blocks"   on public.site_blocks   for select using (true);
create policy "read sponsors"      on public.sponsors      for select using (true);
create policy "read team"          on public.team_members  for select using (true);
create policy "read faqs"          on public.faqs          for select using (true);
create policy "read testimonials"  on public.testimonials  for select using (true);
create policy "read gallery"       on public.gallery_items for select using (true);
create policy "read published events" on public.events for select
  using (status = 'published' or public.is_society_admin(society_id));
create policy "read event speakers" on public.event_speakers for select
  using (exists (select 1 from public.events e where e.id = event_id
                 and (e.status = 'published' or public.is_society_admin(e.society_id))));
create policy "read own admin role" on public.admin_roles for select
  using (user_id = (select auth.uid()) or public.is_super_admin());

-- writes: society-scoped
create policy "admins write events" on public.events for all
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));
create policy "admins write event speakers" on public.event_speakers for all
  using (exists (select 1 from public.events e where e.id = event_id and public.is_society_admin(e.society_id)))
  with check (exists (select 1 from public.events e where e.id = event_id and public.is_society_admin(e.society_id)));
create policy "admins write tracks" on public.tracks for all
  using (public.is_society_admin(society_id)) with check (public.is_society_admin(society_id));
create policy "admins update own society" on public.societies for update
  using (public.is_society_admin(id)) with check (public.is_society_admin(id));
create policy "admins write speakers" on public.speakers for all
  using (public.is_any_admin()) with check (public.is_any_admin());
create policy "admins write gallery" on public.gallery_items for all
  using (public.is_super_admin() or (society_id is not null and public.is_society_admin(society_id)))
  with check (public.is_super_admin() or (society_id is not null and public.is_society_admin(society_id)));

-- writes: super admin only
create policy "super admin societies insert/delete" on public.societies for insert with check (public.is_super_admin());
create policy "super admin societies delete" on public.societies for delete using (public.is_super_admin());
create policy "super admin site_blocks"  on public.site_blocks  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin sponsors"     on public.sponsors     for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin team"         on public.team_members for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin faqs"         on public.faqs         for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin testimonials" on public.testimonials for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin admin_roles"  on public.admin_roles  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ───────── storage: public media bucket ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 104857600,
        array['image/png','image/jpeg','image/webp','image/avif','image/svg+xml','video/mp4','video/webm','application/pdf'])
on conflict (id) do nothing;

create policy "admins upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_any_admin());
create policy "admins update media" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_any_admin());
create policy "admins delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_any_admin());
```

- [ ] **Step 3: Apply the migration**

Use MCP `apply_migration` with project `<REF>`, name `foundation`, query = the file contents.
Expected: success.

- [ ] **Step 4: Verify tables, RLS and advisors**

Run MCP `list_tables` (schemas `["public"]`). Expected: the 12 tables listed, all with `rls_enabled: true`.
Run MCP `get_advisors` type `security`. Expected: no `rls_disabled_in_public` errors. Fix any `function_search_path_mutable` warnings by adding `set search_path = ''` (already present on all functions).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261004000001_foundation.sql
git commit -m "feat(db): foundation schema for societies, events and site content"
```

---

### Task 2: Seed data generator (Vitest + tsx)

**Files:**
- Create: `vitest.config.ts`, `scripts/generate-seed.ts`, `supabase/seed-data/societies.ts`, `supabase/seed-data/wie-events.ts`, `supabase/seed-data/event-map.ts`, `tests/seed/generate-seed.test.ts`, `supabase/seed.sql`
- Move (git mv): `data/event.ts`, `data/weekends.ts`, `data/speakers.ts`, `data/team.ts`, `data/sponsors.ts`, `data/faq.ts`, `data/testimonials.ts`, `data/gallery.ts`, `data/stats.ts`, `data/types.ts` → `supabase/seed-data/` **in Task 6** (components still import them until then). This task imports them from `@/data/*`.
- Modify: `package.json` (devDependencies + `test`, `seed:generate` scripts)

**Interfaces:**
- Consumes: Task 1 schema (column names).
- Produces: `buildSeedSql(input: SeedInput): string` and `sqlLiteral(v: unknown): string` in `scripts/generate-seed.ts`; `SOCIETIES: SocietySeed[]`, `EVENT_SOCIETY_MAP: Record<string, { society: string; track: string; step: number }>`, `WIE_EVENTS: SeedEvent[]`.

- [ ] **Step 1: Install test tooling**

```bash
npm install -D vitest@5 tsx@4 @vitest/coverage-v8@5
npm install zod@4
```

Add to `package.json` `scripts`:

```json
"test": "vitest run",
"seed:generate": "tsx scripts/generate-seed.ts"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 2: Write society + mapping seed data**

Create `supabase/seed-data/societies.ts`:

```ts
export interface SocietySeed {
  slug: "main" | "cs" | "ias" | "ras" | "wie";
  name: string;
  shortName: string;
  color: "yellow" | "blue" | "green" | "red" | "orange" | "purple";
  description: string;
  tracks: string[];
}

export const SOCIETIES: SocietySeed[] = [
  {
    slug: "main", name: "IEEE Student Branch CEK", shortName: "Main IEEE", color: "yellow",
    description: "The branch-wide stairway: research, security, data and generative media.",
    tracks: ["AI × Research & Innovation", "AI × Cybersecurity", "AI × Data Analytics", "AI × Generative Media"],
  },
  {
    slug: "cs", name: "IEEE Computer Society", shortName: "CS", color: "blue",
    description: "Build software with AI: web, apps, cloud and engineering practice.",
    tracks: ["AI × Web Development", "AI × App Development", "AI × Cloud & DevOps", "AI × Software Engineering"],
  },
  {
    slug: "ias", name: "IEEE Industry Applications Society", shortName: "IAS", color: "orange",
    description: "AI on the factory floor: automation, maintenance, twins and manufacturing.",
    tracks: ["AI × Industrial Automation", "AI × Predictive Maintenance", "AI × Digital Twins", "AI × Smart Manufacturing"],
  },
  {
    slug: "ras", name: "IEEE Robotics & Automation Society", shortName: "RAS", color: "green",
    description: "Machines that see and move: robotics, vision, autonomy and ROS.",
    tracks: ["AI × Robotics", "AI × Computer Vision", "AI × Autonomous Systems", "AI × ROS"],
  },
  {
    slug: "wie", name: "IEEE Women in Engineering", shortName: "WIE", color: "purple",
    description: "Women building AI for everyone — health, inclusion, impact and leadership.",
    tracks: ["AI × HealthTech", "AI × Inclusive Design", "AI × Social Impact", "AI × Entrepreneurship & Leadership"],
  },
];
```

Create `supabase/seed-data/event-map.ts` (where each existing step moves):

```ts
// Existing 12 sessions → society stairway, track and per-society step number.
export const EVENT_SOCIETY_MAP: Record<string, { society: string; track: string; step: number; finale?: boolean }> = {
  "ai-unlocked":               { society: "main", track: "AI × Research & Innovation", step: 1 },
  "python-for-ai":             { society: "main", track: "AI × Data Analytics", step: 2 },
  "ml-from-scratch":           { society: "main", track: "AI × Data Analytics", step: 3 },
  "deep-learning-decoded":     { society: "main", track: "AI × Research & Innovation", step: 4 },
  "inside-llms":               { society: "main", track: "AI × Generative Media", step: 5 },
  "generative-ai":             { society: "main", track: "AI × Generative Media", step: 6 },
  "responsible-ai":            { society: "main", track: "AI × Cybersecurity", step: 7 },
  "the-summit":                { society: "main", track: "AI × Research & Innovation", step: 8, finale: true },
  "language-and-machines":     { society: "cs", track: "AI × Software Engineering", step: 1 },
  "prompt-engineering-agents": { society: "cs", track: "AI × Web Development", step: 2 },
  "seeing-machines":           { society: "ras", track: "AI × Computer Vision", step: 1 },
  "ai-on-the-edge":            { society: "ias", track: "AI × Industrial Automation", step: 1 },
};
```

Create `supabase/seed-data/wie-events.ts`:

```ts
import type { Weekend } from "@/data/types";

type WieEvent = Omit<Weekend, "track" | "seatsFilled" | "statusOverride"> & { trackName: string };

const day = (title: string, lab: string) => [
  { time: "09:30", title: "Check-in & coffee" },
  { time: "10:00", title },
  { time: "11:45", title: "Guided walkthrough" },
  { time: "13:00", title: "Lunch" },
  { time: "14:00", title: lab, detail: "Work in pairs. Mentors float between tables." },
  { time: "16:00", title: "Show & tell and wrap-up" },
];

export const WIE_EVENTS: WieEvent[] = [
  {
    step: 1, slug: "wie-ai-healthtech", title: "Code Her Way: AI in HealthTech", topic: "Medical data, diagnosis models and ethics",
    trackName: "AI × HealthTech", start: "2026-10-17T09:30:00+05:30", end: "2026-10-17T16:30:00+05:30",
    level: "Beginner", formats: ["Workshop"],
    summary: "Build a small diagnostic model on open health data and learn where AI helps — and where it must not decide alone.",
    description: "Start with how hospitals actually use AI today, then train a simple classifier on an open medical dataset and examine its mistakes. We close with the questions every health-AI builder must answer: consent, bias and accountability.",
    outcomes: ["Explain common uses of AI in healthcare", "Train and evaluate a simple diagnostic classifier", "Spot bias in a medical dataset", "Apply a responsible-AI checklist to a health project"],
    prerequisites: ["None — beginners welcome"], bring: ["Laptop and charger", "A Google account for Colab"],
    agenda: day("Talk: AI in Indian healthcare today", "Diagnose-with-data lab"),
    speakerIds: ["meera-krishnan"], seatsTotal: 60,
  },
  {
    step: 2, slug: "wie-designing-ai-for-everyone", title: "Designing AI for Everyone", topic: "Accessible, inclusive AI products",
    trackName: "AI × Inclusive Design", start: "2026-10-31T09:30:00+05:30", end: "2026-10-31T16:30:00+05:30",
    level: "Beginner", formats: ["Workshop"],
    summary: "Make AI products that work for people the tutorials forget — accessibility, language and context.",
    description: "Explore how voice assistants, captioning and recommendation systems fail different users, then redesign an AI feature with accessibility and local-language users in mind. Hands-on with speech and vision APIs.",
    outcomes: ["Audit an AI feature for accessibility gaps", "Prototype an inclusive AI interaction", "Use speech and vision APIs in a small demo"],
    prerequisites: ["None"], bring: ["Laptop and charger"],
    agenda: day("Talk: Who does AI leave out?", "Redesign-an-AI-feature sprint"),
    speakerIds: ["sneha-thomas"], seatsTotal: 60,
  },
  {
    step: 3, slug: "wie-ai-for-good", title: "AI for Good: Social Impact Sprint", topic: "Solving local problems with AI",
    trackName: "AI × Social Impact", start: "2026-11-14T09:30:00+05:30", end: "2026-11-14T17:00:00+05:30",
    level: "Intermediate", formats: ["Competition"],
    summary: "A one-day build sprint on real problems from Kottayam — water, transport, safety and education.",
    description: "Teams of two to four pick a local problem statement, find data, and prototype an AI-assisted solution in a day. Mentors help scope; a jury picks three teams to present at the next WIE session.",
    outcomes: ["Scope a social-impact problem for AI", "Prototype a working demo in a day", "Pitch the impact and limits of your solution"],
    prerequisites: ["Basic Python", "Teams of 2–4 (solo sign-ups get matched)"], bring: ["Laptop and charger", "Your team"],
    agenda: [
      { time: "09:30", title: "Problem statements & team formation" },
      { time: "10:30", title: "Build sprint begins" },
      { time: "13:00", title: "Lunch + mentor round" },
      { time: "15:30", title: "Demos" },
      { time: "16:30", title: "Jury results" },
    ],
    speakerIds: ["anjali-nair"], seatsTotal: 80,
  },
  {
    step: 4, slug: "wie-lead-with-ai", title: "Lead with AI: Founders & Leaders Panel", topic: "Careers, startups and leadership in AI",
    trackName: "AI × Entrepreneurship & Leadership", start: "2026-11-28T10:00:00+05:30", end: "2026-11-28T15:00:00+05:30",
    level: "All levels", formats: ["Panel", "Talk"],
    summary: "Women founders and engineering leaders on building careers and companies in AI.",
    description: "An afternoon of honest conversations: getting your first AI role, starting up from Kerala, leading technical teams and negotiating your worth. Speed-mentoring tables close the day.",
    outcomes: ["Map career paths into AI", "Learn how founders validate AI startup ideas", "Get one-to-one advice at mentoring tables"],
    prerequisites: ["None"], bring: ["Questions", "Your CV if you want feedback"],
    agenda: [
      { time: "10:00", title: "Opening keynote" },
      { time: "10:45", title: "Panel: Building a career in AI" },
      { time: "12:15", title: "Lunch" },
      { time: "13:15", title: "Speed-mentoring tables" },
      { time: "14:30", title: "Closing & next steps" },
    ],
    speakerIds: ["anjali-nair", "meera-krishnan", "sneha-thomas"], seatsTotal: 120,
  },
];
```

> Speaker slugs must match the `id` values in `data/speakers.ts` (`anjali-nair`, `meera-krishnan`, `sneha-thomas`, …).

- [ ] **Step 3: Write the failing test**

Create `tests/seed/generate-seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSeedSql, sqlLiteral } from "@/scripts/generate-seed";

describe("sqlLiteral", () => {
  it("escapes single quotes and handles null", () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral(null)).toBe("null");
    expect(sqlLiteral(undefined)).toBe("null");
  });
  it("renders numbers, booleans, text arrays and json", () => {
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(true)).toBe("true");
    expect(sqlLiteral(["a", "b'c"])).toBe("array['a','b''c']::text[]");
    expect(sqlLiteral({ a: "x'y" })).toBe(`'{"a":"x''y"}'::jsonb`);
  });
});

describe("buildSeedSql", () => {
  const sql = buildSeedSql();

  it("seeds all five societies and twenty tracks", () => {
    for (const slug of ["main", "cs", "ias", "ras", "wie"]) expect(sql).toContain(`'${slug}'`);
    expect(sql.match(/insert into public\.tracks/g)?.length).toBe(20);
  });

  it("maps every existing session onto a society stairway", () => {
    expect(sql).toMatch(/'seeing-machines'[\s\S]*?where s\.slug = 'ras'/);
    expect(sql).toMatch(/'the-summit'[\s\S]*?true/); // is_finale
  });

  it("publishes the four WIE sessions", () => {
    for (const slug of ["wie-ai-healthtech", "wie-designing-ai-for-everyone", "wie-ai-for-good", "wie-lead-with-ai"])
      expect(sql).toContain(`'${slug}'`);
  });

  it("is idempotent (truncates content tables first)", () => {
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql).toContain("truncate table public.event_speakers, public.gallery_items, public.events");
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/seed`
Expected: FAIL — `Cannot find module '@/scripts/generate-seed'`.

- [ ] **Step 5: Implement the generator**

Create `scripts/generate-seed.ts`:

```ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { event as settings } from "@/data/event";
import { weekends } from "@/data/weekends";
import { speakers } from "@/data/speakers";
import { team } from "@/data/team";
import { sponsorTiers } from "@/data/sponsors";
import { faqs } from "@/data/faq";
import { testimonials } from "@/data/testimonials";
import { gallery } from "@/data/gallery";
import { stats } from "@/data/stats";
import { SOCIETIES } from "@/supabase/seed-data/societies";
import { EVENT_SOCIETY_MAP } from "@/supabase/seed-data/event-map";
import { WIE_EVENTS } from "@/supabase/seed-data/wie-events";

export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  if (Array.isArray(v) && v.every((x) => typeof x === "string"))
    return `array[${v.map(sqlLiteral).join(",")}]::text[]`;
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
}

const L = sqlLiteral;
const emptyText = "'{}'::text[]";
const arr = (a: readonly string[]) => (a.length ? L([...a]) : emptyText);

interface EventSeedRow {
  slug: string; society: string; track: string; step: number; finale: boolean;
  title: string; topic: string; summary: string; description: string;
  start: string; end: string; level: string; formats: readonly string[];
  agenda: unknown; outcomes: readonly string[]; prerequisites: readonly string[]; bring: readonly string[];
  capacity: number; resources: unknown; winners: unknown; speakerIds: readonly string[];
}

function eventRows(): EventSeedRow[] {
  const existing = weekends.map((w) => {
    const m = EVENT_SOCIETY_MAP[w.slug];
    if (!m) throw new Error(`No society mapping for ${w.slug}`);
    return {
      slug: w.slug, society: m.society, track: m.track, step: m.step, finale: !!m.finale,
      title: w.title, topic: w.topic, summary: w.summary, description: w.description,
      start: w.start, end: w.end, level: w.level, formats: w.formats, agenda: w.agenda,
      outcomes: w.outcomes, prerequisites: w.prerequisites, bring: w.bring, capacity: w.seatsTotal,
      resources: w.resources ?? {}, winners: w.winners ?? [], speakerIds: w.speakerIds,
    };
  });
  const wie = WIE_EVENTS.map((w) => ({
    slug: w.slug, society: "wie", track: w.trackName, step: w.step, finale: false,
    title: w.title, topic: w.topic, summary: w.summary, description: w.description,
    start: w.start, end: w.end, level: w.level, formats: w.formats, agenda: w.agenda,
    outcomes: w.outcomes, prerequisites: w.prerequisites, bring: w.bring, capacity: w.seatsTotal,
    resources: {}, winners: [], speakerIds: w.speakerIds,
  }));
  return [...existing, ...wie];
}

export function buildSeedSql(): string {
  const out: string[] = ["begin;"];
  out.push(
    "truncate table public.event_speakers, public.gallery_items, public.events, public.tracks, public.speakers, public.societies, public.sponsors, public.team_members, public.faqs, public.testimonials, public.site_blocks restart identity cascade;",
  );

  // site blocks: settings (the old data/event.ts shape) + stats
  out.push(`insert into public.site_blocks (key, data) values ('settings', ${L(settings)}), ('stats', ${L({ items: stats })});`);

  SOCIETIES.forEach((s, i) => {
    out.push(
      `insert into public.societies (slug, name, short_name, description, color, sort_order) values (${L(s.slug)}, ${L(s.name)}, ${L(s.shortName)}, ${L(s.description)}, ${L(s.color)}, ${i});`,
    );
    s.tracks.forEach((t, j) => {
      out.push(
        `insert into public.tracks (society_id, name, sort_order) select s.id, ${L(t)}, ${j} from public.societies s where s.slug = ${L(s.slug)};`,
      );
    });
  });

  speakers.forEach((sp, i) => {
    out.push(
      `insert into public.speakers (slug, name, designation, organization, photo_url, bio, topic, links, sort_order) values (${L(sp.id)}, ${L(sp.name)}, ${L(sp.designation)}, ${L(sp.organization)}, ${L(sp.photo ?? null)}, ${L(sp.bio)}, ${L(sp.topic)}, ${L(sp.links)}, ${i});`,
    );
  });

  for (const e of eventRows()) {
    const prefix = `${e.society.toUpperCase()}-${String(e.step).padStart(2, "0")}`;
    out.push(
      `insert into public.events (society_id, track_id, step_number, slug, title, topic, summary, description, starts_at, ends_at, venue, level, formats, agenda, outcomes, prerequisites, bring, capacity, price_paise, ticket_type, token_prefix, status, is_finale, resources, winners)
select s.id, t.id, ${e.step}, ${L(e.slug)}, ${L(e.title)}, ${L(e.topic)}, ${L(e.summary)}, ${L(e.description)}, ${L(e.start)}, ${L(e.end)}, ${L(settings.venue.hall)}, ${L(e.level)}, ${arr(e.formats)}, ${L(e.agenda)}, ${arr(e.outcomes)}, ${arr(e.prerequisites)}, ${arr(e.bring)}, ${e.capacity}, 0, 'qr', ${L(prefix)}, 'published', ${L(e.finale)}, ${L(e.resources)}, ${L(e.winners)}
from public.societies s left join public.tracks t on t.society_id = s.id and t.name = ${L(e.track)} where s.slug = ${L(e.society)};`,
    );
    e.speakerIds.forEach((sid, k) => {
      out.push(
        `insert into public.event_speakers (event_id, speaker_id, sort_order) select e.id, sp.id, ${k} from public.events e, public.speakers sp where e.slug = ${L(e.slug)} and sp.slug = ${L(sid)};`,
      );
    });
  }

  let order = 0;
  for (const tier of sponsorTiers) {
    for (const sp of tier.sponsors) {
      out.push(
        `insert into public.sponsors (name, url, logo_url, tier, tier_size, sort_order) values (${L(sp.name)}, ${L(sp.url)}, ${L(sp.logo ?? null)}, ${L(tier.tier)}, ${L(tier.size)}, ${order++});`,
      );
    }
  }
  team.forEach((m, i) =>
    out.push(
      `insert into public.team_members (name, role, "group", photo_url, fun_fact, links, sort_order) values (${L(m.name)}, ${L(m.role)}, ${L(m.group)}, ${L(m.photo ?? null)}, ${L(m.funFact)}, ${L(m.links)}, ${i});`,
    ),
  );
  faqs.forEach((f, i) => out.push(`insert into public.faqs (question, answer, sort_order) values (${L(f.q)}, ${L(f.a)}, ${i});`));
  testimonials.forEach((t, i) =>
    out.push(
      `insert into public.testimonials (quote, name, detail, step_label, photo_url, sort_order) values (${L(t.quote)}, ${L(t.name)}, ${L(t.detail)}, ${L(t.step)}, ${L(t.photo ?? null)}, ${i});`,
    ),
  );
  gallery.forEach((g, i) => {
    const w = weekends.find((x) => x.step === g.step);
    out.push(
      `insert into public.gallery_items (event_id, society_id, image_url, caption, alt, ratio, sort_order) select e.id, e.society_id, ${L(g.src ?? null)}, ${L(g.caption)}, ${L(g.alt)}, ${L(g.ratio)}, ${i} from public.events e where e.slug = ${L(w?.slug ?? "")};`,
    );
  });

  out.push("commit;");
  return out.join("\n") + "\n";
}

// CLI: `npm run seed:generate` writes supabase/seed.sql
if (process.argv[1] && path.basename(process.argv[1]).startsWith("generate-seed")) {
  const file = path.resolve(process.cwd(), "supabase/seed.sql");
  writeFileSync(file, buildSeedSql());
  console.log(`wrote ${file}`);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/seed`
Expected: PASS (6 tests).

- [ ] **Step 7: Generate and apply the seed**

```bash
npm run seed:generate
```

Expected: `wrote …/supabase/seed.sql`. Apply with MCP `execute_sql` (project `<REF>`) using the file contents. Then verify:

```sql
select s.slug, count(e.*) as events from public.societies s left join public.events e on e.society_id = s.id group by s.slug order by s.slug;
```

Expected: `cs 2, ias 1, main 8, ras 1, wie 4`.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts scripts/generate-seed.ts supabase/seed-data supabase/seed.sql tests/seed package.json package-lock.json
git commit -m "feat(db): seed generator with society stairways and WIE sessions"
```

---

### Task 3: Supabase clients, env and generated types

**Files:**
- Create: `lib/env.ts`, `lib/supabase/public.ts`, `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/database.types.ts`, `.env.example`, `tests/env.test.ts`
- Create (local only, gitignored): `.env.local`

**Interfaces:**
- Produces: `publicEnv: { supabaseUrl: string; supabaseAnonKey: string }`; `parsePublicEnv(raw: Record<string, string | undefined>)`; `createPublicClient(): SupabaseClient<Database>`; `createServerClient(): Promise<SupabaseClient<Database>>` (exported name `createClient` from `lib/supabase/server.ts`); `createBrowserClient(): SupabaseClient<Database>` (exported name `createClient` from `lib/supabase/browser.ts`); type `Database`.

- [ ] **Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js@2 @supabase/ssr@0.12
```

- [ ] **Step 2: Write the failing env test**

Create `tests/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "@/lib/env";

describe("parsePublicEnv", () => {
  it("accepts a valid url and key", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_1234567890abcdef",
    });
    expect(env.supabaseUrl).toBe("https://abc.supabase.co");
  });
  it("throws a readable error when missing", () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/env.test.ts`
Expected: FAIL — module `@/lib/env` not found.

- [ ] **Step 4: Implement env + clients**

Create `lib/env.ts`:

```ts
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a URL" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string({ message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" }).min(20),
});

export function parsePublicEnv(raw: Record<string, string | undefined>) {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const fields = r.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid env: ${fields}. Copy .env.example to .env.local.`);
  }
  return { supabaseUrl: r.data.NEXT_PUBLIC_SUPABASE_URL, supabaseAnonKey: r.data.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

// Next inlines NEXT_PUBLIC_* at build time, so reference them literally.
export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
```

> `publicEnv` evaluates on import; `tests/env.test.ts` imports only `parsePublicEnv`, but importing the module still runs the top-level parse. Guard it: change the last statement to

```ts
export const publicEnv = (() => {
  try {
    return parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  } catch (e) {
    if (process.env.VITEST) return { supabaseUrl: "http://localhost", supabaseAnonKey: "test-key-0000000000" };
    throw e;
  }
})();
```

Create `lib/supabase/public.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

/** Anonymous, cookie-less client for public reads (cache-friendly, RLS as `anon`). */
export function createPublicClient() {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

/** Per-request client bound to the user's session cookies (RLS as the signed-in user). */
export async function createClient() {
  const store = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The browser
          // client refreshes the session instead (no proxy on OpenNext).
        }
      },
    },
  });
}
```

Create `lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

export function createClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
```

- [ ] **Step 5: Generate types and write env files**

Run MCP `generate_typescript_types` (project `<REF>`); save the output verbatim to `lib/supabase/database.types.ts`.
Run MCP `get_project_url` and `get_publishable_keys` (project `<REF>`).

Create `.env.example`:

```bash
# Supabase (Project Settings → API). The anon/publishable key is safe in the browser.
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

Create `.env.local` with the real URL and publishable key (already gitignored by `.env*` in `.gitignore`; confirm with `git check-ignore .env.local`, expected output `.env.local`). Add `!.env.example` to `.gitignore` so the example is committed.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/env.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/env.ts lib/supabase .env.example .gitignore tests/env.test.ts package.json package-lock.json
git commit -m "feat: supabase clients, validated env and generated types"
```

---

### Task 4: Event domain layer (views, mappers, per-society status)

**Files:**
- Create: `lib/events/types.ts`, `lib/events/mappers.ts`, `lib/events/status.ts`, `tests/events/status.test.ts`, `tests/events/mappers.test.ts`
- Modify: `lib/weekends.ts` (remove data-coupled functions)

**Interfaces:**
- Consumes: `Database` type (Task 3).
- Produces:
  - `type EventStatus = "completed" | "next" | "upcoming"`
  - `interface SocietyView { id: string; slug: string; name: string; shortName: string; description: string; color: SocietyColor; logoUrl: string | null; tracks: TrackView[] }`
  - `interface TrackView { id: string; name: string; description: string }`
  - `interface EventView { id; slug; step; title; topic; summary; description; start; end; venue; mode; posterUrl: string|null; videoUrl: string|null; level; formats: string[]; agenda: {time:string;title:string;detail?:string}[]; outcomes: string[]; prerequisites: string[]; bring: string[]; seatsTotal: number; seatsFilled: number; pricePaise: number; ticketType: "qr"|"token"; tokenPrefix: string; isFinale: boolean; speakerIds: string[]; resources: EventResources; winners: {place:string;team:string;project:string}[]; society: Pick<SocietyView,"id"|"slug"|"name"|"shortName"|"color">; trackName: string | null }`
  - `interface EventWithStatus extends EventView { status: EventStatus; seatsLeft: number }`
  - `rowToEventView(row: EventRow, seatsTaken: number): EventView`
  - `withStatus(events: EventView[], now: number): EventWithStatus[]` — status computed **per society**
  - `nextOverall(list: EventWithStatus[]): EventWithStatus | undefined`
  - `nextForSociety(list: EventWithStatus[], slug: string): EventWithStatus | undefined`
  - `societyStairway(list: EventWithStatus[], slug: string): EventWithStatus[]` (sorted by step)

- [ ] **Step 1: Write the failing status test**

Create `tests/events/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextForSociety, nextOverall, societyStairway, withStatus } from "@/lib/events/status";
import type { EventView } from "@/lib/events/types";

const ev = (slug: string, society: string, step: number, start: string, end: string): EventView => ({
  id: slug, slug, step, title: slug, topic: "", summary: "", description: "", start, end, venue: "", mode: "offline",
  posterUrl: null, videoUrl: null, level: "Beginner", formats: [], agenda: [], outcomes: [], prerequisites: [], bring: [],
  seatsTotal: 10, seatsFilled: 3, pricePaise: 0, ticketType: "qr", tokenPrefix: "", isFinale: false, speakerIds: [],
  resources: {}, winners: [], trackName: null,
  society: { id: society, slug: society, name: society, shortName: society, color: "yellow" },
});

const NOW = new Date("2026-10-04T12:00:00+05:30").getTime();
const list = [
  ev("m1", "main", 1, "2026-09-01T09:00:00+05:30", "2026-09-01T16:00:00+05:30"),
  ev("m2", "main", 2, "2026-10-24T09:00:00+05:30", "2026-10-24T16:00:00+05:30"),
  ev("m3", "main", 3, "2026-11-07T09:00:00+05:30", "2026-11-07T16:00:00+05:30"),
  ev("r1", "ras", 1, "2026-10-10T09:00:00+05:30", "2026-10-10T16:00:00+05:30"),
  ev("r2", "ras", 2, "2026-12-01T09:00:00+05:30", "2026-12-01T16:00:00+05:30"),
];

describe("withStatus", () => {
  const s = withStatus(list, NOW);
  const by = (slug: string) => s.find((e) => e.slug === slug)!;

  it("computes status independently per society", () => {
    expect(by("m1").status).toBe("completed");
    expect(by("m2").status).toBe("next");
    expect(by("m3").status).toBe("upcoming");
    expect(by("r1").status).toBe("next");
    expect(by("r2").status).toBe("upcoming");
  });
  it("adds seatsLeft", () => {
    expect(by("m2").seatsLeft).toBe(7);
  });
  it("finds the next session overall and per society", () => {
    expect(nextOverall(s)?.slug).toBe("r1");
    expect(nextForSociety(s, "main")?.slug).toBe("m2");
    expect(nextForSociety(s, "wie")).toBeUndefined();
  });
  it("orders a society stairway by step", () => {
    expect(societyStairway(s, "main").map((e) => e.step)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/events/status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types and status**

Create `lib/events/types.ts`:

```ts
export type SocietyColor = "yellow" | "blue" | "green" | "red" | "orange" | "purple";
export type EventStatus = "completed" | "next" | "upcoming";

export interface TrackView {
  id: string;
  name: string;
  description: string;
}

export interface SocietyView {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  color: SocietyColor;
  logoUrl: string | null;
  tracks: TrackView[];
}

export interface EventResources {
  slides?: string;
  code?: string;
  notebook?: string;
  recording?: string;
  reading?: { label: string; href: string }[];
}

export interface AgendaItem {
  time: string;
  title: string;
  detail?: string;
}

export interface EventView {
  id: string;
  slug: string;
  step: number;
  title: string;
  topic: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  venue: string;
  mode: "offline" | "online" | "hybrid";
  posterUrl: string | null;
  videoUrl: string | null;
  level: string;
  formats: string[];
  agenda: AgendaItem[];
  outcomes: string[];
  prerequisites: string[];
  bring: string[];
  seatsTotal: number;
  seatsFilled: number;
  pricePaise: number;
  ticketType: "qr" | "token";
  tokenPrefix: string;
  isFinale: boolean;
  speakerIds: string[];
  resources: EventResources;
  winners: { place: string; team: string; project: string }[];
  society: Pick<SocietyView, "id" | "slug" | "name" | "shortName" | "color">;
  trackName: string | null;
}

export interface EventWithStatus extends EventView {
  status: EventStatus;
  seatsLeft: number;
}
```

Create `lib/events/status.ts`:

```ts
import type { EventStatus, EventView, EventWithStatus } from "./types";

/** completed / next / upcoming, computed separately for each society's stairway. */
export function withStatus(events: EventView[], now: number): EventWithStatus[] {
  const nextBySociety = new Map<string, string>();
  const bySociety = new Map<string, EventView[]>();
  for (const e of events) bySociety.set(e.society.slug, [...(bySociety.get(e.society.slug) ?? []), e]);
  for (const [slug, list] of bySociety) {
    const first = [...list].sort((a, b) => a.step - b.step).find((e) => new Date(e.end).getTime() >= now);
    if (first) nextBySociety.set(slug, first.id);
  }
  return events.map((e) => {
    let status: EventStatus;
    if (new Date(e.end).getTime() < now) status = "completed";
    else if (nextBySociety.get(e.society.slug) === e.id) status = "next";
    else status = "upcoming";
    return { ...e, status, seatsLeft: Math.max(0, e.seatsTotal - e.seatsFilled) };
  });
}

export function nextOverall(list: EventWithStatus[]) {
  return list
    .filter((e) => e.status === "next")
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];
}

export const nextForSociety = (list: EventWithStatus[], slug: string) =>
  list.find((e) => e.society.slug === slug && e.status === "next");

export const societyStairway = (list: EventWithStatus[], slug: string) =>
  list.filter((e) => e.society.slug === slug).sort((a, b) => a.step - b.step);
```

- [ ] **Step 4: Run status tests**

Run: `npx vitest run tests/events/status.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing mapper test**

Create `tests/events/mappers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rowToEventView, type EventRow } from "@/lib/events/mappers";

const row: EventRow = {
  id: "e1", slug: "seeing-machines", step_number: 1, title: "Seeing Machines", topic: "CV", summary: "s", description: "d",
  starts_at: "2026-10-10T04:00:00+00:00", ends_at: "2026-10-10T11:00:00+00:00", venue: "Hall A", mode: "offline",
  poster_url: null, video_url: "https://youtu.be/x", level: "Intermediate", formats: ["Lab"],
  agenda: [{ time: "09:30", title: "Check-in" }], outcomes: ["o"], prerequisites: [], bring: [],
  capacity: 60, price_paise: 9900, ticket_type: "token", token_prefix: "RAS-01", is_finale: false,
  resources: { slides: "https://x" }, winners: [],
  society: { id: "s1", slug: "ras", name: "IEEE RAS", short_name: "RAS", color: "green" },
  track: { name: "AI × Computer Vision" },
  event_speakers: [{ sort_order: 1, speaker: { slug: "b" } }, { sort_order: 0, speaker: { slug: "a" } }],
};

describe("rowToEventView", () => {
  const v = rowToEventView(row, 12);
  it("maps columns to view fields", () => {
    expect(v.step).toBe(1);
    expect(v.start).toBe("2026-10-10T04:00:00+00:00");
    expect(v.pricePaise).toBe(9900);
    expect(v.ticketType).toBe("token");
    expect(v.society).toEqual({ id: "s1", slug: "ras", name: "IEEE RAS", shortName: "RAS", color: "green" });
    expect(v.trackName).toBe("AI × Computer Vision");
  });
  it("orders speakers and sets seat counts", () => {
    expect(v.speakerIds).toEqual(["a", "b"]);
    expect(v.seatsTotal).toBe(60);
    expect(v.seatsFilled).toBe(12);
  });
});
```

- [ ] **Step 6: Implement the mapper**

Create `lib/events/mappers.ts`:

```ts
import type { AgendaItem, EventResources, EventView, SocietyColor } from "./types";

/** Shape returned by the events select in `lib/site/load.ts` (EVENT_SELECT). */
export interface EventRow {
  id: string;
  slug: string;
  step_number: number;
  title: string;
  topic: string;
  summary: string;
  description: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  mode: "offline" | "online" | "hybrid";
  poster_url: string | null;
  video_url: string | null;
  level: string;
  formats: string[];
  agenda: unknown;
  outcomes: string[];
  prerequisites: string[];
  bring: string[];
  capacity: number;
  price_paise: number;
  ticket_type: "qr" | "token";
  token_prefix: string;
  is_finale: boolean;
  resources: unknown;
  winners: unknown;
  society: { id: string; slug: string; name: string; short_name: string; color: string } | null;
  track: { name: string } | null;
  event_speakers: { sort_order: number; speaker: { slug: string } | null }[];
}

export const EVENT_SELECT =
  "id, slug, step_number, title, topic, summary, description, starts_at, ends_at, venue, mode, poster_url, video_url, level, formats, agenda, outcomes, prerequisites, bring, capacity, price_paise, ticket_type, token_prefix, is_finale, resources, winners, society:societies(id, slug, name, short_name, color), track:tracks(name), event_speakers(sort_order, speaker:speakers(slug))";

export function rowToEventView(r: EventRow, seatsTaken: number): EventView {
  if (!r.society) throw new Error(`Event ${r.slug} has no society`);
  return {
    id: r.id,
    slug: r.slug,
    step: r.step_number,
    title: r.title,
    topic: r.topic,
    summary: r.summary,
    description: r.description,
    start: r.starts_at,
    end: r.ends_at,
    venue: r.venue,
    mode: r.mode,
    posterUrl: r.poster_url,
    videoUrl: r.video_url,
    level: r.level,
    formats: r.formats,
    agenda: (Array.isArray(r.agenda) ? r.agenda : []) as AgendaItem[],
    outcomes: r.outcomes,
    prerequisites: r.prerequisites,
    bring: r.bring,
    seatsTotal: r.capacity,
    seatsFilled: seatsTaken,
    pricePaise: r.price_paise,
    ticketType: r.ticket_type,
    tokenPrefix: r.token_prefix,
    isFinale: r.is_finale,
    speakerIds: [...r.event_speakers]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => s.speaker?.slug)
      .filter((s): s is string => !!s),
    resources: (r.resources ?? {}) as EventResources,
    winners: (Array.isArray(r.winners) ? r.winners : []) as EventView["winners"],
    society: {
      id: r.society.id,
      slug: r.society.slug,
      name: r.society.name,
      shortName: r.society.short_name,
      color: r.society.color as SocietyColor,
    },
    trackName: r.track?.name ?? null,
  };
}
```

- [ ] **Step 7: Trim `lib/weekends.ts`**

Replace the top of `lib/weekends.ts` (lines 1–29: imports, `WeekendWithStatus`, `withStatus`, `getNext`, `getWeekend`) with nothing, and replace `registerHref` with a data-independent version (Phase 3 replaces it with the real flow):

```ts
export function registerHref(slug?: string) {
  return slug ? `/register?step=${slug}` : "/register";
}
```

Change `seatsTone`'s import-free signature unchanged. The file now exports only `pad2`, `formatDate`, `shortDate`, `longDate`, `timeOf`, `daysUntil`, `registerHref`, `seatsTone`. (Type errors in components are fixed in Task 6 — do **not** run `tsc` as a gate in this task; run only the two new test files.)

- [ ] **Step 8: Run tests**

Run: `npx vitest run tests/events`
Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add lib/events tests/events lib/weekends.ts
git commit -m "feat(events): event view types, row mapper and per-society status"
```

---

### Task 5: Site data loader and provider

**Files:**
- Create: `lib/site/schema.ts`, `lib/site/types.ts`, `lib/site/load.ts`, `components/providers/SiteDataProvider.tsx`, `tests/site/schema.test.ts`

**Interfaces:**
- Consumes: `createPublicClient` (Task 3), `EVENT_SELECT`, `rowToEventView` (Task 4).
- Produces:
  - `SettingsSchema` (zod) and `type Settings` — identical shape to the old `data/event.ts` object.
  - `interface SiteData { settings: Settings; stats: { label: string; value: number; suffix: string }[]; societies: SocietyView[]; events: EventView[]; speakers: SpeakerView[]; sponsors: SponsorTierView[]; team: TeamMemberView[]; faqs: FaqView[]; testimonials: TestimonialView[]; gallery: GalleryItemView[] }`
  - `SpeakerView { id: string /* slug */; name; designation; organization; photo?: string; bio; topic; links: {linkedin?: string; x?: string; website?: string} }`
  - `SponsorTierView { tier: string; size: "xl"|"lg"|"md"|"sm"; sponsors: { name: string; url: string; logo?: string }[] }`
  - `TeamMemberView { name; role; group: string; photo?: string; funFact: string; links: {linkedin?: string; instagram?: string; github?: string} }`
  - `FaqView { q: string; a: string }`; `TestimonialView { quote; name; detail; step: string; photo?: string }`
  - `GalleryItemView { id: string; eventSlug: string | null; eventTitle: string | null; step: number | null; caption: string; alt: string; src?: string; ratio: "tall"|"wide"|"square" }`
  - `getSiteData(): Promise<SiteData>` (React `cache`d per request)
  - `SiteDataProvider({ data, children })` and `useSiteData(): SiteData`

- [ ] **Step 1: Write the failing schema test**

Create `tests/site/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SettingsSchema } from "@/lib/site/schema";
import { event } from "@/data/event";

describe("SettingsSchema", () => {
  it("accepts the current site settings", () => {
    expect(SettingsSchema.parse(event).name).toBe("st(AI)rway");
  });
  it("rejects a non-URL siteUrl", () => {
    expect(() => SettingsSchema.parse({ ...event, siteUrl: "nope" })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/site`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement schema, types and loader**

Create `lib/site/schema.ts`:

```ts
import { z } from "zod";

const link = z.string();

export const SettingsSchema = z.object({
  name: z.string().min(1),
  tagline: z.string(),
  supportLine: z.string(),
  altTaglines: z.array(z.string()),
  description: z.string(),
  siteUrl: z.url(),
  organizer: z.object({ name: z.string(), short: z.string(), url: link }),
  venue: z.object({
    name: z.string(), hall: z.string(), address: z.string(), city: z.string(), region: z.string(),
    country: z.string(), postalCode: z.string(), mapEmbed: link, mapLink: link,
  }),
  registration: z.object({ mode: z.enum(["onsite", "external"]), googleFormUrl: link, endpoint: z.string() }),
  newsletter: z.object({ endpoint: z.string() }),
  gaId: z.string(),
  announcement: z.object({ enabled: z.boolean(), text: z.string() }),
  aftermovieUrl: link,
  sponsorDeckUrl: z.string(),
  speakerFormUrl: link,
  volunteerFormUrl: link,
  contact: z.object({
    email: z.string(),
    sponsorEmail: z.string(),
    coordinators: z.array(z.object({ name: z.string(), role: z.string(), phone: z.string() })),
  }),
  social: z.object({ instagram: link, linkedin: link, whatsapp: link, youtube: link, github: link }),
  ieee: z.object({ joinUrl: link, branchUrl: link }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const StatsSchema = z.object({
  items: z.array(z.object({ label: z.string(), value: z.number(), suffix: z.string() })),
});
```

Create `lib/site/types.ts`:

```ts
import type { EventView, SocietyView } from "@/lib/events/types";
import type { Settings } from "./schema";

export interface SpeakerView {
  id: string;
  name: string;
  designation: string;
  organization: string;
  photo?: string;
  bio: string;
  topic: string;
  links: { linkedin?: string; x?: string; website?: string };
}
export interface SponsorTierView {
  tier: string;
  size: "xl" | "lg" | "md" | "sm";
  sponsors: { name: string; url: string; logo?: string }[];
}
export interface TeamMemberView {
  name: string;
  role: string;
  group: string;
  photo?: string;
  funFact: string;
  links: { linkedin?: string; instagram?: string; github?: string };
}
export interface FaqView { q: string; a: string }
export interface TestimonialView { quote: string; name: string; detail: string; step: string; photo?: string }
export interface GalleryItemView {
  id: string;
  eventSlug: string | null;
  eventTitle: string | null;
  step: number | null;
  caption: string;
  alt: string;
  src?: string;
  ratio: "tall" | "wide" | "square";
}

export interface SiteData {
  settings: Settings;
  stats: { label: string; value: number; suffix: string }[];
  societies: SocietyView[];
  events: EventView[];
  speakers: SpeakerView[];
  sponsors: SponsorTierView[];
  team: TeamMemberView[];
  faqs: FaqView[];
  testimonials: TestimonialView[];
  gallery: GalleryItemView[];
}
```

Create `lib/site/load.ts`:

```ts
import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { EVENT_SELECT, rowToEventView, type EventRow } from "@/lib/events/mappers";
import type { SocietyColor } from "@/lib/events/types";
import { SettingsSchema, StatsSchema } from "./schema";
import type { SiteData, SponsorTierView } from "./types";

const orThrow = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error || r.data === null) throw new Error(`Failed to load ${what}: ${r.error?.message ?? "no data"}`);
  return r.data;
};

/** All public site data, loaded once per request. RLS hides drafts from anonymous reads. */
export const getSiteData = cache(async (): Promise<SiteData> => {
  const db = createPublicClient();
  const [blocks, societies, events, seats, speakers, sponsors, team, faqs, testimonials, gallery] = await Promise.all([
    db.from("site_blocks").select("key, data"),
    db.from("societies").select("id, slug, name, short_name, description, color, logo_url, tracks(id, name, description, sort_order)").order("sort_order"),
    db.from("events").select(EVENT_SELECT).eq("status", "published").order("starts_at"),
    db.from("event_seat_counts").select("event_id, seats_taken"),
    db.from("speakers").select("slug, name, designation, organization, photo_url, bio, topic, links").order("sort_order"),
    db.from("sponsors").select("name, url, logo_url, tier, tier_size").order("sort_order"),
    db.from("team_members").select('name, role, "group", photo_url, fun_fact, links').order("sort_order"),
    db.from("faqs").select("question, answer").order("sort_order"),
    db.from("testimonials").select("quote, name, detail, step_label, photo_url").order("sort_order"),
    db.from("gallery_items").select("id, image_url, caption, alt, ratio, event:events(slug, title, step_number)").order("sort_order"),
  ]);

  const blockMap = new Map(orThrow(blocks, "site_blocks").map((b) => [b.key, b.data]));
  const seatMap = new Map(orThrow(seats, "seat counts").map((s) => [s.event_id, s.seats_taken ?? 0]));

  const tiers = new Map<string, SponsorTierView>();
  for (const s of orThrow(sponsors, "sponsors")) {
    const t = tiers.get(s.tier) ?? { tier: s.tier, size: s.tier_size as SponsorTierView["size"], sponsors: [] };
    t.sponsors.push({ name: s.name, url: s.url, logo: s.logo_url ?? undefined });
    tiers.set(s.tier, t);
  }

  return {
    settings: SettingsSchema.parse(blockMap.get("settings")),
    stats: StatsSchema.parse(blockMap.get("stats") ?? { items: [] }).items,
    societies: orThrow(societies, "societies").map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      shortName: s.short_name,
      description: s.description,
      color: s.color as SocietyColor,
      logoUrl: s.logo_url,
      tracks: [...(s.tracks ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => ({ id: t.id, name: t.name, description: t.description })),
    })),
    events: (orThrow(events, "events") as unknown as EventRow[]).map((r) => rowToEventView(r, seatMap.get(r.id) ?? 0)),
    speakers: orThrow(speakers, "speakers").map((s) => ({
      id: s.slug,
      name: s.name,
      designation: s.designation,
      organization: s.organization,
      photo: s.photo_url ?? undefined,
      bio: s.bio,
      topic: s.topic,
      links: (s.links ?? {}) as SiteData["speakers"][number]["links"],
    })),
    sponsors: [...tiers.values()],
    team: orThrow(team, "team").map((m) => ({
      name: m.name,
      role: m.role,
      group: m.group,
      photo: m.photo_url ?? undefined,
      funFact: m.fun_fact,
      links: (m.links ?? {}) as SiteData["team"][number]["links"],
    })),
    faqs: orThrow(faqs, "faqs").map((f) => ({ q: f.question, a: f.answer })),
    testimonials: orThrow(testimonials, "testimonials").map((t) => ({
      quote: t.quote, name: t.name, detail: t.detail, step: t.step_label, photo: t.photo_url ?? undefined,
    })),
    gallery: orThrow(gallery, "gallery").map((g) => {
      const ev = g.event as { slug: string; title: string; step_number: number } | null;
      return {
        id: g.id,
        eventSlug: ev?.slug ?? null,
        eventTitle: ev?.title ?? null,
        step: ev?.step_number ?? null,
        caption: g.caption,
        alt: g.alt,
        src: g.image_url ?? undefined,
        ratio: g.ratio as "tall" | "wide" | "square",
      };
    }),
  };
});
```

```bash
npm install server-only
```

Create `components/providers/SiteDataProvider.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";
import type { SiteData } from "@/lib/site/types";

const SiteDataContext = createContext<SiteData | null>(null);

export function SiteDataProvider({ data, children }: { data: SiteData; children: React.ReactNode }) {
  return <SiteDataContext.Provider value={data}>{children}</SiteDataContext.Provider>;
}

export function useSiteData() {
  const ctx = useContext(SiteDataContext);
  if (!ctx) throw new Error("useSiteData must be used inside <SiteDataProvider>");
  return ctx;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/site`
Expected: PASS (2 tests).

- [ ] **Step 5: Smoke-test the loader against the real database**

Create a throwaway check (not committed): `npx tsx -e "import('./lib/site/load').then(async m => { const d = await m.getSiteData(); console.log(d.societies.length, d.events.length, d.settings.name) })"` — with `.env.local` loaded via `node --env-file=.env.local` if needed:

```bash
node --env-file=.env.local --import tsx -e "const m = await import('./lib/site/load.ts'); const d = await m.getSiteData(); console.log(d.societies.length, d.events.length, d.settings.name)"
```

Expected: `5 16 st(AI)rway`. (`server-only` throws outside React Server; if it does, temporarily set `NODE_OPTIONS=--conditions=react-server`.)

- [ ] **Step 6: Commit**

```bash
git add lib/site components/providers/SiteDataProvider.tsx tests/site package.json package-lock.json
git commit -m "feat(site): load site content from Supabase with a typed site-data provider"
```

---

### Task 6: Switch every component from `/data` to site data

**Files:**
- Modify: `app/layout.tsx`, `components/providers/ClockProvider.tsx`, and every file listed in Step 3.
- Move: seed-only `/data` files → `supabase/seed-data/` (Step 6).

**Interfaces:**
- Consumes: `getSiteData`, `SiteDataProvider`, `useSiteData` (Task 5); `withStatus`, `nextOverall`, `EventWithStatus` (Task 4).
- Produces: `useClock(): { now: number; weekends: EventWithStatus[]; next: EventWithStatus }` (same names as today so call sites keep working; `weekends` now means "all published events with status").

- [ ] **Step 1: Wire the layout**

In `app/layout.tsx`:
- Remove `import { event } from "@/data/event";`.
- Add `import { getSiteData } from "@/lib/site/load";` and `import { SiteDataProvider } from "@/components/providers/SiteDataProvider";`.
- Replace `export const metadata: Metadata = {...}` with:

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSiteData();
  const title = `${settings.name} | Weekend AI Event Series by ${settings.organizer.short}`;
  return {
    metadataBase: new URL(settings.siteUrl),
    title: { default: title, template: `%s | ${settings.name}` },
    description: settings.description,
    applicationName: settings.name,
    keywords: ["AI", "machine learning", "workshop", "hackathon", "IEEE", "College of Engineering Kidangoor", "Kottayam", "Kerala", "students"],
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: settings.name, title, description: settings.description, url: "/", locale: "en_IN" },
    twitter: { card: "summary_large_image", title, description: settings.description },
    appleWebApp: { capable: true, title: settings.name, statusBarStyle: "default" },
  };
}
```

- Delete the `const title = …` line and the `SERVER_NOW` constant; make the component `async`, load data, and wrap providers:

```tsx
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const data = await getSiteData();
  return (
    <html lang="en-IN" className={`${urbanist.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <SiteDataProvider data={data}>
          <ClockProvider initialNow={Date.now()}>
            <TopBar />
            <main id="main" tabIndex={-1} className="outline-none">{children}</main>
            <Footer />
            <Dock />
          </ClockProvider>
        </SiteDataProvider>
        <MotionProvider />
        <EasterEgg />
        {data.settings.gaId && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${data.settings.gaId}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${data.settings.gaId}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
```

> `Date.now()` in render triggers the `react-hooks/purity` lint rule. Move it to a helper outside the component: `const requestTime = () => Date.now();` at module level and pass `initialNow={requestTime()}` — the rule only flags direct `Date.now()` calls in components. If lint still flags it, compute `const now = await getRequestNow()` from `lib/site/load.ts`: `export const getRequestNow = cache(async () => Date.now());`.

- [ ] **Step 2: Rewrite `ClockProvider`**

Replace `components/providers/ClockProvider.tsx` with:

```tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSiteData } from "./SiteDataProvider";
import { nextOverall, withStatus } from "@/lib/events/status";
import type { EventWithStatus } from "@/lib/events/types";

interface Clock {
  now: number;
  /** All published events with per-society status. */
  weekends: EventWithStatus[];
  /** The soonest "next up" session across all societies. */
  next: EventWithStatus;
}

const ClockContext = createContext<Clock | null>(null);

/**
 * Server renders with the request time; the client switches to the real clock
 * after hydration and re-checks every minute.
 */
export function ClockProvider({ initialNow, children }: { initialNow: number; children: React.ReactNode }) {
  const { events } = useSiteData();
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  const value = useMemo(() => {
    const weekends = withStatus(events, now);
    const next = nextOverall(weekends) ?? weekends[weekends.length - 1];
    return { now, weekends, next };
  }, [events, now]);

  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

export function useClock() {
  const ctx = useContext(ClockContext);
  if (!ctx) throw new Error("useClock must be used inside <ClockProvider>");
  return ctx;
}
```

- [ ] **Step 3: Replace `/data` imports in components**

Apply these exact edits.

**Client components** (`"use client"` files): replace the `@/data/*` import line(s) with
`import { useSiteData } from "@/components/providers/SiteDataProvider";`
and add as the first line of the component body the destructure shown:

| File | Remove import(s) | Add in component body |
|---|---|---|
| `components/layout/AnnouncementBar.tsx` | `event` | `const { settings: event } = useSiteData();` |
| `components/layout/Footer.tsx` | `event`, `weekends` | `const { settings: event, societies } = useSiteData();` |
| `components/sections/Hero.tsx` | `event`, `stats` | `const { settings: event, stats } = useSiteData();` |
| `components/sections/NextWeekend.tsx` | `speakerById`, `event` | `const { settings: event, speakers: allSpeakers } = useSiteData(); const speakerById = (id: string) => allSpeakers.find((s) => s.id === id);` |
| `components/sections/Speakers.tsx` | `speakers`, `Speaker` type, `event` | `const { settings: event, speakers } = useSiteData();` and change `import type { Speaker } from "@/data/types"` to `import type { SpeakerView as Speaker } from "@/lib/site/types";` |
| `components/sections/Gallery.tsx` | `gallery`, `GalleryItem`, `weekends`, `event` | in `GalleryGrid`: `const { gallery } = useSiteData();`; in `Aftermovie`: `const { settings: event } = useSiteData();`; type import `import type { GalleryItemView as GalleryItem } from "@/lib/site/types";` |
| `components/sections/Team.tsx` | `team`, `teamGroups` | `const { team } = useSiteData(); const teamGroups = ["All", ...Array.from(new Set(team.map((m) => m.group)))] as const;` and type `useState<string>("All")` |
| `components/sections/Testimonials.tsx` | `testimonials` | `const { testimonials } = useSiteData();` |
| `components/sections/FAQ.tsx` | `faqs`, `Faq`, `event` | `const { settings: event, faqs } = useSiteData();`; type `import type { FaqView as Faq } from "@/lib/site/types";` |
| `components/sections/Community.tsx` | `event` | `const { settings: event } = useSiteData();` |
| `components/sections/WeekendCard.tsx` | `event`; type `WeekendWithStatus` from `@/lib/weekends` | `const { settings: event } = useSiteData();`; `import type { EventWithStatus as WeekendWithStatus } from "@/lib/events/types";` |
| `components/ui/ShareButtons.tsx` | `event` | `const { settings: event } = useSiteData();` |
| `components/register/RegisterForm.tsx` | `event` | `const { settings: event } = useSiteData();` |
| `components/weekend/WeekendDetail.tsx` | `speakerById`, `gallery`, `event` | `const { settings: event, speakers: allSpeakers, gallery } = useSiteData(); const speakerById = (id: string) => allSpeakers.find((s) => s.id === id);` and change `gallery.filter((g) => w.gallery?.includes(g.id))` to `gallery.filter((g) => g.eventSlug === w.slug)` |
| `components/ui/GalleryArt.tsx` | type `GalleryItem` | `import type { GalleryItemView as GalleryItem } from "@/lib/site/types";` and render `Step ${String(item.step ?? 0).padStart(2, "0")}` |

**Server components**: make the component `async` and load data.

| File | Change |
|---|---|
| `components/sections/AboutIEEE.tsx` | `export async function AboutIEEE() { const { settings: event } = await getSiteData(); …` with `import { getSiteData } from "@/lib/site/load";` |
| `components/sections/Sponsors.tsx` | `export async function Sponsors() { const { settings: event, sponsors: sponsorTiers } = await getSiteData(); …`; type `import type { SponsorTierView } from "@/lib/site/types"; type Sponsor = SponsorTierView["sponsors"][number];` |
| `app/privacy/page.tsx`, `app/code-of-conduct/page.tsx` | `export default async function …() { const { settings: event } = await getSiteData(); …` |
| `app/manifest.ts`, `app/robots.ts` | `export default async function …() { const { settings: event } = await getSiteData(); …` |
| `lib/jsonld.tsx` | change `eventJsonLd(w)` to `eventJsonLd(w: EventView, settings: Settings)` and replace `event.` with `settings.`; replace `/weekend/` with `/events/`; import types from `@/lib/events/types` and `@/lib/site/schema` |
| `lib/calendar.ts` | change `googleCalendarUrl(w)`, `icsContent(w)`, `downloadIcs(w)` to take `(w: EventView, settings: Settings)`; replace `event.` with `settings.`; replace `/weekend/` with `/events/`. Update call sites in `WeekendDetail.tsx` and `RegisterForm.tsx` to pass `event` (the destructured settings) as the second argument. |

**Field renames** used by components (EventView vs old Weekend):
- `w.track === "summit"` → `w.isFinale` (in `WeekendCard.tsx`, `WeekendDetail.tsx`).
- `STEP_FILL[w.track]` / `TRACK_FILL[w.track]` → `SOCIETY_FILL[w.society.color]` with

```ts
const SOCIETY_FILL: Record<string, string> = {
  yellow: "bg-yellow", blue: "bg-blue", green: "bg-green", red: "bg-red", orange: "bg-orange", purple: "bg-purple",
};
```

  defined in `lib/events/colors.ts` and imported where used.
- Show the society and track on cards: in `WeekendCard.tsx` add `<span className="tag tag-ink">{w.society.shortName}</span>` before `LevelChip`, and render `{w.trackName && <p className="mono mt-1 text-ink-4">{w.trackName}</p>}` under the topic line.
- `components/sections/Gallery.tsx` filter chips: build the list from `gallery` entries with `eventSlug`: `const chips = [...new Map(gallery.filter((g) => g.eventSlug).map((g) => [g.eventSlug!, g.eventTitle!])).entries()];` and filter by `g.eventSlug === filter`.
- `components/layout/Footer.tsx` "Weekends" column → "Societies": list `societies.map((s) => <Link href={`/s/${s.slug}`}>{s.shortName} — {s.name}</Link>)`.

**Links:** replace every `"/weekend/` and `` `/weekend/ `` with `/events/` in `components/` and `lib/`:

```bash
grep -rl "/weekend/" components lib app --include=*.tsx --include=*.ts
```

Edit each match to `/events/` (expected files: WeekendCard, WeekendDetail, Hero, NextWeekend, Speakers, Resources, TopBar, Tracks, jsonld, calendar).

- [ ] **Step 4: Delete the old `/data` type coupling**

`components/ui/Badges.tsx`: change `import type { WeekendStatus } from "@/data/types";` to `import type { EventStatus as WeekendStatus } from "@/lib/events/types";`.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: no errors. Fix any remaining `@/data/*` imports reported (only `data/leaderboard.ts` and `data/tracks.ts` may still be imported — they stay in code).

- [ ] **Step 6: Move seed-only data files**

```bash
git mv data/event.ts data/weekends.ts data/speakers.ts data/team.ts data/sponsors.ts data/faq.ts data/testimonials.ts data/gallery.ts data/stats.ts data/types.ts supabase/seed-data/
```

Then update imports in `scripts/generate-seed.ts`, `supabase/seed-data/wie-events.ts` and `tests/site/schema.test.ts` from `@/data/...` to `@/supabase/seed-data/...`. Inside the moved files, change `from "./types"` imports to stay relative (they already are). Verify:

```bash
grep -rn "@/data/" app components lib scripts tests supabase
```

Expected: only `@/data/leaderboard` and `@/data/tracks` (in `Leaderboard.tsx` and the quiz).

- [ ] **Step 7: Run everything and check the site**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all pass.

Temporarily remove `output: "export"` from `next.config.ts` (Task 8 finalises the config) and run `npm run dev`; open http://localhost:3000. Expected: the home page renders exactly as before but with society tags on cards; no console errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: read all site content from Supabase instead of /data files"
```

---

### Task 7: Society pages, event routes and the home societies section

**Files:**
- Create: `app/s/[society]/page.tsx`, `components/sections/Societies.tsx`, `lib/events/colors.ts` (if not created in Task 6), `tests/quiz.test.ts`
- Move: `app/weekend/[slug]/page.tsx` → `app/events/[slug]/page.tsx`; `app/weekend/[slug]/opengraph-image.tsx` → `app/events/[slug]/opengraph-image.tsx`
- Modify: `components/sections/Stairway.tsx`, `app/page.tsx`, `components/layout/Dock.tsx`, `app/sitemap.ts`, `next.config.ts` (redirect), `data/tracks.ts` (quiz → level)
- Delete: `components/sections/Tracks.tsx`

**Interfaces:**
- Consumes: `getSiteData`, `useClock`, `societyStairway`, `nextForSociety`.
- Produces: `<Stairway societySlug?: string; showFilters?: boolean />`; `<Societies />`; `quizLevel(total: number): "Beginner" | "Intermediate" | "Advanced"` in `data/tracks.ts`.

- [ ] **Step 1: Write the failing quiz test**

Create `tests/quiz.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { quizLevel } from "@/data/tracks";

describe("quizLevel", () => {
  it("maps quiz totals to a level", () => {
    expect(quizLevel(0)).toBe("Beginner");
    expect(quizLevel(3)).toBe("Beginner");
    expect(quizLevel(5)).toBe("Intermediate");
    expect(quizLevel(9)).toBe("Advanced");
  });
});
```

Run: `npx vitest run tests/quiz.test.ts` — Expected: FAIL (`quizLevel` is not exported).

- [ ] **Step 2: Replace `quizResult` with `quizLevel`**

In `data/tracks.ts`, delete the `Track` interface, the `tracks` array and `quizResult`; keep `quiz`; add:

```ts
export function quizLevel(total: number): "Beginner" | "Intermediate" | "Advanced" {
  if (total <= 3) return "Beginner";
  if (total <= 7) return "Intermediate";
  return "Advanced";
}
```

Run: `npx vitest run tests/quiz.test.ts` — Expected: PASS.

- [ ] **Step 3: Build the Societies section**

Create `components/sections/Societies.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronRight, Layers, RotateCcw, Sparkles } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { useClock } from "@/components/providers/ClockProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { nextForSociety } from "@/lib/events/status";
import { SOCIETY_FILL } from "@/lib/events/colors";
import { quiz, quizLevel } from "@/data/tracks";
import { pad2, registerHref, shortDate } from "@/lib/weekends";
import { cn } from "@/lib/utils";

function Quiz() {
  const { weekends } = useClock();
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const level = quizLevel(score);
  const open = weekends.filter((w) => w.status !== "completed").sort((a, b) => a.start.localeCompare(b.start));
  const rec = open.find((w) => w.level === level) ?? open.find((w) => w.level === "All levels") ?? open[0];

  const answer = (s: number) => {
    setScore(score + s);
    if (i + 1 < quiz.length) setI(i + 1);
    else setDone(true);
  };

  return (
    <div className="box-2 shadow-hard" data-reveal>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-6 py-4">
        <h3 className="mono text-sm font-bold">Which session should you start with?</h3>
        {!done && <span className="tag tag-ink">Q{i + 1} / {quiz.length}</span>}
      </div>
      <div className="p-6 md:p-8" aria-live="polite">
        {!done ? (
          <div key={i}>
            <p className="text-2xl font-semibold">{quiz[i].q}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {quiz[i].options.map((o) => (
                <button key={o.label} onClick={() => answer(o.score)} className="flex min-h-14 items-center justify-between gap-3 border-2 border-ink bg-paper px-4 py-3 text-left hover:shadow-[4px_4px_0_0_var(--ink)]">
                  {o.label} <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : rec ? (
          <div>
            <p className="meta-label text-ink-3"><Sparkles size={15} strokeWidth={2} aria-hidden /> Start at the {level.toLowerCase()} level</p>
            <p className="mt-3 text-3xl font-semibold"><span className="bg-yellow px-1">{rec.society.shortName} · Step {pad2(rec.step)}</span> — {rec.title}</p>
            <p className="mt-2 text-ink-3">{rec.topic}. {rec.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={registerHref(rec.slug)} className="btn btn-primary">Claim this step <ArrowRight size={16} strokeWidth={2} /></Link>
              <Link href={`/events/${rec.slug}`} className="btn btn-ghost">Details</Link>
              <button onClick={() => { setI(0); setScore(0); setDone(false); }} className="btn btn-ghost"><RotateCcw size={16} strokeWidth={2} /> Retake</button>
            </div>
          </div>
        ) : (
          <p>No open sessions right now — check back soon.</p>
        )}
      </div>
    </div>
  );
}

/** One card per society: its tracks and its next session. */
export function Societies() {
  const { societies } = useSiteData();
  const { weekends } = useClock();
  return (
    <section id="societies" aria-labelledby="societies-title" className="section section-alt">
      <div className="wrap">
        <SectionHeader id="societies-title" Icon={Layers} eyebrow="Five societies · five stairways" title="Pick your [[stairway.]]" lead="Every IEEE society at CEK runs its own weekly climb. Follow one, or hop between them." />
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {societies.map((s, i) => {
            const next = nextForSociety(weekends, s.slug);
            return (
              <li key={s.slug} data-reveal style={{ ["--d" as string]: i }} className="box flex flex-col shadow-hard">
                <div className={cn("flex items-center justify-between border-b-2 border-ink px-5 py-3", SOCIETY_FILL[s.color])}>
                  <span className="mono font-bold">{s.shortName}</span>
                  <span className="mono font-bold">{weekends.filter((w) => w.society.slug === s.slug).length} steps</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-2xl font-semibold">{s.name}</h3>
                  <p className="mt-2 text-ink-2">{s.description}</p>
                  <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tracks">
                    {s.tracks.map((t) => <li key={t.id} className="tag">{t.name}</li>)}
                  </ul>
                  <div className="mt-auto pt-5">
                    {next ? (
                      <Link href={`/events/${next.slug}`} className="block border-2 border-ink bg-paper-2 p-3 hover:bg-yellow">
                        <span className="mono block font-bold">Next · Step {pad2(next.step)} · {shortDate(next.start)}</span>
                        <span className="font-semibold">{next.title}</span>
                      </Link>
                    ) : (
                      <p className="border-2 border-dashed border-ink p-3 text-sm text-ink-3">New steps announced soon.</p>
                    )}
                    <Link href={`/s/${s.slug}`} className="btn btn-sm btn-ghost mt-3 w-full">View {s.shortName} stairway <ArrowRight size={16} strokeWidth={2} /></Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-12"><Quiz /></div>
      </div>
    </section>
  );
}
```

Create `lib/events/colors.ts` (skip if created in Task 6):

```ts
export const SOCIETY_FILL: Record<string, string> = {
  yellow: "bg-yellow", blue: "bg-blue", green: "bg-green", red: "bg-red", orange: "bg-orange", purple: "bg-purple",
};
```

- [ ] **Step 4: Make `Stairway` society-scoped**

In `components/sections/Stairway.tsx`:
- Change the signature to `export function Stairway({ societySlug, title = "Every step, [[one weekend at a time.]]" }: { societySlug: string; title?: string })`.
- Replace `const { weekends } = useClock();` with
  `const { weekends: all } = useClock(); const weekends = societyStairway(all, societySlug);` and import `societyStairway` from `@/lib/events/status`.
- Pass `title={title}` to `SectionHeader`; change the `eyebrow` to `"The roadmap"` (unchanged) and the progress label count `weekends.length` (already used).
- Replace the hard-coded `"All 12 steps"` filter label with `` `All ${weekends.length} steps` ``.

- [ ] **Step 5: Move the event routes**

```bash
git mv "app/weekend/[slug]" "app/events/[slug]"
```

Replace `app/events/[slug]/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { pad2 } from "@/lib/weekends";
import { WeekendDetail } from "@/components/weekend/WeekendDetail";
import { eventJsonLd, JsonLd } from "@/lib/jsonld";

const findEvent = async (slug: string) => {
  const data = await getSiteData();
  return { data, ev: data.events.find((e) => e.slug === slug) };
};

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data, ev } = await findEvent(slug);
  if (!ev) return {};
  const title = `${ev.society.shortName} Step ${pad2(ev.step)}: ${ev.title} — ${ev.topic}`;
  return {
    title,
    description: ev.summary,
    alternates: { canonical: `/events/${ev.slug}` },
    openGraph: { title: `${title} | ${data.settings.name}`, description: ev.summary, url: `/events/${ev.slug}`, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} | ${data.settings.name}`, description: ev.summary },
  };
}

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const { data, ev } = await findEvent(slug);
  if (!ev) notFound();
  return (
    <>
      <JsonLd data={eventJsonLd(ev, data.settings)} />
      <WeekendDetail slug={slug} />
    </>
  );
}
```

In `app/events/[slug]/opengraph-image.tsx`: remove `generateStaticParams`, remove `export const dynamic = "force-static"`, load the event with `getSiteData()` and use `ev.society.shortName` in the eyebrow:

```tsx
import { ImageResponse } from "next/og";
import { getSiteData } from "@/lib/site/load";
import { pad2 } from "@/lib/weekends";
import { OgFrame, ogSize } from "@/lib/og";

export const alt = "st(AI)rway session";
export const size = ogSize;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { events } = await getSiteData();
  const ev = events.find((e) => e.slug === slug);
  return new ImageResponse(
    <OgFrame
      eyebrow={ev ? `${ev.society.shortName} · Step ${pad2(ev.step)}` : "st(AI)rway"}
      title={ev?.title ?? "Session"}
      subtitle={ev?.topic ?? ""}
      accent={ev?.isFinale ? "#FF5C38" : "#FFB200"}
    />,
    size,
  );
}
```

In `components/weekend/WeekendDetail.tsx`, compute prev/next **within the same society**:

```tsx
const stair = weekends.filter((x) => x.society.slug === w.society.slug).sort((a, b) => a.step - b.step);
const idx = stair.findIndex((x) => x.slug === slug);
const prev = stair[idx - 1];
const next = stair[idx + 1];
```

(replacing the existing `idx`/`prev`/`next` lines, and find `w` with `weekends.find((x) => x.slug === slug)!`). Update the step badge text from `Step {pad2(w.step)} / {pad2(weekends.length)}` to `{w.society.shortName} · Step {pad2(w.step)} / {pad2(stair.length)}`, and the breadcrumb middle link to `<Link href={`/s/${w.society.slug}`}>{w.society.shortName}</Link>`.

- [ ] **Step 6: Society page**

Create `app/s/[society]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/site/load";
import { Stairway } from "@/components/sections/Stairway";
import { SOCIETY_FILL } from "@/lib/events/colors";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/s/[society]">): Promise<Metadata> {
  const { society } = await params;
  const s = (await getSiteData()).societies.find((x) => x.slug === society);
  if (!s) return {};
  return { title: `${s.shortName} stairway`, description: s.description, alternates: { canonical: `/s/${s.slug}` } };
}

export default async function SocietyPage({ params }: PageProps<"/s/[society]">) {
  const { society } = await params;
  const { societies } = await getSiteData();
  const s = societies.find((x) => x.slug === society);
  if (!s) notFound();
  return (
    <>
      <header className="pb-6 pt-12 md:pt-16">
        <div className="wrap">
          <nav aria-label="Breadcrumb" className="mono mb-6 font-bold text-ink-3">
            <Link href="/" className="underline-offset-4 hover:underline">Home</Link> <span aria-hidden>/</span>{" "}
            <Link href="/#societies" className="underline-offset-4 hover:underline">Societies</Link> <span aria-hidden>/</span>{" "}
            <span className="text-ink" aria-current="page">{s.shortName}</span>
          </nav>
          <span className={cn("inline-block border-2 border-ink px-3 py-1 font-mono font-bold shadow-[3px_3px_0_0_var(--ink)]", SOCIETY_FILL[s.color])}>{s.shortName}</span>
          <h1 className="mt-5 text-[clamp(2.6rem,7vw,5.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">{s.name}</h1>
          <p className="lead mt-5">{s.description}</p>
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tracks">
            {s.tracks.map((t) => <li key={t.id} className="tag tag-outline">{t.name}</li>)}
          </ul>
        </div>
      </header>
      <Stairway societySlug={s.slug} title={`The ${s.shortName} [[stairway.]]`} />
    </>
  );
}
```

- [ ] **Step 7: Home, dock, sitemap, redirects**

- `app/page.tsx`: remove `Stairway` and `Tracks` imports/usages; import `Societies` and render `<Societies />` right after `<NextWeekend />`; change the JSON-LD block to `const { settings, events } = await getSiteData();` (make `Home` async) and `subEvent: events.map((e) => eventJsonLd(e, settings))`, replacing `event.` with `settings.`.
- `components/layout/Dock.tsx`: change the `{ id: "stairway", label: "Stairway", Icon: Footprints }` item to `{ id: "societies", label: "Societies", Icon: Footprints }`, and change `pathname.startsWith("/weekend")` to `pathname.startsWith("/events") || pathname.startsWith("/s/")` mapping to `"societies"`.
- Delete `components/sections/Tracks.tsx`.
- `app/sitemap.ts`: make it async, `const { settings, societies, events } = await getSiteData();`, base from `settings.siteUrl`, and include `/s/${s.slug}` for each society and `/events/${e.slug}` for each event; remove `export const dynamic = "force-static"`.
- `next.config.ts` add:

```ts
async redirects() {
  return [{ source: "/weekend/:slug", destination: "/events/:slug", permanent: true }];
},
```

(Task 8 replaces the whole file; keep this function in it.)

- [ ] **Step 8: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .` — Expected: all pass.
Run `npm run dev` and check: `/` shows the five society cards and the quiz; `/s/ras` shows the RAS stairway with "Seeing Machines"; `/s/wie` shows 4 WIE steps; `/events/seeing-machines` renders with "RAS · Step 01"; `/weekend/seeing-machines` redirects (308) to `/events/seeing-machines`; `/s/nope` returns the 404 page.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: society stairway pages, /events routes and societies section"
```

---

### Task 8: Deploy as a Cloudflare Worker with OpenNext

**Files:**
- Create: `wrangler.jsonc`, `open-next.config.ts`, `.dev.vars` (gitignored), `cloudflare-env.d.ts` (generated)
- Modify: `next.config.ts`, `package.json`, `.gitignore`, `public/_headers`, `app/apple-icon.tsx`, `app/opengraph-image.tsx`, `app/manifest.ts`, `app/robots.ts`, `.claude/launch.json` (parent folder)

**Interfaces:**
- Produces: Worker `stairway` at `https://stairway.<account-subdomain>.workers.dev`; npm scripts `preview`, `deploy`, `cf-typegen`.

- [ ] **Step 1: Install**

```bash
npm install @opennextjs/cloudflare@1
npm install -D wrangler@4
```

- [ ] **Step 2: Config files**

Replace `next.config.ts`:

```ts
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Cloudflare Workers has no image-optimisation server here; images are served as-is.
  images: { unoptimized: true },
  async redirects() {
    return [{ source: "/weekend/:slug", destination: "/events/:slug", permanent: true }];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
```

Create `open-next.config.ts`:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR in Phase 1: pages are rendered per request, so no incremental cache binding is needed.
export default defineCloudflareConfig({});
```

Create `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "stairway",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "stairway" }],
  "observability": { "enabled": true },
  "vars": {
    "NEXT_PUBLIC_SUPABASE_URL": "https://<REF>.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "<publishable key>"
  }
}
```

(Fill `<REF>` and the publishable key — both are public values.)

Create `.dev.vars`:

```
NEXTJS_ENV=development
```

Append to `.gitignore`:

```
# OpenNext / Wrangler
.open-next
.wrangler
.dev.vars
```

Replace `package.json` scripts with:

```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"lint": "eslint",
"test": "vitest run",
"seed:generate": "tsx scripts/generate-seed.ts",
"preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
"deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
"cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
```

(The old `deploy:cloudflare` Pages script is removed.)

Remove `export const dynamic = "force-static";` and its comment from `app/apple-icon.tsx`, `app/opengraph-image.tsx`, `app/manifest.ts`, `app/robots.ts`, `app/sitemap.ts`.

Replace `public/_headers` with (OpenNext serves extension-less images with the right type itself):

```
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

Update `C:\claudeb\.claude\launch.json` `runtimeArgs` to `["--prefix", "stairway", "run", "dev", "--", "-p", "3123"]`.

- [ ] **Step 3: Local Worker preview**

Run: `npm run cf-typegen && npm run preview`
Expected: Wrangler serves on http://localhost:8787. Check with curl:

```bash
for u in / /s/ras /events/seeing-machines /weekend/seeing-machines /opengraph-image /nope; do printf "%s " $u; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8787$u; done
```

Expected: `200 text/html` ×3, `308` for `/weekend/…`, `200 image/png`, `404 text/html`.

- [ ] **Step 4: Deploy**

Run (account `7a852bedf2056637d90bd9534e6cd7c1`): `CLOUDFLARE_ACCOUNT_ID=7a852bedf2056637d90bd9534e6cd7c1 npm run deploy`
Expected: `Deployed stairway … https://stairway.<subdomain>.workers.dev`. If Wrangler asks to register a workers.dev subdomain, stop and ask the user to pick one in the Cloudflare dashboard (Workers & Pages → your subdomain).

Then set `siteUrl` in the `settings` site block to the new URL:

```sql
update public.site_blocks set data = jsonb_set(data, '{siteUrl}', '"https://stairway.<subdomain>.workers.dev"') where key = 'settings';
```

Verify live with the curl loop from Step 3 against the workers.dev URL.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(deploy): run on Cloudflare Workers via OpenNext"
```

---

### Task 9: GitHub auto-deploy, RLS tests and docs

**Files:**
- Create: `tests/rls/public-access.test.ts`
- Modify: `README.md` (sections 1, 4 and 5), `design-system/MASTER.md` (navigation: Dock "Societies")

**Interfaces:**
- Consumes: deployed Worker, Supabase project.

- [ ] **Step 1: Write the RLS integration test**

Create `tests/rls/public-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const env = loadEnv("test", process.cwd(), "");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const live = !!url && !!key;

describe.skipIf(!live)("RLS as an anonymous visitor", () => {
  const db = createClient(url!, key!, { auth: { persistSession: false } });

  it("can read published events", async () => {
    const { data, error } = await db.from("events").select("slug, status");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((e) => e.status === "published")).toBe(true);
  });

  it("cannot insert events", async () => {
    const { error } = await db.from("events").insert({ slug: "hack", title: "x" } as never);
    expect(error).not.toBeNull();
  });

  it("cannot change site content", async () => {
    const { data } = await db.from("site_blocks").update({ data: {} }).eq("key", "settings").select();
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot list admin roles", async () => {
    const { data } = await db.from("admin_roles").select("*");
    expect(data ?? []).toHaveLength(0);
  });
});
```

Run: `npx vitest run tests/rls`
Expected: PASS (4 tests) when `.env.local` is present.

- [ ] **Step 2: Connect GitHub → Cloudflare Workers Builds (user action)**

Ask the user to do this in the Cloudflare dashboard (requires their GitHub authorization):
1. Workers & Pages → `stairway` (Worker) → Settings → Builds → **Connect** → GitHub → repo `hussainkmajmal786-sketch/stairway`, branch `main`.
2. Build command: `npx opennextjs-cloudflare build`; Deploy command: `npx wrangler deploy`.
3. Build variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same values as `.env.local`), `NODE_VERSION=22`.

Verify: push an empty commit and confirm a new deployment appears:

```bash
git commit --allow-empty -m "chore: trigger Workers Builds" && git push
```

Expected: Cloudflare dashboard shows a successful build; the curl loop against workers.dev still passes.

- [ ] **Step 3: Retire the old Pages project**

After the Worker is confirmed live, ask the user before deleting the old static Pages project `stairway` (https://stairway.pages.dev). Do not delete it without explicit confirmation.

- [ ] **Step 4: Update docs**

`README.md`:
- Section 1 (Run locally): add "Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key." and `npm test`.
- Section 2: replace the `/data` table with: "Content lives in Supabase. Until the admin dashboard ships (Phase 5), edit rows in the Supabase Table Editor or regenerate from `supabase/seed-data/` with `npm run seed:generate`."
- Section 4: replace the Cloudflare Pages instructions with Workers: `npm run preview` (local Worker), `npm run deploy`, and the Workers Builds settings from Step 2.
- Section 5: add `supabase/`, `lib/events/`, `lib/site/`, `lib/supabase/`, `tests/` to the structure.

`design-system/MASTER.md`: in Navigation, change the dock items to "Home, Societies, Speakers, Gallery, FAQ + yellow Register".

- [ ] **Step 5: Final verification and commit**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all pass.

```bash
git add -A
git commit -m "test: anonymous RLS checks; docs for Supabase and Workers deploy"
git push
```

---

## Self-review notes

- **Spec coverage (Phase 1):** Supabase project + schema + RLS (T1), seed incl. societies/tracks/WIE (T2), clients/env (T3), DB-driven public pages (T5–T7), society stairways + `/events` + redirects (T7), OpenNext Workers (T8), GitHub auto-deploy + RLS tests (T9). Profiles/registrations/payments/admin are Phases 2–5 (separate plans).
- **Deferred deliberately:** `audit_log`, `admin_invites`, `event_questions`, profile and registration tables — they arrive with the phases that use them. Leaderboard stays static (`data/leaderboard.ts`) until check-ins exist (Phase 3).
- **Naming:** `useClock().weekends` keeps its name to limit churn; it now holds `EventWithStatus[]` for all societies.
