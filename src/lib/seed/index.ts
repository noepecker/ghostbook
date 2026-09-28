// Idempotent seed: games, catalogs, categories and the mkwrs WR snapshot.
// Everything is insert-if-missing, so re-running never duplicates and never
// overwrites what people changed from the UI. World records are only inserted
// when there is none yet for that board (the daily refresh keeps them fresh).
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DB } from "../db/client";
import { catalogItems, catalogs, games, modes } from "../db/schema";
import { slugify } from "../slug";
import type { FieldDef, ModeTemplate } from "../template";
import { parseMkwrsWorld, MKWRS_WORLD_URL, type MkwrsRow } from "../wr/mkwrs";
import { applyMkwrsRows } from "../wr/apply";

const ROOT = process.cwd();
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

interface ItemSeed {
  name: string;
  nameEs?: string;
  slug?: string;
  meta?: Record<string, unknown>;
}

async function upsertGame(db: DB, g: { slug: string; name: string; shortCode: string; wrSource?: string; sort: number }) {
  await db
    .insert(games)
    .values({ slug: g.slug, name: g.name, shortCode: g.shortCode, wrSource: g.wrSource ?? null, sort: g.sort })
    .onConflictDoNothing();
  const [row] = await db.select().from(games).where(eq(games.slug, g.slug));
  return row;
}

async function upsertCatalog(db: DB, gameId: number, key: string, name: string, nameEs: string, items: ItemSeed[]) {
  await db.insert(catalogs).values({ gameId, key, name, nameEs }).onConflictDoNothing();
  const [cat] = await db
    .select()
    .from(catalogs)
    .where(and(eq(catalogs.gameId, gameId), eq(catalogs.key, key)));
  if (items.length) {
    const rows = items.map((it, i) => ({
      catalogId: cat.id,
      slug: it.slug ?? slugify(it.name),
      name: it.name,
      nameEs: it.nameEs ?? null,
      meta: it.meta ?? null,
      sort: (i + 1) * 10,
    }));
    // dedupe by slug inside the batch
    const seen = new Set<string>();
    const unique = rows.filter((r) => (seen.has(r.slug) ? false : (seen.add(r.slug), true)));
    for (let i = 0; i < unique.length; i += 200) {
      await db.insert(catalogItems).values(unique.slice(i, i + 200)).onConflictDoNothing();
    }
  }
  return cat;
}

async function upsertMode(
  db: DB,
  gameId: number,
  m: { slug: string; name: string; nameEs: string; template: ModeTemplate; sort: number },
) {
  await db
    .insert(modes)
    .values({ gameId, slug: m.slug, name: m.name, nameEs: m.nameEs, template: m.template, sort: m.sort })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(modes)
    .where(and(eq(modes.gameId, gameId), eq(modes.slug, m.slug)));
  return row;
}

// ---------------------------------------------------------------- Mario Kart World

const MKW_EXTRA_CHARACTERS = [
  "Mario", "Luigi", "Peach", "Daisy", "Yoshi", "Toad", "Toadette", "Bowser", "Wario", "Waluigi",
  "Donkey Kong", "Koopa Troopa", "Rosalina", "Baby Mario", "Baby Peach",
];

export function mkwTimeTrial(): ModeTemplate {
  return {
    fields: [
      { key: "track", label: "Track", labelEs: "Circuito", type: "choice", catalog: "track", required: true },
      { key: "cc", label: "Engine class", labelEs: "Cilindrada", type: "choice", catalog: "cc", default: "150cc" },
      { key: "route", label: "Route", labelEs: "Ruta", type: "choice", catalog: "route", default: "non-shortcut" },
      { key: "time", label: "Time", labelEs: "Tiempo", type: "time", precision: "ms", required: true },
      { key: "splits", label: "Splits", labelEs: "Parciales", type: "splits", count: 3, of: "time", autoLast: true, countFrom: "track" },
      { key: "character", label: "Character", labelEs: "Personaje", type: "choice", catalog: "character" },
      { key: "kart", label: "Vehicle", labelEs: "Vehículo", type: "choice", catalog: "kart" },
    ],
    score: "time",
    direction: "lower",
    boardKey: ["track", "cc", "route"],
    display: { home: "tower", title: "{track}" },
  };
}

function mkwLounge(): ModeTemplate {
  return {
    fields: [
      { key: "format", label: "Format", labelEs: "Formato", type: "choice", catalog: "format", default: "12p-ffa" },
      { key: "placement", label: "Placement", labelEs: "Puesto", type: "integer", min: 1, max: 24 },
      { key: "points", label: "Points", labelEs: "Puntos", type: "integer", min: 0, required: true },
      { key: "mmr_after", label: "MMR after", labelEs: "MMR después", type: "integer", min: 0 },
      { key: "players", label: "Team", labelEs: "Equipo", type: "players", min: 1, max: 6 },
    ],
    score: "points",
    direction: "higher",
    boardKey: ["format"],
    display: { home: "sessions", title: "Lounge · {format}", rating: "mmr_after" },
  };
}

