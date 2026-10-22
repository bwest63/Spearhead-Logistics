-- TRACE shared database for Supabase.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run again: it updates functions and rules without deleting data.
--
-- Access rules (row-level security):
--   • Everyone must be signed in; signed-in users can read all TRACE data.
--   • Units, training events, and imported T&EOs: only TRACE admins change them.
--   • Evaluations, step claims, and OC/T log entries: anyone can add their own;
--     only the author or an admin can change or delete them.
--   • The first account created becomes the admin. Promote others with:
--       update public.profiles set role = 'admin' where display_name = 'NAME';

-- ---------- Profiles and roles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null default 'oct' check (role in ('oct', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'oct' else 'admin' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles own name" on public.profiles;
create policy "profiles own name" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Users may rename themselves but never change their own role.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------- Shared TRACE data ----------
-- Every table stores one app object per row.
create or replace function public.trace_touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

do $$
declare
  t text;
  admin_tables text[] := array['units', 'events', 'teos'];
  owned_tables text[] := array['evaluations', 'claims', 'oct_logs'];
begin
  foreach t in array admin_tables || owned_tables loop
    execute format(
      'create table if not exists public.%I (
         id text primary key,
         data jsonb not null,
         created_by uuid default auth.uid() references auth.users (id) on delete set null,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now(),
         updated_by uuid default auth.uid()
       )', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.trace_touch_row()',
      t || '_touch', t);
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "add" on public.%I', t);
    execute format('drop policy if exists "change" on public.%I', t);
    execute format('drop policy if exists "remove" on public.%I', t);
  end loop;

  foreach t in array admin_tables loop
    execute format('create policy "add" on public.%I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "change" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "remove" on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;

  foreach t in array owned_tables loop
    execute format('create policy "add" on public.%I for insert to authenticated with check (created_by = auth.uid())', t);
    execute format('create policy "change" on public.%I for update to authenticated using (created_by = auth.uid() or public.is_admin()) with check (true)', t);
    execute format('create policy "remove" on public.%I for delete to authenticated using (created_by = auth.uid() or public.is_admin())', t);
  end loop;

  -- Live updates: send row changes on these tables to signed-in browsers.
  foreach t in array admin_tables || owned_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------- T&EO source documents ----------
insert into storage.buckets (id, name, public)
values ('teo-sources', 'teo-sources', false)
on conflict (id) do nothing;

drop policy if exists "teo sources read" on storage.objects;
create policy "teo sources read" on storage.objects
  for select to authenticated using (bucket_id = 'teo-sources');
drop policy if exists "teo sources add" on storage.objects;
create policy "teo sources add" on storage.objects
  for insert to authenticated with check (bucket_id = 'teo-sources' and public.is_admin());
drop policy if exists "teo sources change" on storage.objects;
create policy "teo sources change" on storage.objects
  for update to authenticated using (bucket_id = 'teo-sources' and public.is_admin());
drop policy if exists "teo sources remove" on storage.objects;
create policy "teo sources remove" on storage.objects
  for delete to authenticated using (bucket_id = 'teo-sources' and public.is_admin());
