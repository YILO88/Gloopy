-- Gloopy v1 database.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
--
-- Security model
--   * Players sign in anonymously (no email). Their id is auth.uid().
--   * Browsers can only READ. Every change goes through the game's server code on
--     Vercel, which uses the secret service key and checks every move.
--   * room_secrets (the deck and everyone's cards) has no read policy at all, so no
--     browser can ever read it.
--   * hole_cards: each player can read only their own row.

-- ------------------------------------------------------------------ rooms (public)
create table if not exists public.rooms (
  code        text primary key,
  state       jsonb not null,           -- what everyone at the table may see
  version     integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.rooms enable row level security;
drop policy if exists "signed-in users can read rooms" on public.rooms;
create policy "signed-in users can read rooms"
  on public.rooms for select to authenticated using (true);

-- ------------------------------------------------------------------ room_secrets (server only)
create table if not exists public.room_secrets (
  code        text primary key references public.rooms(code) on delete cascade,
  room        jsonb not null,           -- full state, including the deck and all cards
  version     integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.room_secrets enable row level security;
-- No policies on purpose: only the server (service key) can read or write.

-- ------------------------------------------------------------------ hole_cards (own row only)
create table if not exists public.hole_cards (
  room_code   text not null references public.rooms(code) on delete cascade,
  player_id   uuid not null,
  hand_number integer not null,
  cards       text[] not null,
  updated_at  timestamptz not null default now(),
  primary key (room_code, player_id)
);
alter table public.hole_cards enable row level security;
drop policy if exists "players read only their own cards" on public.hole_cards;
create policy "players read only their own cards"
  on public.hole_cards for select to authenticated using (player_id = auth.uid());

-- ------------------------------------------------------------------ chat
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  room_code   text not null references public.rooms(code) on delete cascade,
  sender_id   uuid not null,
  sender_name text not null,
  avatar      text not null,
  watching    boolean not null default false,
  kind        text not null check (kind in ('text', 'sticker', 'gif')),
  body        text not null check (char_length(body) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_code, id desc);
alter table public.chat_messages enable row level security;
drop policy if exists "signed-in users can read chat" on public.chat_messages;
create policy "signed-in users can read chat"
  on public.chat_messages for select to authenticated using (true);

-- ------------------------------------------------------------------ live updates
-- Push row changes to browsers (Realtime still applies the read rules above).
do $$
begin
  begin alter publication supabase_realtime add table public.rooms; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hole_cards; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chat_messages; exception when duplicate_object then null; end;
end $$;

-- ------------------------------------------------------------------ server-only save functions
-- One call saves the full state, the public state and any newly dealt cards together,
-- and only if nobody else saved in the meantime (version check). Prevents two moves
-- landing at the same moment from overwriting each other.
create or replace function public.gloopy_create(p_code text, p_room jsonb, p_state jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.rooms (code, state, version) values (p_code, p_state, 1);
  insert into public.room_secrets (code, room, version) values (p_code, p_room, 1);
  return true;
exception when unique_violation then
  return false;
end $$;

create or replace function public.gloopy_save(
  p_code text, p_expected integer, p_room jsonb, p_state jsonb, p_holes jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare h jsonb;
begin
  update public.room_secrets
     set room = p_room, version = p_expected + 1, updated_at = now()
   where code = p_code and version = p_expected;
  if not found then return false; end if;

  update public.rooms
     set state = p_state, version = p_expected + 1, updated_at = now()
   where code = p_code;

  if p_holes is not null then
    for h in select * from jsonb_array_elements(p_holes) loop
      insert into public.hole_cards (room_code, player_id, hand_number, cards, updated_at)
      values (p_code, (h->>'player_id')::uuid, (h->>'hand_number')::int,
              array(select jsonb_array_elements_text(h->'cards')), now())
      on conflict (room_code, player_id) do update
        set hand_number = excluded.hand_number, cards = excluded.cards, updated_at = now();
    end loop;
  end if;
  return true;
end $$;

revoke all on function public.gloopy_create(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.gloopy_save(text, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.gloopy_create(text, jsonb, jsonb) to service_role;
grant execute on function public.gloopy_save(text, integer, jsonb, jsonb, jsonb) to service_role;

-- ------------------------------------------------------------------ housekeeping
-- Rooms untouched for 2 days are deleted (cards and chat go with them).
create or replace function public.gloopy_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from public.rooms where updated_at < now() - interval '2 days';
$$;
revoke all on function public.gloopy_cleanup() from public, anon, authenticated;
