import { describe, expect, it } from "vitest";
import { boardKeyOf, fillPattern, parseBoardKey, validateTemplate, validateValues, type ModeTemplate } from "@/lib/template";

const tt: ModeTemplate = {
  fields: [
    { key: "track", label: "Track", type: "choice", catalog: "track", required: true },
    { key: "cc", label: "Engine", type: "choice", catalog: "cc" },
    { key: "route", label: "Route", type: "choice", catalog: "route" },
    { key: "time", label: "Time", type: "time", precision: "ms" },
    { key: "splits", label: "Splits", type: "splits", count: 3, of: "time", autoLast: true, countFrom: "track" },
    { key: "character", label: "Character", type: "choice", catalog: "character" },
  ],
  score: "time",
  direction: "lower",
  boardKey: ["track", "cc", "route"],
};
const ctx = {
  catalogs: {
    track: [
      { id: 1, slug: "crown-city", name: "Crown City", meta: { splits: 3 } },
      { id: 2, slug: "dk-spaceport", name: "DK Spaceport", meta: { splits: 6 } },
    ],
    cc: [{ id: 10, slug: "150cc", name: "150cc" }, { id: 11, slug: "200cc", name: "200cc" }],
    route: [{ id: 20, slug: "non-shortcut", name: "Non-shortcut" }],
    character: [{ id: 30, slug: "bowser", name: "Bowser" }],
  },
};

describe("validateTemplate", () => {
  it("accepts the time trial template", () => {
    expect(validateTemplate(tt, ["track", "cc", "route", "character"])).toEqual({ ok: true, errors: [] });
  });
  it("rejects a bad score, unknown board key, unknown catalog and duplicate keys", () => {
    const bad = {
      ...tt,
      score: "character",
      boardKey: ["track", "nope"],
      fields: [...tt.fields, { key: "track", label: "Again", type: "text" }],
    };
    const r = validateTemplate(bad, ["cc"]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/used twice/);
    expect(r.errors.join(" ")).toMatch(/score must be/);
    expect(r.errors.join(" ")).toMatch(/"nope" doesn't exist/);
    expect(r.errors.join(" ")).toMatch(/catalog "track"/);
  });
  it("rejects splits without a total, two players fields and a time in the board key", () => {
    const r = validateTemplate({
      fields: [
        { key: "t", label: "T", type: "time" },
        { key: "s", label: "S", type: "splits", count: 3, autoLast: true },
        { key: "p", label: "P", type: "players" },
        { key: "q", label: "Q", type: "players" },
      ],
      score: "t",
      direction: "sideways",
      boardKey: ["t"],
    });
    expect(r.errors.join(" ")).toMatch(/only fill the last split/);
    expect(r.errors.join(" ")).toMatch(/Only one players field/);
    expect(r.errors.join(" ")).toMatch(/lower or higher/);
    expect(r.errors.join(" ")).toMatch(/can't be part of the board key/);
  });
  it("rejects garbage", () => {
    expect(validateTemplate(null).ok).toBe(false);
    expect(validateTemplate({ fields: [] }).ok).toBe(false);
  });
});

describe("validateValues and board keys", () => {
  it("normalises a time trial entry and fills the last split", () => {
    const r = validateValues(tt, { track: "1", cc: "10", route: "20", time: "205917", splits: ["53.402", "43.118", ""], character: "30" }, ctx, 1);
    expect(r.ok).toBe(true);
    expect(r.score).toBe(125917);
    expect(r.values.splits).toEqual([53402, 43118, 29397]);
    expect(boardKeyOf(tt, r.values, 1)).toBe("track=1|cc=10|route=20");
    expect(parseBoardKey("track=1|cc=10|route=20")).toEqual({ track: "1", cc: "10", route: "20" });
  });
  it("uses the track's split count", () => {
    const r = validateValues(tt, { track: "2", cc: "10", route: "20", time: "1:29.604", splits: ["24.4", "14.4", "12.6", "12.6", "12.3", ""] }, ctx, 1);
    expect((r.values.splits as number[]).length).toBe(6);
    expect((r.values.splits as number[])[5]).toBe(89604 - 24400 - 14400 - 12600 - 12600 - 12300);
  });
  it("flags missing board key values and splits that don't add up", () => {
    const r = validateValues(tt, { time: "1:00.000", splits: ["30.000", "20.000", "20.000"], track: "1" }, ctx, 1);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Engine is missing/);
    expect(r.errors.join(" ")).toMatch(/add up/);
  });
  it("players count goes into the board key and is range-checked", () => {
    const hr: ModeTemplate = {
      fields: [
        { key: "map", label: "Map", type: "choice", catalog: "track" },
        { key: "round", label: "Round", type: "integer", min: 1 },
        { key: "players", label: "Players", type: "players", min: 1, max: 4 },
      ],
      score: "round",
      direction: "higher",
      boardKey: ["map", "players"],
    };
    expect(validateTemplate(hr, ["track"]).ok).toBe(true);
    const r = validateValues(hr, { map: "crown-city", round: "34" }, ctx, 4);
    expect(r.ok).toBe(true);
    expect(boardKeyOf(hr, r.values, 4)).toBe("map=1|players=4");
    expect(validateValues(hr, { map: "1", round: "34" }, ctx, 5).ok).toBe(false);
    expect(validateValues(hr, { map: "1", round: "0" }, ctx, 2).ok).toBe(false);
  });
  it("fills display patterns", () => {
    expect(fillPattern("{our}–{their}", (k) => ({ our: "512", their: "472" })[k] ?? "")).toBe("512–472");
  });
});
