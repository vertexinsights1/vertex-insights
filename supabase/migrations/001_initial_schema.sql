-- Vertex Insights initial schema. Review and run in Supabase SQL Editor for your own project.
create extension if not exists pgcrypto;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Vertex Insights Admin',
  role text not null default 'owner' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  sections jsonb not null default '[]'::jsonb,
  seo_title text,
  meta_description text,
  og_image_path text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  body text not null default '',
  cover_image_path text,
  author_name text not null default 'Vertex Insights',
  seo_title text,
  meta_description text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  summary text not null default '',
  description text not null default '',
  deliverables jsonb not null default '[]'::jsonb,
  cta_label text not null default 'Request a quote',
  cta_href text not null default 'contact.html',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  seo_title text,
  meta_description text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  description text not null default '',
  features jsonb not null default '[]'::jsonb,
  cta_label text not null default 'Request a quote',
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  organisation text not null default '',
  service text not null default 'Not sure yet',
  message text not null,
  status text not null default 'new' check (status in ('new','contacted','qualified','proposal_sent','won','lost')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  follow_up_at timestamptz,
  assigned_to uuid references auth.users(id),
  source text not null default 'website',
  email_notification_status text not null default 'pending' check (email_notification_status in ('pending','sent','failed','not_configured')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  activity_type text not null check (activity_type in ('note','status_change','follow_up','email','system')),
  body text not null,
  old_status text,
  new_status text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  original_filename text not null,
  content_type text not null,
  alt_text text not null default '',
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.enquiries drop constraint if exists enquiries_field_lengths;
alter table public.enquiries add constraint enquiries_field_lengths check (
  char_length(name) between 2 and 120 and char_length(email) between 5 and 254 and char_length(message) between 10 and 5000
  and char_length(organisation) <= 180 and char_length(service) <= 160);

create index if not exists enquiries_created_at_idx on public.enquiries(created_at desc);
create index if not exists enquiries_status_idx on public.enquiries(status);
create index if not exists enquiries_follow_up_idx on public.enquiries(follow_up_at);
create index if not exists lead_activities_enquiry_idx on public.lead_activities(enquiry_id, created_at desc);
create index if not exists articles_status_published_idx on public.articles(status, published_at desc);
create index if not exists pages_status_idx on public.pages(status);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
do $$ declare t text; begin
  foreach t in array array['admin_profiles','pages','articles','services','packages','enquiries','site_settings'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop; end $$;

-- Admin authorization is based on an explicitly created profile, not user-editable metadata.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.role in ('owner','editor','viewer')
  );
$$;
create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.role in ('owner','editor')
  );
$$;
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'owner'
  );
$$;
revoke all on function public.is_admin() from public;
revoke all on function public.can_edit() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.can_edit() to authenticated;
grant execute on function public.is_owner() to authenticated;

alter table public.admin_profiles enable row level security;
alter table public.pages enable row level security;
alter table public.articles enable row level security;
alter table public.services enable row level security;
alter table public.packages enable row level security;
alter table public.enquiries enable row level security;
alter table public.lead_activities enable row level security;
alter table public.site_settings enable row level security;
alter table public.media enable row level security;
alter table public.audit_logs enable row level security;

