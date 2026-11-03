begin;

alter table public.cedar_ai_profiles enable row level security;
alter table public.cedar_match_history enable row level security;

-- Remove legacy policies that allowed anonymous/global access.
drop policy if exists "public can read ai profiles" on public.cedar_ai_profiles;
drop policy if exists "public can upsert ai profiles" on public.cedar_ai_profiles;
drop policy if exists "public can update ai profiles" on public.cedar_ai_profiles;
drop policy if exists "public can insert match history" on public.cedar_match_history;
drop policy if exists "public can read own-style match history feed" on public.cedar_match_history;

drop policy if exists "players can read own ai profile" on public.cedar_ai_profiles;
drop policy if exists "players can insert own ai profile" on public.cedar_ai_profiles;
drop policy if exists "players can update own ai profile" on public.cedar_ai_profiles;
drop policy if exists "players can insert own match history" on public.cedar_match_history;
drop policy if exists "players can read own match history" on public.cedar_match_history;

create policy "players can read own ai profile"
  on public.cedar_ai_profiles
  for select
  to authenticated
  using (profile_key = auth.uid()::text);

create policy "players can insert own ai profile"
  on public.cedar_ai_profiles
  for insert
  to authenticated
  with check (profile_key = auth.uid()::text);

create policy "players can update own ai profile"
  on public.cedar_ai_profiles
  for update
  to authenticated
  using (profile_key = auth.uid()::text)
  with check (profile_key = auth.uid()::text);

create policy "players can insert own match history"
  on public.cedar_match_history
  for insert
  to authenticated
  with check (player_id = auth.uid());

create policy "players can read own match history"
  on public.cedar_match_history
  for select
  to authenticated
  using (player_id = auth.uid());

revoke all on table public.cedar_ai_profiles from anon;
revoke all on table public.cedar_match_history from anon;
grant select, insert, update on table public.cedar_ai_profiles to authenticated;
grant select, insert on table public.cedar_match_history to authenticated;

-- Legacy global profile rows become unreachable under the new policies.
-- They are intentionally retained so this migration is non-destructive.

commit;
