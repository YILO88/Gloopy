# Gloopy

## Product
- **Gloopy is a game house** (the umbrella brand). **Poker is the first game** in it ("the poker house"). More games come later.
- Current focus: get poker right for a Discord friend group. Game night target: 6 November 2026.
- Owner is the product manager, not a developer. Explain changes in plain words; keep instructions step by step.

## Build with the game house in mind
Not building the multi-game infrastructure yet, but don't paint us into a corner:
- Keep **shared** pieces game-neutral: Gloop characters, nicknames, stickers/GIFs, chat, lobby, waiting room, host crown, sign-in, sounds, the lobby's "sticker" visual style. These will be reused by every game.
- Keep **poker-specific** pieces inside poker: `src/engine/game.ts` (Hold'em rules), the table screen, chip settings.
- Avoid hard-coding "poker" into shared names, routes, tables or copy when a neutral name works. Brand copy says Gloopy; poker copy belongs to the poker screens.
- Room/lobby logic (`src/engine/room.ts`) should stay separable from the poker engine so another game can plug in.

## Stack
Next.js + Tailwind on Vercel, Supabase (database, Realtime, anonymous sign-in). Server-authoritative: browsers only read; every move goes through `src/app/api/`. Secret cards live in `room_secrets` (no read policy) and `hole_cards` (own row only).

## Accounts, friends, leaderboards, bots (shared Gloopy pieces)
- Guests play as before (anonymous sign-in). Accounts: Discord, Google, 6-digit email code (Apple planned, not built). A guest who signs in keeps the same id (Supabase manual linking).
- Tables `profiles`, `friendships`, `game_results` (migration 0003) have no read policies: browsers go through `/api/me`, `/api/friends`, `/api/users/[username]`, `/api/leaderboard`.
- Profile is Gloopy-wide (totals), with a tab per game; leaderboards are per game (`src/lib/results.ts`, `GAMES`).
- Leaderboard rules (owner): a win = 1st among people (bots ignored in placing); a game is ranked only with 2+ account holders; solo-with-bots is practice. Bots never appear on boards.
- Bots: host adds Easy/Normal/Hard in the lobby's "Add bots" fold. Server plays their turns (`src/engine/bots.ts`) when their short "think" deadline passes; a game ends when no person is left.

## Hosting
- Supabase is in **eu-north-1 (Stockholm)**; Vercel functions are pinned to **arn1 (Stockholm)** in `vercel.json` so every move stays in one city. If either moves, move the other too.

## Working rules
- `npm test` must pass (rule tests + 400 random bot games). `npm run local` runs without Supabase.
- `/check` on the live site is the card-privacy self-test; keep it passing.
- Pauses between hands and before the final leaderboard: cards stay fully visible for 3 seconds (pause = 3s + the ~0.8s turn-over animation). Don't make pauses longer than that (owner's rule). After a fold-win the winner gets 3.5s to tap Show; showing guarantees 2.5s of viewing, capped at 5s total.
- Design: playful "sticker" style outside the table; realistic, calmer style at the table (Plato is the reference). Keep table text short.
