import "server-only";
import { cookies } from "next/headers";

export const LAST_COOKIE = "gb_last";

export async function readLast(): Promise<{ modeId: number; boardKey: string } | null> {
  const v = (await cookies()).get(LAST_COOKIE)?.value;
  if (!v) return null;
  const i = v.indexOf(":");
  const modeId = Number(v.slice(0, i));
  if (!Number.isInteger(modeId)) return null;
  return { modeId, boardKey: decodeURIComponent(v.slice(i + 1)) };
}

export async function writeLast(modeId: number, boardKey: string): Promise<void> {
  (await cookies()).set(LAST_COOKIE, `${modeId}:${encodeURIComponent(boardKey)}`, {
    path: "/",
    maxAge: 365 * 86400,
    sameSite: "lax",
    httpOnly: true,
  });
}
