// Type-to-filter matching for every long list: case- and accent-insensitive substring,
// word starts, initials ("dks" → DK Spaceport, "aotd" → Ashes of the Damned) and aliases
// such as a game's short code ("BO7"). Lower score = better match; null = no match.

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .trim();
}

function words(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/**
 * Initials of a name. Short all-caps words count letter by letter ("DK" → "dk"), so
 * "DK Spaceport" answers to both "ds" and "dks". Digits are kept whole ("Donut Plains 3" → "dp3").
 */
export function initials(name: string): string[] {
  const ws = words(name);
  const plain = ws.map((w) => (/^\d+$/.test(w) ? w : w[0])).join("").toLowerCase();
  const spelled = ws.map((w) => (/^\d+$/.test(w) || (/^[A-Z0-9]{2,4}$/.test(w) && /[A-Z]/.test(w)) ? w : w[0])).join("").toLowerCase();
  return plain === spelled ? [plain] : [plain, spelled];
}

export interface Matchable {
  label: string;
  /** other names it answers to: short codes, the Spanish name */
  aliases?: string[];
}

export function matchScore(item: Matchable, query: string): number | null {
  const q = norm(query);
  if (!q) return 0;
  const qCompact = q.replace(/[^a-z0-9]/g, "");
  let best: number | null = null;
  const take = (s: number) => {
    if (best === null || s < best) best = s;
  };
  for (const [i, text] of [item.label, ...(item.aliases ?? [])].entries()) {
    const alias = i > 0 ? 0.5 : 0;
    const n = norm(text);
    if (!n) continue;
    if (n === q) take(0 + alias);
    else if (n.startsWith(q)) take(1 + alias);
    else if (words(text).some((w) => norm(w).startsWith(q))) take(2 + alias);
    else if (n.includes(q)) take(4 + alias);
    if (qCompact.length >= 2 && initials(text).some((ini) => ini.startsWith(qCompact))) take(3 + alias);
  }
  return best;
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/**
 * Filter and order a list. Empty query: recently used first (in the order given), then the
 * list's own order. With a query: best match first, ties broken by recency, then list order.
 */
export function rankItems<T extends Matchable>(items: T[], query: string, recentRank: (item: T) => number | undefined = () => undefined): T[] {
  const scored: { item: T; score: number; recent: number; index: number }[] = [];
  items.forEach((item, index) => {
    const score = matchScore(item, query);
    if (score === null) return;
    scored.push({ item, score, recent: recentRank(item) ?? Infinity, index });
  });
  scored.sort((a, b) => a.score - b.score || a.recent - b.recent || a.index - b.index);
  return scored.map((s) => s.item);
}
