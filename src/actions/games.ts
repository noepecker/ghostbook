"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { catalogItems, catalogs, games, modes, records, recordParticipants } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";
import { boardKeyOf, validateTemplate, type ModeTemplate } from "@/lib/template";

export interface EditState {
  error?: string;
  errors?: string[];
  ok?: string;
}

const RESERVED = new Set(["edit", "new", "api"]);

export async function createGame(_: EditState, form: FormData): Promise<EditState> {
  const me = await requireUser();
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const shortCode = String(form.get("short") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const slug = slugify(name);
  if (!name || !slug || shortCode.length < 2) return { error: "games.shortHint" };
  const clash = await db.select({ id: games.id }).from(games).where(eq(games.slug, slug));
  if (clash.length) return { error: "games.exists" };
  await db.insert(games).values({ name, slug, shortCode, createdBy: me.id, sort: 200 });
  revalidatePath("/", "layout");
  redirect(`/g/${slug}/edit`);
}

export async function updateGame(_: EditState, form: FormData): Promise<EditState> {
  await requireUser();
  const id = Number(form.get("id"));
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const shortCode = String(form.get("short") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (!name || shortCode.length < 2) return { error: "games.shortHint" };
  await db.update(games).set({ name, shortCode }).where(eq(games.id, id));
  revalidatePath("/", "layout");
  return { ok: "editor.saved" };
}

export async function createCatalog(_: EditState, form: FormData): Promise<EditState> {
  const me = await requireUser();
  const gameId = Number(form.get("gameId"));
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const key = slugify(String(form.get("key") ?? "") || name).replace(/-/g, "_").slice(0, 32);
  if (!name || !/^[a-z][a-z0-9_]*$/.test(key)) return { errors: ["Catalog needs a name; the key must start with a letter."] };
  await db.insert(catalogs).values({ gameId, key, name, createdBy: me.id }).onConflictDoNothing();
  revalidatePath("/", "layout");
  return { ok: "editor.saved" };
}

export async function addItemForm(_: EditState, form: FormData): Promise<EditState> {
  const me = await requireUser();
  const catalogId = Number(form.get("catalogId"));
  const lines = String(form.get("name") ?? "")
    .split(/\n|;/)
    .map((s) => s.replace(/\s+/g, " ").trim().slice(0, 60))
    .filter(Boolean);
  if (!lines.length) return { errors: ["Give it a name."] };
  const [cat] = await db.select().from(catalogs).where(eq(catalogs.id, catalogId));
  if (!cat) return { errors: ["Unknown catalog."] };
  for (const name of lines) {
    const slug = slugify(name);
    if (!slug) continue;
    await db.insert(catalogItems).values({ catalogId, slug, name, createdBy: me.id, sort: 9000 }).onConflictDoNothing();
  }
  revalidatePath("/", "layout");
  return { ok: "editor.saved" };
}

/** Create or update a category. Records are re-keyed when the board key changes. */
export async function saveMode(input: {
  gameId: number;
  modeId: number | null;
  name: string;
  nameEs?: string | null;
  template: ModeTemplate;
}): Promise<{ ok: true; recomputed: number; slug: string } | { ok: false; errors: string[] }> {
  const me = await requireUser();
  const [game] = await db.select().from(games).where(eq(games.id, Number(input.gameId)));
  if (!game) return { ok: false, errors: ["Unknown game."] };
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return { ok: false, errors: ["The category needs a name."] };
  const cats = await db.select().from(catalogs).where(eq(catalogs.gameId, game.id));
  const check = validateTemplate(input.template, cats.map((c) => c.key));
  if (!check.ok) return { ok: false, errors: check.errors };
  const tpl = input.template;
  if (input.modeId) {
    const [m] = await db.select().from(modes).where(and(eq(modes.id, Number(input.modeId)), eq(modes.gameId, game.id)));
    if (!m) return { ok: false, errors: ["Unknown category."] };
    await db.update(modes).set({ name, nameEs: input.nameEs || null, template: tpl }).where(eq(modes.id, m.id));
    // re-key existing records
    const recs = await db.select().from(records).where(eq(records.modeId, m.id));
    let n = 0;
    for (const r of recs) {
      const count = (await db.select({ id: recordParticipants.id }).from(recordParticipants).where(eq(recordParticipants.recordId, r.id))).length;
      const values = r.values as Record<string, unknown>;
      const boardKey = boardKeyOf(tpl, values, count);
      const sv = values[tpl.score];
      const score = typeof sv === "number" ? sv : null;
      if (boardKey !== r.boardKey || score !== r.score) {
        await db.update(records).set({ boardKey, score }).where(eq(records.id, r.id));
        n++;
      }
    }
    revalidatePath("/", "layout");
    return { ok: true, recomputed: n, slug: m.slug };
  }
  let slug = slugify(name) || "category";
  if (RESERVED.has(slug)) slug = `${slug}-mode`;
  const clash = await db.select({ id: modes.id }).from(modes).where(and(eq(modes.gameId, game.id), eq(modes.slug, slug)));
  if (clash.length) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  await db.insert(modes).values({ gameId: game.id, name, nameEs: input.nameEs || null, slug, template: tpl, createdBy: me.id, sort: 500 });
  revalidatePath("/", "layout");
  return { ok: true, recomputed: 0, slug };
}
