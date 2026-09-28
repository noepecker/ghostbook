import { describeTarget } from "./_env";
import { createDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { seed } from "../src/lib/seed";
import { catalogItems, games, modes, worldRecords } from "../src/lib/db/schema";

async function main() {
  // Production and Preview each have their own Neon database (preview-only: ghostbook-preview-db).
  if (process.env.VERCEL_ENV && !["production", "preview"].includes(process.env.VERCEL_ENV)) {
    console.log(`seed: skipped on a ${process.env.VERCEL_ENV} build.`);
    return;
  }
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    console.log("seed: on Vercel without DATABASE_URL, skipping.");
    return;
  }
  const db = createDb();
  await runMigrations(db);
  await seed(db);
  const count = async (t: typeof games | typeof modes | typeof catalogItems | typeof worldRecords) => (await db.select().from(t)).length;
  console.log(
    `seed: ${await count(games)} games, ${await count(modes)} categories, ${await count(catalogItems)} catalog items, ` +
      `${await count(worldRecords)} world records on ${describeTarget()}`,
  );
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
