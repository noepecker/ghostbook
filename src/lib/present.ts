// Turning stored values into text and links. Pure: takes the World snapshot and a language.
import { makeT, type Lang } from "./i18n/dict";
import type { Game, Item, Mode, RecordFull, World } from "./data";
import { fieldLabel, fillPattern, parseBoardKey, type FieldDef, type ModeTemplate } from "./template";
import { formatDelta, formatInt, formatNumberDelta, formatTime } from "./time";

export function itemName(item: Pick<Item, "name" | "nameEs"> | undefined, lang: Lang): string {
  if (!item) return "?";
  return lang === "es" && item.nameEs ? item.nameEs : item.name;
}

export function itemShort(item: Item | undefined, lang: Lang): string {
  const s = item?.meta?.short;
  return typeof s === "string" ? s : itemName(item, lang);
}

export function modeName(mode: Pick<Mode, "name" | "nameEs">, lang: Lang): string {
  return lang === "es" && mode.nameEs ? mode.nameEs : mode.name;
}

export function playersLabel(n: number, lang: Lang): string {
  const t = makeT(lang);
  if (n >= 1 && n <= 4) return t(`players.${n}` as "players.1");
  return t("players.n", { n });
}

export function formatScore(t: ModeTemplate, score: number | null | undefined): string {
  if (score === null || score === undefined) return "–";
  const f = t.fields.find((x) => x.key === t.score);
  if (f?.type === "time") return formatTime(score, f.precision ?? "ms");
  if (f?.type === "integer") return formatInt(score);
  return String(Math.round(score * 1000) / 1000);
}

/** A gap where negative means better; printed with the field's own units. */
export function formatGap(t: ModeTemplate, gap: number): string {
  const f = t.fields.find((x) => x.key === t.score);
  if (f?.type === "time") return formatDelta(gap, f.precision ?? "ms");
  // for "higher is better" a negative gap means we are above: print the raw difference
  return formatNumberDelta(t.direction === "higher" ? -gap : gap);
}

export function formatValue(f: FieldDef, v: unknown, world: World, lang: Lang): string {
  if (v === undefined || v === null || v === "") return "–";
  switch (f.type) {
    case "time":
      return typeof v === "number" ? formatTime(v, f.precision ?? "ms") : String(v);
    case "integer":
      return typeof v === "number" ? formatInt(v) : String(v);
    case "choice":
      return itemName(world.itemById.get(Number(v)), lang);
    case "boolean":
      return makeT(lang)(v ? "misc.yes" : "misc.no");
    case "splits":
      return Array.isArray(v) ? v.map((x) => (typeof x === "number" ? formatTime(x) : "–")).join(" · ") : "–";
    case "date":
      return String(v);
    default:
      return String(v);
  }
}

/** Value of one board-key part, for labels. */
function keyPartLabel(f: FieldDef, raw: string, world: World, lang: Lang, compact: boolean): string | null {
  if (raw === "") return null;
  if (f.type === "players") return playersLabel(Number(raw), lang);
  if (f.type === "choice") {
    const item = world.itemById.get(Number(raw));
    if (compact && item?.meta?.quiet) return null;
    return compact ? itemShort(item, lang) : itemName(item, lang);
  }
  if (f.type === "boolean") return `${fieldLabel(f, lang)}: ${makeT(lang)(raw === "1" ? "misc.yes" : "misc.no")}`;
  return raw;
}

export interface BoardLabel {
  title: string;
  /** the other key values, compact: `150`, `200 · Glitch`, `4 players` */
  rest: string;
  /** everything, spelled out */
  full: string;
}

export function boardLabel(mode: Mode, boardKey: string, world: World, lang: Lang): BoardLabel {
  const t = mode.template;
  const parts = parseBoardKey(boardKey);
  const keyFields = t.boardKey.map((k) => t.fields.find((f) => f.key === k)).filter((f): f is FieldDef => !!f);
  const titleField = keyFields.find((f) => f.type === "choice") ?? keyFields[0];
  const title = titleField ? keyPartLabel(titleField, parts[titleField.key] ?? "", world, lang, false) ?? modeName(mode, lang) : modeName(mode, lang);
  const rest = keyFields
    .filter((f) => f !== titleField)
    .map((f) => keyPartLabel(f, parts[f.key] ?? "", world, lang, true))
    .filter((x): x is string => !!x)
    .join(" · ");
  const full = keyFields
    .map((f) => keyPartLabel(f, parts[f.key] ?? "", world, lang, false))
    .filter((x): x is string => !!x)
    .join(" · ");
  return { title, rest, full };
}

/** `/g/mkw/time-trial/crown-city/150cc/non-shortcut` */
export function boardPath(game: Game, mode: Mode, boardKey: string, world: World): string {
  const t = mode.template;
  const parts = parseBoardKey(boardKey);
  const segs = t.boardKey.map((k) => {
    const f = t.fields.find((x) => x.key === k);
    const raw = parts[k] ?? "";
    if (!f || raw === "") return "-";
    if (f.type === "players") return `${raw}p`;
    if (f.type === "choice") return world.itemById.get(Number(raw))?.slug ?? raw;
    if (f.type === "boolean") return raw === "1" ? "yes" : "no";
    return encodeURIComponent(raw);
  });
  return `/g/${game.slug}/${mode.slug}/${segs.join("/")}`;
}

