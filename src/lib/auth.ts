import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { sessions, users } from "./db/schema";

export const SESSION_COOKIE = "gb_session";
const SESSION_DAYS = 60;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new Error("SESSION_SECRET is not set (32+ random characters).");
  }
  return "ghostbook-local-dev-secret-not-for-production";
}

function sign(id: string): string {
  return `${id}.${createHmac("sha256", secret()).update(id).digest("base64url")}`;
}

function unsign(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const id = value.slice(0, i);
  const expected = Buffer.from(sign(id));
  const got = Buffer.from(value);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return id;
}

export type SessionUser = typeof users.$inferSelect;

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const id = unsign((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  return rows[0]?.user ?? null;
});

/** For pages, server actions and route handlers: the logged-in user, or off to /login. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function createSession(userId: number): Promise<void> {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, sign(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.GHOSTBOOK_INSECURE_COOKIES,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = unsign(jar.get(SESSION_COOKIE)?.value);
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  jar.delete(SESSION_COOKIE);
}
