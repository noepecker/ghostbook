"use server";

import { del, head } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadWorld } from "@/lib/data";
import { db } from "@/lib/db";
import { catalogItems, catalogs, proofs, recordParticipants, records } from "@/lib/db/schema";
import { writeLast } from "@/lib/lastlog";
import { boardPath } from "@/lib/present";
import { slugify } from "@/lib/slug";
import { boardKeyOf, validateValues, type ValueContext } from "@/lib/template";

export interface NewRecordInput {
  modeId: number;
  values: Record<string, unknown>;
  participants: { userId?: number | null; guestName?: string | null; stats?: Record<string, number | string> }[];
  playedAt: string;
  notes: string;
}

export type CreateResult = { ok: true; id: number; href: string } | { ok: false; errors: string[] };

export async function createRecord(input: NewRecordInput): Promise<CreateResult> {
  const me = await requireUser();
  const world = await loadWorld();
  const mode = world.modeById.get(Number(input.modeId));
  if (!mode) return { ok: false, errors: ["Unknown category."] };
  const game = world.gameById.get(mode.gameId)!;
  const tpl = mode.template;
  const ctx: ValueContext = { catalogs: world.catalogItems.get(game.id) ?? {} };
  const playersF = tpl.fields.find((f) => f.type === "players");

  // participants: accounts that exist and guest names, no duplicates
  const seen = new Set<string>();
  let parts = (Array.isArray(input.participants) ? input.participants : [])
    .map((p) => {
      const userId = p.userId && world.userById.has(Number(p.userId)) ? Number(p.userId) : null;
      const guestName = userId ? null : String(p.guestName ?? "").trim().slice(0, 40) || null;
      const stats: Record<string, number> = {};
      for (const s of playersF?.stats ?? []) {
        const v = p.stats?.[s.key];
        const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\s/g, ""));
        if (v !== undefined && v !== "" && Number.isFinite(n) && n >= 0) stats[s.key] = Math.round(n);
      }
      return { userId, guestName, stats };
    })
    .filter((p) => {
      const k = p.userId ? `u${p.userId}` : `g${p.guestName?.toLowerCase()}`;
      if ((!p.userId && !p.guestName) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  if (!playersF) parts = [{ userId: me.id, guestName: null, stats: {} }];

  const check = validateValues(tpl, input.values ?? {}, ctx, parts.length);
  const playedAt = new Date(input.playedAt);
  const errors = [...check.errors];
  if (Number.isNaN(playedAt.getTime())) errors.push("When: not a date.");
  else if (playedAt.getTime() > Date.now() + 36 * 3600_000) errors.push("When: that's in the future.");
  if (errors.length) return { ok: false, errors };

  const boardKey = boardKeyOf(tpl, check.values, parts.length);
  const [rec] = await db
    .insert(records)
    .values({
      modeId: mode.id,
      values: check.values,
      boardKey,
      score: check.score,
      playedAt,
      notes: String(input.notes ?? "").trim().slice(0, 2000) || null,
      createdBy: me.id,
    })
    .returning();
  if (parts.length) {
    await db.insert(recordParticipants).values(
      parts.map((p, i) => ({ recordId: rec.id, userId: p.userId, guestName: p.guestName, position: i, stats: Object.keys(p.stats).length ? p.stats : null })),
    );
  }
  await writeLast(mode.id, boardKey);
  revalidatePath("/", "layout");
  const href = tpl.display?.home === "tower" ? boardPath(game, mode, boardKey, world) : `/r/${rec.id}`;
  return { ok: true, id: rec.id, href };
}

async function canTouch(recordId: number, userId: number): Promise<boolean> {
  const [rec] = await db.select().from(records).where(eq(records.id, recordId));
  if (!rec) return false;
  if (rec.createdBy === userId) return true;
  const p = await db
    .select()
    .from(recordParticipants)
    .where(and(eq(recordParticipants.recordId, recordId), eq(recordParticipants.userId, userId)));
  return p.length > 0;
}

export async function deleteRecord(recordId: number): Promise<void> {
  const me = await requireUser();
  if (!(await canTouch(recordId, me.id))) throw new Error("Not yours to delete.");
  const files = await db.select().from(proofs).where(eq(proofs.recordId, recordId));
  if (files.length && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(files.map((f) => f.url));
    } catch (e) {
      console.error("blob delete failed", e);
    }
  }
  await db.delete(records).where(eq(records.id, recordId));
  revalidatePath("/", "layout");
  redirect("/");
}

export interface AttachInput {
  recordId: number;
  url: string;
  pathname: string;
  durationMs?: number | null;
}

/** Called by the browser after upload() finishes. Size and type come from Blob, not the client. */
export async function attachProof(input: AttachInput): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  const recordId = Number(input.recordId);
  if (!(await canTouch(recordId, me.id))) return { ok: false, error: "Not your record." };
  if (!String(input.pathname).startsWith(`proofs/${recordId}/`)) return { ok: false, error: "Wrong path." };
  const meta = await head(input.url);
  if (meta.pathname !== input.pathname) return { ok: false, error: "Wrong file." };
  const type = meta.contentType ?? "";
  const kind = type.startsWith("video/") ? "video" : type.startsWith("image/") ? "image" : null;
  if (!kind) {
    await del(meta.url);
    return { ok: false, error: "Only images and videos." };
  }
  const existing = await db.select({ id: proofs.id }).from(proofs).where(eq(proofs.pathname, meta.pathname));
  if (existing.length) return { ok: true };
  const duration = Number(input.durationMs);
  await db.insert(proofs).values({
    recordId,
    pathname: meta.pathname,
    url: meta.url,
    kind,
    contentType: type,
    size: meta.size,
    durationMs: kind === "video" && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    createdBy: me.id,
  });
  revalidatePath(`/r/${recordId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

export interface NewItem {
  id: number;
  slug: string;
  name: string;
  nameEs: string | null;
  meta: Record<string, unknown> | null;
}

export async function addCatalogItem(catalogId: number, rawName: string): Promise<{ ok: true; item: NewItem } | { ok: false; error: string }> {
  const me = await requireUser();
  const name = String(rawName ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const slug = slugify(name);
  if (!name || !slug) return { ok: false, error: "Give it a name." };
  const [cat] = await db.select().from(catalogs).where(eq(catalogs.id, Number(catalogId)));
  if (!cat) return { ok: false, error: "Unknown catalog." };
  await db.insert(catalogItems).values({ catalogId: cat.id, slug, name, sort: 9000, createdBy: me.id }).onConflictDoNothing();
  const [item] = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.catalogId, cat.id), eq(catalogItems.slug, slug)));
  revalidatePath("/", "layout");
  return { ok: true, item: { id: item.id, slug: item.slug, name: item.name, nameEs: item.nameEs, meta: item.meta ?? null } };
}

export async function proofUsage(): Promise<{ bytes: number; files: number }> {
  await requireUser();
  const rows = await db.select({ size: proofs.size }).from(proofs);
  return { bytes: rows.reduce((a, r) => a + Number(r.size), 0), files: rows.length };
}

