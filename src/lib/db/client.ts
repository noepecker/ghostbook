import { neon } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

// Both drivers expose the same query builder. Neon's HTTP driver has no interactive
// transactions, so app code never uses db.transaction().
export type DB = PgliteDatabase<typeof schema>;

export function pgliteDir(): string {
  return process.env.PGLITE_DIR ?? ".data/pglite";
}

export function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzleNeon({ client: neon(url), schema }) as unknown as DB;
  }
  const dir = pgliteDir();
  if (dir !== "memory://") mkdirSync(dir, { recursive: true });
  return drizzlePglite({ client: new PGlite(dir), schema });
}
