"use client";

import { useEffect, useRef, useState } from "react";
import { formatInt, formatTime, type Precision } from "@/lib/time";

export interface StepPoint {
  at: string; // ISO
  v: number;
}

interface Props {
  points: StepPoint[];
  wr: number | null;
  wrLabel: string | null;
  direction: "lower" | "higher";
  kind: "time" | "number";
  precision?: Precision;
  months: string[]; // 12 short month names for the axis, Jan first
  ariaLabel: string;
}

const INK = "#f3f2ec";
const DIM = "#a9a89e";
const RULE = "#2c2b27";
const WR = "#c260ff";
const PB = "#34d873";

const TIME_STEPS = [100, 200, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000];

function niceStep(range: number, kind: Props["kind"], target = 4): number {
  const raw = range / target;
  if (kind === "time") return TIME_STEPS.find((s) => s >= raw) ?? TIME_STEPS[TIME_STEPS.length - 1];
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

/**
 * PB progression as a step chart. A PB only changes at the moment it's set, so the line
 * holds flat and then drops (or climbs, for rounds). "Better" is always up.
 * Drawn at the real pixel width so text never scales.
 */
export function StepChart({ points, wr, wrLabel, direction, kind, precision = "ms", months, ariaLabel }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const fmt = (v: number, tick = false) =>
    kind === "time" ? (tick ? formatTime(v, "s") : formatTime(v, precision)) : formatInt(v);

  let svg: React.ReactNode = null;
  if (w > 0 && points.length > 0) {
    const W = w;
    const H = Math.max(220, Math.min(300, W * 0.42));
    const L = 8;
    const R = W < 500 ? 62 : 84;
    const T = 22;
    const B = 26;
    const times = points.map((p) => Date.parse(p.at));
    const now = Date.now();
    const first = Math.min(...times);
    const span = Math.max(now - first, 7 * 86400_000);
    const T0 = first - span * 0.04;
    const T1 = Math.max(now, times[times.length - 1]);
    const x = (t: number) => L + ((t - T0) / (T1 - T0)) * (W - L - R);
    const vals = points.map((p) => p.v);
    let lo = Math.min(...vals, ...(wr !== null ? [wr] : []));
    let hi = Math.max(...vals, ...(wr !== null ? [wr] : []));
    if (hi === lo) {
      lo -= kind === "time" ? 1000 : 2;
      hi += kind === "time" ? 1000 : 2;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    // better is up: for times the smallest value is at the top
    const y = (v: number) => (direction === "lower" ? T + ((v - lo) / (hi - lo)) * (H - T - B) : T + ((hi - v) / (hi - lo)) * (H - T - B));

    const els: React.ReactNode[] = [];
    const step = niceStep(hi - lo, kind);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const yy = y(v);
      els.push(<line key={`g${v}`} x1={L} x2={W - R} y1={yy} y2={yy} stroke={RULE} />);
      els.push(
        <text key={`gl${v}`} x={W - R + 8} y={yy + 4} fill={DIM} fontSize="12">
          {fmt(v, step >= 1000)}
        </text>,
      );
    }
    // month ticks
    const start = new Date(T0);
    const monthsList: Date[] = [];
    for (let d = new Date(start.getFullYear(), start.getMonth() + 1, 1); d.getTime() <= T1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      monthsList.push(d);
    }
    const every = Math.max(1, Math.ceil(monthsList.length / Math.max(2, Math.floor((W - L - R) / 64))));
    monthsList.forEach((d, i) => {
      if (i % every !== 0) return;
      const xx = x(d.getTime());
      const yr = d.getMonth() === 0 || i === 0 ? ` ${String(d.getFullYear()).slice(2)}` : "";
      els.push(
        <text key={`m${i}`} x={xx} y={H - 6} fill={DIM} fontSize="12">
          {months[d.getMonth()]}
          {yr}
        </text>,
      );
      els.push(<line key={`mt${i}`} x1={xx} x2={xx} y1={H - B} y2={H - B + 4} stroke={RULE} />);
    });
    if (wr !== null) {
      const yy = y(wr);
      els.push(<line key="wr" x1={L} x2={W - R} y1={yy} y2={yy} stroke={WR} strokeWidth="2" strokeDasharray="6 4" />);
      els.push(
        <text key="wrl" x={L} y={yy - 8} fill={WR} fontSize="13" fontWeight="700">
          {wrLabel}
        </text>,
      );
    }
    let d = `M${x(times[0])} ${y(vals[0])}`;
    for (let i = 1; i < points.length; i++) d += ` H${x(times[i])} V${y(vals[i])}`;
    d += ` H${x(T1)}`;
    els.push(<path key="line" d={d} fill="none" stroke={INK} strokeWidth="2.5" />);
    points.forEach((p, i) => {
      const xx = x(times[i]);
      const yy = y(p.v);
      els.push(<rect key={`p${i}`} x={xx - 3.5} y={yy - 3.5} width="7" height="7" fill={i === points.length - 1 ? PB : INK} />);
    });
    const last = points.length - 1;
    if (points.length > 1) {
      const fx = x(times[0]);
      const fy = y(vals[0]);
      els.push(
        <text key="fl" x={fx + 6} y={direction === "lower" ? fy + 20 : fy + 20} fill={INK} fontSize="13" fontWeight="700">
          {fmt(vals[0])}
        </text>,
      );
    }
    els.push(
      <text key="ll" x={x(T1)} y={y(vals[last]) - 12} textAnchor="end" fill={PB} fontSize="15" fontWeight="700">
        {fmt(vals[last])}
      </text>,
    );
    svg = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fontFamily="var(--font-archivo), Archivo, sans-serif" style={{ fontVariantNumeric: "tabular-nums" }} aria-hidden="true">
        {els}
      </svg>
    );
  }

  return (
    <div ref={host} className="chartbox" role="img" aria-label={ariaLabel}>
      {svg}
    </div>
  );
}
