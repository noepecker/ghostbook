// Parsers for the world record tables on mkwrs.com.
//
// /mkworld/: row cells are track, time+video (1'47"342), player, nation flag, date, days,
// character, vehicle, splits (in an onmouseover). Tracks named "X (Glitch)" are the Glitch
// route. Only 150cc exists there.
//
// /mk8dx/: one `<table class = "wr">` (spaces around the `=`; HTML parsers don't mind).
// Each track is a block of rows: the first carries the cup icon (first track of a cup only)
// and a cell with a nested `<table class= "track">` holding the name and the 150cc/200cc
// links; then ten cells: time+video, player, nation, date, days, character, vehicle, tires,
// glider, splits. The first row is 150cc and the next one 200cc. A tie adds a row with the
// same time (the track cell's rowspan grows by one), so the class only moves on when the
// time changes. Three "Total" rows close the table.

import * as cheerio from "cheerio";
import { parseTime } from "../time";

export const MKWRS_WORLD_URL = "https://mkwrs.com/mkworld/";
export const MKWRS_MK8DX_URL = "https://mkwrs.com/mk8dx/";
export const USER_AGENT = "Ghostbook/1.0 (family records log; one request a day; github.com/noepecker/ghostbook)";

export interface MkwrsRow {
  /** the track's name in Ghostbook's catalog */
  track: string;
  cc: "150cc" | "200cc";
  /** null for games whose boards have no route (MK8DX) */
  route: "Non-shortcut" | "Glitch" | null;
  timeMs: number;
  holder: string;
  country: string | null;
  date: string | null;
  character: string | null;
  kart: string | null;
  videoUrl: string | null;
  splitsMs: number[];
  /** the WR history page on mkwrs */
  sourceUrl: string;
}

function plus(s: string): string {
  return encodeURIComponent(s).replace(/%20/g, "+");
}

function flagCode(src: string | undefined): string | null {
  const cc = (src ?? "").match(/\/([A-Z]{2})\.png$/)?.[1] ?? null;
  return cc && cc !== "UN" ? cc : null;
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
        const row: MkwrsRow = {
          track,
          cc: "150cc",
          route,
          timeMs,
          holder: clean(cell(2).text()),
          country: flagCode(cell(3).find("img").attr("src")),
          date: /^\d{4}-\d{2}-\d{2}$/.test(clean(cell(4).text())) ? clean(cell(4).text()) : null,
          character: clean(cell(6).text()) || null,
          kart: clean(cell(7).text()) || null,
          videoUrl: cell(1).find("a").attr("href") ?? null,
          splitsMs: parseSplitsAttr(cell(8).find("img").attr("onmouseover")),
          sourceUrl: `${MKWRS_WORLD_URL}display.php?track=${plus(trackName)}`,
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

const MK8DX_PREFIX = /^(SNES|N64|GBA|GCN|3DS|DS|Wii|Tour|GB)\s+(.+)$/;

/** mkwrs prints the cup's origin first ("Wii Moo Moo Meadows"); the catalog puts it last. */
export function mk8dxTrackName(mkwrsName: string): string {
  const name = clean(mkwrsName);
  const m = name.match(MK8DX_PREFIX);
  return m ? `${m[2]} (${m[1]})` : name;
}

const MK8DX_CLASSES = ["150cc", "200cc"] as const;

export function parseMkwrsMk8dx(html: string): MkwrsRow[] {
  const $ = cheerio.load(html);
  const rows: MkwrsRow[] = [];
  let block: { name: string; classIdx: number; last: MkwrsRow | null } | null = null;
  $("table.wr")
    .first()
    .find("> tbody > tr, > tr")
    .each((_, tr) => {
      const tds = $(tr).children("td");
      const nested = $(tr).find("table.track");
      if (nested.length) {
        const name = clean(nested.find("a").first().text());
        block = name ? { name, classIdx: -1, last: null } : null;
      } else if (tds.length !== 10) {
        return; // header, totals
      }
      if (!block || tds.length < 10) return;
      const d = tds.slice(tds.length - 10);
      const cell = (i: number) => d.eq(i);
      const timeMs = parseTime(clean(cell(0).text()));
      if (timeMs === null) {
        // a class with no WR yet: skip it, leave the board without one
        block.classIdx++;
        block.last = null;
        return;
      }
      const holder = clean(cell(1).text());
      if (block.last && block.last.timeMs === timeMs) {
        block.last.holder = `${block.last.holder} / ${holder}`;
        return;
      }
      block.classIdx++;
      const cc = MK8DX_CLASSES[block.classIdx];
      if (!cc) return;
      const date = clean(cell(3).text());
      const kart = [cell(6), cell(7), cell(8)].map((c) => clean(c.text())).filter(Boolean).join(" · ");
      const row: MkwrsRow = {
        track: mk8dxTrackName(block.name),
        cc,
        route: null,
        timeMs,
        holder,
        country: flagCode(cell(2).find("img").attr("src")),
        date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        character: clean(cell(5).text()) || null,
        kart: kart || null,
        videoUrl: cell(0).find("a").attr("href") ?? null,
        splitsMs: parseSplitsAttr(cell(9).find("img").attr("onmouseover")),
        sourceUrl: `${MKWRS_MK8DX_URL}display.php?track=${plus(block.name)}${cc === "200cc" ? "&m=200" : ""}`,
      };
      rows.push(row);
      block.last = row;
    });
  return rows;
}
