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

## Working rules
- `npm test` must pass (rule tests + 400 random bot games). `npm run local` runs without Supabase.
- `/check` on the live site is the card-privacy self-test; keep it passing.
- Design: playful "sticker" style outside the table; realistic, calmer style at the table (Plato is the reference). Keep table text short.
