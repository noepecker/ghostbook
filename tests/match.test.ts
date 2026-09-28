import { describe, expect, it } from "vitest";
import { initials, matchScore, norm, rankItems } from "@/lib/match";

const tracks = ["Mario Bros. Circuit", "Crown City", "DK Spaceport", "Rainbow Road", "Desert Hills", "Dino Dino Jungle", "Peach Stadium", "Donut Plains 3 (SNES)"].map((label) => ({ label }));
const labels = (xs: { label: string }[]) => xs.map((x) => x.label);

describe("matcher", () => {
  it("ignores case and accents", () => {
    expect(norm("Lucía ÁLVAREZ")).toBe("lucia alvarez");
    expect(matchScore({ label: "Kowakujō" }, "kowakujo")).toBe(0);
    expect(matchScore({ label: "Contrarreloj" }, "CONTRA")).toBe(1);
  });

  it("matches substrings and word starts", () => {
    expect(labels(rankItems(tracks, "city"))).toEqual(["Crown City"]);
    expect(labels(rankItems(tracks, "port"))).toEqual(["DK Spaceport"]);
    expect(labels(rankItems(tracks, "d")).slice(0, 4)).toEqual(["DK Spaceport", "Desert Hills", "Dino Dino Jungle", "Donut Plains 3 (SNES)"]);
  });

  it("matches initials, spelling out short capitals", () => {
    expect(initials("DK Spaceport")).toEqual(["ds", "dks"]);
    expect(initials("Ashes of the Damned")).toEqual(["aotd"]);
    expect(labels(rankItems(tracks, "dks"))).toEqual(["DK Spaceport"]);
    expect(labels(rankItems(tracks, "rr"))).toEqual(["Rainbow Road"]);
    expect(labels(rankItems(tracks, "ddj"))).toEqual(["Dino Dino Jungle"]);
    expect(labels(rankItems(tracks, "dp3"))).toEqual(["Donut Plains 3 (SNES)"]);
    expect(matchScore({ label: "Ashes of the Damned" }, "aotd")).not.toBeNull();
  });

  it("matches aliases like short codes", () => {
    const games = [
      { label: "Mario Kart World", aliases: ["MKW"] },
      { label: "Black Ops 7 Zombies", aliases: ["BO7"] },
      { label: "Black Ops 6 Zombies", aliases: ["BO6"] },
    ];
    expect(labels(rankItems(games, "bo7"))).toEqual(["Black Ops 7 Zombies"]);
    expect(labels(rankItems(games, "MKW"))[0]).toBe("Mario Kart World");
  });

  it("puts better matches first, then recent, then list order", () => {
    const items = [{ label: "Rainbow Road" }, { label: "Road Runner" }, { label: "Crown City" }];
    expect(labels(rankItems(items, "road"))).toEqual(["Road Runner", "Rainbow Road"]);
    const recent = (x: { label: string }) => (x.label === "Crown City" ? 0 : undefined);
    expect(labels(rankItems(items, "", recent))).toEqual(["Crown City", "Rainbow Road", "Road Runner"]);
    const recentRR = (x: { label: string }) => (x.label === "Rainbow Road" ? 0 : undefined);
    expect(labels(rankItems([{ label: "Rainbow Road" }, { label: "Rainbow Road (Wii)" }].reverse(), "rainbow", recentRR))).toEqual(["Rainbow Road", "Rainbow Road (Wii)"]);
  });

  it("returns nothing for no match", () => {
    expect(rankItems(tracks, "zzz")).toEqual([]);
    expect(matchScore({ label: "Crown City" }, "x")).toBeNull();
  });
});
