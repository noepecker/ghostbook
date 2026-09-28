import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { catalogItems, catalogs, worldRecords } from "../db/schema";
import { slugify } from "../slug";
import { boardKeyOf, type ModeTemplate } from "../template";
import type { MkwrsRow } from "./mkwrs";

/**
 * Shared by the seed and the daily refresh: map mkwrs rows onto the Time Trial boards.
 * The board key is track + cc (+ route when the template has one). Boards with no row keep
 * whatever they had, so a class without a WR on the site simply stays empty.
 */
export async function applyMkwrsRows(
  db: DB,
  gameId: number,
  modeId: number,
  template: ModeTemplate,
  rows: MkwrsRow[],
  fetchedAt: Date,
  opts: { onlyMissing?: boolean } = {},
): Promise<{ updated: number; added: string[] }> {
  const cats = await db.select().from(catalogs).where(eq(catalogs.gameId, gameId));
  const catId = (key: string) => cats.find((c) => c.key === key)?.id;
  const trackCat = catId("track");
  const ccCat = catId("cc");
  const usesRoute = template.boardKey.includes("route");
  const routeCat = usesRoute ? catId("route") : undefined;
  if (!trackCat || !ccCat || (usesRoute && !routeCat)) throw new Error("The track, engine class or route catalog is missing; run the seed.");
  const items = await db.select().from(catalogItems);
  const find = (cat: number, name: string) =>
    items.find((i) => i.catalogId === cat && (i.name.toLowerCase() === name.toLowerCase() || i.slug === slugify(name)));
  const added: string[] = [];
  let updated = 0;
  for (const row of rows) {
    let track = find(trackCat, row.track);
    if (!track) {
      // a new track appeared on mkwrs (DLC): add it so it can be logged
      const [ins] = await db
        .insert(catalogItems)
        .values({ catalogId: trackCat, slug: slugify(row.track), name: row.track, meta: { splits: row.splitsMs.length || undefined }, sort: 5000 })
        .onConflictDoNothing()
        .returning();
      if (!ins) continue;
      track = ins;
      items.push(ins);
      added.push(row.track);
    } else if (row.route !== "Glitch" && row.splitsMs.length && !track.meta?.splits) {
      await db
        .update(catalogItems)
        .set({ meta: { ...(track.meta ?? {}), splits: row.splitsMs.length } })
        .where(eq(catalogItems.id, track.id));
    }
    const cc = find(ccCat, row.cc);
    if (!cc) continue;
    const route = usesRoute && routeCat && row.route ? find(routeCat, row.route) : undefined;
    if (usesRoute && !route) continue;
    for (const [key, name] of [["character", row.character], ["kart", row.kart]] as const) {
      const cid = catId(key);
      if (cid && name && !find(cid, name)) {
        const [ins] = await db.insert(catalogItems).values({ catalogId: cid, slug: slugify(name), name, sort: 5000 }).onConflictDoNothing().returning();
        if (ins) items.push(ins);
      }
    }
    const boardKey = boardKeyOf(template, { track: track.id, cc: cc.id, ...(route ? { route: route.id } : {}) }, 1);
    const values = {
      gameId,
      modeId,
      boardKey,
      score: row.timeMs,
      holder: row.holder,
      holderCountry: row.country,
      playedOn: row.date,
      character: row.character,
      kart: row.kart,
      splits: row.splitsMs.length ? row.splitsMs : null,
      sourceUrl: row.sourceUrl,
      videoUrl: row.videoUrl,
      fetchedAt,
    };
    if (opts.onlyMissing) {
      const res = await db.insert(worldRecords).values(values).onConflictDoNothing().returning({ id: worldRecords.id });
      updated += res.length;
    } else {
      await db
        .insert(worldRecords)
        .values(values)
        .onConflictDoUpdate({ target: [worldRecords.modeId, worldRecords.boardKey], set: values });
      updated++;
    }
  }
  return { updated, added };
}