function mkwWar(): ModeTemplate {
  return {
    fields: [
      { key: "rival_tag", label: "Rival tag", labelEs: "Tag rival", type: "text", required: true },
      { key: "format", label: "Format", labelEs: "Formato", type: "choice", catalog: "format", default: "6v6" },
      { key: "races", label: "Races", labelEs: "Carreras", type: "integer", min: 1, max: 24, default: 12 },
      { key: "our_points", label: "Our points", labelEs: "Nuestros puntos", type: "integer", min: 0, required: true },
      { key: "their_points", label: "Their points", labelEs: "Sus puntos", type: "integer", min: 0 },
      { key: "players", label: "Players", labelEs: "Jugadores", type: "players", min: 1, max: 6 },
    ],
    score: "our_points",
    direction: "higher",
    boardKey: ["format"],
    display: { home: "sessions", title: "{format} vs {rival_tag}", result: "{our_points}–{their_points}" },
  };
}

async function seedMkw(db: DB, wrRows: MkwrsRow[]) {
  const research = readJson("docs/research/mkworld.json");
  const game = await upsertGame(db, { slug: "mkw", name: "Mario Kart World", shortCode: "MKW", wrSource: "mkwrs-mkworld", sort: 10 });
  const splitsByTrack = new Map(wrRows.filter((r) => r.route === "Non-shortcut").map((r) => [r.track, r.splitsMs.length]));
  const tracks: ItemSeed[] = (research.tracks as { slug: string; name: string; cup: string; verified: boolean }[])
    .filter((t) => t.verified)
    .map((t) => ({
      name: t.name,
      slug: t.slug,
      meta: { cup: t.cup, ...(splitsByTrack.get(t.name) ? { splits: splitsByTrack.get(t.name) } : {}) },
    }));
  await upsertCatalog(db, game.id, "track", "Tracks", "Circuitos", tracks);
  await upsertCatalog(db, game.id, "cc", "Engine classes", "Cilindradas", [
    { name: "150cc", meta: { short: "150" } },
    { name: "200cc", meta: { short: "200" } },
  ]);
  await upsertCatalog(db, game.id, "route", "Routes", "Rutas", [
    { name: "Non-shortcut", nameEs: "Sin atajo", meta: { short: "Non-SC", quiet: true } },
    { name: "Glitch", meta: { short: "Glitch" } },
  ]);
  const chars = [...new Set([...wrRows.map((r) => r.character).filter((x): x is string => !!x), ...MKW_EXTRA_CHARACTERS])].sort();
  await upsertCatalog(db, game.id, "character", "Characters", "Personajes", chars.map((name) => ({ name })));
  const karts = [...new Set([...wrRows.map((r) => r.kart).filter((x): x is string => !!x), "Reel Racer"])].sort();
  await upsertCatalog(db, game.id, "kart", "Vehicles", "Vehículos", karts.map((name) => ({ name })));
  await upsertCatalog(db, game.id, "format", "Formats", "Formatos", [
    { name: "12P FFA", slug: "12p-ffa" },
    { name: "24P FFA", slug: "24p-ffa" },
    { name: "2v2" },
    { name: "3v3" },
    { name: "4v4" },
    { name: "6v6" },
  ]);
  const tt = await upsertMode(db, game.id, { slug: "time-trial", name: "Time Trial", nameEs: "Contrarreloj", template: mkwTimeTrial(), sort: 10 });
  await upsertMode(db, game.id, { slug: "lounge", name: "Lounge", nameEs: "Lounge", template: mkwLounge(), sort: 20 });
  await upsertMode(db, game.id, { slug: "war", name: "War", nameEs: "Guerra", template: mkwWar(), sort: 30 });

  await applyMkwrsRows(db, game.id, tt.id, tt.template, wrRows, new Date("2026-09-28T00:00:00Z"), { onlyMissing: true });
}

// ---------------------------------------------------------------- Mario Kart 8 Deluxe

