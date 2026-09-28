import { describe, expect, it } from "vitest";
import { digitsToTime, formatDelta, formatInt, formatSplit, formatTime, parseTime } from "@/lib/time";

describe("digitsToTime", () => {
  it("masks keypad digits as m:ss.mmm", () => {
    expect(digitsToTime("147382")).toBe("1:47.382");
    expect(digitsToTime("2")).toBe("0:00.002");
    expect(digitsToTime("47382")).toBe("0:47.382");
    expect(digitsToTime("0147382")).toBe("1:47.382");
    expect(digitsToTime("3524101")).toBe("35:24.101");
  });
  it("goes to hours past 99 minutes, and does seconds precision", () => {
    expect(digitsToTime("10000000")).toBe("1:00:00.000");
    expect(digitsToTime("24108", "s")).toBe("2:41:08");
    expect(digitsToTime("4708", "s")).toBe("47:08");
  });
});

describe("parseTime", () => {
  it("reads every format players type", () => {
    expect(parseTime("1:47.382")).toBe(107382);
    expect(parseTime("147382")).toBe(107382);
    expect(parseTime("47.382")).toBe(47382);
    expect(parseTime("1:47,382")).toBe(107382);
    expect(parseTime("1:47.3")).toBe(107300);
    expect(parseTime("2:41:08")).toBe(9668000);
    expect(parseTime("24108", "s")).toBe(9668000);
    expect(parseTime("1:12:47.250")).toBe(4367250);
  });
  it("reads mkwrs.com's 1'47\"342", () => {
    expect(parseTime("1'47\"342")).toBe(107342);
    expect(parseTime("58'34\"215")).toBe(3514215);
    expect(parseTime("47\"342")).toBe(47342);
  });
  it("rejects nonsense", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("1:75.000")).toBeNull();
    expect(parseTime("1:2:75")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats times to the millisecond, never truncated", () => {
    expect(formatTime(125917)).toBe("2:05.917");
    expect(formatTime(107382)).toBe("1:47.382");
    expect(formatTime(9668000, "s")).toBe("2:41:08");
    expect(formatTime(4367250, "s")).toBe("1:12:47");
    expect(formatTime(59999)).toBe("0:59.999");
  });
  it("round-trips", () => {
    for (const ms of [1, 999, 60000, 107382, 3599999, 3600000, 9668123]) {
      expect(parseTime(formatTime(ms))).toBe(ms);
    }
  });
  it("formats splits and deltas with a real minus", () => {
    expect(formatSplit(53402)).toBe("53.402");
    expect(formatSplit(73585)).toBe("1:13.585");
    expect(formatDelta(-533)).toBe("−0.533");
    expect(formatDelta(2507)).toBe("+2.507");
    expect(formatDelta(62345)).toBe("+1:02.345");
    expect(formatDelta(0)).toBe("±0.000");
    expect(formatDelta(-65000, "s")).toBe("−1:05");
  });
  it("groups thousands with a narrow space", () => {
    expect(formatInt(11240)).toBe("11 240");
    expect(formatInt(968)).toBe("968");
  });
});
