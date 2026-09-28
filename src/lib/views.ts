import "server-only";
import type { Lang } from "./i18n/dict";
import { fmtDate } from "./i18n/dict";
import type { Mode, RecordFull, World, WorldRecord } from "./data";
import {
  bestBefore,
  bestSplits,
  computePBs,
  gap,
  splitStates,
  userKey,
  type SplitState,
} from "./pb";
import {
  boardLabel,
  boardPath,
  formatGap,
  formatScore,
  modeName,
  participantCode,
  proofBadge,
  recordResult,
  recordSub,
  recordTitle,
} from "./present";
import { fieldLabel } from "./template";
import { formatNumberDelta } from "./time";

export function wrKey(modeId: number, boardKey: string) {
  return `${modeId}|${boardKey}`;
}

export function splitsFieldKey(mode: Mode): string | null {
  return mode.template.fields.find((f) => f.type === "splits")?.key ?? null;
}

export function splitsOf(rec: RecordFull, key: string | null): (number | null)[] | null {
  if (!key) return null;
  const v = rec.values[key];
  return Array.isArray(v) ? (v as (number | null)[]) : null;
}

export interface SplitCell {
  v: number | null;
  state: SplitState;
}

export interface TowerRow {
  mode: Mode;
  boardKey: string;
  href: string;
  title: string;
  rest: string;
  record: RecordFull;
  score: string;
  gain: string | null;
  gainBetter: boolean;
  dwr: string | null;
  dwrBetter: boolean;
  date: string;
  proof: "clip" | "shot" | null;
  splits: SplitCell[] | null;
  wr: WorldRecord | null;
}

/** One row per board where `userId` has a PB, newest PB first. */
export function buildTower(
  mode: Mode,
  records: RecordFull[],
  wrs: Map<string, WorldRecord>,
  userId: number,
  world: World,
  lang: Lang,
): TowerRow[] {
  const game = world.gameById.get(mode.gameId)!;
  const dir = mode.template.direction;
  const mine = records.filter((r) => r.modeId === mode.id && r.participants.some((p) => p.userId === userId));
  const pbs = computePBs(mine, dir);
  const owner = userKey(userId);
  const sk = splitsFieldKey(mode);
  const rows: TowerRow[] = [];
  for (const [boardKey, owners] of pbs) {
    const pb = owners.get(owner);
    if (!pb || pb.score === null) continue;
    const prev = bestBefore(mine, dir, owner, boardKey, pb);
    const wr = wrs.get(wrKey(mode.id, boardKey)) ?? null;
    const label = boardLabel(mode, boardKey, world, lang);
    let splits: SplitCell[] | null = null;
    const s = splitsOf(pb, sk);
    if (s) {
      const own = bestSplits(mine.filter((r) => r.boardKey === boardKey).map((r) => splitsOf(r, sk) ?? []));
      const wrS = wr?.splits && wr.splits.length === s.length ? wr.splits : null;
      const states = splitStates(s, own, wrS);
      splits = s.map((v, i) => ({ v, state: states[i] }));
    }
    const g = prev && prev.score !== null ? gap(pb.score, prev.score, dir) : null;
    const d = wr ? gap(pb.score, wr.score, dir) : null;
    rows.push({
      mode,
      boardKey,
      href: boardPath(game, mode, boardKey, world),
      title: label.title,
      rest: label.rest,
      record: pb,
      score: formatScore(mode.template, pb.score),
      gain: g === null ? null : formatGap(mode.template, g),
      gainBetter: g !== null && g < 0,
      dwr: d === null ? null : formatGap(mode.template, d),
      dwrBetter: d !== null && d < 0,
      date: fmtDate(pb.playedAt, lang, "day"),
      proof: proofBadge(pb),
      splits,
      wr,
    });
  }
  rows.sort((a, b) => b.record.playedAt.getTime() - a.record.playedAt.getTime() || b.record.id - a.record.id);
  return rows;
}

export interface SessionRow {
  href: string;
  day: string;
  what: string;
  res: string;
  resClass: string;
  sub: string;
  codes: string[];
  more: number;
}

export function buildSession(rec: RecordFull, world: World, lang: Lang, ratingDelta?: number | null): SessionRow {
  const mode = world.modeById.get(rec.modeId)!;
  let res = recordResult(mode, rec, world, lang);
  let resClass = "";
  if (ratingDelta !== undefined && ratingDelta !== null) {
    res = formatNumberDelta(ratingDelta);
    resClass = ratingDelta > 0 ? "pb" : ratingDelta < 0 ? "slow" : "";
  }
  const codes = rec.participants.map((p) => participantCode(world, p));
  return {
    href: `/r/${rec.id}`,
    day: fmtDate(rec.playedAt, lang, "weekday"),
    what: recordTitle(mode, rec, world, lang),
    res,
    resClass,
    sub: recordSub(mode, rec, world, lang),
    codes: codes.slice(0, 4),
    more: Math.max(0, codes.length - 4),
  };
}

/** Rating change of each record against the same player's previous rating in that mode. */
export function ratingDeltas(records: RecordFull[], mode: Mode): Map<number, number | null> {
  const key = mode.template.display?.rating;
  const out = new Map<number, number | null>();
  if (!key) return out;
  const sorted = [...records].filter((r) => r.modeId === mode.id).sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime() || a.id - b.id);
  let prev: number | null = null;
  for (const r of sorted) {
    const v = r.values[key];
    if (typeof v !== "number") {
      out.set(r.id, null);
      continue;
    }
    out.set(r.id, prev === null ? null : v - prev);
    prev = v;
  }
  return out;
}

export interface RatingView {
  label: string;
  value: number;
  monthDelta: number | null;
  monthName: string;
  href: string;
}

export function buildRating(mode: Mode, records: RecordFull[], world: World, lang: Lang, now = new Date()): RatingView | null {
  const key = mode.template.display?.rating;
  if (!key) return null;
  const f = mode.template.fields.find((x) => x.key === key);
  const withValue = records
    .filter((r) => r.modeId === mode.id && typeof r.values[key] === "number")
    .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  if (!withValue.length) return null;
  const latest = withValue[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const before = withValue.find((r) => r.playedAt < monthStart);
  const inMonth = withValue.filter((r) => r.playedAt >= monthStart);
  let monthDelta: number | null = null;
  if (inMonth.length) {
    const base = before ? (before.values[key] as number) : (inMonth[inMonth.length - 1].values[key] as number);
    monthDelta = (latest.values[key] as number) - base;
  }
  const b = boardLabel(mode, latest.boardKey, world, lang);
  const ratingName = f ? fieldLabel(f, lang).replace(/\s+(after|después)$/i, "") : "";
  return {
    label: [`${modeName(mode, lang)} ${ratingName}`.trim(), b.title !== modeName(mode, lang) ? b.title : b.rest].filter(Boolean).join(" · "),
    value: latest.values[key] as number,
    monthDelta,
    monthName: fmtDate(now, lang, "month"),
    href: `/r/${latest.id}`,
  };
}
