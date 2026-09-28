import { requireUser } from "@/lib/auth";
import { loadWorld, recordsForUser, worldRecordsFor } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { readLast } from "@/lib/lastlog";
import { bestSplits, computePBs, userKey } from "@/lib/pb";
import { splitsFieldKey, splitsOf } from "@/lib/views";
import { LogForm, type BoardRef, type LogCatalog } from "@/components/LogForm";

export const metadata = { title: "Log a time" };

export default async function LogPage({ searchParams }: { searchParams: Promise<{ mode?: string; game?: string; key?: string }> }) {
  const me = await requireUser();
  const { lang } = await getT();
  const world = await loadWorld();
  const sp = await searchParams;
  const last = await readLast();

  let mode = sp.mode ? world.modeById.get(Number(sp.mode)) : undefined;
  let game = mode ? world.gameById.get(mode.gameId) : sp.game ? world.gameBySlug.get(sp.game) : undefined;
  if (!game && last) {
    mode = world.modeById.get(last.modeId);
    game = mode ? world.gameById.get(mode.gameId) : undefined;
  }
  game ??= world.games[0];
  const modes = world.modes.filter((m) => m.gameId === game.id);
  if (!mode || mode.gameId !== game.id) mode = last && modes.find((m) => m.id === last.modeId) ? world.modeById.get(last.modeId) : modes[0];

  const modeIds = modes.map((m) => m.id);
  const [mine, wrList] = await Promise.all([recordsForUser(me.id, modeIds), worldRecordsFor(modeIds)]);

  const pbs: Record<number, Record<string, BoardRef>> = {};
  for (const m of modes) {
    const recs = mine.filter((r) => r.modeId === m.id);
    const sk = splitsFieldKey(m);
    const out: Record<string, BoardRef> = {};
    for (const [bk, owners] of computePBs(recs, m.template.direction)) {
      const pb = owners.get(userKey(me.id));
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

  return (
    <LogForm
      key={`${game.id}-${mode?.id ?? 0}-${sp.key ?? ""}`}
      lang={lang}
      games={world.games.map((g) => ({ slug: g.slug, name: g.name, shortCode: g.shortCode }))}
      gameSlug={game.slug}
      gameShort={game.shortCode}
      modes={modes.map((m) => ({ id: m.id, name: m.name, nameEs: m.nameEs, template: m.template }))}
      catalogs={catalogs}
      users={world.users.map((u) => ({ id: u.id, code: u.code, displayName: u.displayName }))}
      meId={me.id}
      pbs={pbs}
      wrs={wrs}
      recent={recent}
      initialModeId={mode?.id ?? null}
      initialKey={sp.key ?? null}
    />
  );
}
