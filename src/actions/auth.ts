"use server";

import { and, eq, gt, isNull, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { invites, users } from "@/lib/db/schema";
import { LANG_COOKIE } from "@/lib/i18n/server";
import { dummyHash, hashPassword, normaliseCode, normaliseUsername, verifyPassword } from "@/lib/passwords";
import { randomBytes } from "node:crypto";

export interface FormState {
  error?: string;
  ok?: string;
}

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const username = normaliseUsername(String(form.get("username") ?? ""));
  const password = String(form.get("password") ?? "");
  const [u] = username ? await db.select().from(users).where(eq(users.username, username)) : [];
  // compare against a dummy hash when the user doesn't exist, so timing doesn't leak usernames
  const ok = await verifyPassword(password, u?.passwordHash ?? dummyHash());
  if (!u || !ok) return { error: "login.bad" };
  await createSession(u.id);
  redirect(safeNext(form.get("next")));
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const [inv] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.usedBy), gt(invites.expiresAt, new Date())));
  if (!inv) return { error: "register.bad" };
  const username = normaliseUsername(String(form.get("username") ?? ""));
  const code = normaliseCode(String(form.get("code") ?? ""));
  const displayName = String(form.get("displayName") ?? "").trim().slice(0, 40);
  const password = String(form.get("password") ?? "");
  if (!username || !code || !displayName || password.length < 8) return { error: "register.invalid" };
  const clash = await db.select({ id: users.id }).from(users).where(or(eq(users.username, username), eq(users.code, code)));
  if (clash.length) return { error: "register.taken" };
  const [u] = await db
    .insert(users)
    .values({ username, code, displayName, passwordHash: await hashPassword(password) })
    .returning();
  // single-use: only mark it if nobody got there first
  const used = await db
    .update(invites)
    .set({ usedBy: u.id, usedAt: new Date() })
    .where(and(eq(invites.id, inv.id), isNull(invites.usedBy)))
    .returning();
  if (!used.length) {
    await db.delete(users).where(eq(users.id, u.id));
    return { error: "register.bad" };
  }
  await createSession(u.id);
  redirect("/");
}

export async function createInvite(): Promise<void> {
  const me = await requireUser();
  const token = randomBytes(18).toString("base64url");
  await db.insert(invites).values({ token, createdBy: me.id, expiresAt: new Date(Date.now() + 7 * 86400_000) });
  revalidatePath("/settings");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 8 || !(await verifyPassword(current, me.passwordHash))) return { error: "settings.passwordWrong" };
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, me.id));
  return { ok: "settings.passwordChanged" };
}

export async function setLanguage(form: FormData): Promise<void> {
  const lang = form.get("lang") === "es" ? "es" : "en";
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  revalidatePath("/", "layout");
}