async function seedMk8dx(db: DB) {
  const research = readJson("docs/research/mk8dx.json");
  const game = await upsertGame(db, { slug: "mk8dx", name: "Mario Kart 8 Deluxe", shortCode: "MK8DX", sort: 40 });
  const tracks: ItemSeed[] = [];
  for (const cup of [...research.base_game_cups, ...research.booster_course_pass_cups]) {
    for (const name of cup.tracks as string[]) tracks.push({ name, meta: { cup: cup.cup } });
  }
  await upsertCatalog(db, game.id, "track", "Tracks", "Circuitos", tracks);
  await upsertCatalog(db, game.id, "cc", "Engine classes", "Cilindradas", [
    { name: "150cc", meta: { short: "150" } },
    { name: "200cc", meta: { short: "200" } },
  ]);
  await upsertCatalog(db, game.id, "character", "Characters", "Personajes", []);
  await upsertCatalog(db, game.id, "kart", "Combos", "Combos", []);
  await upsertMode(db, game.id, {
    slug: "time-trial",
    name: "Time Trial",
    nameEs: "Contrarreloj",
    sort: 10,
    template: {
      fields: [
        { key: "track", label: "Track", labelEs: "Circuito", type: "choice", catalog: "track", required: true },
        { key: "cc", label: "Engine class", labelEs: "Cilindrada", type: "choice", catalog: "cc", default: "150cc" },
        { key: "time", label: "Time", labelEs: "Tiempo", type: "time", precision: "ms", required: true },
        { key: "splits", label: "Splits", labelEs: "Parciales", type: "splits", count: 3, of: "time", autoLast: true },
        { key: "character", label: "Character", labelEs: "Personaje", type: "choice", catalog: "character" },
        { key: "kart", label: "Combo", labelEs: "Combo", type: "choice", catalog: "kart" },
      ],
      score: "time",
      direction: "lower",
      boardKey: ["track", "cc"],
      display: { home: "tower", title: "{track}" },
    },
  });
}

// ---------------------------------------------------------------- Call of Duty Zombies

const ZOMBIES_META: Record<string, { name: string; code: string; sort: number; rulesets: [string, string][] }> = {
  waw: { name: "World at War Zombies", code: "WAW", sort: 28, rulesets: [["Standard", "Estándar"]] },
  bo1: { name: "Black Ops Zombies", code: "BO1", sort: 27, rulesets: [["Standard", "Estándar"], ["Dead Ops Arcade", "Dead Ops Arcade"]] },
  bo2: { name: "Black Ops II Zombies", code: "BO2", sort: 26, rulesets: [["Standard", "Estándar"], ["Grief", "Grief"], ["Turned", "Turned"]] },
  bo3: { name: "Black Ops III Zombies", code: "BO3", sort: 25, rulesets: [["Standard", "Estándar"], ["Nightmares", "Pesadillas"]] },
  bo4: { name: "Black Ops 4 Zombies", code: "BO4", sort: 24, rulesets: [["Standard", "Estándar"], ["Rush", "Rush"]] },
  bocw: { name: "Cold War Zombies", code: "BOCW", sort: 23, rulesets: [["Standard", "Estándar"], ["Outbreak", "Outbreak"], ["Onslaught", "Onslaught"]] },
  vanguard: { name: "Vanguard Zombies", code: "VG", sort: 22, rulesets: [["Standard", "Estándar"]] },
  bo6: { name: "Black Ops 6 Zombies", code: "BO6", sort: 21, rulesets: [["Standard", "Estándar"], ["Directed", "Dirigido"], ["Grief", "Grief"]] },
  bo7: {
    name: "Black Ops 7 Zombies",
    code: "BO7",
    sort: 20,
    rulesets: [
      ["Standard", "Estándar"],
      ["Directed", "Dirigido"],
      ["Survival", "Supervivencia"],
      ["Cursed", "Maldito"],
      ["Cursed Survival", "Supervivencia maldita"],
      ["Dead Ops Arcade 4", "Dead Ops Arcade 4"],
    ],
  },
};

function zombiesPlayers(max: number, withStats: boolean): FieldDef {
  return {
    key: "players",
    label: "Squad",
    labelEs: "Escuadra",
    type: "players",
    min: 1,
    max,
    ...(withStats
      ? {
          stats: [
            { key: "kills", label: "Kills", labelEs: "Bajas" },
            { key: "downs", label: "Downs", labelEs: "Caídas" },
            { key: "revives", label: "Revives", labelEs: "Reanim." },
          ],
        }
      : {}),
  };
}

const MAP: FieldDef = { key: "map", label: "Map", labelEs: "Mapa", type: "choice", catalog: "map", required: true };
const RULESET: FieldDef = { key: "ruleset", label: "Mode", labelEs: "Modo", type: "choice", catalog: "ruleset", default: "standard" };

