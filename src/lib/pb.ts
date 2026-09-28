// Personal bests. Pure functions over plain records so they can be tested without a DB.
//
// A PB is the best score per board key per owner. A record belongs to each member who
// is an account, and, when more than one person played, to the squad as a whole
// (identified by the sorted set of accounts and guest names).

export type Direction = "lower" | "higher";

export interface PbParticipant {
  userId?: number | null;
  guestName?: string | null;
}

export interface PbRecord {
  id: number;
  boardKey: string;
  score: number | null;
  playedAt: Date;
  participants: PbParticipant[];
}

export function isBetter(a: number, b: number, dir: Direction): boolean {
  return dir === "lower" ? a < b : a > b;
}

function participantId(p: PbParticipant): string | null {
  if (p.userId) return `u${p.userId}`;
  const g = p.guestName?.trim().toLowerCase();
  return g ? `g:${g}` : null;
}

export function squadKey(participants: PbParticipant[]): string | null {
  const ids = participants.map(participantId).filter((x): x is string => !!x);
  if (ids.length < 2) return null;
  return "squad:" + [...new Set(ids)].sort().join("+");
}

export function userKey(userId: number): string {
  return `user:${userId}`;
}

/** Everyone a record counts for: each account, plus the squad when there is one. */
export function ownerKeys(rec: Pick<PbRecord, "participants">): string[] {
  const out: string[] = [];
  for (const p of rec.participants) if (p.userId) out.push(userKey(p.userId));
  const sq = squadKey(rec.participants);
  if (sq) out.push(sq);
  return [...new Set(out)];
}

function chronological<T extends PbRecord>(records: T[]): T[] {
  return [...records].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime() || a.id - b.id);
}

/**
 * board key → owner key → PB record. Ties go to the record set first,
 * the same way a timing sheet keeps the earlier lap.
 */
export function computePBs<T extends PbRecord>(records: T[], dir: Direction): Map<string, Map<string, T>> {
  const out = new Map<string, Map<string, T>>();
  for (const r of chronological(records)) {
    if (r.score === null || r.score === undefined) continue;
    let board = out.get(r.boardKey);
    if (!board) out.set(r.boardKey, (board = new Map()));
    for (const owner of ownerKeys(r)) {
      const cur = board.get(owner);
      if (!cur || isBetter(r.score, cur.score as number, dir)) board.set(owner, r);
    }
  }
  return out;
}

export interface PbStep<T> {
  record: T;
  /** the PB it replaced, null for the first time on the board */
  previous: T | null;
}

/**
 * The chronological list of records that improved an owner's best on one board.
 * A PB only moves one way, so this is exactly the step chart.
 */
export function pbProgression<T extends PbRecord>(
  records: T[],
  dir: Direction,
  owner: string,
  boardKey: string,
): PbStep<T>[] {
  const steps: PbStep<T>[] = [];
  let best: T | null = null;
  for (const r of chronological(records)) {
    if (r.boardKey !== boardKey || r.score === null) continue;
    if (!ownerKeys(r).includes(owner)) continue;
    if (!best || isBetter(r.score, best.score as number, dir)) {
      steps.push({ record: r, previous: best });
      best = r;
    }
  }
  return steps;
}

/** The owner's PB on a board at a moment, excluding one record (used for "was this a PB"). */
export function bestBefore<T extends PbRecord>(
  records: T[],
  dir: Direction,
  owner: string,
  boardKey: string,
  before: T,
): T | null {
  let best: T | null = null;
  for (const r of chronological(records)) {
    if (r.id === before.id) break;
    if (r.boardKey !== boardKey || r.score === null || !ownerKeys(r).includes(owner)) continue;
    if (!best || isBetter(r.score, best.score as number, dir)) best = r;
  }
  return best;
}

/** Signed gap where negative always means "better", whatever the direction. */
export function gap(score: number, reference: number, dir: Direction): number {
  return dir === "lower" ? score - reference : reference - score;
}

/**
 * Best split per index over a set of split arrays (for "your best split" colouring
 * and the sum of best).
 */
export function bestSplits(all: (number | null)[][]): (number | null)[] {
  const n = Math.max(0, ...all.map((s) => s.length));
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    let b: number | null = null;
    for (const s of all) {
      const v = s[i];
      if (v !== null && v !== undefined && (b === null || v < b)) b = v;
    }
    out.push(b);
  }
  return out;
}

export type SplitState = "wr" | "pb" | "slow" | "none";

/** F1 timing colours: purple beats the WR split, green is your best, yellow is slower. */
export function splitStates(
  splits: (number | null)[],
  own: (number | null)[],
  wr: (number | null)[] | null,
): SplitState[] {
  return splits.map((v, i) => {
    if (v === null || v === undefined) return "none";
    const w = wr?.[i];
    if (w !== null && w !== undefined && v < w) return "wr";
    const b = own[i];
    if (b === null || b === undefined || v <= b) return "pb";
    return "slow";
  });
}
