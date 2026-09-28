"use client";

import { useActionState, useState } from "react";
import { changePassword, type FormState } from "@/actions/auth";
import { makeT, type Key, type Lang } from "@/lib/i18n/dict";

export function PasswordForm({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const [s, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <form action={action}>
      <h3 style={{ fontSize: 17, marginTop: 20 }}>{t("settings.password")}</h3>
      {s.error && <p className="errors" role="alert">{t(s.error as Key)}</p>}
      {s.ok && <p className="ok" role="status">{t(s.ok as Key)}</p>}
      <div className="row2">
        <div className="field">
          <label htmlFor="pw-cur">{t("settings.currentPassword")}</label>
          <input id="pw-cur" name="current" type="password" className="input" autoComplete="current-password" required />
        </div>
        <div className="field">
          <label htmlFor="pw-new">{t("settings.newPassword")}</label>
          <input id="pw-new" name="next" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </div>
      </div>
      <button className="btn ghost" disabled={pending}>{t("editor.save")}</button>
    </form>
  );
}

export function CopyLink({ url, lang }: { url: string; lang: Lang }) {
  const t = makeT(lang);
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="linkish"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          prompt("", url);
        }
      }}
    >
      {done ? t("settings.copied") : t("settings.copy")}
    </button>
  );
}