/** Inverse of boardPath. Returns null when a segment doesn't resolve. */
export function boardKeyFromPath(game: Game, mode: Mode, segs: string[], world: World): string | null {
  const t = mode.template;
  if (segs.length !== t.boardKey.length) return null;
  const items = world.catalogItems.get(game.id) ?? {};
  const out: string[] = [];
  for (let i = 0; i < t.boardKey.length; i++) {
    const k = t.boardKey[i];
    const f = t.fields.find((x) => x.key === k);
    const s = decodeURIComponent(segs[i]);
    if (!f) return null;
    if (s === "-") {
      out.push(`${k}=`);
      continue;
    }
    if (f.type === "players") {
      const n = parseInt(s, 10);
      if (!Number.isInteger(n)) return null;
      out.push(`${k}=${n}`);
    } else if (f.type === "choice") {
      const it = (items[f.catalog ?? ""] ?? []).find((x) => x.slug === s);
      if (!it) return null;
      out.push(`${k}=${it.id}`);
    } else if (f.type === "boolean") out.push(`${k}=${s === "yes" ? 1 : 0}`);
    else out.push(`${k}=${s}`);
  }
  return out.join("|");
}

function valueText(mode: Mode, rec: Pick<RecordFull, "values" | "participants">, key: string, world: World, lang: Lang): string {
  const f = mode.template.fields.find((x) => x.key === key);
  if (!f) return "";
  if (f.type === "players") return playersLabel(rec.participants.length, lang);
  return formatValue(f, rec.values[key], world, lang);
}

export function recordTitle(mode: Mode, rec: Pick<RecordFull, "values" | "participants" | "boardKey">, world: World, lang: Lang): string {
  const pattern = mode.template.display?.title;
  if (pattern) return fillPattern(pattern, (k) => valueText(mode, rec, k, world, lang));
  return boardLabel(mode, rec.boardKey, world, lang).title;
}

/** Result as printed in the sessions column: `Round 34`, `1:12:47`, `512–472`. */
export function recordResult(mode: Mode, rec: Pick<RecordFull, "values" | "participants" | "score">, world: World, lang: Lang): string {
  const t = mode.template;
  if (t.display?.result) return fillPattern(t.display.result, (k) => valueText(mode, rec, k, world, lang));
  const f = t.fields.find((x) => x.key === t.score);
  if (f && f.type !== "time") return `${fieldLabel(f, lang)} ${formatScore(t, rec.score)}`;
  return formatScore(t, rec.score);
}

/** A short line of the other facts for the sessions column. */
export function recordSub(mode: Mode, rec: RecordFull, world: World, lang: Lang): string {
  const t = mode.template;
  const game = world.gameById.get(mode.gameId);
  const titleKeys = new Set((t.display?.title ?? "").match(/\{([a-z0-9_]+)\}/g)?.map((x) => x.slice(1, -1)) ?? []);
  const resultKeys = new Set((t.display?.result ?? "").match(/\{([a-z0-9_]+)\}/g)?.map((x) => x.slice(1, -1)) ?? []);
  const bits: string[] = [];
  if (game) bits.push(`${game.shortCode} · ${modeName(mode, lang)}`);
  for (const f of t.fields) {
    if (titleKeys.has(f.key) || resultKeys.has(f.key) || f.key === t.score || f.key === t.display?.rating) continue;
    if (f.type === "players" || f.type === "splits" || f.type === "text" || f.type === "boolean") continue;
    const v = rec.values[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.type === "choice") {
      const item = world.itemById.get(Number(v));
      if (item?.meta?.quiet) continue;
      bits.push(itemName(item, lang));
    } else if (f.type === "integer") bits.push(`${fieldLabel(f, lang)} ${formatInt(v as number)}`);
    else bits.push(formatValue(f, v, world, lang));
  }
  return bits.join(" · ");
}

export function userCode(world: World, userId: number | null | undefined): string {
  return (userId && world.userById.get(userId)?.code) || "";
}

export function participantName(world: World, p: { userId: number | null; guestName: string | null }): string {
  if (p.userId) return world.userById.get(p.userId)?.displayName ?? "?";
  return p.guestName ?? "?";
}

export function participantCode(world: World, p: { userId: number | null; guestName: string | null }): string {
  if (p.userId) return world.userById.get(p.userId)?.code ?? "???";
  return (p.guestName ?? "?").normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "·");
}

export function proofBadge(rec: Pick<RecordFull, "proofs">): "clip" | "shot" | null {
  if (rec.proofs.some((p) => p.kind === "video")) return "clip";
  if (rec.proofs.length) return "shot";
  return null;
}
