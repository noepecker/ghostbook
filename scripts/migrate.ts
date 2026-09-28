import { describeTarget } from "./_env";
import { createDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";

async function main() {
  // Production and Preview each have their own Neon database (preview-only: ghostbook-preview-db).
  if (process.env.VERCEL_ENV && !["production", "preview"].includes(process.env.VERCEL_ENV)) {
    console.log(`migrate: skipped on a ${process.env.VERCEL_ENV} build.`);
    return;
  }
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    console.log("migrate: on Vercel without DATABASE_URL, nothing to migrate. Add the Neon database first.");
    return;
  }
  const db = createDb();
  await runMigrations(db);
  console.log(`migrate: up to date on ${describeTarget()}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
