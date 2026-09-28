// Turn a stored record back into what the log form holds while typing, so the same form can edit it.
import type { ModeTemplate, Values } from "./template";
import { formatSplit, formatTime } from "./time";

export type RawValues = Record<string, string | boolean | string[]>;

export function valuesToRaw(tpl: ModeTemplate, values: Values | Record<string, unknown>): RawValues {
  const raw: RawValues = {};
  for (const f of tpl.fields) {
    const v = (values as Record<string, unknown>)[f.key];
    if (v === undefined || v === null || f.type === "players") continue;
    switch (f.type) {
      case "choice":
      case "integer":
      case "number":
      case "text":
      case "date":
        if (v !== "") raw[f.key] = String(v);
        break;
      case "boolean":
        raw[f.key] = !!v;
        break;
      case "time":
        if (typeof v === "number") raw[f.key] = formatTime(v, f.precision ?? "ms");
        break;
      case "splits": {
        if (!Array.isArray(v)) break;
        const arr = v.map((x) => (typeof x === "number" ? formatSplit(x) : ""));
        // a last split that is exactly total minus the others was (or could have been) filled in
        // by the form: leave it blank so it follows the total if that gets corrected
        const total = f.of ? (values as Record<string, unknown>)[f.of] : undefined;
        if (f.autoLast && typeof total === "number" && v.length >= 2 && v.every((x) => typeof x === "number")) {
          const rest = total - (v.slice(0, -1) as number[]).reduce((a, b) => a + b, 0);
          if (rest === v[v.length - 1]) arr[arr.length - 1] = "";
        }
        raw[f.key] = arr;
        break;
      }
    }
  }
  return raw;
}

/** ISO instant → the `YYYY-MM-DDTHH:mm` a datetime-local input wants, in the browser's zone. */
export function toLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
