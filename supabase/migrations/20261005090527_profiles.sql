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
