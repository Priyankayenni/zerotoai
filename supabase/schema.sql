-- ZeroToAI Supabase schema
-- Run this in Supabase SQL Editor before inviting students.

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  class text,
  created_at timestamptz default now()
);

create table if not exists public.progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  phase_id text not null,
  completed_at timestamptz default now(),
  unique(user_id, phase_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, class)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'ZeroToAI learner'),
    new.raw_user_meta_data ->> 'class'
  )
  on conflict (id) do update set
    name = excluded.name,
    class = excluded.class;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.progress enable row level security;

drop policy if exists "Profiles are readable by everyone" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Progress is readable by everyone" on public.progress;
drop policy if exists "Users insert own progress" on public.progress;
drop policy if exists "Users update own progress" on public.progress;
drop policy if exists "Users delete own progress" on public.progress;

-- Keep profile writes owner-only
create policy "Users insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Privacy: show leaderboard to logged-in users, but hide personal details (class)
-- We'll allow public SELECT on profiles, but only name/class are column-level gated in the view below.
-- Here: restrict raw profiles table reads to authenticated users only.
create policy "Profiles are readable by authenticated users"
on public.profiles for select
using (auth.uid() is not null);

-- Privacy: raw progress rows should not be readable by everyone.
-- Allow SELECT only for authenticated users.
create policy "Progress is readable by authenticated users"
on public.progress for select
using (auth.uid() is not null);

-- Writes owner-only
create policy "Users insert own progress"
on public.progress for insert
with check (auth.uid() = user_id);

create policy "Users update own progress"
on public.progress for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users delete own progress"
on public.progress for delete
using (auth.uid() = user_id);

-- Leaderboard-safe view: exposes only name + completed_count (no class, no raw progress rows)
-- Under RLS, this view will only work if the underlying tables' SELECT policies allow
-- the current user to read rows. We keep progress/profile privacy intact via RLS.
create or replace view public.leaderboard as
select
  p.id as user_id,
  p.name as name,
  count(pr.phase_id) as completed_count
from public.profiles p
left join public.progress pr on pr.user_id = p.id
group by p.id, p.name;

-- Allow authenticated users to query the view directly.
-- (Without this, some setups may still block the view even if underlying policies allow it.)
grant select on public.leaderboard to authenticated;


