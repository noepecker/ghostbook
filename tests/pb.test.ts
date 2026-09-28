import { describe, expect, it } from "vitest";
import {
  bestBefore,
  bestSplits,
  computePBs,
  ownerKeys,
  pbProgression,
  splitStates,
  squadKey,
  userKey,
  type PbRecord,
} from "@/lib/pb";

const d = (s: string) => new Date(s + "T20:00:00Z");
const rec = (id: number, boardKey: string, score: number, date: string, users: number[], guests: string[] = []): PbRecord => ({
  id,
  boardKey,
  score,
  playedAt: d(date),
  participants: [...users.map((userId) => ({ userId })), ...guests.map((guestName) => ({ guestName }))],
});

describe("computePBs, lower is better (time trial)", () => {
  const cc150 = "track=2|cc=1|route=1";
  const cc200 = "track=2|cc=2|route=1";
  const records = [
    rec(1, cc150, 126284, "2026-06-01", [1]),
    rec(2, cc150, 125917, "2026-09-27", [1]),
    rec(3, cc150, 126500, "2026-09-28", [1]), // slower, not a PB
    rec(4, cc200, 107915, "2026-09-14", [1]),
    rec(5, cc150, 125600, "2026-09-20", [2]), // a cousin
  ];
  const pbs = computePBs(records, "lower");
  it("keeps one PB per board key and player", () => {
    expect(pbs.get(cc150)?.get(userKey(1))?.id).toBe(2);
    expect(pbs.get(cc200)?.get(userKey(1))?.id).toBe(4);
    expect(pbs.get(cc150)?.get(userKey(2))?.id).toBe(5);
  });
  it("progression only goes down", () => {
    const steps = pbProgression(records, "lower", userKey(1), cc150);
    expect(steps.map((s) => s.record.id)).toEqual([1, 2]);
    expect(steps[1].previous?.id).toBe(1);
  });
  it("bestBefore gives the PB a record was compared against", () => {
    expect(bestBefore(records, "lower", userKey(1), cc150, records[2])?.id).toBe(2);
    expect(bestBefore(records, "lower", userKey(1), cc150, records[0])).toBeNull();
  });
  it("ties keep the earlier record", () => {
    const tie = [rec(10, cc150, 100000, "2026-01-01", [1]), rec(11, cc150, 100000, "2026-02-01", [1])];
    expect(computePBs(tie, "lower").get(cc150)?.get(userKey(1))?.id).toBe(10);
  });
});

describe("computePBs, higher is better (zombies high round, squads)", () => {
  const rex4 = "map=7|ruleset=1|players=4";
  const rex3 = "map=7|ruleset=1|players=3";
  const records = [
    rec(1, rex4, 31, "2026-09-12", [1, 2, 3], ["Lucía"]),
    rec(2, rex4, 34, "2026-09-26", [1, 2, 3], ["lucía "]),
    rec(3, rex4, 36, "2026-09-27", [2, 3, 4], ["Marta"]),
    rec(4, rex3, 40, "2026-09-01", [1, 3], ["Lucía"]),
  ];
  const pbs = computePBs(records, "higher");
  it("credits every account and the squad", () => {
    const board = pbs.get(rex4)!;
    expect(board.get(userKey(1))?.id).toBe(2);
    expect(board.get(userKey(2))?.id).toBe(3);
    expect(board.get(userKey(4))?.id).toBe(3);
    const sq = squadKey(records[0].participants)!;
    expect(sq).toBe(squadKey(records[1].participants)); // guest names are case/space-insensitive
    expect(board.get(sq)?.id).toBe(2);
  });
  it("player count is part of the board", () => {
    expect(pbs.get(rex3)?.get(userKey(1))?.score).toBe(40);
    expect(pbs.get(rex4)?.get(userKey(1))?.score).toBe(34);
  });
  it("a solo run has no squad key", () => {
    expect(ownerKeys(rec(9, rex4, 10, "2026-01-01", [1]))).toEqual([userKey(1)]);
  });
  it("ignores records without a score", () => {
    const r = { ...rec(20, rex4, 0, "2026-01-01", [9]), score: null };
    expect(computePBs([r], "higher").get(rex4)).toBeUndefined();
  });
});

describe("splits", () => {
  it("best split per section", () => {
    expect(bestSplits([[53402, 43118, 29397], [53310, 43500, 29204], [53500, null, null]])).toEqual([53310, 43118, 29204]);
  });
  it("colours like an F1 timing screen", () => {
    const own = [53310, 43118, 29204];
    expect(splitStates([53402, 43118, 29397], own, [52762, 42395, 28197])).toEqual(["slow", "pb", "slow"]);
    expect(splitStates([52700, 43118, null], own, [52762, 42395, 28197])).toEqual(["wr", "pb", "none"]);
    expect(splitStates([53402, 43000], own, null)).toEqual(["slow", "pb"]);
  });
});
