// A category ("mode") is described by a field template stored as JSON.
// The same code validates templates in the editor, validates record values on save,
// and derives the board key both on the server and in the log form.

import { parseTime, type Precision } from "./time";

export const FIELD_TYPES = [
  "time",
  "integer",
  "number",
  "text",
  "choice",
  "boolean",
  "splits",
  "players",
  "date",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface PlayerStat {
  key: string;
  label: string;
  labelEs?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  labelEs?: string;
  type: FieldType;
  required?: boolean;
  /** choice: catalog key within the same game */
  catalog?: string;
  /** choice: default item slug; integer/number: default value */
  default?: string | number;
  /** time */
  precision?: Precision;
  /** splits: how many, which time field they add up to, last one auto */
  count?: number;
  of?: string;
  autoLast?: boolean;
  /** splits: take the count from this choice field's item meta.splits when set */
  countFrom?: string;
  /** integer/number: bounds. players: min/max participants */
  min?: number;
  max?: number;
  /** players: per-player integer stats (kills, downs, revives) */
  stats?: PlayerStat[];
}

export interface ModeDisplay {
  /** where records of this category show on a player's page */
  home?: "tower" | "sessions" | "none";
  /** headline, with {field} placeholders; defaults to the first board-key choice */
  title?: string;
  /** result text with {field} placeholders; defaults to the score */
  result?: string;
  /** an integer field that is a rating over time (Lounge MMR) */
  rating?: string;
}

export interface ModeTemplate {
  fields: FieldDef[];
  score: string;
  direction: "lower" | "higher";
  boardKey: string[];
  display?: ModeDisplay;
}

export type Values = Record<string, unknown>;

export interface Participant {
  userId?: number | null;
  guestName?: string | null;
  stats?: Record<string, number>;
}

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const SCORE_TYPES: FieldType[] = ["time", "integer", "number"];
const KEYABLE: FieldType[] = ["choice", "boolean", "integer", "text", "players"];

export interface TemplateCheck {
  ok: boolean;
  errors: string[];
}

/** Structural validation. `catalogKeys` = catalogs that exist in the game. */
export function validateTemplate(input: unknown, catalogKeys?: string[]): TemplateCheck {
  const errors: string[] = [];
  const t = input as ModeTemplate;
  if (!t || typeof t !== "object") return { ok: false, errors: ["Template must be an object."] };
  if (!Array.isArray(t.fields) || t.fields.length === 0) errors.push("Add at least one field.");
  const fields = Array.isArray(t.fields) ? t.fields : [];
  const byKey = new Map<string, FieldDef>();
  let players = 0;
  for (const f of fields) {
    if (!f || typeof f !== "object") {
      errors.push("Every field must be an object.");
      continue;
    }
    if (!KEY_RE.test(f.key ?? "")) errors.push(`Field key "${f.key ?? ""}" must be lowercase letters, digits or _.`);
    if (byKey.has(f.key)) errors.push(`Field key "${f.key}" is used twice.`);
    byKey.set(f.key, f);
    if (!f.label || typeof f.label !== "string") errors.push(`Field "${f.key}" needs a label.`);
    if (!FIELD_TYPES.includes(f.type)) errors.push(`Field "${f.key}" has an unknown type.`);
    if (f.type === "choice") {
      if (!f.catalog) errors.push(`Choice field "${f.key}" needs a catalog.`);
      else if (catalogKeys && !catalogKeys.includes(f.catalog)) {
        errors.push(`Choice field "${f.key}" uses catalog "${f.catalog}", which this game doesn't have.`);
      }
    }
    if (f.type === "time" && f.precision && f.precision !== "ms" && f.precision !== "s") {
      errors.push(`Time field "${f.key}" precision must be ms or s.`);
    }
    if (f.type === "players") {
      players++;
      const min = f.min ?? 1;
      const max = f.max ?? 4;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 24) {
        errors.push(`Players field "${f.key}" needs 1 ≤ min ≤ max ≤ 24.`);
      }
      for (const s of f.stats ?? []) {
        if (!KEY_RE.test(s.key ?? "") || !s.label) errors.push(`Player stat "${s.key ?? ""}" needs a key and label.`);
      }
    }
    if ((f.type === "integer" || f.type === "number") && f.min !== undefined && f.max !== undefined && f.min > f.max) {
      errors.push(`Field "${f.key}": min is above max.`);
    }
  }
  if (players > 1) errors.push("Only one players field per category.");
  for (const f of fields) {
    if (f.type !== "splits") continue;
    const count = f.count ?? 0;
    if (!Number.isInteger(count) || count < 2 || count > 12) errors.push(`Splits "${f.key}" needs a count from 2 to 12.`);
    if (f.of) {
      const total = byKey.get(f.of);
      if (!total || total.type !== "time") errors.push(`Splits "${f.key}" must add up to a time field.`);
    } else if (f.autoLast) {
      errors.push(`Splits "${f.key}" can only fill the last split if it adds up to a time field.`);
    }
    if (f.countFrom && byKey.get(f.countFrom)?.type !== "choice") {
      errors.push(`Splits "${f.key}" can only take their count from a choice field.`);
    }
  }
  const score = byKey.get(t.score);
  if (!score) errors.push("Pick the field that is the score.");
  else if (!SCORE_TYPES.includes(score.type)) errors.push("The score must be a time, integer or number field.");
  if (t.direction !== "lower" && t.direction !== "higher") errors.push("Say whether lower or higher is better.");
  if (!Array.isArray(t.boardKey)) errors.push("Board key must be a list of fields.");
  else {
    const seen = new Set<string>();
    for (const k of t.boardKey) {
      const f = byKey.get(k);
      if (!f) errors.push(`Board key field "${k}" doesn't exist.`);
      else if (!KEYABLE.includes(f.type)) errors.push(`"${f.label}" can't be part of the board key.`);
      else if (k === t.score) errors.push("The score can't be part of the board key.");
      if (seen.has(k)) errors.push(`Board key lists "${k}" twice.`);
      seen.add(k);
    }
  }
  const d = t.display;
  if (d) {
    if (d.home && !["tower", "sessions", "none"].includes(d.home)) errors.push("Display: unknown home placement.");
    if (d.rating && byKey.get(d.rating)?.type !== "integer" && byKey.get(d.rating)?.type !== "number") {
      errors.push("Display: the rating must be a number field.");
    }
  }
  return { ok: errors.length === 0, errors };
}

