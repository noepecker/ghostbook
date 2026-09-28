import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mk8dxTracks } from "@/lib/seed";
import { slugify } from "@/lib/slug";
import { mk8dxTrackName, parseMkwrsMk8dx } from "@/lib/wr/mkwrs";

const html = readFileSync(join(__dirname, "../src/lib/wr/__fixtures__/mk8dx.html"), "utf8");

describe("mkwrs.com/mk8dx parser (fixture saved 2026-09-28)", () => {
  const rows = parseMkwrsMk8dx(html);

  it("finds the table despite `class = \"wr\"`", () => {
    expect(html).toContain('<table class = "wr">');
    expect(rows.length).toBeGreaterThan(0);
  });

  it("reads 150cc and 200cc for all 96 tracks and skips the totals", () => {
    expect(rows).toHaveLength(192);
    expect(rows.filter((r) => r.cc === "150cc")).toHaveLength(96);
    expect(rows.filter((r) => r.cc === "200cc")).toHaveLength(96);
    expect(new Set(rows.map((r) => r.track)).size).toBe(96);
    expect(rows.some((r) => /total/i.test(r.track))).toBe(false);
  });

  it("parses a 150cc and a 200cc row", () => {
    const s150 = rows.find((r) => r.track === "Mario Kart Stadium" && r.cc === "150cc")!;
    expect(s150).toMatchObject({
      route: null,
      timeMs: 93635,
      holder: "Byron",
      country: "AU",
      date: "2026-09-03",
      character: "Light-blue Yoshi",
      kart: "Cat Cruiser · Cushion · Paper Glider",
      splitsMs: [32666, 30570, 30399],
      videoUrl: "https://youtu.be/ehVZ4kYgY5k?t=10",
      sourceUrl: "https://mkwrs.com/mk8dx/display.php?track=Mario+Kart+Stadium",
    });
    expect(s150.splitsMs.reduce((a, b) => a + b, 0)).toBe(s150.timeMs);
    const s200 = rows.find((r) => r.track === "Mario Kart Stadium" && r.cc === "200cc")!;
    expect(s200).toMatchObject({ timeMs: 65415, holder: "Army", country: "FR", sourceUrl: expect.stringMatching(/&m=200$/) });
    expect(s200.timeMs).toBeLessThan(s150.timeMs);
  });

  it("keeps a time without a video link and times under a minute", () => {
    const wp = rows.find((r) => r.track === "Water Park" && r.cc === "150cc")!;
    expect(wp).toMatchObject({ timeMs: 98132, videoUrl: null, holder: "Vincent" });
    expect(rows.find((r) => r.track === "Moo Moo Meadows (Wii)" && r.cc === "200cc")!.timeMs).toBe(58222);
  });

  it("folds a tie into one row with both holders, without shifting the class", () => {
    const ddd = rows.filter((r) => r.track === "Dry Dry Desert (GCN)");
    expect(ddd.map((r) => [r.cc, r.timeMs, r.holder])).toEqual([
      ["150cc", 111955, "Vincent"],
      ["200cc", 76702, "Army / Panda"],
    ]);
    // the next track still starts at 150cc
    expect(rows.find((r) => r.track === "Donut Plains 3 (SNES)" && r.cc === "150cc")!.timeMs).toBe(72203);
  });

  it("leaves 200cc out when the site has no time for it", () => {
    const one = `<table class = "wr"><tr><th>Track</th></tr>
      <tr><td colspan=2 rowspan=2><table class= "track"><tr><td rowspan=2><a href="x">Big Blue</a></td><td class="lap">150cc</td></tr><tr><td class="lap">200cc</td></tr></table>
      <td>1'22"710</td><td><a>P</a></td><td><img src="../country-flags/JP.png"></td><td>2026-01-01</td><td>1</td><td>Mario</td><td>A</td><td>B</td><td>C</td><td></td></tr>
      <tr><td>-</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>`;
    const r = parseMkwrsMk8dx(one);
    expect(r.map((x) => [x.track, x.cc, x.timeMs])).toEqual([["Big Blue", "150cc", 82710]]);
  });

  it("names tracks the way the catalog does, and every one exists in the seed", () => {
    expect(mk8dxTrackName("Wii Moo Moo Meadows")).toBe("Moo Moo Meadows (Wii)");
    expect(mk8dxTrackName("Tour Paris Promenade")).toBe("Paris Promenade (Tour)");
    expect(mk8dxTrackName("DS Tick-Tock Clock")).toBe("Tick-Tock Clock (DS)");
    expect(mk8dxTrackName("Excitebike Arena")).toBe("Excitebike Arena");
    const seeded = new Set(mk8dxTracks().map((t) => slugify(t.name)));
    expect(seeded.size).toBe(96);
    expect(rows.filter((r) => !seeded.has(slugify(r.track))).map((r) => r.track)).toEqual([]);
  });
});
