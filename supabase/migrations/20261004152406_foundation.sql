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
