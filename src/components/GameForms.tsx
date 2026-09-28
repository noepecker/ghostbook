"use client";

import { useActionState } from "react";
import { addItemForm, createCatalog, createGame, updateGame, type EditState } from "@/actions/games";
import { refreshWrs } from "@/actions/wr";
import { makeT, type Key, type Lang } from "@/lib/i18n/dict";

function Msg({ s, lang }: { s: EditState; lang: Lang }) {
  const t = makeT(lang);
  if (s.error) return <p className="errors" role="alert">{t(s.error as Key)}</p>;
  if (s.errors?.length) return <p className="errors" role="alert">{s.errors.join(" ")}</p>;
  if (s.ok) return <p className="flash pb" role="status">{t(s.ok as Key)}</p>;
  return null;
}

export function NewGameForm({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const [s, action, pending] = useActionState<EditState, FormData>(createGame, {});
  return (
    <form className="form" action={action}>
      <h2>{t("games.add")}</h2>
      <Msg s={s} lang={lang} />
      <div className="field">
        <label htmlFor="g-name">{t("games.name")}</label>
        <input id="g-name" name="name" className="input" required maxLength={60} />
      </div>
      <div className="field">
        <label htmlFor="g-short">{t("games.short")}</label>
        <input id="g-short" name="short" className="input t" required maxLength={6} style={{ textTransform: "uppercase" }} />
        <p className="hint">{t("games.shortHint")}</p>
      </div>
      <button className="save" disabled={pending}>
        <span>{t("games.create")}</span>
      </button>
    </form>
  );
}

export function EditGameForm({ lang, id, name, short }: { lang: Lang; id: number; name: string; short: string }) {
  const t = makeT(lang);
  const [s, action, pending] = useActionState<EditState, FormData>(updateGame, {});
  return (
    <form action={action}>
      <Msg s={s} lang={lang} />
      <input type="hidden" name="id" value={id} />
      <div className="row2">
        <div className="field">
          <label htmlFor="e-name">{t("games.name")}</label>
          <input id="e-name" name="name" className="input" defaultValue={name} required maxLength={60} />
        </div>
        <div className="field">
          <label htmlFor="e-short">{t("games.short")}</label>
          <input id="e-short" name="short" className="input t" defaultValue={short} required maxLength={6} />
        </div>
      </div>
      <button className="btn" disabled={pending}>{t("editor.save")}</button>
    </form>
  );
}

export function NewCatalogForm({ lang, gameId }: { lang: Lang; gameId: number }) {
  const t = makeT(lang);
  const [s, action, pending] = useActionState<EditState, FormData>(createCatalog, {});
  return (
    <form action={action} style={{ marginTop: 16 }}>
      <Msg s={s} lang={lang} />
      <input type="hidden" name="gameId" value={gameId} />
      <span className="lbl" style={{ display: "block", fontWeight: 700, fontStretch: "72%", color: "var(--dim)", marginBottom: 8 }}>{t("editor.newCatalog")}</span>
      <div className="inline" style={{ marginLeft: 0 }}>
        <input name="name" className="input" placeholder={t("editor.catalogName")} aria-label={t("editor.catalogName")} required />
        <input name="key" className="input" placeholder={t("editor.catalogKey")} aria-label={t("editor.catalogKey")} style={{ maxWidth: 140 }} />
        <button className="btn ghost" disabled={pending}>{t("editor.addCatalog")}</button>
      </div>
    </form>
  );
}

export function AddItemForm({ lang, catalogId }: { lang: Lang; catalogId: number }) {
  const t = makeT(lang);
  const [s, action, pending] = useActionState<EditState, FormData>(addItemForm, {});
  return (
    <form action={action}>
      {s.errors && <Msg s={s} lang={lang} />}
      <input type="hidden" name="catalogId" value={catalogId} />
      <div className="inline">
        <input name="name" className="input" placeholder={t("editor.itemName")} aria-label={t("editor.itemName")} required />
        <button className="btn ghost" disabled={pending}>{t("editor.addItem")}</button>
      </div>
    </form>
  );
}

export function RefreshWrButton({ lang, game }: { lang: Lang; game: string }) {
  const t = makeT(lang);
  const [s, action, pending] = useActionState<{ msg?: string; bad?: boolean }, FormData>(refreshWrs, {});
  return (
    <form action={action} style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <input type="hidden" name="game" value={game} />
      <button className="btn ghost" disabled={pending}>{t("games.wrRefresh")}</button>
      {s.msg && <span className={`flash ${s.bad ? "slow" : "pb"}`} role="status">{s.msg}</span>}
    </form>
  );
}
