
-- Roles
create type public.app_role as enum ('admin', 'operator');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

-- Incidents
create type public.incident_status as enum ('pending','analyzing','complete','failed');
create type public.incident_severity as enum ('low','medium','high','critical','unknown');
create type public.source_type as enum ('text','file','pdf','video');

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_type source_type not null default 'text',
  raw_text text,
  file_url text,
  file_name text,
  severity incident_severity not null default 'unknown',
  status incident_status not null default 'pending',
  analysis jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.incidents enable row level security;

-- updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger incidents_updated_at before update on public.incidents
for each row execute function public.tg_set_updated_at();

-- Profile auto-create + default role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  insert into public.user_roles(user_id, role) values (new.id, 'operator');
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
create policy "profiles self read" on public.profiles for select using (auth.uid()=id or public.has_role(auth.uid(),'admin'));
create policy "profiles self update" on public.profiles for update using (auth.uid()=id);

create policy "roles self read" on public.user_roles for select using (auth.uid()=user_id or public.has_role(auth.uid(),'admin'));
create policy "roles admin manage" on public.user_roles for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "incidents owner read" on public.incidents for select using (auth.uid()=user_id or public.has_role(auth.uid(),'admin'));
create policy "incidents owner insert" on public.incidents for insert with check (auth.uid()=user_id);
create policy "incidents owner update" on public.incidents for update using (auth.uid()=user_id or public.has_role(auth.uid(),'admin'));
create policy "incidents owner delete" on public.incidents for delete using (auth.uid()=user_id or public.has_role(auth.uid(),'admin'));

-- Storage bucket
insert into storage.buckets(id, name, public) values ('incident-files','incident-files', false);

create policy "incident files owner read" on storage.objects for select
  using (bucket_id='incident-files' and (auth.uid()::text = (storage.foldername(name))[1] or public.has_role(auth.uid(),'admin')));
create policy "incident files owner write" on storage.objects for insert
  with check (bucket_id='incident-files' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "incident files owner delete" on storage.objects for delete
  using (bucket_id='incident-files' and (auth.uid()::text = (storage.foldername(name))[1] or public.has_role(auth.uid(),'admin')));
