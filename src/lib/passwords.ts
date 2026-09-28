import bcrypt from "bcryptjs";

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 11);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function normaliseUsername(s: string): string | null {
  const u = s.trim().toLowerCase();
  return /^[a-z0-9._-]{2,24}$/.test(u) ? u : null;
}

export function normaliseCode(s: string): string | null {
  const c = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

let dummy: string | null = null;
/** A real hash to compare against when the username doesn't exist, so timing doesn't leak it. */
export function dummyHash(): string {
  if (!dummy) dummy = bcrypt.hashSync("not-a-real-password", 11);
  return dummy;
}
