import { describe, expect, it } from "vitest";
import { listAllPages, summarizeBlobs } from "@/lib/blob-usage";
import { valuesToRaw } from "@/lib/edit";
import { mkwTimeTrial } from "@/lib/seed";
import type { ModeTemplate } from "@/lib/template";

describe("valuesToRaw (prefilling the log form to edit)", () => {
  const tpl = mkwTimeTrial();
  it("turns stored values back into what the form holds", () => {
    const raw = valuesToRaw(tpl, { track: 12, cc: 3, route: 5, time: 123354, splits: [52762, 42395, 28197], character: 40 });
    expect(raw).toEqual({ track: "12", cc: "3", route: "5", time: "2:03.354", splits: ["52.762", "42.395", ""], character: "40" });
  });
  it("keeps a last split that doesn't follow from the total", () => {
    const raw = valuesToRaw(tpl, { track: 1, time: 123354, splits: [52762, 42395, 28000] });
    expect(raw.splits).toEqual(["52.762", "42.395", "28.000"]);
  });
  it("prints splits over a minute with minutes and skips gaps", () => {
    const raw = valuesToRaw(tpl, { track: 1, time: 232848, splits: [57799, null, 73585] });
    expect(raw.splits).toEqual(["57.799", "", "1:13.585"]);
  });
  it("handles numbers, booleans, text and seconds precision", () => {
    const t: ModeTemplate = {
      fields: [
        { key: "round", label: "Round", type: "integer" },
        { key: "ee", label: "EE", type: "boolean" },
        { key: "rival", label: "Rival", type: "text" },
        { key: "run", label: "Run", type: "time", precision: "s" },
        { key: "players", label: "Players", type: "players" },
      ],
      score: "round",
      direction: "higher",
      boardKey: [],
    };
    expect(valuesToRaw(t, { round: 42, ee: true, rival: "ABC", run: 9_668_000 })).toEqual({ round: "42", ee: true, rival: "ABC", run: "2:41:08" });
  });
});

describe("storage meter", () => {
  it("sums sizes and counts orphans and missing files", () => {
    const s = summarizeBlobs(
      [
        { pathname: "proofs/1/a.png", size: 1000 },
        { pathname: "proofs/1/b.mp4", size: 5000 },
        { pathname: "proofs/9/stray.png", size: 300 },
      ],
      ["proofs/1/a.png", "proofs/1/b.mp4", "proofs/2/gone.png"],
    );
    expect(s).toEqual({ bytes: 6300, files: 3, orphans: 1, orphanBytes: 300, missing: 1 });
  });
  it("walks every page of the listing", async () => {
    const pages = [
      { blobs: [1, 2], cursor: "a", hasMore: true },
      { blobs: [3], cursor: "b", hasMore: true },
      { blobs: [4], hasMore: false },
    ];
    const seen: (string | undefined)[] = [];
    const all = await listAllPages(async (cursor) => {
      seen.push(cursor);
      return pages[seen.length - 1];
    });
    expect(all).toEqual([1, 2, 3, 4]);
    expect(seen).toEqual([undefined, "a", "b"]);
  });
  it("gives up on a cursor that never ends", async () => {
    await expect(listAllPages(async () => ({ blobs: [0], cursor: "x", hasMore: true }), 3)).rejects.toThrow(/more than 3 pages/);
  });
});

describe("counters", () => {
  it("use the singular when n is 1, in both languages", async () => {
    const { makeT } = await import("@/lib/i18n/dict");
    const en = makeT("en");
    const es = makeT("es");
    expect(en("settings.storageFiles", { n: 1 })).toBe("1 file");
    expect(en("settings.storageFiles", { n: 2 })).toBe("2 files");
    expect(en("settings.storageFiles", { n: 0 })).toBe("0 files");
    expect(es("settings.storageFiles", { n: 1 })).toBe("1 archivo");
    expect(en("games.wrRefreshed", { n: 1 })).toBe("1 world record updated.");
    expect(es("board.history", { n: 1, months: "1 mes" })).toBe("Historial del PB · 1 mejora en 1 mes");
    expect(en("picker.count", { n: 1 })).toBe("1 match");
    expect(es("picker.count", { n: 3 })).toBe("3 resultados");
  });
});
