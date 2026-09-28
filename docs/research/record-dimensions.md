# Record dimensions — what each entry needs, and what the console UI doesn't give you

## Mario Kart Time Trial (MKWorld / MK8DX)
Fields needed: `game`, `track`, `cc_class` (150cc; 200cc only exists in MK8DX, not MKWorld TT), `time` (mm:ss.mmm), `lap_splits[]`, `character`, `combo` (MK8DX: body+tires+glider; MKWorld: character/costume only — no stat parts), `shortcut_used` (bool, if the community tracks SC vs non-SC for that track), `date`, `platform_patch_version` (physics/track changes between versions make cross-version comparison misleading), `proof` (video/replay file), `player`.

**Console UI gap:** the game saves only **one best ghost per track** — no history of prior attempts, no diff between your PB from six months ago and today's, no way to see "how much have I improved on this track over time." No cross-track aggregate (e.g. "sum of my PBs across a cup") is shown anywhere. No shortcut/no-shortcut split is exposed in-game even though the community tracks it separately. No per-combo record keeping (switching character/kart wipes any sense of "what was my best time with combo X").

## Mario Kart Lounge match (MKCentral, FFA/mogi)
Fields needed: `season`, `format` (12P/24P FFA, 2v2/3v3/4v4, 6v6 war), `table_id`, `date`, `players[]` with `placement`, `score`, `mmr_before`, `mmr_change`, `mmr_after`, `track_pool_used`, `proof` (table screenshot/link).

**Console UI gap:** the Switch itself has **no concept of Lounge at all** — MMR, placement scoring, and match history live entirely on a third-party website (lounge.mkcentral.com), not in-game. There's no in-game record of "which races I won this session" beyond the immediate post-race screen, no season-over-season trend, and no personal log tying a specific Lounge table back to which combo/character was used race-by-race.

## Mario Kart war (6v6 clan war)
Fields needed: `war_id`, `date`, `team_a`, `team_b`, `race_count` (12 standard), `per_race_scores[]`, `running_total_a`, `running_total_b`, `final_score`, `winner` (first to 493 of 984), `roster[]` (who actually raced each leg — subs matter), `proof`.

**Console UI gap:** wars are entirely tracked by hand/bot on Discord — the console has zero concept of a "war," no automatic score tally, and no way to see a war's race-by-race momentum after the fact except a Discord log which typically isn't archived long-term.

## Call of Duty Zombies — high round
Fields needed: `game`, `map`, `mode` (standard/Cursed/Cursed Survival/Directed/Grief/Onslaught/Outbreak), `players` (solo/duo/trio/quad), `round_reached`, `flawless` (bool — no one ever downed), `gobblegums_used[]` (or "none" for purist runs), `augments_used[]`, `starting_conditions` (e.g. no jug, first-room-only, area-only), `duration`, `proof` (video), `date`.

**Console UI gap:** the game shows your **single highest round per map** in a stats menu at best (and not even that on all titles) — no log of every session played, no breakdown by ruleset (a "no jug" run and a normal run overwrite the same stat), no gobblegum/augment loadout history attached to a result, and no way to distinguish a solo record from a squad record after the fact beyond memory.

## Call of Duty Zombies — speedrun / Easter Egg
Fields needed: `game`, `map`, `category` (round-30/50/70/100/200 speedrun, EE speedrun, Build% EE, Super EE), `players`, `time` (time-to-round or time-to-completion), `route_notes`, `gobblegums_used[]`, `starting_round`, `proof` (full VOD required by community rules — partial clips aren't accepted), `date`.

**Console UI gap:** there is **no in-game timer/splits UI** for either round-speedruns or EE-speedruns at all — every speedrunner times themselves externally (LiveSplit, stream timestamp) and the game gives no built-in way to compare a run's splits to a previous PB, let alone publish/verify it. The "main quest complete" trophy/achievement fires once, ever, with no time attached.

## What this app fills, across all of the above
1. **History, not just a single best**: every attempt logged, not overwritten.
2. **Rulesets as first-class fields**: combo/character/shortcut/gobblegum/augment/starting-conditions are often the actual variable that makes two "records" incomparable, and the console UI throws that context away.
3. **Proof attached per entry** (video/screenshot link), since none of these platforms bundle proof with the stat itself.
4. **Cross-time comparison and trends** (PB progression, season-over-season MMR, war momentum) — none of the native UIs plot this.
5. **Group/family context**: a shared log across cousins that no single-player console profile or per-player Lounge account provides on its own.
