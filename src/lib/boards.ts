// Which boards a game page lists for one category: every board the family has a time on,
// plus every board with a world record, so a fresh install isn't an empty page.
import { parseBoardKey, type ModeTemplate } from "./template";

export interface BoardEntry {
  boardKey: string;
  /** newest family record on the board; null when only a world record is there */
  latest: Date | null;
  hasWr: boolean;
}

/** Board key → sort tuple, in catalog order (track order from the seed, then class, then route). */
export function catalogOrder(tpl: ModeTemplate, itemSort: (id: number) => number | undefined): (boardKey: string) => number[] {
  return (bk) => {
    const parts = parseBoardKey(bk);
    return tpl.boardKey.map((k) => {
      const f = tpl.fields.find((x) => x.key === k);
      const v = parts[k] ?? "";
      if (f?.type === "choice") {
        const id = Number(v);
        return (itemSort(id) ?? 1e9) * 1e6 + (Number.isFinite(id) ? id : 0);
      }
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    });
  };
}

function cmpTuple(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Union of boards with records and boards with a WR. Boards with family activity come first,
 * newest first; the rest follow in catalog order. `show` filters only the WR-only boards
 * (class / route toggles): a board the family has played is always listed.
 */
export function unionBoards(
  recordLatest: Map<string, Date>,
  wrKeys: Iterable<string>,
  order: (boardKey: string) => number[],
  show: (boardKey: string) => boolean = () => true,
): BoardEntry[] {
  const wr = new Set(wrKeys);
  const played: BoardEntry[] = [...recordLatest.entries()]
    .map(([boardKey, latest]) => ({ boardKey, latest, hasWr: wr.has(boardKey) }))
    .sort((a, b) => b.latest!.getTime() - a.latest!.getTime() || cmpTuple(order(a.boardKey), order(b.boardKey)));
  const rest: BoardEntry[] = [...wr]
    .filter((bk) => !recordLatest.has(bk) && show(bk))
    .map((boardKey) => ({ boardKey, latest: null, hasWr: true }))
    .sort((a, b) => cmpTuple(order(a.boardKey), order(b.boardKey)));
  return [...played, ...rest];
}
