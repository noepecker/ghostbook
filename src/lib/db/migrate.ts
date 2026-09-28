import type { DB } from "./client";

/** Apply the committed SQL migrations in ./drizzle to whichever database is configured. */
export async function runMigrations(db: DB): Promise<void> {
  const migrationsFolder = "drizzle";
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder });
  }
}
