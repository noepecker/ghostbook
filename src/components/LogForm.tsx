"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addCatalogItem, createRecord, updateRecord } from "@/actions/records";
import { toLocalInput, valuesToRaw } from "@/lib/edit";
import { fmtDate, makeT, type Lang } from "@/lib/i18n/dict";
import { gap, splitStates, type SplitState } from "@/lib/pb";
import {
  boardKeyOf,
  fieldLabel,
  fillPattern,
  parseBoardKey,
  splitCount,
  type CatalogItemLite,
  type FieldDef,
  type ModeTemplate,
  type Values,
} from "@/lib/template";
import { digitsToTime, formatDelta, formatInt, formatNumberDelta, formatSplit, formatTime, parseTime } from "@/lib/time";
import { fileSize, uploadProof, type PendingFile } from "@/lib/upload-client";
import { Glyphs } from "./Bits";
import { Picker } from "./Picker";
import { ProofPicker } from "./ProofPicker";

export interface LogMode {
  id: number;
  name: string;
  nameEs: string | null;
  template: ModeTemplate;
}
export interface LogCatalog {
  id: number;
  key: string;
  name: string;
  nameEs: string | null;
  items: CatalogItemLite[];
}
export interface LogUser {
  id: number;
  code: string;
  displayName: string;
}
/** A stored record to edit instead of logging a new one. */
export interface EditSeed {
  recordId: number;
  modeId: number;
  values: Values;
  parts: Part[];
  playedAt: string;
  notes: string;
  proofs: { id: number; kind: "image" | "video"; name: string; size: number; durationMs: number | null }[];
}
export interface BoardRef {
  score: number;
  splits?: (number | null)[] | null;
  holder?: string;
}

interface Props {
  lang: Lang;
  games: { slug: string; name: string; shortCode: string }[];
  gameSlug: string;
  gameShort: string;
  modes: LogMode[];
  catalogs: Record<string, LogCatalog>;
  users: LogUser[];
  meId: number;
  /** modeId → boardKey → my PB (+ my best splits) */
  pbs: Record<number, Record<string, BoardRef>>;
  /** modeId → boardKey → world record */
  wrs: Record<number, Record<string, BoardRef>>;
  /** catalog key → item ids I used most recently */
  recent: Record<string, number[]>;
  /** game slugs I logged most recently */
  recentGames: string[];
  initialModeId: number | null;
  initialKey: string | null;
  edit?: EditSeed;
}

type Raw = Record<string, string | boolean | string[]>;
export interface Part {
  userId: number | null;
  guestName: string | null;
  stats: Record<string, string>;
}

const MEMORY = (modeId: number) => `gb:last:${modeId}`;

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function itemText(i: CatalogItemLite | undefined, lang: Lang): string {
  if (!i) return "";
  return lang === "es" && i.nameEs ? i.nameEs : i.name;
}

