import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadWorld, modeRecordCounts } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { modeName } from "@/lib/present";
import { NewGameForm } from "@/components/GameForms";

export const metadata = { title: "Games" };

export default async function GamesPage() {
  await requireUser();
  const { lang, t } = await getT();
  const world = await loadWorld();
  const counts = await modeRecordCounts();
  return (
    <section>
      <div className="games-grid">
        <div>
          <h2 style={{ marginBottom: 24 }}>{t("games.title")}</h2>
          <div className="tower list" role="table">
            <div className="th" role="row">
              <span>{t("col.code")}</span>
              <span>{t("games.name")}</span>
              <span>{t("col.records")}</span>
              <span />
            </div>
            {world.games.map((g) => {
              const ms = world.modes.filter((m) => m.gameId === g.id);
              const n = ms.reduce((a, m) => a + (counts.get(m.id) ?? 0), 0);
              return (
                <div className="tr" role="row" key={g.id}>
                  <span className="tla">{g.shortCode}</span>
                  <span className="gname">
                    <Link href={`/g/${g.slug}`} className="trk">
                      {g.name}
                    </Link>
                    <small>{ms.map((m) => modeName(m, lang)).join(" · ") || "–"}</small>
                  </span>
                  <span className="num t">{n || "–"}</span>
                  <span className="num">
                    <Link href={`/g/${g.slug}/edit`} className="dim">
                      {t("games.edit")}
                    </Link>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <NewGameForm lang={lang} />
        </div>
      </div>
    </section>
  );
}