-- Admin-only profiles and business data. Public enquiries are accepted by the server function only.
drop policy if exists "admins read profiles" on public.admin_profiles;
create policy "admins read profiles" on public.admin_profiles for select to authenticated using (public.is_admin());
drop policy if exists "owner manages profiles" on public.admin_profiles;
create policy "owner manages profiles" on public.admin_profiles for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "public reads published pages" on public.pages;
create policy "public reads published pages" on public.pages for select to anon, authenticated using (status = 'published' or public.is_admin());
drop policy if exists "editors manage pages" on public.pages;
create policy "editors manage pages" on public.pages for all to authenticated using (public.can_edit()) with check (public.can_edit());
drop policy if exists "public reads published articles" on public.articles;
create policy "public reads published articles" on public.articles for select to anon, authenticated using (status = 'published' or public.is_admin());
drop policy if exists "editors manage articles" on public.articles;
create policy "editors manage articles" on public.articles for all to authenticated using (public.can_edit()) with check (public.can_edit());
drop policy if exists "public reads visible published services" on public.services;
create policy "public reads visible published services" on public.services for select to anon, authenticated using ((status = 'published' and is_visible) or public.is_admin());
drop policy if exists "editors manage services" on public.services;
create policy "editors manage services" on public.services for all to authenticated using (public.can_edit()) with check (public.can_edit());
drop policy if exists "public reads visible packages" on public.packages;
create policy "public reads visible packages" on public.packages for select to anon, authenticated using (is_visible or public.is_admin());
drop policy if exists "editors manage packages" on public.packages;
create policy "editors manage packages" on public.packages for all to authenticated using (public.can_edit()) with check (public.can_edit());
drop policy if exists "admins read enquiries" on public.enquiries;
create policy "admins read enquiries" on public.enquiries for select to authenticated using (public.is_admin());
drop policy if exists "editors write enquiries" on public.enquiries;
create policy "editors write enquiries" on public.enquiries for update to authenticated using (public.can_edit()) with check (public.can_edit());
drop policy if exists "editors delete enquiries" on public.enquiries;
create policy "editors delete enquiries" on public.enquiries for delete to authenticated using (public.can_edit());
drop policy if exists "admins read lead activities" on public.lead_activities;
create policy "admins read lead activities" on public.lead_activities for select to authenticated using (public.is_admin());
drop policy if exists "editors write lead activities" on public.lead_activities;
create policy "editors write lead activities" on public.lead_activities for insert to authenticated with check (public.can_edit() and created_by = (select auth.uid()));
drop policy if exists "public reads public settings only" on public.site_settings;
create policy "public reads public settings only" on public.site_settings for select to anon, authenticated using (key in ('public_site','seo_defaults') or public.is_admin());
drop policy if exists "editors manage settings" on public.site_settings;
create policy "editors manage settings" on public.site_settings for all to authenticated using (public.can_edit()) with check (public.can_edit());
drop policy if exists "public reads media metadata" on public.media;
create policy "public reads media metadata" on public.media for select to anon, authenticated using (true);
drop policy if exists "editors manage media metadata" on public.media;
create policy "editors manage media metadata" on public.media for all to authenticated using (public.can_edit()) with check (public.can_edit());
drop policy if exists "owners read audit logs" on public.audit_logs;
create policy "owners read audit logs" on public.audit_logs for select to authenticated using (public.is_owner());
drop policy if exists "editors insert audit logs" on public.audit_logs;
create policy "editors insert audit logs" on public.audit_logs for insert to authenticated with check (public.can_edit() and actor_id = (select auth.uid()));

-- Explicit grants (RLS above still decides which rows are visible). Newer Supabase projects no longer grant these automatically.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.pages, public.articles, public.services, public.packages, public.site_settings, public.media to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Public-read bucket (images shown on the website). Only editors/owners can upload, replace or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vertex-media', 'vertex-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "admins read vertex media" on storage.objects;
create policy "admins read vertex media" on storage.objects for select to authenticated using (bucket_id = 'vertex-media' and public.is_admin());
drop policy if exists "editors upload vertex media" on storage.objects;
create policy "editors upload vertex media" on storage.objects for insert to authenticated with check (bucket_id = 'vertex-media' and public.can_edit());
drop policy if exists "editors update vertex media" on storage.objects;
create policy "editors update vertex media" on storage.objects for update to authenticated using (bucket_id = 'vertex-media' and public.can_edit()) with check (bucket_id = 'vertex-media' and public.can_edit());
drop policy if exists "editors delete vertex media" on storage.objects;
create policy "editors delete vertex media" on storage.objects for delete to authenticated using (bucket_id = 'vertex-media' and public.can_edit());

-- Seed the three quote-only services so the admin is not empty on first login.
insert into public.services (name, slug, summary, status, is_visible, sort_order) values
  ('Business intelligence and reporting','bi','Dashboards and reporting built from the data you already hold.','published',true,1),
  ('Financial analysis and modelling','financial','Budgets, forecasts and scenario models you can keep using.','published',true,2),
  ('Market and competitor research','market','Research that answers a specific commercial question.','published',true,3)
on conflict (slug) do nothing;

-- IMPORTANT: create the first auth user in Supabase Auth, then insert its UUID into admin_profiles as role='owner'.
