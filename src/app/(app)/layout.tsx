import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadWorld } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { readLast } from "@/lib/lastlog";
import { boardLabel, modeName } from "@/lib/present";
import { NavLinks } from "@/components/NavLinks";
import { LangToggle } from "@/components/LangToggle";
import { LogBar } from "@/components/LogBar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const { lang, t } = await getT();
  const world = await loadWorld();
  const last = await readLast();
  const lastMode = last ? world.modeById.get(last.modeId) : undefined;
  let lastText = t("logbar.none");
  let logHref = "/log";
  if (lastMode && last) {
    const b = boardLabel(lastMode, last.boardKey, world, lang);
    lastText = t("logbar.last", { what: [b.title, b.rest].filter(Boolean).join(" · ") || modeName(lastMode, lang) });
    logHref = `/log?mode=${lastMode.id}`;
  }
  return (
    <>
      <header className="bar">
        <Link className="me" href="/" aria-label={me.displayName}>
          <span className="code">{me.code}</span>
          <b>{me.displayName}</b>
        </Link>
        <NavLinks
          label={t("nav.sections")}
          links={[
            { href: "/", label: t("nav.board") },
            { href: "/games", label: t("nav.games") },
            { href: "/players", label: t("nav.players") },
            { href: "/settings", label: t("nav.settings") },
            { href: logHref, label: t("nav.log"), log: true },
          ]}
        />
        <LangToggle lang={lang} />
      </header>
      <main>{children}</main>
      <LogBar href={logHref} label={t("nav.log")} text={lastText} />
    </>
  );
}
