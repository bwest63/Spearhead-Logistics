-- TRACE shared database for Supabase.
-- Run in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run again (for example after a TRACE update): it updates tables,
-- functions, and rules without deleting data.
--
-- Access rules (row-level security):
--   • Everyone must be signed in with an active account; active accounts can
--     read all TRACE data. Accounts an admin has turned off see nothing.
--   • Units, training events, and imported T&EOs: only TRACE admins change them.
--   • Evaluations, step claims, and OC/T log entries: anyone can add their own;
--     only the author or an admin can change or delete them.
--   • The first account created becomes the admin. Admins manage everyone else
--     on TRACE's Accounts page.

-- ---------- Profiles, roles, and access ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role text not null default 'oct' check (role in ('oct', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles enable row level security;
update public.profiles p set email = lower(u.email)
  from auth.users u
  where u.id = p.id and p.email is distinct from lower(u.email);

-- Emails an admin has invited, and the role each will get on sign-up.
create table if not exists public.account_invites (
  email text primary key check (email = lower(email)),
  role text not null default 'oct' check (role in ('oct', 'admin')),
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.account_invites enable row level security;

-- TRACE-wide settings, such as invite-only sign-up.
create table if not exists public.trace_settings (
  key text primary key,
  value jsonb not null
);
alter table public.trace_settings enable row level security;

create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

-- Creates the profile for each new sign-in account. In invite-only mode, an
-- email that is not on the invite list is refused (the very first account is
-- always allowed so a new project can get its admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_account boolean := not exists (select 1 from public.profiles);
  invite_only boolean := coalesce(
    (select (value ->> 'enabled')::boolean from public.trace_settings where key = 'invite_only'), false);
  invited_role text := (select role from public.account_invites where email = lower(new.email));
begin
  if not first_account and invite_only and invited_role is null then
    raise exception 'TRACE: % has not been invited', new.email using errcode = '42501';
  end if;
  insert into public.profiles (id, display_name, role, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    case when first_account then 'admin' else coalesce(invited_role, 'oct') end,
    lower(new.email)
  );
  delete from public.account_invites where email = lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- People see their own profile; admins see everyone's through admin_list_accounts().
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles own name" on public.profiles;
create policy "profiles own name" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Users may rename themselves but never change their own role or access.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "admins manage invites" on public.account_invites;
create policy "admins manage invites" on public.account_invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins manage settings" on public.trace_settings;
create policy "admins manage settings" on public.trace_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Account management for admins (called from TRACE's Accounts page) ----------
create or replace function public.trace_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only TRACE admins can manage accounts.' using errcode = '42501';
  end if;
end;
$$;

-- Refuses a change that would leave TRACE with no active admin.
create or replace function public.trace_keep_an_admin(target uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where role = 'admin' and active and id <> target
  ) then
    raise exception 'TRACE needs at least one active admin. Make someone else an admin first.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_list_accounts()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.trace_require_admin();
  return query
    select p.id, coalesce(p.email, lower(u.email)), p.display_name, p.role, p.active,
           p.created_at, u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    order by p.active desc, p.display_name;
end;
$$;

create or replace function public.admin_set_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.trace_require_admin();
  if new_role not in ('oct', 'admin') then
    raise exception 'Unknown role: %', new_role;
  end if;
  if new_role = 'oct' then
    perform public.trace_keep_an_admin(target);
  end if;
  update public.profiles set role = new_role where id = target;
end;
$$;

create or replace function public.admin_set_active(target uuid, make_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.trace_require_admin();
  if not make_active then
    if target = auth.uid() then
      raise exception 'You cannot turn off your own access.' using errcode = '42501';
    end if;
    perform public.trace_keep_an_admin(target);
  end if;
  update public.profiles set active = make_active where id = target;
end;
$$;

create or replace function public.admin_rename(target uuid, new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.trace_require_admin();
  if nullif(trim(new_name), '') is null then
    raise exception 'Enter a name.';
  end if;
  update public.profiles set display_name = left(trim(new_name), 80) where id = target;
end;
$$;

revoke execute on function
  public.admin_list_accounts(), public.admin_set_role(uuid, text),
  public.admin_set_active(uuid, boolean), public.admin_rename(uuid, text)
  from public, anon;
grant execute on function
  public.admin_list_accounts(), public.admin_set_role(uuid, text),
  public.admin_set_active(uuid, boolean), public.admin_rename(uuid, text)
  to authenticated;

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
    execute format('create policy "read" on public.%I for select to authenticated using (public.is_active())', t);
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
    execute format('create policy "add" on public.%I for insert to authenticated with check (created_by = auth.uid() and public.is_active())', t);
    execute format('create policy "change" on public.%I for update to authenticated using ((created_by = auth.uid() and public.is_active()) or public.is_admin()) with check (true)', t);
    execute format('create policy "remove" on public.%I for delete to authenticated using ((created_by = auth.uid() and public.is_active()) or public.is_admin())', t);
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
  for select to authenticated using (bucket_id = 'teo-sources' and public.is_active());
drop policy if exists "teo sources add" on storage.objects;
create policy "teo sources add" on storage.objects
  for insert to authenticated with check (bucket_id = 'teo-sources' and public.is_admin());
drop policy if exists "teo sources change" on storage.objects;
create policy "teo sources change" on storage.objects
  for update to authenticated using (bucket_id = 'teo-sources' and public.is_admin());
drop policy if exists "teo sources remove" on storage.objects;
create policy "teo sources remove" on storage.objects
  for delete to authenticated using (bucket_id = 'teo-sources' and public.is_admin());