async function seedZombies(db: DB) {
  const research = readJson("docs/research/cod-zombies.json");
  for (const g of research.games as Record<string, unknown>[]) {
    const slug = g.slug as string;
    const meta = ZOMBIES_META[slug];
    if (!meta) continue;
    const game = await upsertGame(db, { slug, name: meta.name, shortCode: meta.code, sort: meta.sort });
    const maps: ItemSeed[] = [];
    for (const key of ["maps", "maps_standard", "maps_survival"]) {
      for (const m of (g[key] as { name: string; slug?: string; type?: string }[] | undefined) ?? []) {
        maps.push({ name: m.name, slug: m.slug, meta: m.type ? { type: m.type } : undefined });
      }
    }
    const zc = g.zombies_chronicles_dlc as { maps: { name: string; slug: string }[] } | undefined;
    for (const m of zc?.maps ?? []) maps.push({ name: m.name, slug: m.slug, meta: { chronicles: true } });
    await upsertCatalog(db, game.id, "map", "Maps", "Mapas", maps);
    await upsertCatalog(db, game.id, "ruleset", "Modes", "Modos", meta.rulesets.map(([name, nameEs]) => ({ name, nameEs })));
    const maxPlayers = Math.max(...((g.player_counts as number[]) ?? [4]));

    const cats = g.record_categories as { speedruns?: string[] };
    const speedruns = cats.speedruns ?? [];
    const targets = speedruns.map((s) => s.match(/^(\d+) Speedrun/)?.[1]).filter((x): x is string => !!x);
    const ee = speedruns
      .filter((s) => /EE Speedrun/.test(s))
      .map((s) => s.replace(/\s*\(.*\)\s*$/, "").replace(/ Speedrun$/, ""));
    const eeCats = [...new Set(ee)];

    await upsertMode(db, game.id, {
      slug: "high-round",
      name: "High round",
      nameEs: "Ronda máxima",
      sort: 10,
      template: {
        fields: [
          MAP,
          RULESET,
          { key: "round", label: "Round", labelEs: "Ronda", type: "integer", min: 1, max: 9999, required: true },
          zombiesPlayers(maxPlayers, true),
          { key: "duration", label: "Length", labelEs: "Duración", type: "time", precision: "s" },
          { key: "flawless", label: "Flawless (nobody went down)", labelEs: "Sin caídas", type: "boolean" },
          { key: "ended", label: "How it ended", labelEs: "Cómo acabó", type: "text" },
          { key: "quest", label: "Main quest", labelEs: "Misión principal", type: "text" },
        ],
        score: "round",
        direction: "higher",
        boardKey: ["map", "ruleset", "players"],
        display: { home: "sessions", title: "{map}" },
      },
    });
    if (targets.length) {
      await upsertCatalog(db, game.id, "round_target", "Target rounds", "Rondas objetivo",
        targets.map((n) => ({ name: `Round ${n}`, nameEs: `Ronda ${n}`, slug: `round-${n}` })));
      await upsertMode(db, game.id, {
        slug: "round-speedrun",
        name: "Round speedrun",
        nameEs: "Speedrun de ronda",
        sort: 20,
        template: {
          fields: [
            MAP,
            { key: "target", label: "Target round", labelEs: "Ronda objetivo", type: "choice", catalog: "round_target", required: true },
            RULESET,
            { key: "time", label: "Time", labelEs: "Tiempo", type: "time", precision: "s", required: true },
            zombiesPlayers(maxPlayers, false),
          ],
          score: "time",
          direction: "lower",
          boardKey: ["map", "target", "players"],
          display: { home: "sessions", title: "{map} · {target}" },
        },
      });
    }
    const eeFields: FieldDef[] = [MAP];
    if (eeCats.length > 1) {
      await upsertCatalog(db, game.id, "ee_category", "Easter egg categories", "Categorías de misión",
        eeCats.map((n) => ({ name: n, nameEs: n.replace("EE", "Misión") })));
      eeFields.push({ key: "category", label: "Category", labelEs: "Categoría", type: "choice", catalog: "ee_category", default: "ee" });
    }
    eeFields.push(
      { key: "time", label: "Time", labelEs: "Tiempo", type: "time", precision: "s", required: true },
      zombiesPlayers(maxPlayers, false),
    );
    await upsertMode(db, game.id, {
      slug: "ee-speedrun",
      name: "EE speedrun",
      nameEs: "Speedrun de misión",
      sort: 30,
      template: {
        fields: eeFields,
        score: "time",
        direction: "lower",
        boardKey: eeCats.length > 1 ? ["map", "category", "players"] : ["map", "players"],
        display: { home: "sessions", title: "{map} · EE" },
      },
    });
  }
}

export async function seed(db: DB): Promise<void> {
  const html = readFileSync(join(ROOT, "src/lib/wr/__fixtures__/mkworld.html"), "utf8");
  const rows = parseMkwrsWorld(html);
  await seedMkw(db, rows);
  await seedMk8dx(db);
  await seedZombies(db);
}

export { MKWRS_WORLD_URL };
