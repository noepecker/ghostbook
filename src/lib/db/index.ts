// One database handle for the whole app.
// DATABASE_URL set → Neon over HTTP (production). Unset → PGlite on disk in .data/ (dev, tests).
import "server-only";
import { createDb, type DB } from "./client";

const g = globalThis as unknown as { __ghostbookDb?: DB };

export const db: DB = g.__ghostbookDb ?? (g.__ghostbookDb = createDb());
export * as t from "./schema";