export function LogForm(props: Props) {
  const { lang, modes, users, meId } = props;
  const t = makeT(lang);
  const router = useRouter();
  const [catalogs, setCatalogs] = useState(props.catalogs);
  const editing = props.edit ?? null;
  const [modeId, setModeId] = useState<number | null>(editing?.modeId ?? props.initialModeId ?? modes[0]?.id ?? null);
  const mode = modes.find((m) => m.id === modeId) ?? null;
  const tpl = mode?.template ?? null;
  const [raw, setRaw] = useState<Raw>(() => (editing && tpl ? valuesToRaw(tpl, editing.values) : {}));
  const [parts, setParts] = useState<Part[]>(() => editing?.parts ?? [{ userId: meId, guestName: null, stats: {} }]);
  const [playedAt, setPlayedAt] = useState(() => (editing ? toLocalInput(editing.playedAt) : localNow()));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [dropProofs, setDropProofs] = useState<number[]>([]);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [comboOpen, setComboOpen] = useState(!!editing);
  const [guest, setGuest] = useState("");

  const ctxCatalogs = useMemo(() => Object.fromEntries(Object.entries(catalogs).map(([k, c]) => [k, c.items])), [catalogs]);

  // restore the last combo for this category (or apply the board we came from)
  useEffect(() => {
    if (!tpl || !mode || editing) return;
    const next: Raw = {};
    for (const f of tpl.fields) {
      if (f.type === "choice" && f.default !== undefined) {
        const it = catalogs[f.catalog ?? ""]?.items.find((i) => i.slug === f.default);
        if (it) next[f.key] = String(it.id);
      }
      if ((f.type === "integer" || f.type === "number") && typeof f.default === "number") next[f.key] = String(f.default);
    }
    let restoredParts: Part[] | null = null;
    try {
      const mem = JSON.parse(localStorage.getItem(MEMORY(mode.id)) ?? "null") as { values?: Raw; parts?: Part[] } | null;
      if (mem?.values) {
        for (const f of tpl.fields) {
          const v = mem.values[f.key];
          if (v === undefined) continue;
          if (f.type === "choice" && catalogs[f.catalog ?? ""]?.items.some((i) => String(i.id) === v)) next[f.key] = v;
          if (f.type === "boolean" && typeof v === "boolean") next[f.key] = v;
        }
      }
      if (mem?.parts?.length) restoredParts = mem.parts.map((p) => ({ ...p, stats: {} }));
    } catch {
      /* ignore */
    }
    if (props.initialKey && mode.id === props.initialModeId) {
      const kp = parseBoardKey(props.initialKey);
      for (const [k, v] of Object.entries(kp)) {
        const f = tpl.fields.find((x) => x.key === k);
        if (f && f.type !== "players" && v !== "") next[k] = f.type === "boolean" ? v === "1" : v;
      }
    }
    setRaw(next);
    setParts(restoredParts ?? [{ userId: meId, guestName: null, stats: {} }]);
    setErrors([]);
    setComboOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeId]);

  if (!mode || !tpl) {
    return (
      <section>
        <p className="empty-note">{t("log.noModes")}</p>
      </section>
    );
  }

  const playersF = tpl.fields.find((f) => f.type === "players");
  const participantCount = playersF ? parts.length : 1;
  const scoreF = tpl.fields.find((f) => f.key === tpl.score)!;

  // values as they'd be stored, for the board key and the live delta
  const stored: Values = {};
  for (const f of tpl.fields) {
    const v = raw[f.key];
    if (v === undefined || v === "") continue;
    if (f.type === "choice") stored[f.key] = Number(v);
    else if (f.type === "boolean") stored[f.key] = !!v;
    else stored[f.key] = v;
  }
  const keyComplete = tpl.boardKey.every((k) => {
    const f = tpl.fields.find((x) => x.key === k);
    return f?.type === "players" ? participantCount > 0 : stored[k] !== undefined;
  });
  const boardKey = keyComplete ? boardKeyOf(tpl, stored, participantCount) : null;
  const pb = boardKey ? props.pbs[mode.id]?.[boardKey] : undefined;
  const wr = boardKey ? props.wrs[mode.id]?.[boardKey] : undefined;
  const scoreRaw = typeof raw[tpl.score] === "string" ? (raw[tpl.score] as string) : "";
  const score =
    scoreF.type === "time"
      ? scoreRaw.length >= 4
        ? parseTime(scoreRaw, scoreF.precision ?? "ms")
        : null
      : scoreRaw !== "" && Number.isFinite(Number(scoreRaw))
        ? Number(scoreRaw)
        : null;
  const fmtScore = (v: number) => (scoreF.type === "time" ? formatTime(v, scoreF.precision ?? "ms") : formatInt(v));
  const fmtGap = (g: number) => (scoreF.type === "time" ? formatDelta(g, scoreF.precision ?? "ms") : formatNumberDelta(tpl.direction === "higher" ? -g : g));

  // splits
  const splitsF = tpl.fields.find((f) => f.type === "splits");
  const nSplits = splitsF ? splitCount(splitsF, stored, { catalogs: ctxCatalogs }, tpl) : 0;
  const splitRaw = (splitsF && Array.isArray(raw[splitsF.key]) ? (raw[splitsF.key] as string[]) : []).slice(0, nSplits);
  const splitVals = Array.from({ length: nSplits }, (_, i) => (splitRaw[i] ? parseTime(splitRaw[i]) : null));
  let autoLast: number | null = null;
  if (splitsF?.autoLast && score !== null && nSplits >= 2 && !splitRaw[nSplits - 1] && splitVals.slice(0, -1).every((x) => x !== null)) {
    const rest = score - splitVals.slice(0, -1).reduce<number>((a, b) => a + (b ?? 0), 0);
    if (rest > 0) autoLast = rest;
  }
  const allSplits = splitVals.map((v, i) => (i === nSplits - 1 && v === null ? autoLast : v));

  function set(key: string, v: string | boolean | string[]) {
    setRaw((r) => ({ ...r, [key]: v }));
  }

  async function addItem(f: FieldDef, name: string) {
    const cat = catalogs[f.catalog ?? ""];
    if (!cat) return;
    const res = await addCatalogItem(cat.id, name);
    if (!res.ok) {
      setErrors([res.error]);
      return;
    }
    setCatalogs((c) => ({
      ...c,
      [cat.key]: { ...cat, items: cat.items.some((i) => i.id === res.item.id) ? cat.items : [...cat.items, res.item] },
    }));
    set(f.key, String(res.item.id));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!mode || !tpl) return;
    setSaving(true);
    setErrors([]);
    const values: Record<string, unknown> = {};
    for (const f of tpl.fields) {
      if (f.type === "players") continue;
      const v = raw[f.key];
      if (f.type === "splits") values[f.key] = Array.isArray(v) ? v.slice(0, nSplits) : [];
      else if (v !== undefined) values[f.key] = v;
    }
    const input = {
      modeId: mode.id,
      values,
      participants: playersF ? parts : [{ userId: meId }],
      playedAt: new Date(playedAt).toISOString(),
      notes,
    };
    const res = editing ? await updateRecord(editing.recordId, { ...input, removeProofIds: dropProofs }) : await createRecord(input);
    if (!res.ok) {
      setErrors(res.errors);
      setSaving(false);
      window.scrollTo({ top: 0 });
      return;
    }
    // an edit isn't "the last combo I used", so it leaves the memory alone
    if (!editing) {
      try {
        const mem: Raw = {};
        for (const f of tpl.fields) if ((f.type === "choice" || f.type === "boolean") && raw[f.key] !== undefined) mem[f.key] = raw[f.key];
        localStorage.setItem(MEMORY(mode.id), JSON.stringify({ values: mem, parts: parts.map((p) => ({ userId: p.userId, guestName: p.guestName })) }));
      } catch {
        /* private mode */
      }
    }
    for (const f of files.filter((x) => !x.error)) {
      try {
        await uploadProof(res.id, f, (pct) => setStatus(t("log.uploading", { name: f.file.name, pct })));
      } catch (err) {
        setErrors([t("log.uploadFailed", { name: f.file.name, error: (err as Error).message })]);
        setSaving(false);
        setTimeout(() => router.push(`/r/${res.id}`), 2500);
        return;
      }
    }
    router.push(res.href);
    router.refresh();
  }

  // ---- field renderers
  const comboFields = tpl.fields.filter((f) => f.type === "choice" && !tpl.boardKey.includes(f.key) && f.key !== tpl.score);
  const comboKnown = comboFields.length > 0 && comboFields.every((f) => raw[f.key]);
  const showCombo = comboOpen || !comboKnown;

  function renderChoice(f: FieldDef) {
    const cat = catalogs[f.catalog ?? ""];
    const items = cat?.items ?? [];
    const val = typeof raw[f.key] === "string" ? (raw[f.key] as string) : "";
    const label = fieldLabel(f, lang);
    if (items.length > 0 && items.length <= 6) {
      return (
        <div className="field" key={f.key}>
          <span className="lbl" id={`l-${f.key}`}>{label}</span>
          <div className={`seg ${items.length > 4 ? "wrap" : ""}`} role="group" aria-labelledby={`l-${f.key}`}>
            {items.map((i) => (
              <button type="button" key={i.id} aria-pressed={val === String(i.id)} onClick={() => set(f.key, String(i.id))}>
                {itemText(i, lang)}
              </button>
            ))}
          </div>
        </div>
      );
    }
    const catName = cat ? (lang === "es" && cat.nameEs ? cat.nameEs : cat.name) : label;
    return (
      <div className="field" key={f.key}>
        <span className="lbl" id={`l-${f.key}`}>{label}</span>
        <Picker
          lang={lang}
          label={label}
          what={catName.toLowerCase()}
          labelledBy={`l-${f.key}`}
          options={items.map((i) => ({
            id: String(i.id),
            label: itemText(i, lang),
            sub: typeof i.meta?.cup === "string" ? (i.meta.cup as string) : undefined,
            aliases: [i.name, i.nameEs ?? ""].filter((x) => x && x !== itemText(i, lang)),
          }))}
          value={val || null}
          onPick={(id) => set(f.key, id)}
          recent={(props.recent[f.catalog ?? ""] ?? []).map(String)}
          onAdd={cat ? (n) => addItem(f, n) : undefined}
        />
      </div>
    );
  }

  function renderField(f: FieldDef) {
    const label = fieldLabel(f, lang);
    const val = typeof raw[f.key] === "string" ? (raw[f.key] as string) : "";
    switch (f.type) {
      case "choice":
        return comboFields.includes(f) ? null : renderChoice(f);
      case "time": {
        const isScore = f.key === tpl!.score;
        const prec = f.precision ?? "ms";
        return (
          <div className="field" key={f.key}>
            <label htmlFor={`f-${f.key}`}>{label}</label>
            <input
              id={`f-${f.key}`}
              className={`timein t ${isScore ? "" : "mid"}`}
              inputMode="numeric"
              autoComplete="off"
              placeholder={prec === "ms" ? "0:00.000" : "0:00:00"}
              value={val}
              onChange={(e) => set(f.key, digitsToTime(e.target.value, prec))}
            />
            <p className="hint">{prec === "ms" ? t("log.digitsHint", { example: "147382 → 1:47.382" }) : t("log.digitsHintS")}</p>
            {isScore && deltaBox()}
          </div>
        );
      }
      case "integer":
      case "number": {
        const isScore = f.key === tpl!.score;
        return (
          <div className="field" key={f.key}>
            <label htmlFor={`f-${f.key}`}>{label}</label>
            <input
              id={`f-${f.key}`}
              className={isScore ? "timein t mid" : "input t"}
              inputMode={f.type === "integer" ? "numeric" : "decimal"}
              autoComplete="off"
              value={val}
              min={f.min}
              max={f.max}
              onChange={(e) => set(f.key, f.type === "integer" ? e.target.value.replace(/\D/g, "") : e.target.value.replace(/[^\d.,-]/g, ""))}
            />
            {isScore && deltaBox()}
          </div>
        );
      }
      case "text":
        return (
          <div className="field" key={f.key}>
            <label htmlFor={`f-${f.key}`}>{label}</label>
            <input id={`f-${f.key}`} className="input" value={val} maxLength={200} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        );
      case "boolean":
        return (
          <div className="field" key={f.key}>
            <label className="check">
              <input type="checkbox" checked={!!raw[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
              {label}
            </label>
          </div>
        );
      case "date":
        return (
          <div className="field" key={f.key}>
            <label htmlFor={`f-${f.key}`}>{label}</label>
            <input id={`f-${f.key}`} type="date" className="input" value={val} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        );
      case "splits": {
        const arr = Array.isArray(raw[f.key]) ? (raw[f.key] as string[]) : [];
        return (
          <div className="field" key={f.key}>
            <span className="lbl">{t("log.splitsLabel", { label })}</span>
            <div className="splitsin" style={nSplits > 3 ? { gridTemplateColumns: `repeat(${Math.min(nSplits, 4)}, 1fr)` } : undefined}>
              {Array.from({ length: nSplits }, (_, i) => {
                const isAuto = i === nSplits - 1 && !arr[i] && autoLast !== null;
                return (
                  <input
                    key={i}
                    className={`t ${isAuto ? "auto" : ""}`}
                    inputMode="numeric"
                    aria-label={`${label} ${i + 1}`}
                    placeholder={isAuto ? formatSplit(autoLast as number) : ""}
                    value={arr[i] ?? ""}
                    onChange={(e) => {
                      const next = [...arr];
                      while (next.length < nSplits) next.push("");
                      const d = e.target.value.replace(/\D/g, "");
                      next[i] = d ? digitsToTime(d).replace(/^0:/, "") : "";
                      set(f.key, next);
                    }}
                  />
                );
              })}
            </div>
            {f.autoLast && <p className="hint">{t("log.splitsHint")}</p>}
          </div>
        );
      }
      case "players":
        return <div key={f.key}>{playersField(f)}</div>;
    }
  }

  function deltaBox() {
    if (score === null) {
      return (
        <div className="delta n t">
          <span>–</span>
          <small>{pb ? t("log.pbRef", { value: fmtScore(pb.score) }) : boardKey ? t("log.firstOnBoard") : t("log.incomplete")}</small>
        </div>
      );
    }
    if (!pb) {
      return (
        <div className="delta n t">
          <span>–</span>
          <small>{t("log.firstOnBoard")}</small>
        </div>
      );
    }
    const g = gap(score, pb.score, tpl!.direction);
    return (
      <div className={`delta t ${g < 0 ? "g" : "y"}`} aria-live="polite">
        <span>{fmtGap(g)}</span>
        <small>
          {t("log.pbRef", { value: fmtScore(pb.score) })} · {g < 0 ? t("log.newPb") : t("log.notPb")}
        </small>
      </div>
    );
  }

  function playersField(f: FieldDef) {
    const label = fieldLabel(f, lang);
    const stats = f.stats ?? [];
    const toggle = (u: LogUser) => {
      setParts((ps) => (ps.some((p) => p.userId === u.id) ? ps.filter((p) => p.userId !== u.id) : [...ps, { userId: u.id, guestName: null, stats: {} }]));
    };
    return (
      <div className="field">
        <span className="lbl" id={`l-${f.key}`}>
          {label} · {parts.length}
          {f.max ? `/${f.max}` : ""}
        </span>
        <div className="chips" role="group" aria-labelledby={`l-${f.key}`}>
          {users.map((u) => (
            <button type="button" key={u.id} aria-pressed={parts.some((p) => p.userId === u.id)} onClick={() => toggle(u)}>
              <b style={{ fontStretch: "125%", fontWeight: 800, marginRight: 6 }}>{u.code}</b>
              {u.displayName}
            </button>
          ))}
          {parts
            .filter((p) => !p.userId)
            .map((p) => (
              <button type="button" key={`g-${p.guestName}`} aria-pressed onClick={() => setParts((ps) => ps.filter((x) => x !== p))}>
                {p.guestName}
              </button>
            ))}
        </div>
        <div className="guest">
          <input
            className="input"
            placeholder={t("log.addGuest")}
            aria-label={t("log.addGuest")}
            value={guest}
            maxLength={40}
            onChange={(e) => setGuest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGuest();
              }
            }}
          />
          <button type="button" className="btn ghost" onClick={addGuest}>
            {t("log.addGuestButton")}
          </button>
        </div>
        {stats.length > 0 && parts.length > 0 && (
          <div className="pstats" style={{ ["--stats" as string]: stats.length }}>
            <div className="row head">
              <span />
              <span />
              {stats.map((s) => (
                <span key={s.key}>{fieldLabel(s, lang).toUpperCase()}</span>
              ))}
            </div>
            {parts.map((p, i) => {
              const u = p.userId ? users.find((x) => x.id === p.userId) : null;
              const name = u?.displayName ?? p.guestName ?? "";
              return (
                <div className="row" key={i}>
                  <b className="tla">{u?.code ?? (p.guestName ?? "").slice(0, 3).toUpperCase()}</b>
                  <span>{name}</span>
                  {stats.map((s) => (
                    <input
                      key={s.key}
                      inputMode="numeric"
                      className="t"
                      aria-label={`${name} ${fieldLabel(s, lang)}`}
                      value={p.stats[s.key] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        setParts((ps) => ps.map((x, j) => (j === i ? { ...x, stats: { ...x.stats, [s.key]: v } } : x)));
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function addGuest() {
    const g = guest.trim();
    if (!g) return;
    setParts((ps) => (ps.some((p) => p.guestName?.toLowerCase() === g.toLowerCase()) ? ps : [...ps, { userId: null, guestName: g, stats: {} }]));
    setGuest("");
  }

  // ---- preview
  const itemById = (catKey: string | undefined, id: unknown) => catalogs[catKey ?? ""]?.items.find((i) => String(i.id) === String(id));
  const textOf = (k: string): string => {
    const f = tpl.fields.find((x) => x.key === k);
    if (!f) return "";
    if (f.type === "choice") return itemText(itemById(f.catalog, raw[k]), lang);
    if (f.type === "players") return String(participantCount);
    const v = raw[k];
    return typeof v === "string" ? v : "";
  };
  const firstChoice = tpl.boardKey.map((k) => tpl.fields.find((f) => f.key === k)).find((f) => f?.type === "choice");
  const title = tpl.display?.title ? fillPattern(tpl.display.title, textOf) : firstChoice ? textOf(firstChoice.key) : lang === "es" && mode.nameEs ? mode.nameEs : mode.name;
  const rest = tpl.boardKey
    .map((k) => tpl.fields.find((f) => f.key === k))
    .filter((f): f is FieldDef => !!f && f !== firstChoice && f.type === "choice")
    .map((f) => {
      const it = itemById(f.catalog, raw[f.key]);
      return it?.meta?.quiet ? "" : ((it?.meta?.short as string) ?? itemText(it, lang));
    })
    .filter(Boolean)
    .join(" · ");
  const states: SplitState[] = splitsF ? splitStates(allSplits, pb?.splits ?? [], wr?.splits && wr.splits.length === nSplits ? wr.splits : null) : [];
  const saveText = score !== null ? fmtScore(score) : "–";
  const wrGap = wr && score !== null ? gap(score, wr.score, tpl.direction) : null;
  const pbGap = pb && score !== null ? gap(score, pb.score, tpl.direction) : null;
  const isTower = tpl.display?.home === "tower";

  const logTitle = editing
    ? t("log.editTitle")
    : scoreF.type === "time"
      ? t("log.title")
      : lang === "es"
        ? `Apuntar: ${mode.nameEs ?? mode.name}`
        : `Log: ${mode.name}`;
  const keptProofs = editing ? editing.proofs.filter((p) => !dropProofs.includes(p.id)) : [];
  const hasClip = keptProofs.some((p) => p.kind === "video") || files.some((f) => f.kind === "video" && !f.error);
  const hasShot = keptProofs.length > 0 || files.some((f) => !f.error);
  const gameName = props.games.find((g) => g.slug === props.gameSlug)?.name ?? props.gameShort;

  return (
    <section aria-labelledby="h-log">
      <Glyphs />
      <div className="logwrap">
        <form className="form edge" onSubmit={save} noValidate>
          <h2 id="h-log">{logTitle}</h2>
          {errors.length > 0 && (
            <div className="errors" role="alert">
              <b>{t("log.errors")}</b>
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {editing ? (
            <p className="kicker" style={{ marginTop: -8, marginBottom: 20 }}>
              {gameName} · {lang === "es" && mode.nameEs ? mode.nameEs : mode.name}
            </p>
          ) : (
            <>
              <div className="field">
                <span className="lbl" id="l-game">{t("log.game")}</span>
                <Picker
                  lang={lang}
                  label={t("log.game")}
                  what={t("picker.games")}
                  labelledBy="l-game"
                  chips={4}
                  options={props.games.map((g) => ({ id: g.slug, label: g.name, sub: g.shortCode, aliases: [g.shortCode] }))}
                  value={props.gameSlug}
                  recent={props.recentGames}
                  onPick={(slug) => slug !== props.gameSlug && router.push(`/log?game=${slug}`)}
                />
              </div>

              <div className="field">
                <span className="lbl" id="l-what">{t("log.what")}</span>
                <div className={`seg ${modes.length > 4 ? "wrap" : ""}`} role="group" aria-labelledby="l-what">
                  {modes.map((m) => (
                    <button type="button" key={m.id} aria-pressed={m.id === mode.id} onClick={() => setModeId(m.id)}>
                      {lang === "es" && m.nameEs ? m.nameEs : m.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tpl.fields.map(renderField)}

          {comboFields.length > 0 && (
            <div className="field">
              {!showCombo ? (
                <>
                  <span className="lbl">{editing ? t("log.comboEdit") : t("log.combo")}</span>
                  <div className="comboin">
                    <span>{comboFields.map((f) => itemText(itemById(f.catalog, raw[f.key]), lang)).join(" · ")}</span>
                    <button type="button" onClick={() => setComboOpen(true)}>
                      {t("log.change")}
                    </button>
                  </div>
                </>
              ) : (
                comboFields.map((f) => renderChoice(f))
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="played">{t("log.playedAt")}</label>
            <input id="played" type="datetime-local" className="input" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="notes">{t("log.notes")}</label>
            <textarea id="notes" className="input" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="field">
            <span className="lbl">{t("log.proof")}</span>
            {editing && editing.proofs.length > 0 && (
              <ul className="files kept" aria-label={t("log.proofOnFile")}>
                {editing.proofs.map((p) => {
                  const gone = dropProofs.includes(p.id);
                  return (
                    <li key={p.id} className={gone ? "gone" : ""}>
                      <b>{p.kind === "video" ? t("proof.clip").toUpperCase() : t("proof.shot").toUpperCase()}</b>
                      <span title={p.name}>
                        {gone
                          ? t("log.proofWillGo", { name: p.name })
                          : `${p.name} · ${fileSize(p.size)}${p.durationMs ? ` · ${Math.round(p.durationMs / 1000)} s` : ""}`}
                      </span>
                      <button
                        type="button"
                        className="linkish"
                        aria-pressed={gone}
                        onClick={() => setDropProofs((d) => (gone ? d.filter((x) => x !== p.id) : [...d, p.id]))}
                      >
                        {gone ? t("log.keep") : t("log.remove")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <ProofPicker lang={lang} files={files} onChange={setFiles} />
          </div>

          {status && <p className="hint" role="status">{status}</p>}
          <button type="submit" className="save" disabled={saving}>
            <span>{saving ? t("log.saving") : editing ? t("log.saveChanges") : t("log.save")}</span>
            <span className="t">{saveText}</span>
          </button>
          {editing && (
            <p className="hint" style={{ marginTop: 12 }}>
              <Link href={`/r/${editing.recordId}`}>{t("log.cancelEdit")}</Link>
            </p>
          )}
        </form>

        <div className="preview" aria-live="polite">
          <h3>{t("log.preview")}</h3>
          {isTower ? (
            <div className="tower" role="table" aria-label={t("log.preview")}>
              <div className="tr" role="row">
                <span className="pos">1</span>
                <span className="trk">
                  {title || "–"}
                  {rest && <span className="ccm">{rest}</span>}
                </span>
                <span className="cc">{rest}</span>
                {splitsF ? (
                  <span className="secs">
                    {allSplits.map((v, i) => (
                      <i key={i} className={v === null ? "" : { wr: "P", pb: "G", slow: "Y", none: "" }[states[i]]} style={{ flex: v ?? (score ?? 60000) / Math.max(1, nSplits) }} />
                    ))}
                  </span>
                ) : (
                  <span className="secs empty" />
                )}
                <span className="time t">{saveText}</span>
                <span className={`num dpb t ${pbGap !== null ? (pbGap < 0 ? "pb" : "slow") : "dim"}`}>{pbGap !== null ? fmtGap(pbGap) : "–"}</span>
                <span className={`num dwr t ${wrGap === null ? "dim" : wrGap < 0 ? "wr" : ""}`}>{wrGap !== null ? fmtGap(wrGap) : "–"}</span>
                <span className="date">{editing ? fmtDate(new Date(playedAt), lang, "day") : t("log.today")}</span>
                <span className="prf">{hasClip ? t("proof.clip") : hasShot ? t("proof.shot") : "–"}</span>
              </div>
            </div>
          ) : (
            <div className="sessions">
              <div className="s">
                <span className="d">{fmtDate(new Date(playedAt), lang, "weekday")}</span>
                <span className="what">{title || "–"}</span>
                <span className="res t">
                  {tpl.display?.result
                    ? fillPattern(tpl.display.result, textOf)
                    : score !== null
                      ? scoreF.type === "time"
                        ? saveText
                        : `${fieldLabel(scoreF, lang)} ${saveText}`
                      : "–"}
                </span>
                <span className="sub">
                  {props.gameShort} · {lang === "es" && mode.nameEs ? mode.nameEs : mode.name}
                  {rest && ` · ${rest}`}
                </span>
                <span className="codes">
                  {parts.map((p, i) => (
                    <b key={i}>{p.userId ? users.find((u) => u.id === p.userId)?.code : (p.guestName ?? "").slice(0, 3).toUpperCase()}</b>
                  ))}
                </span>
              </div>
            </div>
          )}
          {isTower && (
            <p>
              {wr
                ? t("log.previewNoteWr", { value: fmtScore(wr.score), holder: wr.holder ?? "" })
                : keyComplete
                  ? t("log.previewNote")
                  : null}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
