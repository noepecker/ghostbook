// Times are stored as integer milliseconds everywhere. These helpers are the only
// place that turns them into text and back.

export type Precision = "ms" | "s";

const MINUS = "−"; // typographic minus, same width as "+" in tabular figures

/** Digits typed on a phone keypad → canonical text. `147382` → `1:47.382`. */
export function digitsToTime(input: string, precision: Precision = "ms"): string {
  const d = input.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!d) return "";
  if (precision === "ms") {
    const p = d.padStart(6, "0");
    const ms = p.slice(-3);
    const s = p.slice(-5, -3);
    const rest = p.slice(0, -5); // minutes, or hours+minutes when longer than 2
    if (rest.length > 2) {
      const h = rest.slice(0, -2);
      const m = rest.slice(-2);
      return `${Number(h)}:${m}:${s}.${ms}`;
    }
    return `${Number(rest)}:${s}.${ms}`;
  }
  const p = d.padStart(3, "0");
  const s = p.slice(-2);
  const rest = p.slice(0, -2);
  if (rest.length > 2) {
    return `${Number(rest.slice(0, -2))}:${rest.slice(-2)}:${s}`;
  }
  return `${Number(rest)}:${s}`;
}

/**
 * Parse anything a player might type or a site might print:
 * `1:47.382`, `147382` (digits only), `47.382`, `2:41:08`, `1'47"342` (mkwrs), `1:47,382`.
 * Returns milliseconds, or null when the text is not a time.
 */
export function parseTime(input: string, precision: Precision = "ms"): number | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return parseTime(digitsToTime(raw, precision), precision);

  // mkwrs.com prints 1'47"342
  const mk = raw.match(/^(?:(\d+)')?(\d{1,2})"(\d{1,3})$/);
  if (mk) {
    const [, m, s, ms] = mk;
    if (Number(s) > 59 && m) return null;
    return Number(m ?? 0) * 60000 + Number(s) * 1000 + Number(ms.padEnd(3, "0"));
  }

  const t = raw.replace(",", ".");
  const m = t.match(/^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) {
    const secOnly = t.match(/^(\d+)(?:\.(\d{1,3}))?$/);
    if (!secOnly) return null;
    return Number(secOnly[1]) * 1000 + Number((secOnly[2] ?? "0").padEnd(3, "0"));
  }
  const [, a, b, c] = m;
  const f = (m[4] ?? "0").padEnd(3, "0");
  let h = 0;
  let min = 0;
  if (a !== undefined && b !== undefined) {
    h = Number(a);
    min = Number(b);
  } else if (a !== undefined) {
    min = Number(a);
  }
  const sec = Number(c);
  // with a colon, seconds (and minutes under hours) must be two-digit sane values
  if ((a !== undefined && sec > 59) || (b !== undefined && min > 59)) return null;
  return ((h * 60 + min) * 60 + sec) * 1000 + Number(f);
}

/** `125917` → `2:05.917`; seconds precision drops the milliseconds; hours when needed. */
export function formatTime(ms: number, precision: Precision = "ms"): string {
  const neg = ms < 0;
  let v = Math.abs(Math.round(ms));
  if (precision === "s") v = Math.floor(v / 1000) * 1000;
  const h = Math.floor(v / 3600000);
  const m = Math.floor((v % 3600000) / 60000);
  const s = Math.floor((v % 60000) / 1000);
  const x = v % 1000;
  const tail = precision === "ms" ? `.${String(x).padStart(3, "0")}` : "";
  const body = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${tail}`
    : `${m}:${String(s).padStart(2, "0")}${tail}`;
  return (neg ? MINUS : "") + body;
}

/** Split times read better without a leading `0:`: `53.402`, but `1:13.585` over a minute. */
export function formatSplit(ms: number): string {
  if (Math.abs(ms) < 60000) {
    const v = Math.abs(Math.round(ms));
    return `${ms < 0 ? MINUS : ""}${Math.floor(v / 1000)}.${String(v % 1000).padStart(3, "0")}`;
  }
  return formatTime(ms);
}

/** Signed delta for tables: `−0.533`, `+2.507`, `+1:02.345`. Zero prints `±0.000`. */
export function formatDelta(ms: number, precision: Precision = "ms"): string {
  if (ms === 0) return precision === "ms" ? "±0.000" : "±0:00";
  const sign = ms < 0 ? MINUS : "+";
  const abs = Math.abs(ms);
  if (precision === "ms" && abs < 60000) {
    return sign + formatSplit(abs);
  }
  return sign + formatTime(abs, precision);
}

/** Signed delta for plain numbers (rounds, points, MMR). */
export function formatNumberDelta(n: number): string {
  if (n === 0) return "±0";
  return (n < 0 ? MINUS : "+") + formatInt(Math.abs(n));
}

/** Thousands with a narrow no-break space, the way timing sheets print them: `11 240`. */
export function formatInt(n: number): string {
  const s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  return (n < 0 ? MINUS : "") + s;
}
