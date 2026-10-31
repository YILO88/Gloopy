-- Gloopy update 2: instant updates + automatic cleanup.
-- Run once in Supabase: SQL Editor → New snippet → paste this file → Run.
-- Safe to run again.

-- ------------------------------------------------------------------ instant updates
-- The game server pushes each new table state on a private channel "game:<CODE>",
-- and each player's new cards on "cards:<their id>". Players may LISTEN only:
-- there is no insert policy, so nobody but the server can send on these channels.
drop policy if exists "players hear their table and their own cards" on realtime.messages;
create policy "players hear their table and their own cards"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      realtime.topic() like 'game:%'
      or realtime.topic() = 'cards:' || (select auth.uid())::text
    )
  );

-- ------------------------------------------------------------------ cleanup rules
-- A table closes (link stops working; its cards and chat are deleted) when:
--   * nothing has happened at it for 24 hours, or
--   * its game ended more than 15 minutes ago and nobody started another.
-- (It also closes the moment the last person leaves; the game server does that.)
-- Sign-in records for players not seen in 30 days are removed too.
create or replace function public.gloopy_cleanup() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.rooms
   where updated_at < now() - interval '24 hours'
      or (state->>'phase' = 'results' and updated_at < now() - interval '15 minutes');

  begin
    delete from auth.users
     where is_anonymous
       and coalesce(last_sign_in_at, created_at) < now() - interval '30 days';
  exception when others then
    null; -- not allowed on this project: skip, tables are still cleaned
  end;
end $$;
revoke all on function public.gloopy_cleanup() from public, anon, authenticated;

-- Run the cleanup every 10 minutes.
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('gloopy-cleanup');
exception when others then
  null; -- not scheduled yet
end $$;
select cron.schedule('gloopy-cleanup', '*/10 * * * *', 'select public.gloopy_cleanup()');

-- Clean up old tables right now, too.
select public.gloopy_cleanup();
