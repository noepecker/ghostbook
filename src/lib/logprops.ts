import "server-only";
import { recordsForUser, worldRecordsFor, type Game, type World } from "./data";
import type { Lang } from "./i18n/dict";
import { bestSplits, computePBs, userKey } from "./pb";
import { splitsFieldKey, splitsOf } from "./views";
import type { BoardRef, LogCatalog, LogMode, LogUser } from "@/components/LogForm";

export interface LogProps {
  games: { slug: string; name: string; shortCode: string }[];
  gameSlug: string;
  gameShort: string;
  modes: LogMode[];
  catalogs: Record<string, LogCatalog>;
  users: LogUser[];
  pbs: Record<number, Record<string, BoardRef>>;
  wrs: Record<number, Record<string, BoardRef>>;
  recent: Record<string, number[]>;
}

/**
 * What the log form needs for one game: categories, catalogs, people, my PBs and the WRs.
 * `excludeRecordId` leaves the record being edited out of the PBs, so the delta compares
 * against the best of the others rather than against itself.
 */
export async function buildLogProps(world: World, game: Game, meId: number, lang: Lang, excludeRecordId?: number): Promise<LogProps> {
  const modes = world.modes.filter((m) => m.gameId === game.id);
  const modeIds = modes.map((m) => m.id);
  const [all, wrList] = await Promise.all([recordsForUser(meId, modeIds), worldRecordsFor(modeIds)]);
  const mine = excludeRecordId ? all.filter((r) => r.id !== excludeRecordId) : all;

  const pbs: Record<number, Record<string, BoardRef>> = {};
  for (const m of modes) {
    const recs = mine.filter((r) => r.modeId === m.id);
    const sk = splitsFieldKey(m);
    const out: Record<string, BoardRef> = {};
    for (const [bk, owners] of computePBs(recs, m.template.direction)) {
      const pb = owners.get(userKey(meId));
      if (!pb || pb.score === null) continue;
      out[bk] = {
        score: pb.score,
        splits: sk ? bestSplits(recs.filter((r) => r.boardKey === bk).map((r) => splitsOf(r, sk) ?? [])) : null,
      };
    }
    pbs[m.id] = out;
  }
  const wrs: Record<number, Record<string, BoardRef>> = {};
  for (const w of wrList) (wrs[w.modeId] ??= {})[w.boardKey] = { score: w.score, splits: w.splits, holder: w.holder };

  // recently used items per catalog, newest first
  const recent: Record<string, number[]> = {};
  for (const r of mine) {
    const m = world.modeById.get(r.modeId)!;
    for (const f of m.template.fields) {
      if (f.type !== "choice" || !f.catalog) continue;
      const id = Number(r.values[f.key]);
      if (!id) continue;
      const list = (recent[f.catalog] ??= []);
      if (!list.includes(id)) list.push(id);
    }
  }

  const items = world.catalogItems.get(game.id) ?? {};
  const catalogs: Record<string, LogCatalog> = {};
  for (const c of world.catalogs.filter((x) => x.gameId === game.id)) {
    catalogs[c.key] = {
      id: c.id,
      key: c.key,
      name: lang === "es" && c.nameEs ? c.nameEs : c.name,
      nameEs: c.nameEs,
      items: (items[c.key] ?? []).map((i) => ({ id: i.id, slug: i.slug, name: i.name, nameEs: i.nameEs, meta: i.meta ?? null })),
    };
  }

  return {
    games: world.games.map((g) => ({ slug: g.slug, name: g.name, shortCode: g.shortCode })),
    gameSlug: game.slug,
    gameShort: game.shortCode,
    modes: modes.map((m) => ({ id: m.id, name: m.name, nameEs: m.nameEs, template: m.template })),
    catalogs,
    users: world.users.map((u) => ({ id: u.id, code: u.code, displayName: u.displayName })),
    pbs,
    wrs,
    recent,
  };
}
