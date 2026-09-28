# Ghostbook

Family records log: Mario Kart World time trials, Lounge and wars, Call of Duty Zombies runs,
and any other game you add from the web. Every record can carry proof (screenshot or clip).

- Spec and decisions: [`docs/SPEC.md`](docs/SPEC.md)
- Game research (tracks, maps, modes, record categories): [`docs/research/`](docs/research/)
- Design: [`docs/mockups/timing-tower/`](docs/mockups/timing-tower/) is the chosen direction

Next.js 15 (App Router) · TypeScript · Drizzle on Postgres (Neon in production, PGlite locally) ·
Vercel Blob (private store) for proof · plain CSS, Archivo via `next/font`.

## How it's modelled

- **Game** → **catalogs** (tracks, maps, characters, karts, cc, route, modes…) and **categories**
  (Time Trial, Lounge, War, High round, EE speedrun…).
- A category is a JSON **field template**: `time`, `integer`, `number`, `text`, `choice` (from a
  catalog), `boolean`, `splits`, `players`, `date`. One field is the **score** (lower or higher is
  better) and some fields form the **board key** (Time Trial: track + cc + route; High round:
  map + mode + player count). The template drives the log form, validation and the pages.
- A **PB** is the best score per board key per player. A record with several people counts for each
  account and for the squad as a whole.
- World records come from mkwrs.com: `mkworld/` for Mario Kart World (150cc only; 200cc stays `–`)
  and `mk8dx/` for Mario Kart 8 Deluxe (150cc and 200cc; a class with no WR on the site stays `–`).
- A record can be edited (values, people, date, notes, proof) by whoever logged it, anyone on it,
  and admins. PBs and boards are computed from records, so they follow the edit.

Code map: `src/lib/template.ts` (templates, validation, board keys), `src/lib/pb.ts` (PBs, splits
colours), `src/lib/time.ts` (time parsing/formatting), `src/lib/wr/` (mkwrs scraper + refresh),
`src/lib/seed/` (seed data), `src/lib/i18n/dict.ts` (every UI string, EN and ES).

## Local development

Node 20. Without `DATABASE_URL` the app uses PGlite stored in `.data/pglite` (gitignored).
Only one process can have that folder open at a time: stop the dev server before running scripts.

```bash
npm install
npm run db:seed                          # migrations + games, catalogs, categories, WR snapshot
npm run create-admin -- andres AND Andrés  # prints a one-time password
npm run dev
```

Optional: `npm run db:demo` adds sample history and three more accounts (javi, lucia, pablo;
password `ghostbook-demo`) so the pages have something to show. It refuses to run against
`DATABASE_URL`.

Proof uploads need `BLOB_READ_WRITE_TOKEN` in `.env.local` (`vercel env pull`).

Checks: `npm test` (vitest), `npm run typecheck`, `npm run lint`, `npm run build`.
Browser QA helpers live in `tools/` (`qa-flow.mjs` logs a TT time with proof, a zombies session and
an invite; `qa-edit.mjs` edits a TT time into a PB and drops its proof; `shots.mjs` takes 390 and
1440 px screenshots into `docs/shots/`).

## Production (Vercel)

Environment variables:

| Name | What |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (pooled is fine; the app uses Neon's HTTP driver) |
| `SESSION_SECRET` | 32+ random characters; signs the session cookie. `openssl rand -base64 32` |
| `CRON_SECRET` | Random string. Vercel Cron sends it as `Authorization: Bearer …` to `/api/cron/wr` |
| `BLOB_READ_WRITE_TOKEN` | Private Blob store `ghostbook-proofs` (already linked) |

Deploying runs `vercel-build`: migrations, the idempotent seed, then `next build`. Without
`DATABASE_URL` the migrate and seed steps skip themselves. After the first deploy with Neon, create
the first account from your machine:

```bash
DATABASE_URL='postgres://…' npm run create-admin -- andres AND Andrés
```

Then log in, change the password in Settings and create invite links for the others there.

`vercel.json` schedules the world record refresh daily at 04:00 UTC. Anyone logged in can also press
**Refresh WRs** on the game page (at most once every 5 minutes).

## Storage meter

Settings lists the Blob store itself (every page of `list()`), cached for 10 minutes and dropped
whenever a proof is added or removed. It shows the real usage against the 1 GB free tier, the file
count, and how many files in Blob no record points at (counted, never deleted on its own). If Blob
can't be asked it falls back to the sum of proof sizes in the database and says so.
