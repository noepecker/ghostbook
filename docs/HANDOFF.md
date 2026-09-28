# Handoff — how to keep working on Ghostbook

For Andrés (`Pandrius`). The [README](../README.md) explains the app and the model; this page is
about access, workflow and what is left.

## Where things live

| What | Where |
|---|---|
| Code | `github.com/noepecker/ghostbook` (public repo; you're a collaborator) |
| App | https://ghostbook-gg.vercel.app (`ghostbook.vercel.app` belongs to somebody else) |
| Hosting | Vercel project `ghostbook` in Noé's Hobby account (`noepas`) |
| Database | Neon Postgres `ghostbook-db` (production) and `ghostbook-preview-db` (previews) |
| Proof files | Vercel Blob `ghostbook-proofs` (production) and `ghostbook-proofs-preview`; private, signed URLs |
| World records | scraped from mkwrs.com daily at 04:00 UTC (`vercel.json`) and with **Refresh WRs** |

The repo is public so that Vercel's free plan deploys your commits too (on Hobby, private repos
only deploy commits by the account owner). Only the code is public: records, clips, passwords and
keys live in Neon, Blob and Vercel env vars, never in the repo. Keep it that way — no `.env*`, no
dumps, no real clips in git.

## Workflow

1. Branch from `main` (`feat/…`, `fix/…`), commit with Conventional Commits (`feat: …`).
2. Open a PR to `main`. Vercel builds a **preview** and posts its URL on the PR.
3. Squash-merge. Every push to `main` deploys to production on its own.

On a personal GitHub repo there is only one collaborator level: you can push, open and merge PRs,
manage issues. Repo settings, secrets and visibility stay with Noé.

You are not a member of the Vercel project (Hobby has one seat). You don't need to be for
deploying. For env vars, logs or the dashboard, ask Noé.

## Local development without any secret

`npm install && npm run db:seed && npm run dev` gives you the full app on PGlite (an embedded
Postgres in `.data/`), with every game, catalog and a WR snapshot. `npm run db:demo` adds sample
history and three demo accounts. The only thing that needs a secret locally is uploading proof
(`BLOB_READ_WRITE_TOKEN`); everything else works offline.

Before a PR: `npm test && npm run typecheck && npm run lint && npm run build`.

## Things that can bite

- **Previews have their own database and proof store.** Preview deployments use the Neon
  database `ghostbook-preview-db` and the Blob store `ghostbook-proofs-preview`, never the
  production ones. Every preview build migrates, seeds and (once) loads the demo history into it;
  log in there as `andres`, `javi`, `lucia` or `pablo` with the preview password Noé gives you.
  All previews share that one database, so two open PRs with different migrations can collide:
  merge one before testing the other.
- **Migrations run on production builds too** (inside `vercel-build`). They must be additive —
  never drop or rename a column the running version uses; the seed must stay idempotent (it
  upserts by slug, keeps ids).
- **mkwrs.com has no API.** The scrapers in `src/lib/wr/` parse its HTML tables; if the site
  changes layout the refresh reports 0 updates. Tests run against saved copies in the test
  fixtures, so a change on the site won't make them fail: check the refresh after deploys.
- **Blob free tier is 1 GB.** Clips are capped at 60 s; Settings shows real usage. If it fills up,
  the plan was to move proof to Cloudflare R2 (10 GB free).
- **One process per PGlite folder.** Stop `npm run dev` before running scripts locally.

## Design rules (please keep them)

The look is the **Timing Tower** direction (`docs/mockups/timing-tower/`): broadcast black,
Archivo in several widths, tabular figures, colour only for data (purple = faster than the WR
split, green = your best, yellow = slower). `docs/research/ai-tells.md` lists what makes a site
look AI-generated — Inter, purple gradients, glass, rounded card grids, emoji icons, "Welcome back",
fade-in animations — and it's the checklist for any new screen. Every UI string goes through
`src/lib/i18n/dict.ts` in English **and** Spanish.

## Decisions already taken

- Mario Kart World first, but everything is generic: games, catalogs and categories are data,
  created from the web by anyone with an account.
- Time Trials keep 150cc and 200cc (and Non-shortcut / Glitch) even where mkwrs has no 200cc WR.
- Everyone has an account (username + password, invite links from Settings). Nothing is public.
- Proof is optional and there is no verification workflow: it's for memory and credibility.
- English UI with a Spanish toggle.

## What's next

Open ideas are GitHub issues labelled `idea`. Nothing there is committed to; pick what's useful
after using the app for a while.
