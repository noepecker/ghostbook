"use client";

import { useActionState } from "react";
import { login, register, type FormState } from "@/actions/auth";
import { makeT, type Lang } from "@/lib/i18n/dict";
import type { Key } from "@/lib/i18n/dict";

export function LoginForm({ lang, next }: { lang: Lang; next: string }) {
  const t = makeT(lang);
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form className="form" action={action}>
      <h2>{t("login.title")}</h2>
      {state.error && <p className="errors" role="alert">{t(state.error as Key)}</p>}
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="username">{t("login.username")}</label>
        <input id="username" name="username" className="input" autoComplete="username" autoCapitalize="none" required />
      </div>
      <div className="field">
        <label htmlFor="password">{t("login.password")}</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      <button className="save" disabled={pending}>
        <span>{t("login.submit")}</span>
      </button>
    </form>
  );
}

export function RegisterForm({ lang, token }: { lang: Lang; token: string }) {
  const t = makeT(lang);
  const [state, action, pending] = useActionState<FormState, FormData>(register, {});
  return (
    <form className="form" action={action}>
      <h2>{t("register.title")}</h2>
      {state.error && <p className="errors" role="alert">{t(state.error as Key)}</p>}
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="displayName">{t("register.displayName")}</label>
        <input id="displayName" name="displayName" className="input" autoComplete="name" required maxLength={40} />
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="username">{t("login.username")}</label>
          <input id="username" name="username" className="input" autoComplete="username" autoCapitalize="none" required pattern="[A-Za-z0-9._\-]{2,24}" />
        </div>
        <div className="field">
          <label htmlFor="code">{t("register.code")}</label>
          <input id="code" name="code" className="input t" required maxLength={3} pattern="[A-Za-z]{3}" style={{ textTransform: "uppercase", fontWeight: 800 }} />
        </div>
      </div>
      <p className="hint" style={{ marginTop: -10, marginBottom: 16 }}>{t("register.codeHint")}</p>
      <div className="field">
        <label htmlFor="password">{t("login.password")}</label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={8} />
        <p className="hint">{t("register.passwordHint")}</p>
      </div>
      <button className="save" disabled={pending}>
        <span>{t("register.submit")}</span>
      </button>
    </form>
  );
}
