import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "./db";
import {
  catalogItems,
  catalogs,
  games,
  modes,
  proofs,
  recordParticipants,
  records,
  users,
  worldRecords,
} from "./db/schema";

export type Game = typeof games.$inferSelect;
export type Mode = typeof modes.$inferSelect;
export type Catalog = typeof catalogs.$inferSelect;
export type Item = typeof catalogItems.$inferSelect;
export type User = typeof users.$inferSelect;
export type Proof = typeof proofs.$inferSelect;
export type WorldRecord = typeof worldRecords.$inferSelect;
export type ParticipantRow = typeof recordParticipants.$inferSelect;

export interface RecordFull {
  id: number;
  modeId: number;
  values: Record<string, unknown>;
  boardKey: string;
  score: number | null;
  playedAt: Date;
  notes: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date | null;
  updatedBy: number | null;
  participants: ParticipantRow[];
  proofs: Proof[];
}

/** Everything small enough to load whole: games, categories, catalogs, items, people. */
export interface World {
  games: Game[];
  modes: Mode[];
  catalogs: Catalog[];
  items: Item[];
  users: User[];
  gameById: Map<number, Game>;
  gameBySlug: Map<string, Game>;
  modeById: Map<number, Mode>;
  itemById: Map<number, Item>;
  userById: Map<number, User>;
  /** gameId → catalog key → items (sorted) */
  catalogItems: Map<number, Record<string, Item[]>>;
  catalogByGameKey: Map<string, Catalog>;
}

export const loadWorld = cache(async (): Promise<World> => {
  const [g, m, c, i, u] = await Promise.all([
    db.select().from(games).orderBy(asc(games.sort), asc(games.name)),
    db.select().from(modes).orderBy(asc(modes.sort), asc(modes.id)),
    db.select().from(catalogs).orderBy(asc(catalogs.id)),
    db.select().from(catalogItems).orderBy(asc(catalogItems.sort), asc(catalogItems.name)),
    db.select().from(users).orderBy(asc(users.displayName)),
  ]);
  const catById = new Map(c.map((x) => [x.id, x]));
  const byGame = new Map<number, Record<string, Item[]>>();
  for (const cat of c) {
    const rec = byGame.get(cat.gameId) ?? {};
    rec[cat.key] = [];
    byGame.set(cat.gameId, rec);
  }
  for (const it of i) {
    const cat = catById.get(it.catalogId);
    if (!cat) continue;
    byGame.get(cat.gameId)![cat.key].push(it);
  }
  return {
    games: g,
    modes: m,
    catalogs: c,
    items: i,
    users: u,
    gameById: new Map(g.map((x) => [x.id, x])),
    gameBySlug: new Map(g.map((x) => [x.slug, x])),
    modeById: new Map(m.map((x) => [x.id, x])),
    itemById: new Map(i.map((x) => [x.id, x])),
    userById: new Map(u.map((x) => [x.id, x])),
    catalogItems: byGame,
    catalogByGameKey: new Map(c.map((x) => [`${x.gameId}:${x.key}`, x])),
  };
});

async function hydrate(rows: (typeof records.$inferSelect)[]): Promise<RecordFull[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [parts, prf] = await Promise.all([
    db.select().from(recordParticipants).where(inArray(recordParticipants.recordId, ids)).orderBy(asc(recordParticipants.position)),
    db.select().from(proofs).where(inArray(proofs.recordId, ids)).orderBy(asc(proofs.id)),
  ]);
  return rows.map((r) => ({
    ...r,
    values: r.values as Record<string, unknown>,
    participants: parts.filter((p) => p.recordId === r.id),
    proofs: prf.filter((p) => p.recordId === r.id),
  }));
}

export async function recordsForModes(modeIds: number[]): Promise<RecordFull[]> {
  if (modeIds.length === 0) return [];
  const rows = await db.select().from(records).where(inArray(records.modeId, modeIds)).orderBy(asc(records.playedAt));
  return hydrate(rows);
}

export async function recordsForBoard(modeId: number, boardKey: string): Promise<RecordFull[]> {
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.modeId, modeId), eq(records.boardKey, boardKey)))
    .orderBy(asc(records.playedAt));
  return hydrate(rows);
}

/** Records a user took part in, newest first. */
export async function recordsForUser(userId: number, modeIds?: number[], limit?: number): Promise<RecordFull[]> {
  const sub = db.select({ id: recordParticipants.recordId }).from(recordParticipants).where(eq(recordParticipants.userId, userId));
  const where = modeIds && modeIds.length ? and(inArray(records.id, sub), inArray(records.modeId, modeIds)) : inArray(records.id, sub);
  const q = db.select().from(records).where(where).orderBy(desc(records.playedAt), desc(records.id));
  const rows = limit ? await q.limit(limit) : await q;
  return hydrate(rows);
}

export async function recordById(id: number): Promise<RecordFull | null> {
  const rows = await db.select().from(records).where(eq(records.id, id));
  return (await hydrate(rows))[0] ?? null;
}

export async function worldRecordsFor(modeIds: number[]): Promise<WorldRecord[]> {
  if (modeIds.length === 0) return [];
  return db.select().from(worldRecords).where(inArray(worldRecords.modeId, modeIds));
}

export async function recordCounts(): Promise<{ userId: number; n: number; latest: Date | null }[]> {
  const rows = await db
    .select({
      userId: recordParticipants.userId,
      n: sql<number>`count(*)::int`,
      latest: sql<string | null>`max(${records.playedAt})`,
    })
    .from(recordParticipants)
    .innerJoin(records, eq(records.id, recordParticipants.recordId))
    .groupBy(recordParticipants.userId);
  return rows
    .filter((r) => r.userId !== null)
    .map((r) => ({ userId: r.userId as number, n: Number(r.n), latest: r.latest ? new Date(r.latest) : null }));
}

export async function modeRecordCounts(): Promise<Map<number, number>> {
  const rows = await db
    .select({ modeId: records.modeId, n: sql<number>`count(*)::int` })
    .from(records)
    .groupBy(records.modeId);
  return new Map(rows.map((r) => [r.modeId, Number(r.n)]));
}