export function fieldLabel(f: { label: string; labelEs?: string }, lang: string): string {
  return lang === "es" && f.labelEs ? f.labelEs : f.label;
}

export function scoreField(t: ModeTemplate): FieldDef {
  const f = t.fields.find((x) => x.key === t.score);
  if (!f) throw new Error("template without score field");
  return f;
}

export function playersField(t: ModeTemplate): FieldDef | undefined {
  return t.fields.find((f) => f.type === "players");
}

/** Board key as a stable string: `track=12|cc=3|route=5`, players → participant count. */
export function boardKeyOf(t: ModeTemplate, values: Values, participantCount: number): string {
  return t.boardKey
    .map((k) => {
      const f = t.fields.find((x) => x.key === k);
      if (!f) return `${k}=`;
      if (f.type === "players") return `${k}=${participantCount}`;
      const v = values[k];
      if (v === undefined || v === null || v === "") return `${k}=`;
      if (f.type === "boolean") return `${k}=${v ? 1 : 0}`;
      if (f.type === "text") return `${k}=${String(v).trim().toLowerCase()}`;
      return `${k}=${v}`;
    })
    .join("|");
}

export function parseBoardKey(key: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of key.split("|")) {
    if (!part) continue;
    const i = part.indexOf("=");
    out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

export interface CatalogItemLite {
  id: number;
  slug: string;
  name: string;
  nameEs?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface ValueContext {
  /** catalog key → items */
  catalogs: Record<string, CatalogItemLite[]>;
}

export interface ValueCheck {
  ok: boolean;
  errors: string[];
  values: Values;
  score: number | null;
}

/** Split count for a record: fixed, or from the chosen item (DK Spaceport has 6 sections). */
export function splitCount(f: FieldDef, values: Values, ctx: ValueContext, t: ModeTemplate): number {
  if (f.countFrom) {
    const src = t.fields.find((x) => x.key === f.countFrom);
    const id = values[f.countFrom];
    if (src?.catalog && id !== undefined) {
      const item = ctx.catalogs[src.catalog]?.find((i) => i.id === Number(id));
      const n = Number(item?.meta?.splits);
      if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
    }
  }
  return f.count ?? 3;
}

/**
 * Normalise raw form values (strings from inputs) into stored values and check them.
 * time → ms, integer/number → number, choice → item id, splits → (ms|null)[], date → ISO date.
 */
export function validateValues(
  t: ModeTemplate,
  raw: Record<string, unknown>,
  ctx: ValueContext,
  participantCount: number,
): ValueCheck {
  const errors: string[] = [];
  const values: Values = {};
  for (const f of t.fields) {
    if (f.type === "players") {
      const min = f.min ?? 1;
      const max = f.max ?? 4;
      if (participantCount < min || participantCount > max) {
        errors.push(`${f.label}: ${min === max ? min : `${min} to ${max}`} needed.`);
      }
      continue;
    }
    if (f.type === "splits") continue; // after the total is known
    const r = raw[f.key];
    const empty = r === undefined || r === null || (typeof r === "string" && r.trim() === "");
    const required = f.required || f.key === t.score || t.boardKey.includes(f.key);
    if (empty) {
      if (f.type === "boolean") {
        values[f.key] = false;
        continue;
      }
      if (required) errors.push(`${f.label} is missing.`);
      continue;
    }
    switch (f.type) {
      case "time": {
        const ms = typeof r === "number" ? r : parseTime(String(r), f.precision ?? "ms");
        if (ms === null || ms <= 0) errors.push(`${f.label}: not a time.`);
        else values[f.key] = ms;
        break;
      }
      case "integer":
      case "number": {
        const n = typeof r === "number" ? r : Number(String(r).replace(",", ".").replace(/[\s ]/g, ""));
        if (!Number.isFinite(n) || (f.type === "integer" && !Number.isInteger(n))) {
          errors.push(`${f.label}: not a ${f.type === "integer" ? "whole number" : "number"}.`);
        } else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
          errors.push(`${f.label}: out of range.`);
        } else values[f.key] = n;
        break;
      }
      case "text": {
        const s = String(r).trim().slice(0, 500);
        values[f.key] = s;
        break;
      }
      case "choice": {
        const items = ctx.catalogs[f.catalog ?? ""] ?? [];
        const id = Number(r);
        const item = items.find((i) => i.id === id) ?? items.find((i) => i.slug === String(r));
        if (!item) errors.push(`${f.label}: pick one from the list.`);
        else values[f.key] = item.id;
        break;
      }
      case "boolean":
        values[f.key] = r === true || r === "true" || r === "on" || r === "1" || r === 1;
        break;
      case "date": {
        const s = String(r);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) errors.push(`${f.label}: not a date.`);
        else values[f.key] = s;
        break;
      }
    }
  }
  for (const f of t.fields) {
    if (f.type !== "splits") continue;
    const r = raw[f.key];
    if (!Array.isArray(r)) continue;
    const n = splitCount(f, values, ctx, t);
    const parsed: (number | null)[] = [];
    for (let i = 0; i < n; i++) {
      const v = r[i];
      if (v === undefined || v === null || v === "") parsed.push(null);
      else {
        const ms = typeof v === "number" ? v : parseTime(String(v));
        if (ms === null || ms <= 0) {
          errors.push(`${f.label} ${i + 1}: not a time.`);
          parsed.push(null);
        } else parsed.push(ms);
      }
    }
    const total = f.of ? (values[f.of] as number | undefined) : undefined;
    if (f.autoLast && total !== undefined && n >= 2 && parsed[n - 1] === null) {
      const known = parsed.slice(0, n - 1);
      if (known.every((x) => x !== null)) {
        const rest = total - known.reduce<number>((a, b) => a + (b ?? 0), 0);
        if (rest > 0) parsed[n - 1] = rest;
        else errors.push(`${f.label}: the splits add up to more than the total.`);
      }
    }
    if (total !== undefined && parsed.every((x) => x !== null)) {
      const sum = parsed.reduce<number>((a, b) => a + (b ?? 0), 0);
      if (Math.abs(sum - total) > 2) errors.push(`${f.label}: they add up to ${sum} ms, the total is ${total} ms.`);
    }
    if (parsed.some((x) => x !== null)) values[f.key] = parsed;
  }
  const sv = values[t.score];
  const score = typeof sv === "number" ? sv : null;
  return { ok: errors.length === 0, errors, values, score };
}

/** Replace {field} placeholders with already-formatted text. */
export function fillPattern(pattern: string, get: (key: string) => string): string {
  return pattern.replace(/\{([a-z0-9_]+)\}/g, (_, k: string) => get(k)).replace(/\s+/g, " ").trim();
}
