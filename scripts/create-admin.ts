// npm run create-admin -- <username> [CODE] [Display name]
// Creates the first account with a one-time password and prints an invite link base.
import { describeTarget } from "./_env";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { users } from "../src/lib/db/schema";
import { hashPassword, normaliseCode, normaliseUsername } from "../src/lib/passwords";

async function main() {
  const [rawName, rawCode, ...rest] = process.argv.slice(2);
  if (!rawName) {
    console.error("usage: npm run create-admin -- <username> [CODE] [Display name]");
    process.exit(2);
  }
  const username = normaliseUsername(rawName);
  if (!username) throw new Error("username: 2 to 24 letters, digits, dot, dash or underscore");
  const code = normaliseCode(rawCode ?? rawName.slice(0, 3));
  if (!code) throw new Error("code: exactly 3 letters, like AND");
  const displayName = rest.join(" ") || rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const db = createDb();
  await runMigrations(db);
  const existing = await db.select().from(users).where(eq(users.username, username));
  const password = randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(password);
  if (existing.length) {
    await db.update(users).set({ passwordHash, isAdmin: true }).where(eq(users.id, existing[0].id));
    console.log(`Reset password for ${username} on ${describeTarget()}.`);
  } else {
    await db.insert(users).values({ username, displayName, code, passwordHash, isAdmin: true });
    console.log(`Created ${username} (${code}, ${displayName}) on ${describeTarget()}.`);
  }
  console.log(`One-time password: ${password}`);
  console.log("Log in, then change it in Settings. Invite the others from Settings as well.");
}

main().then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1); });
