import type { SplitCell } from "@/lib/views";
import { formatSplit } from "@/lib/time";

const CLS = { wr: "P", pb: "G", slow: "Y", none: "" } as const;

/** Sector bars: widths are the split times, colours are the F1 states. */
export function SplitBars({ cells, label }: { cells: SplitCell[] | null; label?: string }) {
  if (!cells || cells.length === 0) return <span className="secs empty" aria-hidden="true" />;
  const aria = label ?? cells.map((c, i) => `${i + 1}: ${c.v === null ? "–" : formatSplit(c.v)} ${c.state}`).join(", ");
  const known = cells.filter((c) => c.v !== null).map((c) => c.v as number);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  return (
    <span className="secs" role="img" aria-label={aria}>
      {cells.map((c, i) => (
        <i key={i} className={CLS[c.state]} style={{ flex: c.v ?? avg }} />
      ))}
    </span>
  );
}

/** `2:05.917` with the milliseconds a weight lighter, like the broadcast graphic. */
export function BigTime({ text, className = "" }: { text: string; className?: string }) {
  const m = text.match(/^(.*?)(\.\d{3})$/);
  return (
    <div className={`bigtime t ${className}`}>
      {m ? (
        <>
          {m[1]}
          <span className="ms">{m[2]}</span>
        </>
      ) : (
        text
      )}
    </div>
  );
}

export function Glyphs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {/* bespoke glyphs: square-cornered, same 2px stroke as the rules */}
        <symbol id="g-clip" viewBox="0 0 20 20">
          <rect x="1" y="4" width="13" height="12" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M14 8l5-3v10l-5-3z" fill="currentColor" />
        </symbol>
        <symbol id="g-shot" viewBox="0 0 20 20">
          <rect x="1" y="4" width="18" height="13" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="7" y="8" width="6" height="5" fill="currentColor" />
          <rect x="4" y="1" width="5" height="3" fill="currentColor" />
        </symbol>
      </defs>
    </svg>
  );
}
