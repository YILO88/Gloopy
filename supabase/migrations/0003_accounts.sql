-- Gloopy accounts: profiles, friends, game results and leaderboards.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
--
-- Security: browsers never read these tables directly. Every request goes through the game's
-- server (which checks who is asking), so there are no read policies at all.

-- ------------------------------------------------------------------ profiles (one per account)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_]{3,16}$'),
  display_name  text not null check (char_length(display_name) between 1 and 16),
  avatar        text not null,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ------------------------------------------------------------------ friends
create table if not exists public.friendships (
  requester   uuid not null references public.profiles(id) on delete cascade,
  addressee   uuid not null references public.profiles(id) on delete cascade,
  status      text not null check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee);
alter table public.friendships enable row level security;

-- ------------------------------------------------------------------ results (every Gloopy game)
-- One row per person per finished game. Bots never get rows.
-- place: finishing place among people (bots ignored). ranked: 2+ players had accounts.
create table if not exists public.game_results (
  id           bigint generated always as identity primary key,
  game         text not null default 'poker',
  room_code    text not null,
  game_number  integer not null,
  player_id    uuid not null,
  finished_at  timestamptz not null,
  place        integer not null,
  place_all    integer not null,
  people       integer not null,
  bots         integer not null default 0,
  accounts     integer not null default 0,
  ranked       boolean not null,
  won          boolean not null,
  stats        jsonb not null default '{}'::jsonb,
  unique (room_code, game_number, player_id)
);
create index if not exists game_results_player_idx on public.game_results (player_id, finished_at desc);
create index if not exists game_results_board_idx on public.game_results (game, finished_at) where ranked;
alter table public.game_results enable row level security;

-- ------------------------------------------------------------------ leaderboard (server only)
create or replace function public.gloopy_leaderboard(p_game text, p_since timestamptz, p_ids uuid[] default null, p_limit integer default 50)
returns table (player_id uuid, username text, display_name text, avatar text, wins bigint, games bigint)
language sql stable security definer set search_path = public as $$
  with board as (
    select r.player_id, count(*) filter (where r.won) as wins, count(*) as games
      from public.game_results r
     where r.game = p_game and r.ranked and r.finished_at >= p_since
       and (p_ids is null or r.player_id = any(p_ids))
     group by r.player_id
  )
  select p.id, p.username, p.display_name, p.avatar, coalesce(b.wins, 0), coalesce(b.games, 0)
    from public.profiles p
    left join board b on b.player_id = p.id
   where (p_ids is null and coalesce(b.wins, 0) > 0) or (p_ids is not null and p.id = any(p_ids))
   order by coalesce(b.wins, 0) desc, coalesce(b.games, 0) asc, p.username
   limit p_limit;
$$;
revoke all on function public.gloopy_leaderboard(text, timestamptz, uuid[], integer) from public, anon, authenticated;
grant execute on function public.gloopy_leaderboard(text, timestamptz, uuid[], integer) to service_role;
