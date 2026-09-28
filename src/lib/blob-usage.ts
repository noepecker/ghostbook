// Pure arithmetic for the storage meter, kept apart from the Blob calls so it can be tested.

export interface BlobEntry {
  pathname: string;
  size: number;
}

export interface UsageSummary {
  bytes: number;
  files: number;
  /** in Blob but not referenced by any proof row */
  orphans: number;
  orphanBytes: number;
  /** referenced by a proof row but missing from Blob */
  missing: number;
}

export function summarizeBlobs(blobs: BlobEntry[], referenced: Iterable<string>): UsageSummary {
  const refs = new Set(referenced);
  const present = new Set<string>();
  let bytes = 0;
  let orphans = 0;
  let orphanBytes = 0;
  for (const b of blobs) {
    present.add(b.pathname);
    bytes += b.size;
    if (!refs.has(b.pathname)) {
      orphans++;
      orphanBytes += b.size;
    }
  }
  let missing = 0;
  for (const r of refs) if (!present.has(r)) missing++;
  return { bytes, files: blobs.length, orphans, orphanBytes, missing };
}

/** Walk every page of a cursor-paginated listing. `maxPages` guards against a cursor that never ends. */
export async function listAllPages<T>(
  page: (cursor: string | undefined) => Promise<{ blobs: T[]; cursor?: string; hasMore: boolean }>,
  maxPages = 100,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const res = await page(cursor);
    out.push(...res.blobs);
    if (!res.hasMore || !res.cursor) return out;
    cursor = res.cursor;
  }
  throw new Error(`more than ${maxPages} pages`);
}
