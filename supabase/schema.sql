-- Point41 — accounts & stats schema.
-- Run this once in your Supabase project's SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run only after dropping the objects below; it is not idempotent.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  games_played integer not null default 0,
  wins integer not null default 0,
  total_score numeric not null default 0,   -- sum of every recorded game's total; average = total_score / games_played
  best_score numeric,                        -- lowest total ever recorded; null until the first game
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);

-- Deliberately no insert/update/delete policy for the authenticated role.
-- Every write goes through record_game_result() below, which is SECURITY
-- DEFINER and reads auth.uid() itself (no p_id argument) — so a client
-- cannot touch any row but its own, even in principle.

create or replace function public.record_game_result(p_total numeric, p_won boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  insert into public.profiles (id, games_played, wins, total_score, best_score)
  values (auth.uid(), 1, case when p_won then 1 else 0 end, p_total, p_total)
  on conflict (id) do update
    set games_played = profiles.games_played + 1,
        wins         = profiles.wins + (case when p_won then 1 else 0 end),
        total_score  = profiles.total_score + p_total,
        best_score   = least(profiles.best_score, p_total),
        updated_at   = now()
  returning * into result;
  return result;
end;
$$;

grant execute on function public.record_game_result(numeric, boolean) to authenticated;
