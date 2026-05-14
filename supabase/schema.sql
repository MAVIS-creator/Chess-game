create table if not exists public.cedar_ai_profiles (
  profile_key text primary key,
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  strong_games integer not null default 0 check (strong_games >= 0),
  experience integer not null default 0 check (experience >= 0),
  pressure_index integer not null default 0 check (pressure_index >= 0),
  endgame_prep integer not null default 0 check (endgame_prep >= 0),
  opening_prep integer not null default 0 check (opening_prep >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cedar_match_history (
  id bigint generated always as identity primary key,
  player_id uuid references auth.users(id) on delete set null,
  player_name text not null default 'Guest',
  difficulty text not null,
  result text not null check (result in ('win', 'loss', 'draw')),
  move_count integer not null default 0 check (move_count >= 0),
  status_text text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists cedar_match_history_created_at_idx
  on public.cedar_match_history (created_at desc);

alter table public.cedar_ai_profiles enable row level security;
alter table public.cedar_match_history enable row level security;

drop policy if exists "public can read ai profiles" on public.cedar_ai_profiles;
create policy "public can read ai profiles"
  on public.cedar_ai_profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public can upsert ai profiles" on public.cedar_ai_profiles;
create policy "public can upsert ai profiles"
  on public.cedar_ai_profiles
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public can update ai profiles" on public.cedar_ai_profiles;
create policy "public can update ai profiles"
  on public.cedar_ai_profiles
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "public can insert match history" on public.cedar_match_history;
create policy "public can insert match history"
  on public.cedar_match_history
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public can read own-style match history feed" on public.cedar_match_history;
create policy "public can read own-style match history feed"
  on public.cedar_match_history
  for select
  to anon, authenticated
  using (true);

create or replace function public.set_cedar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists cedar_ai_profiles_set_updated_at on public.cedar_ai_profiles;
create trigger cedar_ai_profiles_set_updated_at
before update on public.cedar_ai_profiles
for each row
execute function public.set_cedar_updated_at();
