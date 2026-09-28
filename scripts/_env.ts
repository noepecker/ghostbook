// Load .env.local / .env for scripts (Next does this itself for the app).
import { existsSync, readFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

export function describeTarget(): string {
  return process.env.DATABASE_URL ? "Postgres (DATABASE_URL)" : `PGlite at ${process.env.PGLITE_DIR ?? ".data/pglite"}`;
}
