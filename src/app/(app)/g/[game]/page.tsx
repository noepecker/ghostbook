import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadWorld, recordsForModes, worldRecordsFor } from "@/lib/data";
import { db } from "@/lib/db";
import { fmtAgo, fmtDate } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { catalogOrder, unionBoards } from "@/lib/boards";
import { computePBs, isBetter, userKey } from "@/lib/pb";
import { boardLabel, boardPath, formatScore, itemName, modeName } from "@/lib/present";
import { fieldLabel, parseBoardKey } from "@/lib/template";
import { lastRefresh, SOURCES } from "@/lib/wr/refresh";
import { RefreshWrButton } from "@/components/GameForms";

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const world = await loadWorld();
  return { title: world.gameBySlug.get(game)?.name ?? "Game" };
}

export default async function GamePage({ params, searchParams }: { params: Promise<{ game: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const { lang, t } = await getT();
  const world = await loadWorld();
  const { game: slug } = await params;
  const sp = await searchParams;
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
        const tpl = mode.template;
        const mine = recs.filter((r) => r.modeId === mode.id);
        const dir = tpl.direction;
        const pbs = computePBs(mine, dir);
        const modeWrs = wrList.filter((w) => w.modeId === mode.id);
        const wrs = new Map(modeWrs.map((w) => [w.boardKey, w]));
        const items = world.catalogItems.get(game.id) ?? {};

        // class / route toggles for categories with world records: they pick which WR-only boards show
        const toggles = modeWrs.length
          ? tpl.boardKey
              .slice(1)
              .map((k) => tpl.fields.find((f) => f.key === k))
              .filter((f) => f?.type === "choice" && (items[f.catalog ?? ""]?.length ?? 0) > 1 && (items[f.catalog ?? ""]?.length ?? 0) <= 6)
              .map((f) => {
                const list = items[f!.catalog ?? ""]!;
                const current = list.find((i) => i.slug === sp[f!.key]) ?? list.find((i) => i.slug === f!.default) ?? list[0];
                return { field: f!, list, current };
              })
          : [];
        const hrefWith = (key: string, value: string) => {
          const q = new URLSearchParams();
          for (const g of toggles) q.set(g.field.key, g.field.key === key ? value : g.current.slug);
          return `/g/${game.slug}?${q.toString()}`;
        };
        const show = (bk: string) => {
          const parts = parseBoardKey(bk);
          return toggles.every((g) => parts[g.field.key] === String(g.current.id));
        };

        const latestBy = new Map<string, Date>();
        for (const r of mine) {
          const cur = latestBy.get(r.boardKey);
          if (!cur || r.playedAt > cur) latestBy.set(r.boardKey, r.playedAt);
        }
        const order = catalogOrder(tpl, (id) => world.itemById.get(id)?.sort);
        const rows = unionBoards(latestBy, wrs.keys(), order, show).map(({ boardKey: bk, latest }) => {
          let best: { code: string; score: number } | null = null;
          const owners = pbs.get(bk);
          for (const [owner, r] of owners ?? []) {
            if (!owner.startsWith("user:") || r.score === null) continue;
            const u = world.userById.get(Number(owner.slice(5)));
            if (!best || isBetter(r.score, best.score, dir)) best = { code: u?.code ?? "?", score: r.score };
          }
          return { bk, b: boardLabel(mode, bk, world, lang), best, minePb: owners?.get(userKey(me.id)), wr: wrs.get(bk), latest };
        });
        const logHref = `/log?mode=${mode.id}`;
        return (
          <div className="modeblock" key={mode.id}>
            <h3>
              <span>{modeName(mode, lang)}</span>
              <Link href={logHref}>{t("nav.log")}</Link>
            </h3>
            {toggles.length > 0 && (
              <div className="tabgroups modetabs">
                {toggles.map((g) => (
                  <nav className="tabs" key={g.field.key} aria-label={fieldLabel(g.field, lang)}>
                    {g.list.map((i) => (
                      <Link key={i.id} href={hrefWith(g.field.key, i.slug)} aria-current={i.id === g.current.id ? "page" : undefined} scroll={false}>
                        {String((i.meta?.short as string) ?? itemName(i, lang))}
                      </Link>
                    ))}
                  </nav>
                ))}
              </div>
            )}
            {rows.length === 0 ? (
              <p className="empty-note">
                {t("games.noRecords")} <Link href={logHref}>{t("games.logFirst")}</Link>
              </p>
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
                  <Link className={`tr${r.latest ? "" : " wronly"}`} role="row" key={r.bk} href={boardPath(game, mode, r.bk, world)}>
                    <span className="trk">
                      {r.b.title}
                      {r.b.rest && <span className="dim" style={{ fontWeight: 600, fontStretch: "72%", marginLeft: 8 }}>{r.b.rest}</span>}
                    </span>
                    <span className="num t">
                      {r.best ? (
                        <>
                          <b className="tla" style={{ fontSize: 11, marginRight: 6 }}>{r.best.code}</b>
                          {formatScore(tpl, r.best.score)}
                        </>
                      ) : (
                        <span className="dim notime">{t("games.noTimeYet")}</span>
                      )}
                    </span>
                    <span className={`time t${r.minePb ? "" : " dim"}`}>{r.minePb ? formatScore(tpl, r.minePb.score) : "–"}</span>
                    <span className="num t dim">{r.wr ? formatScore(tpl, r.wr.score) : "–"}</span>
                    <span className="date">{r.latest ? fmtDate(r.latest, lang, "day") : "–"}</span>
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
