import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMkwrsWorld, parseSplitsAttr, splitTrackRoute } from "@/lib/wr/mkwrs";

const html = readFileSync(join(__dirname, "../src/lib/wr/__fixtures__/mkworld.html"), "utf8");

describe("mkwrs.com/mkworld parser (fixture saved 2026-09-28)", () => {
  const rows = parseMkwrsWorld(html);
  it("reads all 40 tracks from both tables and skips the total", () => {
    expect(rows).toHaveLength(40);
    expect(rows.some((r) => /total/i.test(r.track))).toBe(false);
    expect(rows.find((r) => r.track === "SNES Vanilla Lake 1")).toBeTruthy();
  });
  it("parses a full row", () => {
    const cc = rows.find((r) => r.track === "Crown City")!;
    expect(cc).toMatchObject({
      route: "Non-shortcut",
      timeMs: 123354,
      holder: "Pluto",
      country: "US",
      date: "2026-07-08",
      character: "Wiggler",
      kart: "Big Horn",
      splitsMs: [52762, 42395, 28197],
    });
    expect(cc.videoUrl).toMatch(/^https:\/\/www\.youtube\.com\//);
  });
  it("keeps variable split counts and splits over a minute", () => {
    expect(rows.find((r) => r.track === "DK Spaceport")!.splitsMs).toHaveLength(6);
    const rr = rows.find((r) => r.track === "Rainbow Road")!;
    expect(rr.splitsMs).toEqual([57799, 48493, 52971, 73585]);
    expect(rr.splitsMs.reduce((a, b) => a + b, 0)).toBe(rr.timeMs);
  });
  it("reads non-latin names and unknown nations", () => {
    expect(rows.find((r) => r.track === "Mario Bros. Circuit")!.holder).toBe("あつき");
    expect(rows.find((r) => r.track === "Desert Hills")!.country).toBeNull();
  });
  it("maps (Glitch) tracks to the Glitch route", () => {
    expect(splitTrackRoute("Crown City (Glitch)")).toEqual({ track: "Crown City", route: "Glitch" });
    expect(splitTrackRoute("Great ? Block Ruins")).toEqual({ track: "Great ? Block Ruins", route: "Non-shortcut" });
    const glitchRow = `<table class="wr"><tr><th>Track</th></tr><tr><td rowspan='1'><a>Crown City (Glitch)</a></td><td><a href="v">1'58"001</a></td><td><a>Someone</a></td><td><div class="center"><img src="../country-flags/JP.png"></div></td><td>2025-07-01</td><td>80</td><td>Bowser</td><td>Reel Racer</td><td><img onmouseover="show_splits_dynamic('ttipid_splits', '40.000','40.000','38.001', '0-0-0', '0-0-0');"></td></tr></table>`;
    const [g] = parseMkwrsWorld(glitchRow);
    expect(g).toMatchObject({ track: "Crown City", route: "Glitch", timeMs: 118001, country: "JP", splitsMs: [40000, 40000, 38001] });
  });
  it("parses the splits tooltip", () => {
    expect(parseSplitsAttr("show_splits_dynamic('ttipid_splits', '36.891','35.194','35.257', '8-0-0', '1-1-1');")).toEqual([36891, 35194, 35257]);
    expect(parseSplitsAttr(undefined)).toEqual([]);
  });
});
