// Parser for the world record table on https://mkwrs.com/mkworld/.
// Row cells: track, time+video (1'47"342), player, nation flag, date, days, character,
// vehicle, splits (in an onmouseover). Tracks named "X (Glitch)" are the Glitch route.
// Only 150cc exists there.

import * as cheerio from "cheerio";
import { parseTime } from "../time";

export const MKWRS_WORLD_URL = "https://mkwrs.com/mkworld/";
export const USER_AGENT = "Ghostbook/1.0 (family records log; one request a day; github.com/noepecker/ghostbook)";

export interface MkwrsRow {
  track: string;
  route: "Non-shortcut" | "Glitch";
  timeMs: number;
  holder: string;
  country: string | null;
  date: string | null;
  character: string | null;
  kart: string | null;
  videoUrl: string | null;
  splitsMs: number[];
}

function clean(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** `show_splits_dynamic('ttipid_splits', '52.762','42.395','28.197', '17-3-0', '1-0-2')` */
export function parseSplitsAttr(attr: string | undefined): number[] {
  if (!attr) return [];
  const quoted = [...attr.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  const out: number[] = [];
  for (const q of quoted) {
    if (!/^\d+(:\d{2})?\.\d{3}$/.test(q)) continue; // skips 'ttipid_splits' and '17-3-0'
    const ms = parseTime(q);
    if (ms !== null) out.push(ms);
  }
  return out;
}

export function splitTrackRoute(name: string): { track: string; route: MkwrsRow["route"] } {
  const m = name.match(/^(.*?)\s*\((?:glitch)\)\s*$/i);
  return m ? { track: m[1].trim(), route: "Glitch" } : { track: name.trim(), route: "Non-shortcut" };
}

export function parseMkwrsWorld(html: string): MkwrsRow[] {
  const $ = cheerio.load(html);
  const rows: MkwrsRow[] = [];
  $("table.wr").each((_, table) => {
    let last: MkwrsRow | null = null;
    $(table)
      .find("> tbody > tr, > tr")
      .each((__, tr) => {
        const tds = $(tr).children("td");
        if (tds.length === 0) return; // header
        const first = clean(tds.eq(0).text());
        if (/^total:?$/i.test(first)) return;
        // A tie shows as a row without the track cell (the track cell has rowspan > 1).
        const offset = tds.length >= 9 ? 0 : tds.length === 8 && last ? -1 : null;
        if (offset === null) return;
        const cell = (i: number) => tds.eq(i + offset);
        const trackName = offset === 0 ? first : last!.track + (last!.route === "Glitch" ? " (Glitch)" : "");
        const timeText = clean(cell(1).text());
        const timeMs = parseTime(timeText);
        if (!trackName || timeMs === null) return;
        const { track, route } = splitTrackRoute(trackName);
        const flag = cell(3).find("img").attr("src") ?? "";
        const cc = flag.match(/\/([A-Z]{2})\.png$/)?.[1] ?? null;
        const row: MkwrsRow = {
          track,
          route,
          timeMs,
          holder: clean(cell(2).text()),
          country: cc && cc !== "UN" ? cc : null,
          date: /^\d{4}-\d{2}-\d{2}$/.test(clean(cell(4).text())) ? clean(cell(4).text()) : null,
          character: clean(cell(6).text()) || null,
          kart: clean(cell(7).text()) || null,
          videoUrl: cell(1).find("a").attr("href") ?? null,
          splitsMs: parseSplitsAttr(cell(8).find("img").attr("onmouseover")),
        };
        if (offset === -1 && last && last.timeMs === row.timeMs) {
          // tie: keep one row, list both holders
          last.holder = `${last.holder} / ${row.holder}`;
          return;
        }
        rows.push(row);
        last = row;
      });
  });
  return rows;
}
