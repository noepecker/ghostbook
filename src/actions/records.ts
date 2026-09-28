"use server";

import { del, head } from "@vercel/blob";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { canEditRecord } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadWorld } from "@/lib/data";
import { db } from "@/lib/db";
import { catalogItems, catalogs, proofs, recordParticipants, records } from "@/lib/db/schema";
import { writeLast } from "@/lib/lastlog";
import { boardPath } from "@/lib/present";
import { slugify } from "@/lib/slug";
import { BLOB_USAGE_TAG } from "@/lib/storage";
import { boardKeyOf, validateValues, type ValueContext } from "@/lib/template";

export interface NewRecordInput {
  modeId: number;
  values: Record<string, unknown>;
  participants: { userId?: number | null; guestName?: string | null; stats?: Record<string, number | string> }[];
  playedAt: string;
  notes: string;
}

export interface EditRecordInput extends NewRecordInput {
  /** proof rows to drop; their Blob files are deleted too */
  removeProofIds?: number[];
}

export type CreateResult = { ok: true; id: number; href: string } | { ok: false; errors: string[] };

type World = Awaited<ReturnType<typeof loadWorld>>;
interface Part {
  userId: number | null;
  guestName: string | null;
  stats: Record<string, number>;
}

/** Shared by create and edit: clean participants, validate values against the template. */
function prepare(input: NewRecordInput, modeId: number, world: World, soloUser: Part[]) {
  const mode = world.modeById.get(modeId);
  if (!mode) return { ok: false as const, errors: ["Unknown category."] };
  const game = world.gameById.get(mode.gameId)!;
  const tpl = mode.template;
  const ctx: ValueContext = { catalogs: world.catalogItems.get(game.id) ?? {} };
  const playersF = tpl.fields.find((f) => f.type === "players");

  // participants: accounts that exist and guest names, no duplicates
  const seen = new Set<string>();
  let parts: Part[] = (Array.isArray(input.participants) ? input.participants : [])
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
  if (!playersF) parts = soloUser;

  const check = validateValues(tpl, input.values ?? {}, ctx, parts.length);
  const playedAt = new Date(input.playedAt);
  const errors = [...check.errors];
  if (Number.isNaN(playedAt.getTime())) errors.push("When: not a date.");
  else if (playedAt.getTime() > Date.now() + 36 * 3600_000) errors.push("When: that's in the future.");
  if (errors.length) return { ok: false as const, errors };
  return {
    ok: true as const,
    mode,
    game,
    tpl,
    parts,
    hasPlayers: !!playersF,
    values: check.values,
    score: check.score,
    boardKey: boardKeyOf(tpl, check.values, parts.length),
    playedAt,
    notes: String(input.notes ?? "").trim().slice(0, 2000) || null,
  };
}

async function writeParticipants(recordId: number, parts: Part[]) {
  if (!parts.length) return;
  await db.insert(recordParticipants).values(
    parts.map((p, i) => ({ recordId, userId: p.userId, guestName: p.guestName, position: i, stats: Object.keys(p.stats).length ? p.stats : null })),
  );
}

export async function createRecord(input: NewRecordInput): Promise<CreateResult> {
  const me = await requireUser();
  const world = await loadWorld();
  const p = prepare(input, Number(input.modeId), world, [{ userId: me.id, guestName: null, stats: {} }]);
  if (!p.ok) return p;
  const [rec] = await db
    .insert(records)
    .values({
      modeId: p.mode.id,
      values: p.values,
      boardKey: p.boardKey,
      score: p.score,
      playedAt: p.playedAt,
      notes: p.notes,
      createdBy: me.id,
    })
    .returning();
  await writeParticipants(rec.id, p.parts);
  await writeLast(p.mode.id, p.boardKey);
  revalidatePath("/", "layout");
  const href = p.tpl.display?.home === "tower" ? boardPath(p.game, p.mode, p.boardKey, world) : `/r/${rec.id}`;
  return { ok: true, id: rec.id, href };
}

/**
 * Edit a record in place: values, participants, when, notes, and which proofs stay.
 * The category stays the same. PBs and boards are computed from records, so they follow.
 */
export async function updateRecord(recordId: number, input: EditRecordInput): Promise<CreateResult> {
  const me = await requireUser();
  const id = Number(recordId);
  const [rec] = await db.select().from(records).where(eq(records.id, id));
  if (!rec || !(await canEditRecord(id, me))) return { ok: false, errors: ["Not yours to edit."] };
  const world = await loadWorld();
  // without a players field the record keeps its owner, whoever edits it
  const current = await db.select().from(recordParticipants).where(eq(recordParticipants.recordId, id));
  const owners = current
    .sort((a, b) => a.position - b.position)
    .map((x) => ({ userId: x.userId, guestName: x.guestName, stats: (x.stats ?? {}) as Record<string, number> }));
  const p = prepare(input, rec.modeId, world, owners);
  if (!p.ok) return p;

  // proofs first: if Blob refuses, nothing has changed yet
  const drop = [...new Set((input.removeProofIds ?? []).map(Number).filter(Number.isInteger))];
  if (drop.length) {
    const files = await db
      .select()
      .from(proofs)
      .where(and(eq(proofs.recordId, id), inArray(proofs.id, drop)));
    if (files.length) {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          await del(files.map((f) => f.url));
        } catch (e) {
          console.error("blob delete failed", e);
          return { ok: false, errors: [`Proof: the file store didn't delete it (${(e as Error).message}). Nothing was changed.`] };
        }
      }
      await db.delete(proofs).where(inArray(proofs.id, files.map((f) => f.id)));
      revalidateTag(BLOB_USAGE_TAG);
    }
  }

  await db
    .update(records)
    .set({
      values: p.values,
      boardKey: p.boardKey,
      score: p.score,
      playedAt: p.playedAt,
      notes: p.notes,
      updatedAt: new Date(),
      updatedBy: me.id,
    })
    .where(eq(records.id, id));
  if (p.hasPlayers) {
    await db.delete(recordParticipants).where(eq(recordParticipants.recordId, id));
    await writeParticipants(id, p.parts);
  }
  revalidatePath("/", "layout");
  return { ok: true, id, href: `/r/${id}` };
}

export async function deleteRecord(recordId: number): Promise<void> {
  const me = await requireUser();
  if (!(await canEditRecord(Number(recordId), me))) throw new Error("Not yours to delete.");
  const files = await db.select().from(proofs).where(eq(proofs.recordId, recordId));
  if (files.length && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(files.map((f) => f.url));
    } catch (e) {
      console.error("blob delete failed", e);
    }
  }
  await db.delete(records).where(eq(records.id, recordId));
  if (files.length) revalidateTag(BLOB_USAGE_TAG);
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
  if (!(await canEditRecord(recordId, me))) return { ok: false, error: "Not your record." };
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
  revalidateTag(BLOB_USAGE_TAG);
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
