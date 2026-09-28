"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveMode } from "@/actions/games";
import { makeT, type Key, type Lang } from "@/lib/i18n/dict";
import { FIELD_TYPES, validateTemplate, type FieldDef, type FieldType, type ModeTemplate } from "@/lib/template";

const KEYABLE: FieldType[] = ["choice", "boolean", "integer", "text", "players"];
const SCORABLE: FieldType[] = ["time", "integer", "number"];

function keyFrom(label: string): string {
  const k = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1")
    .slice(0, 32);
  return k || "field";
}

const EMPTY: ModeTemplate = {
  fields: [
    { key: "time", label: "Time", type: "time", precision: "ms", required: true },
  ],
  score: "time",
  direction: "lower",
  boardKey: [],
  display: { home: "sessions" },
};

export function ModeEditor({
  lang,
  gameId,
  modeId,
  initialName,
  initialNameEs,
  initial,
  catalogs,
}: {
  lang: Lang;
  gameId: number;
  modeId: number | null;
  initialName: string;
  initialNameEs: string | null;
  initial: ModeTemplate | null;
  catalogs: { key: string; name: string }[];
}) {
  const t = makeT(lang);
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [nameEs, setNameEs] = useState(initialNameEs ?? "");
  const [tpl, setTpl] = useState<ModeTemplate>(initial ?? EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setField = (i: number, patch: Partial<FieldDef>) =>
    setTpl((x) => {
      const fields = x.fields.map((f, j) => (j === i ? { ...f, ...patch } : f));
      const old = x.fields[i];
      let { score, boardKey } = x;
      if (patch.key !== undefined && patch.key !== old.key) {
        if (score === old.key) score = patch.key;
        boardKey = boardKey.map((k) => (k === old.key ? patch.key! : k));
      }
      if (patch.type && !KEYABLE.includes(patch.type)) boardKey = boardKey.filter((k) => k !== fields[i].key);
      return { ...x, fields, score, boardKey };
    });
  const move = (i: number, d: -1 | 1) =>
    setTpl((x) => {
      const f = [...x.fields];
      const j = i + d;
      if (j < 0 || j >= f.length) return x;
      [f[i], f[j]] = [f[j], f[i]];
      const order = f.map((y) => y.key);
      return { ...x, fields: f, boardKey: [...x.boardKey].sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
    });
  const remove = (i: number) =>
    setTpl((x) => {
      const k = x.fields[i].key;
      return { ...x, fields: x.fields.filter((_, j) => j !== i), boardKey: x.boardKey.filter((b) => b !== k) };
    });
  const add = () =>
    setTpl((x) => {
      let n = x.fields.length + 1;
      while (x.fields.some((f) => f.key === `field_${n}`)) n++;
      return { ...x, fields: [...x.fields, { key: `field_${n}`, label: "", type: "text" }] };
    });
  const toggleKey = (k: string, on: boolean) =>
    setTpl((x) => {
      const order = x.fields.map((f) => f.key);
      const set = new Set(x.boardKey);
      if (on) set.add(k);
      else set.delete(k);
      return { ...x, boardKey: [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
    });

  async function save() {
    setOk(null);
    const check = validateTemplate(tpl, catalogs.map((c) => c.key));
    if (!name.trim()) check.errors.unshift("The category needs a name.");
    if (!check.ok || !name.trim()) {
      setErrors(check.errors);
      return;
    }
    setBusy(true);
    const res = await saveMode({ gameId, modeId, name, nameEs: nameEs || null, template: tpl });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors([]);
    setOk(modeId ? t("editor.recomputed", { n: res.recomputed }) : t("editor.saved"));
    if (!modeId) {
      setName("");
      setNameEs("");
      setTpl(EMPTY);
    }
    router.refresh();
  }

  const timeFields = tpl.fields.filter((f) => f.type === "time");

  return (
    <div>
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
      {ok && <p className="ok" role="status">{ok}</p>}
      <div className="row2">
        <div className="field">
          <label>
            {t("editor.modeName")}
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={{ marginTop: 8 }} />
          </label>
        </div>
        <div className="field">
          <label>
            ES
            <input className="input" value={nameEs} onChange={(e) => setNameEs(e.target.value)} maxLength={60} style={{ marginTop: 8 }} />
          </label>
        </div>
      </div>

      <span className="lbl" style={{ display: "block", fontWeight: 700, fontStretch: "72%", color: "var(--dim)", marginBottom: 8 }}>
        {t("editor.fields")}
      </span>
      <div className="fb">
        {tpl.fields.map((f, i) => (
          <div className="fb-row" key={i}>
            <select className="input" aria-label={t("editor.fieldType")} value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })}>
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {t(`editor.type.${ft}` as Key)}
                </option>
              ))}
            </select>
            <input
              className="input"
              aria-label={t("editor.fieldLabel")}
              placeholder={t("editor.fieldLabel")}
              value={f.label}
              onChange={(e) => {
                const label = e.target.value;
                const auto = !f.label || f.key === keyFrom(f.label) || /^field_\d+$/.test(f.key);
                setField(i, auto ? { label, key: keyFrom(label) } : { label });
              }}
            />
            <input className="input t" aria-label={t("editor.fieldKey")} placeholder={t("editor.fieldKey")} value={f.key} onChange={(e) => setField(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} />
            <div className="opts">
              {f.type === "choice" && (
                <label>
                  {t("editor.fieldCatalog")}
                  <select className="input" value={f.catalog ?? ""} onChange={(e) => setField(i, { catalog: e.target.value })}>
                    <option value="">–</option>
                    {catalogs.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {f.type === "time" && (
                <label>
                  {t("editor.precision")}
                  <select className="input" value={f.precision ?? "ms"} onChange={(e) => setField(i, { precision: e.target.value as "ms" | "s" })}>
                    <option value="ms">{t("editor.precisionMs")}</option>
                    <option value="s">{t("editor.precisionS")}</option>
                  </select>
                </label>
              )}
              {f.type === "splits" && (
                <>
                  <label>
                    {t("editor.count")}
                    <input className="input t" inputMode="numeric" value={f.count ?? 3} onChange={(e) => setField(i, { count: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
                  </label>
                  <label>
                    {t("editor.of")}
                    <select className="input" value={f.of ?? ""} onChange={(e) => setField(i, { of: e.target.value || undefined })}>
                      <option value="">–</option>
                      {timeFields.map((tf) => (
                        <option key={tf.key} value={tf.key}>
                          {tf.label || tf.key}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" checked={!!f.autoLast} onChange={(e) => setField(i, { autoLast: e.target.checked })} />
                    {t("editor.autoLast")}
                  </label>
                </>
              )}
              {(f.type === "integer" || f.type === "number" || f.type === "players") && (
                <>
                  <label>
                    {t("editor.min")}
                    <input className="input t" inputMode="numeric" value={f.min ?? ""} onChange={(e) => setField(i, { min: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </label>
                  <label>
                    {t("editor.max")}
                    <input className="input t" inputMode="numeric" value={f.max ?? ""} onChange={(e) => setField(i, { max: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </label>
                </>
              )}
              {f.type === "players" && (
                <label title={t("editor.statsHint")}>
                  {t("editor.stats")}
                  <input
                    className="input wide"
                    defaultValue={(f.stats ?? []).map((s) => s.label).join(", ")}
                    placeholder="kills, downs, revives"
                    onBlur={(e) =>
                      setField(i, {
                        stats: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((label) => ({ key: keyFrom(label), label })),
                      })
                    }
                  />
                </label>
              )}
              {f.type !== "players" && f.type !== "splits" && (
                <label>
                  <input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                  {t("editor.required")}
                </label>
              )}
              {KEYABLE.includes(f.type) && (
                <label>
                  <input type="checkbox" checked={tpl.boardKey.includes(f.key)} onChange={(e) => toggleKey(f.key, e.target.checked)} />
                  {t("editor.inKey")}
                </label>
              )}
              {SCORABLE.includes(f.type) && (
                <label>
                  <input type="radio" name={`score-${modeId ?? "new"}`} checked={tpl.score === f.key} onChange={() => setTpl((x) => ({ ...x, score: f.key }))} />
                  {t("editor.isScore")}
                </label>
              )}
              <span className="moves">
                <button type="button" className="linkish" onClick={() => move(i, -1)} disabled={i === 0}>
                  {t("editor.up")}
                </button>
                <button type="button" className="linkish" onClick={() => move(i, 1)} disabled={i === tpl.fields.length - 1}>
                  {t("editor.down")}
                </button>
                <button type="button" className="linkish" onClick={() => remove(i)}>
                  {t("editor.removeField")}
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn ghost" style={{ marginTop: 12 }} onClick={add}>
        {t("editor.addField")}
      </button>

      <div className="row2" style={{ marginTop: 20 }}>
        <div className="field">
          <label>
            {t("editor.direction")}
            <select className="input" style={{ marginTop: 8 }} value={tpl.direction} onChange={(e) => setTpl((x) => ({ ...x, direction: e.target.value as "lower" | "higher" }))}>
              <option value="lower">{t("editor.lower")}</option>
              <option value="higher">{t("editor.higher")}</option>
            </select>
          </label>
        </div>
        <div className="field">
          <label>
            {t("editor.home")}
            <select
              className="input"
              style={{ marginTop: 8 }}
              value={tpl.display?.home ?? "sessions"}
              onChange={(e) => setTpl((x) => ({ ...x, display: { ...x.display, home: e.target.value as "tower" | "sessions" | "none" } }))}
            >
              <option value="tower">{t("editor.homeTower")}</option>
              <option value="sessions">{t("editor.homeSessions")}</option>
              <option value="none">{t("editor.homeNone")}</option>
            </select>
          </label>
        </div>
      </div>
      <div className="field">
        <label>
          {t("editor.title2")}
          <input
            className="input t"
            style={{ marginTop: 8 }}
            value={tpl.display?.title ?? ""}
            placeholder="{map}"
            onChange={(e) => setTpl((x) => ({ ...x, display: { ...x.display, title: e.target.value || undefined } }))}
          />
        </label>
        <p className="hint">{t("editor.titleHint")}</p>
      </div>
      <button type="button" className="save" onClick={save} disabled={busy}>
        <span>{modeId ? t("editor.saveMode") : t("editor.createMode")}</span>
      </button>
    </div>
  );
}
