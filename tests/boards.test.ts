import { describe, expect, it } from "vitest";
import { catalogOrder, unionBoards } from "@/lib/boards";
import { mkwTimeTrial } from "@/lib/seed";

// item ids → catalog sort: tracks 1 (sort 30), 2 (sort 10), 3 (sort 20); cc 150 = 10, 200 = 11; routes 20 (Non-SC), 21 (Glitch)
const sorts: Record<number, number> = { 1: 30, 2: 10, 3: 20, 10: 10, 11: 20, 20: 10, 21: 20 };
const order = catalogOrder(mkwTimeTrial(), (id) => sorts[id]);
const key = (track: number, cc = 10, route = 20) => `track=${track}|cc=${cc}|route=${route}`;

describe("game page boards", () => {
  it("lists WR-only boards when nobody has a time, in catalog order", () => {
    const rows = unionBoards(new Map(), [key(1), key(2), key(3)], order);
    expect(rows.map((r) => r.boardKey)).toEqual([key(2), key(3), key(1)]);
    expect(rows.every((r) => r.latest === null && r.hasWr)).toBe(true);
  });

  it("puts played boards first, newest first, and doesn't list them twice", () => {
    const played = new Map([
      [key(1), new Date("2026-09-01")],
      [key(3, 11), new Date("2026-09-20")],
    ]);
    const rows = unionBoards(played, [key(1), key(2), key(3)], order);
    expect(rows.map((r) => r.boardKey)).toEqual([key(3, 11), key(1), key(2), key(3)]);
    expect(rows[0]).toMatchObject({ hasWr: false });
    expect(rows[1]).toMatchObject({ hasWr: true });
  });

  it("filters only the WR-only boards with the class / route toggle", () => {
    const played = new Map([[key(1, 10, 21), new Date("2026-09-01")]]); // a Glitch time
    const wrs = [key(1), key(2), key(2, 11), key(3, 10, 21)];
    const nonScOn150 = (bk: string) => bk.includes("cc=10|") && bk.endsWith("route=20");
    expect(unionBoards(played, wrs, order, nonScOn150).map((r) => r.boardKey)).toEqual([key(1, 10, 21), key(2), key(1)]);
    const glitch = (bk: string) => bk.endsWith("route=21");
    expect(unionBoards(played, wrs, order, glitch).map((r) => r.boardKey)).toEqual([key(1, 10, 21), key(3, 10, 21)]);
  });

  it("orders by class and route after the track", () => {
    const rows = unionBoards(new Map(), [key(2, 11), key(2, 10, 21), key(2)], order);
    expect(rows.map((r) => r.boardKey)).toEqual([key(2), key(2, 10, 21), key(2, 11)]);
  });

  it("is empty when there are neither records nor WRs", () => {
    expect(unionBoards(new Map(), [], order)).toEqual([]);
  });
});
