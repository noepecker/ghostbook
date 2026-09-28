// Local-only sample history so the pages can be judged with real density.
// Refuses to run against DATABASE_URL. Idempotent: an app_state marker stops a second run.
import "./_env";
import { and, eq } from "drizzle-orm";
import { createDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { appState, catalogItems, catalogs, games, modes, recordParticipants, records, users } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/passwords";
import { seed } from "../src/lib/seed";
import { boardKeyOf, validateValues, type ModeTemplate } from "../src/lib/template";

const MARK = "demo-history";

async function main() {
  if (process.env.DATABASE_URL) throw new Error("db:demo is for the local PGlite database only.");
  const db = createDb();
  await runMigrations(db);
  await seed(db);
  if ((await db.select().from(appState).where(eq(appState.key, MARK))).length) {
    console.log("demo: already there");
    return;
  }
  const pw = await hashPassword(process.env.DEMO_PASSWORD ?? "ghostbook-demo");
  const people: [string, string, string][] = [
    ["andres", "AND", "Andrés"],
    ["javi", "JAV", "Javi"],
    ["lucia", "LUC", "Lucía"],
    ["pablo", "PAB", "Pablo"],
  ];
  const uid: Record<string, number> = {};
  for (const [username, code, displayName] of people) {
    await db.insert(users).values({ username, code, displayName, passwordHash: pw, isAdmin: username === "andres" }).onConflictDoNothing();
    const [u] = await db.select().from(users).where(eq(users.username, username));
    uid[code] = u.id;
  }

  const ctxCache = new Map<number, Record<string, { id: number; slug: string; name: string; meta: Record<string, unknown> | null }[]>>();
  async function ctxFor(gameId: number) {
    if (!ctxCache.has(gameId)) {
      const cats = await db.select().from(catalogs).where(eq(catalogs.gameId, gameId));
      const out: Record<string, { id: number; slug: string; name: string; meta: Record<string, unknown> | null }[]> = {};
      for (const c of cats) out[c.key] = (await db.select().from(catalogItems).where(eq(catalogItems.catalogId, c.id))).map((i) => ({ ...i, meta: i.meta ?? null }));
      ctxCache.set(gameId, out);
    }
    return { catalogs: ctxCache.get(gameId)! };
  }

  async function add(
    gameSlug: string,
    modeSlug: string,
    at: string,
    raw: Record<string, unknown>,
    who: (string | { guest: string; stats?: Record<string, number> } | { code: string; stats: Record<string, number> })[],
    notes = "",
    by = "AND",
  ) {
    const [g] = await db.select().from(games).where(eq(games.slug, gameSlug));
    const [m] = await db.select().from(modes).where(and(eq(modes.gameId, g.id), eq(modes.slug, modeSlug)));
    const ctx = await ctxFor(g.id);
    const tpl = m.template as ModeTemplate;
    // choice values given as slugs
    const check = validateValues(tpl, raw, ctx, who.length);
    if (!check.ok) throw new Error(`${gameSlug}/${modeSlug} ${at}: ${check.errors.join(" ")}`);
    const [rec] = await db
      .insert(records)
      .values({
        modeId: m.id,
        values: check.values,
        boardKey: boardKeyOf(tpl, check.values, who.length),
        score: check.score,
        playedAt: new Date(at),
        notes: notes || null,
        createdBy: uid[by],
      })
      .returning();
    await db.insert(recordParticipants).values(
      who.map((w, i) =>
        typeof w === "string"
          ? { recordId: rec.id, userId: uid[w], position: i }
          : "guest" in w
            ? { recordId: rec.id, guestName: w.guest, stats: w.stats ?? null, position: i }
            : { recordId: rec.id, userId: uid[w.code], stats: w.stats, position: i },
      ),
    );
  }

  const tt = (track: string, cc: string, time: string, splits: string[] | null, at: string, who = "AND", character = "bowser", kart = "reel-racer") =>
    add("mkw", "time-trial", at, { track, cc, route: "non-shortcut", time, splits: splits ?? [], character, kart }, [who], "", who);

  // Crown City 150cc: fifteen months of PBs
  const cc = [
    ["2025-07-02T20:10:00+02:00", "2:11.480", null],
    ["2025-07-19T21:30:00+02:00", "2:09.902", null],
    ["2025-08-30T18:02:00+02:00", "2:08.615", null],
    ["2025-11-14T22:12:00+01:00", "2:07.740", null],
    ["2026-01-06T12:40:00+01:00", "2:07.212", ["53.790", "43.690", "29.732"]],
    ["2026-03-22T19:20:00+01:00", "2:06.803", ["53.640", "43.480", "29.683"]],
    ["2026-06-01T21:05:00+02:00", "2:06.284", ["53.310", "43.570", "29.404"]],
    ["2026-09-20T22:40:00+02:00", "2:06.400", ["53.900", "43.296", "29.204"]],
    ["2026-09-27T21:14:00+02:00", "2:05.917", ["53.402", "43.118", "29.397"]],
  ] as const;
  for (const [at, time, splits] of cc) await tt("crown-city", "150cc", time, splits ? [...splits] : null, at);
  await tt("crown-city", "200cc", "1:48.955", ["45.502", "37.410", "26.043"], "2026-09-02T20:00:00+02:00");
  await tt("crown-city", "200cc", "1:47.915", ["45.102", "37.011", "25.802"], "2026-09-14T20:30:00+02:00");
  await tt("dk-spaceport", "150cc", "1:29.816", ["24.450", "14.402", "12.640", "12.611", "12.346", "13.367"], "2026-09-08T21:00:00+02:00");
  await tt("dk-spaceport", "150cc", "1:29.604", ["24.401", "14.366", "12.598", "12.580", "12.301", "13.358"], "2026-09-21T22:10:00+02:00");
  await tt("rainbow-road", "150cc", "3:57.279", ["58.790", "49.300", "53.700", "75.489"], "2026-08-15T20:00:00+02:00");
  await tt("rainbow-road", "150cc", "3:56.771", ["58.612", "49.105", "53.640", "75.414"], "2026-09-06T19:45:00+02:00");
  await tt("peach-stadium", "150cc", "2:15.296", null, "2026-08-12T20:00:00+02:00");
  await tt("peach-stadium", "150cc", "2:15.206", null, "2026-08-30T20:00:00+02:00");
  await tt("sky-high-sundae", "150cc", "1:55.045", null, "2026-07-30T20:00:00+02:00");
  await tt("sky-high-sundae", "150cc", "1:54.390", null, "2026-08-17T20:00:00+02:00");
  // cousins on the same boards
  await tt("crown-city", "150cc", "2:06.912", ["53.600", "43.502", "29.810"], "2026-09-18T19:00:00+02:00", "JAV", "wiggler", "big-horn");
  await tt("crown-city", "150cc", "2:07.455", null, "2026-09-10T19:00:00+02:00", "LUC", "peach", "baby-blooper");
  await tt("dk-spaceport", "150cc", "1:30.201", null, "2026-09-19T19:00:00+02:00", "PAB", "wario-work-crew", "b-dasher");

  // Lounge: MMR climbing through September
  const lounge = [
    ["2026-08-28T22:00:00+02:00", "12p-ffa", 5, 71, 10928],
    ["2026-09-05T22:30:00+02:00", "12p-ffa", 3, 88, 11012],
    ["2026-09-18T23:00:00+02:00", "12p-ffa", 4, 79, 11156],
    ["2026-09-25T22:15:00+02:00", "2v2", 2, 91, 11240],
  ] as const;
  for (const [at, format, placement, points, mmr] of lounge) {
    await add("mkw", "lounge", at, { format, placement: String(placement), points: String(points), mmr_after: String(mmr) }, format === "2v2" ? ["AND", "JAV"] : ["AND"]);
  }
  await add(
    "mkw",
    "war",
    "2026-09-23T21:30:00+02:00",
    { rival_tag: "KNK", format: "6v6", races: "12", our_points: "512", their_points: "472" },
    ["AND", "JAV", { guest: "Rafa" }, { guest: "Iker" }, { guest: "Dani" }, { guest: "Sergio" }],
    "Won it on the last two races.",
  );

  // BO7 Zombies with the cousins
  await add(
    "bo7",
    "high-round",
    "2026-09-12T23:10:00+02:00",
    { map: "rex-infernus", ruleset: "standard", round: "31", duration: "2:02:40", ended: "Downed together at the arena" },
    [
      { code: "AND", stats: { kills: 1020, downs: 3, revives: 4 } },
      { code: "PAB", stats: { kills: 870, downs: 5, revives: 6 } },
      { code: "LUC", stats: { kills: 1104, downs: 2, revives: 5 } },
    ],
    "",
    "PAB",
  );
  await add("bo7", "high-round", "2026-01-03T22:00:00+01:00", { map: "ashes-of-the-damned", ruleset: "standard", round: "41", duration: "3:05:12" }, ["AND", "JAV", "PAB"]);
  await add("bo7", "high-round", "2026-03-14T21:00:00+01:00", { map: "astra-malorum", ruleset: "standard", round: "28" }, ["AND", "JAV", "LUC"], "", "JAV");
  await add("bo7", "ee-speedrun", "2026-09-19T20:30:00+02:00", { map: "ashes-of-the-damned", time: "1:12:47" }, ["AND", "JAV", "PAB"], "Cursed rules on, first clean run.");
  await add("bo6", "high-round", "2025-12-20T22:00:00+01:00", { map: "terminus", ruleset: "standard", round: "52" }, ["AND", "JAV", "PAB", "LUC"]);
  await db.insert(appState).values({ key: MARK, value: { at: new Date().toISOString() } });
  console.log("demo: users andres/javi/lucia/pablo, password from DEMO_PASSWORD or 'ghostbook-demo'; history added");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
