"use client";

// The one type-to-filter control for long lists.
// - <Picker>: a combobox that picks one option (log form: game, track, map, character, …).
//   The last few used stay as one-tap chips; typing opens a large-tap result list;
//   arrows / Enter / Esc on desktop; when nothing matches, "Add “…”" creates a catalog item.
// - <ListFilter>: the same input and matcher, filtering a list the server already rendered
//   (games, boards, catalog items). Rows carry data-filter="label|alias|…".

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { makeT, type Lang } from "@/lib/i18n/dict";
import { matchScore, rankItems } from "@/lib/match";

export interface PickerOption {
  id: string;
  label: string;
  /** a second line or a quiet suffix, e.g. the cup */
  sub?: string;
  aliases?: string[];
}

interface PickerProps {
  lang: Lang;
  label: string;
  /** the plural noun for the placeholder: "tracks", "games" */
  what: string;
  options: PickerOption[];
  value: string | null;
  onPick: (id: string) => void;
  /** option ids, most recent first */
  recent?: string[];
  /** how many one-tap chips to keep above the input */
  chips?: number;
  onAdd?: (text: string) => Promise<void>;
  labelledBy?: string;
}

const MAX_RESULTS = 8;

export function Picker({ lang, label, what, options, value, onPick, recent = [], chips = 5, onAdd, labelledBy }: PickerProps) {
  const t = makeT(lang);
  const uid = useId();
  const listId = `${uid}-list`;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const recentRank = useMemo(() => new Map(recent.map((id, i) => [id, i])), [recent]);

  // chips: the current value, then the most recent ones, then the first of the list
  const chipList = useMemo(() => {
    const ids: string[] = [];
    if (value && byId.has(value)) ids.push(value);
    for (const id of recent) if (ids.length < chips && byId.has(id) && !ids.includes(id)) ids.push(id);
    for (const o of options) if (ids.length < chips && !ids.includes(o.id)) ids.push(o.id);
    return ids.map((id) => byId.get(id)!);
  }, [value, recent, options, byId, chips]);

  const results = useMemo(() => {
    const ranked = rankItems(options, q, (o) => recentRank.get(o.id));
    return q.trim() ? ranked.slice(0, MAX_RESULTS) : ranked;
  }, [options, q, recentRank]);
  // "Add" only when nothing matches, so initials like "dks" don't offer to create "dks"
  const canAdd = !!onAdd && q.trim() !== "" && results.length === 0;
  const rows = results.length + (canAdd ? 1 : 0);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(id: string) {
    onPick(id);
    setQ("");
    setOpen(false);
  }
  async function add() {
    if (!onAdd || !q.trim()) return;
    setAdding(true);
    await onAdd(q.trim());
    setAdding(false);
    setQ("");
    setOpen(false);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (rows ? (a + 1) % rows : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (rows ? (a - 1 + rows) % rows : 0));
    } else if (e.key === "Enter") {
      if (!open && !q) return;
      e.preventDefault();
      if (active < results.length) pick(results[active].id);
      else if (canAdd) void add();
    } else if (e.key === "Escape") {
      if (open || q) {
        e.preventDefault();
        setQ("");
        setOpen(false);
      }
    }
  }

  const activeId = open && rows ? `${uid}-o${active}` : undefined;
  return (
    <div className="picker" ref={wrap}>
      {chipList.length > 0 && (
        <div className="chips" role="group" aria-label={label}>
          {chipList.map((o) => (
            <button type="button" key={o.id} aria-pressed={value === o.id} onClick={() => pick(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      <div className="pick-in">
        <input
          ref={input}
          className="search"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={labelledBy ? undefined : `${t("picker.search")}: ${label}`}
          aria-labelledby={labelledBy}
          autoComplete="off"
          spellCheck={false}
          placeholder={t("picker.placeholder", { what, n: options.length })}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {open && (
          <ul className="pick-list" id={listId} role="listbox" aria-label={label}>
            {results.map((o, i) => (
              <li
                key={o.id}
                id={`${uid}-o${i}`}
                role="option"
                aria-selected={value === o.id}
                className={i === active ? "on" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.id)}
              >
                <span>{o.label}</span>
                {o.sub && <small>{o.sub}</small>}
              </li>
            ))}
            {canAdd && (
              <li
                id={`${uid}-o${results.length}`}
                role="option"
                aria-selected={false}
                className={`add ${active === results.length ? "on" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(results.length)}
                onClick={() => void add()}
              >
                <span>{adding ? t("log.adding") : t("log.addItem", { name: q.trim() })}</span>
              </li>
            )}
            {rows === 0 && <li className="none" role="presentation">{t("picker.none")}</li>}
          </ul>
        )}
      </div>
      <span className="sr" aria-live="polite">
        {open && q ? t("picker.count", { n: results.length }) : ""}
      </span>
    </div>
  );
}

/**
 * Filters the rows inside `target` (a CSS selector, scoped to the parent element of this
 * control) by their data-filter attribute. Enter follows the first visible link.
 */
export function ListFilter({ lang, what, target, total }: { lang: Lang; what: string; target: string; total: number }) {
  const t = makeT(lang);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(total);
  // the rows actually on the page (toggles may render fewer than the server counted)
  const [count, setCount] = useState(total);
  const ref = useRef<HTMLInputElement>(null);

  function rowsOf(): HTMLElement[] {
    const scope = ref.current?.closest("[data-filter-scope]") ?? document;
    return [...scope.querySelectorAll<HTMLElement>(target)];
  }
  useEffect(() => {
    let n = 0;
    const rows = rowsOf();
    if (!q) setCount(rows.length);
    for (const el of rows) {
      const [label, ...aliases] = (el.dataset.filter ?? "").split("|");
      const ok = matchScore({ label, aliases }, q) !== null;
      el.hidden = !ok;
      if (ok) n++;
    }
    // hide groups (blocks) left with no visible row
    const scope = ref.current?.closest("[data-filter-scope]") ?? document;
    for (const g of scope.querySelectorAll<HTMLElement>("[data-filter-group]")) {
      const any = [...g.querySelectorAll<HTMLElement>(target)].some((r) => !r.hidden);
      g.hidden = !!q.trim() && !any;
    }
    setShown(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, target]);

  return (
    <div className="listfilter">
      <input
        ref={ref}
        className="search"
        type="search"
        role="searchbox"
        aria-label={`${t("picker.filter")}: ${what}`}
        placeholder={t("picker.placeholder", { what, n: count })}
        autoComplete="off"
        spellCheck={false}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQ("");
          if (e.key === "Enter") {
            const first = rowsOf().find((r) => !r.hidden);
            const a = first?.matches("a") ? (first as HTMLAnchorElement) : first?.querySelector("a");
            if (a) a.click();
          }
          if (e.key === "ArrowDown") {
            const first = rowsOf().find((r) => !r.hidden);
            const a = first?.matches("a") ? (first as HTMLAnchorElement) : first?.querySelector("a");
            if (a) {
              e.preventDefault();
              a.focus();
            }
          }
        }}
      />
      <span className="sr" aria-live="polite">
        {q ? t("picker.count", { n: shown }) : ""}
      </span>
      {q && shown === 0 && <p className="dim" style={{ marginTop: 10 }}>{t("picker.none")}</p>}
    </div>
  );
}
