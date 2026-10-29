# Gloopy Poker

Texas Hold'em for 2–9 friends from one link. Next.js + Tailwind on Vercel, Supabase for the database and live updates.

## How it fits together

| Part | Where | Job |
| --- | --- | --- |
| `src/engine/` | Pure TypeScript | Poker rules, side pots, blinds clock, missed turns, lobby and waiting room |
| `src/app/api/` | Vercel | Checks every move, runs the engine, saves to Supabase |
| `supabase/migrations/` | Supabase | Tables, security rules, save functions |
| `src/components/`, `src/app/` | Browser | Home, lobby, table, results, chat |

The deck and everyone's cards live in `room_secrets`, which no browser can read. Each player can read only their own row in `hole_cards`.

## One-time setup

### 1. Supabase

1. Open your project → **SQL Editor** → **New query**, paste all of `supabase/migrations/0001_gloopy.sql`, and press **Run**.
2. **Authentication → Sign In / Providers** → turn on **Allow anonymous sign-ins** → Save.
3. **Project Settings → API Keys**: note the **Project URL**, the **publishable** key and the **secret** key.

### 2. Vercel

1. **Add New → Project** → import the `Gloopy` GitHub repo.
2. Before deploying, open **Environment Variables** and add:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
| `SUPABASE_SECRET_KEY` | secret key (never share this one) |

3. Press **Deploy**. Every push to `main` redeploys automatically.

## Before game night

- Supabase free projects pause after 7 days without activity. Open the Supabase dashboard on the day and press **Restore** if it's paused.

## Developing

```bash
npm install
npm test                      # rule tests + 400 random bot games
# Run locally without Supabase (in-memory, several tabs = several players):
GLOOPY_MEMORY_STORE=1 NEXT_PUBLIC_GLOOPY_DEV=1 npm run dev
```

## Adding your own stickers and GIFs

Send the files over and they'll replace the placeholder Gloop stickers in `src/lib/gloops.ts`.
