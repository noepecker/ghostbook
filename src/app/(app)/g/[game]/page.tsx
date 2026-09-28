import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadWorld, recordsForModes, worldRecordsFor } from "@/lib/data";
import { db } from "@/lib/db";
import { fmtAgo, fmtDate } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { computePBs, isBetter, userKey } from "@/lib/pb";
import { boardLabel, boardPath, formatScore, modeName } from "@/lib/present";
import { lastRefresh, SOURCES } from "@/lib/wr/refresh";
import { RefreshWrButton } from "@/components/GameForms";

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const world = await loadWorld();
  return { title: world.gameBySlug.get(game)?.name ?? "Game" };
}

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const me = await requireUser();
  const { lang, t } = await getT();
  const world = await loadWorld();
  const { game: slug } = await params;
  const game = world.gameBySlug.get(slug);
  if (!game) notFound();
  const modes = world.modes.filter((m) => m.gameId === game.id);
  const [recs, wrList] = await Promise.all([recordsForModes(modes.map((m) => m.id)), worldRecordsFor(modes.map((m) => m.id))]);
  const src = game.wrSource ? SOURCES[game.wrSource] : undefined;
  const last = game.wrSource ? await lastRefresh(db, game.wrSource) : null;

  return (
    <section>
      <div className="trackhead">
        <div>
          <p className="kicker">
            <Link href="/games">{t("games.title")}</Link> · {game.shortCode}
          </p>
          <h2>{game.name}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          {src && <RefreshWrButton lang={lang} game={game.slug} />}
          <Link className="btn ghost" href={`/g/${game.slug}/edit`}>
            {t("games.edit")}
          </Link>
        </div>
      </div>
      {src && (
        <p className="hint" style={{ marginTop: -16, marginBottom: 28 }}>
          {last ? t("games.wrSource", { source: src.label, when: fmtAgo(last, lang) }) : t("games.wrNotYet", { source: src.label })}
        </p>
      )}

      {modes.map((mode) => {
        const mine = recs.filter((r) => r.modeId === mode.id);
        const dir = mode.template.direction;
        const pbs = computePBs(mine, dir);
        const wrs = new Map(wrList.filter((w) => w.modeId === mode.id).map((w) => [w.boardKey, w]));
        const rows = [...pbs.entries()]
          .map(([bk, owners]) => {
            let best: { code: string; score: number } | null = null;
            for (const [owner, r] of owners) {
              if (!owner.startsWith("user:") || r.score === null) continue;
              const u = world.userById.get(Number(owner.slice(5)));
              if (!best || isBetter(r.score, best.score, dir)) best = { code: u?.code ?? "?", score: r.score };
            }
            const minePb = owners.get(userKey(me.id));
            const latest = mine.filter((r) => r.boardKey === bk).reduce((a, r) => (r.playedAt > a ? r.playedAt : a), new Date(0));
            const b = boardLabel(mode, bk, world, lang);
            return { bk, b, best, minePb, wr: wrs.get(bk), latest };
          })
          .sort((a, b) => b.latest.getTime() - a.latest.getTime())
          .slice(0, 60);
        return (
          <div className="modeblock" key={mode.id}>
            <h3>
              <span>{modeName(mode, lang)}</span>
              <Link href={`/log?mode=${mode.id}`}>{t("nav.log")}</Link>
            </h3>
            {rows.length === 0 ? (
              <p className="empty-note">{t("games.noRecords")}</p>
            ) : (
              <div className="tower boards" role="table">
                <div className="th" role="row">
                  <span>{t("col.board")}</span>
                  <span>{t("col.best")}</span>
                  <span>{t("col.you")}</span>
                  <span>{t("col.wr")}</span>
                  <span>{t("col.latest")}</span>
                </div>
                {rows.map((r) => (
                  <Link className="tr" role="row" key={r.bk} href={boardPath(game, mode, r.bk, world)}>
                    <span className="trk">
                      {r.b.title}
                      {r.b.rest && <span className="dim" style={{ fontWeight: 600, fontStretch: "72%", marginLeft: 8 }}>{r.b.rest}</span>}
                    </span>
                    <span className="num t">
                      {r.best ? (
                        <>
                          <b className="tla" style={{ fontSize: 11, marginRight: 6 }}>{r.best.code}</b>
                          {formatScore(mode.template, r.best.score)}
                        </>
                      ) : (
                        "–"
                      )}
                    </span>
                    <span className="time t">{r.minePb ? formatScore(mode.template, r.minePb.score) : "–"}</span>
                    <span className="num t dim">{r.wr ? formatScore(mode.template, r.wr.score) : "–"}</span>
                    <span className="date">{fmtDate(r.latest, lang, "day")}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
