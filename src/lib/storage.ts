import "server-only";
import { list } from "@vercel/blob";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { proofs } from "./db/schema";
import { listAllPages, summarizeBlobs, type BlobEntry, type UsageSummary } from "./blob-usage";

export const BLOB_USAGE_TAG = "blob-usage";
export const BLOB_FREE_TIER = 1024 ** 3; // Vercel Blob Hobby: 1 GB

export type StorageUsage =
  | (UsageSummary & { source: "blob"; checkedAt: Date })
  | { source: "db"; bytes: number; files: number; reason: "no-token" | "error"; error?: string };

// The listing is cached for 10 minutes (and dropped whenever a proof is added or removed),
// so Settings doesn't walk the whole store on every visit.
const cachedListing = unstable_cache(
  async (): Promise<{ blobs: [string, number][]; at: number }> => {
    const blobs = await listAllPages((cursor) => list({ cursor, limit: 1000, abortSignal: AbortSignal.timeout(10_000) }));
    return { blobs: blobs.map((b) => [b.pathname, b.size]), at: Date.now() };
  },
  ["blob-listing-v1"],
  { revalidate: 600, tags: [BLOB_USAGE_TAG] },
);

/** Real usage from the Blob API; the database sum when Blob can't be asked. */
export async function storageUsage(): Promise<StorageUsage> {
  const rows = await db.select({ pathname: proofs.pathname, size: proofs.size }).from(proofs);
  const dbFallback = (reason: "no-token" | "error", error?: string): StorageUsage => ({
    source: "db",
    bytes: rows.reduce((a, r) => a + Number(r.size), 0),
    files: rows.length,
    reason,
    error,
  });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return dbFallback("no-token");
  try {
    const { blobs, at } = await cachedListing();
    const entries: BlobEntry[] = blobs.map(([pathname, size]) => ({ pathname, size }));
    return { ...summarizeBlobs(entries, rows.map((r) => r.pathname)), source: "blob", checkedAt: new Date(at) };
  } catch (e) {
    console.error("blob list failed, metering from the database", e);
    return dbFallback("error", (e as Error).message);
  }
}
