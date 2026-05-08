
-- Drop dependent triggers/functions tied to auth
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

-- Drop tables that exist solely for auth/roles/logging-per-user
drop table if exists public.ai_call_logs cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.profiles cascade;
drop function if exists public.has_role(uuid, app_role) cascade;
drop type if exists public.app_role cascade;

-- Detach incidents from auth.users and disable RLS
alter table public.incidents disable row level security;
drop policy if exists "incidents owner read" on public.incidents;
drop policy if exists "incidents owner insert" on public.incidents;
drop policy if exists "incidents owner update" on public.incidents;
drop policy if exists "incidents owner delete" on public.incidents;
alter table public.incidents drop constraint if exists incidents_user_id_fkey;
alter table public.incidents alter column user_id drop not null;

-- Same for qwen_learnings
alter table public.qwen_learnings disable row level security;
drop policy if exists "learnings owner read" on public.qwen_learnings;
drop policy if exists "learnings owner insert" on public.qwen_learnings;
drop policy if exists "learnings owner delete" on public.qwen_learnings;
alter table public.qwen_learnings drop constraint if exists qwen_learnings_user_id_fkey;
alter table public.qwen_learnings alter column user_id drop not null;
