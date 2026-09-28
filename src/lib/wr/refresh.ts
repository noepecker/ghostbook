import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { appState, games, modes, worldRecords } from "../db/schema";
import { applyMkwrsRows } from "./apply";
import { MKWRS_MK8DX_URL, MKWRS_WORLD_URL, USER_AGENT, parseMkwrsMk8dx, parseMkwrsWorld, type MkwrsRow } from "./mkwrs";

export const RATE_LIMIT_MS = 5 * 60_000;

export interface WrSource {
  url: string;
  label: string;
  modeSlug: string;
  parse: (html: string) => MkwrsRow[];
  /** fewer rows than this means the page changed shape: fail rather than half-update */
  minRows: number;
}

export const SOURCES: Record<string, WrSource> = {
  "mkwrs-mkworld": { url: MKWRS_WORLD_URL, label: "mkwrs.com", modeSlug: "time-trial", parse: parseMkwrsWorld, minRows: 10 },
  "mkwrs-mk8dx": { url: MKWRS_MK8DX_URL, label: "mkwrs.com", modeSlug: "time-trial", parse: parseMkwrsMk8dx, minRows: 48 },
};

export interface RefreshResult {
  game: string;
  source: string;
  updated: number;
  added: string[];
  error?: string;
  tooSoonUntil?: Date;
}

/** When the WRs of a source were last fetched: the refresh log, else the newest stored WR (seed snapshot). */
export async function lastRefresh(db: DB, source: string): Promise<Date | null> {
  const [row] = await db.select().from(appState).where(eq(appState.key, `wr:${source}`));
  if (row) return row.updatedAt;
  const [w] = await db
    .select({ at: sql<string | null>`max(${worldRecords.fetchedAt})` })
    .from(worldRecords)
    .innerJoin(games, eq(games.id, worldRecords.gameId))
    .where(eq(games.wrSource, source));
  return w?.at ? new Date(w.at) : null;
}

/** One polite request per source. `force` skips the 5-minute limit (the daily cron). */
export async function refreshWorldRecords(db: DB, opts: { force?: boolean; gameSlug?: string } = {}): Promise<RefreshResult[]> {
  const list = (await db.select().from(games)).filter((g) => g.wrSource && SOURCES[g.wrSource] && (!opts.gameSlug || g.slug === opts.gameSlug));
  const out: RefreshResult[] = [];
  for (const g of list) {
    const src = SOURCES[g.wrSource!];
    const res: RefreshResult = { game: g.slug, source: src.label, updated: 0, added: [] };
    out.push(res);
    const last = await lastRefresh(db, g.wrSource!);
    if (!opts.force && last && Date.now() - last.getTime() < RATE_LIMIT_MS) {
      res.tooSoonUntil = new Date(last.getTime() + RATE_LIMIT_MS);
      continue;
    }
    // claim the slot first so two quick clicks don't both fetch
    await db
      .insert(appState)
      .values({ key: `wr:${g.wrSource}`, value: { status: "fetching" }, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appState.key, set: { value: { status: "fetching" }, updatedAt: new Date() } });
    const [mode] = await db.select().from(modes).where(and(eq(modes.gameId, g.id), eq(modes.slug, src.modeSlug)));
    if (!mode) {
      res.error = "no Time Trial category";
      continue;
    }
    try {
      const resp = await fetch(src.url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const rows = src.parse(await resp.text());
      if (rows.length < src.minRows) throw new Error(`only ${rows.length} rows, the page layout may have changed`);
      const r = await applyMkwrsRows(db, g.id, mode.id, mode.template, rows, new Date());
      res.updated = r.updated;
      res.added = r.added;
      await db
        .update(appState)
        .set({ value: { status: "ok", rows: rows.length }, updatedAt: new Date() })
        .where(eq(appState.key, `wr:${g.wrSource}`));
    } catch (e) {
      res.error = (e as Error).message;
      await db
        .update(appState)
        .set({ value: { status: "error", error: res.error }, updatedAt: new Date() })
        .where(eq(appState.key, `wr:${g.wrSource}`));
    }
  }
  return out;
}
