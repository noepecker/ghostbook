import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadWorld, recordCounts } from "@/lib/data";
import { fmtDate } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Family" };

export default async function PlayersPage() {
  await requireUser();
  const { lang, t } = await getT();
  const world = await loadWorld();
  const counts = new Map((await recordCounts()).map((c) => [c.userId, c]));
  const people = [...world.users].sort((a, b) => (counts.get(b.id)?.n ?? 0) - (counts.get(a.id)?.n ?? 0));
  return (
    <section>
      <h2 style={{ marginBottom: 24 }}>{t("players.title")}</h2>
      <div className="tower people" role="table">
        <div className="th" role="row">
          <span>{t("col.code")}</span>
          <span>{t("col.player")}</span>
          <span>{t("col.records")}</span>
          <span>{t("col.latest")}</span>
        </div>
        {people.map((u) => {
          const c = counts.get(u.id);
          return (
            <Link className="tr" role="row" key={u.id} href={`/p/${u.username}`}>
              <span className="pos" style={{ fontStretch: "125%" }}>{u.code}</span>
              <span className="trk">{u.displayName}</span>
              <span className="num t">{c?.n ?? 0}</span>
              <span className="date">{c?.latest ? fmtDate(c.latest, lang, "dayYear") : "–"}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
