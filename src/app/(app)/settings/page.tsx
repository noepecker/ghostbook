import { desc } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { createInvite, logout } from "@/actions/auth";
import { requireUser } from "@/lib/auth";
import { loadWorld } from "@/lib/data";
import { db } from "@/lib/db";
import { invites, proofs } from "@/lib/db/schema";
import { fmtAgo, fmtDate } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { lastRefresh, SOURCES } from "@/lib/wr/refresh";
import { LangToggle } from "@/components/LangToggle";
import { CopyLink, PasswordForm } from "@/components/SettingsForms";
import { RefreshWrButton } from "@/components/GameForms";

export const metadata = { title: "Settings" };

const FREE_TIER = 1024 ** 3; // Vercel Blob Hobby: 1 GB

function size(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} kB`;
}

export default async function SettingsPage() {
  const me = await requireUser();
  const { lang, t } = await getT();
  const world = await loadWorld();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const inv = await db.select().from(invites).orderBy(desc(invites.createdAt)).limit(12);
  const files = await db.select({ size: proofs.size }).from(proofs);
  const used = files.reduce((a, f) => a + Number(f.size), 0);
  const pct = Math.min(100, (used / FREE_TIER) * 100);
  const wrGames = world.games.filter((g) => g.wrSource && SOURCES[g.wrSource]);
  const wrTimes = await Promise.all(wrGames.map(async (g) => ({ g, at: await lastRefresh(db, g.wrSource!) })));
  const now = new Date();

  return (
    <section>
      <h2 style={{ marginBottom: 32 }}>{t("settings.title")}</h2>
      <div className="settings">
        <div>
          <h3>{t("settings.account")}</h3>
          <dl className="combo">
            <dt>{t("register.code")}</dt>
            <dd className="tla">{me.code}</dd>
            <dt>{t("register.displayName")}</dt>
            <dd>{me.displayName}</dd>
            <dt>{t("login.username")}</dt>
            <dd>{me.username}</dd>
          </dl>
          <PasswordForm lang={lang} />
          <form action={logout} style={{ marginTop: 20 }}>
            <button className="btn warn">{t("settings.logout")}</button>
          </form>
        </div>

        <div>
          <h3>{t("settings.invites")}</h3>
          <p className="hint" style={{ marginBottom: 12 }}>{t("settings.invitesHint")}</p>
          <form action={createInvite}>
            <button className="btn">{t("settings.newInvite")}</button>
          </form>
          <ul className="invites" style={{ marginTop: 12 }}>
            {inv.length === 0 && <li className="dim">{t("settings.noInvites")}</li>}
            {inv.map((i) => {
              const url = `${origin}/register/${i.token}`;
              const usedBy = i.usedBy ? world.userById.get(i.usedBy) : null;
              const open = !i.usedBy && i.expiresAt > now;
              return (
                <li key={i.id}>
                  {open ? <code>{url}</code> : <span className="dim">{usedBy ? t("settings.inviteUsed", { name: usedBy.displayName }) : t("settings.inviteExpired")}</span>}
                  {open ? <CopyLink url={url} lang={lang} /> : <span />}
                  {open && <span className="dim">{t("settings.inviteActive", { date: fmtDate(i.expiresAt, lang, "dayYear") })}</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h3>{t("settings.storage")}</h3>
          <p className="t" style={{ fontSize: 22, fontWeight: 700 }}>
            {t("settings.storageUse", { used: size(used), total: "1 GB" })}
          </p>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={t("settings.storage")}>
            <i className={pct > 80 ? "hi" : ""} style={{ width: `${Math.max(pct, used ? 0.5 : 0)}%` }} />
          </div>
          <p className="hint">
            {files.length === 1 ? t("settings.storageFile") : t("settings.storageFiles", { n: files.length })} · {t("settings.storageHint")}
          </p>
        </div>

        <div>
          <h3>{t("settings.language")}</h3>
          <div style={{ display: "inline-flex", height: 40, border: "1px solid var(--rule)" }}>
            <LangToggle lang={lang} />
          </div>
          {wrTimes.length > 0 && (
            <>
              <h3 style={{ marginTop: 32 }}>{t("settings.wr")}</h3>
              {wrTimes.map(({ g, at }) => (
                <div key={g.id} style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <p style={{ flex: 1, minWidth: 200 }}>
                    <Link href={`/g/${g.slug}`}>{g.name}</Link>
                    <br />
                    <span className="hint">{at ? t("games.wrSource", { source: SOURCES[g.wrSource!].label, when: fmtAgo(at, lang) }) : t("games.wrNotYet", { source: SOURCES[g.wrSource!].label })}</span>
                  </p>
                  <RefreshWrButton lang={lang} game={g.slug} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
