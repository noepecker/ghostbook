import Link from "next/link";
import { loadWorld, recordsForModes, recordsForUser, worldRecordsFor, type User } from "@/lib/data";
import { fmtDate } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { modeName } from "@/lib/present";
import { formatInt, formatNumberDelta } from "@/lib/time";
import { buildRating, buildSession, buildTower, ratingDeltas, wrKey, type TowerRow } from "@/lib/views";
import { BigTime, SplitBars } from "./Bits";

export async function PlayerView({ player, isMe }: { player: User; isMe: boolean }) {
  const { lang, t } = await getT();
  const world = await loadWorld();
  const towerModes = world.modes.filter((m) => m.template.display?.home === "tower");
  const sessionModes = world.modes.filter((m) => (m.template.display?.home ?? "sessions") === "sessions");
  const ratingModes = world.modes.filter((m) => m.template.display?.rating);

  const [towerRecords, wrList, sessionRecs, ratingRecs] = await Promise.all([
    recordsForModes(towerModes.map((m) => m.id)),
    worldRecordsFor(towerModes.map((m) => m.id)),
    recordsForUser(player.id, sessionModes.map((m) => m.id), 8),
    recordsForUser(player.id, ratingModes.map((m) => m.id)),
  ]);
  const wrs = new Map(wrList.map((w) => [wrKey(w.modeId, w.boardKey), w]));

  const blocks = towerModes
    .map((m) => ({ mode: m, rows: buildTower(m, towerRecords, wrs, player.id, world, lang) }))
    .filter((b) => b.rows.length > 0);
  // the latest PB across every tower
  const latest: TowerRow | undefined = blocks
    .flatMap((b) => b.rows)
    .sort((a, b) => b.record.playedAt.getTime() - a.record.playedAt.getTime())[0];

  const deltas = new Map<number, number | null>();
  for (const m of ratingModes) for (const [k, v] of ratingDeltas(ratingRecs, m)) deltas.set(k, v);
  const sessions = sessionRecs.map((r) => buildSession(r, world, lang, deltas.has(r.id) ? deltas.get(r.id) : undefined));
  const ratings = ratingModes.map((m) => buildRating(m, ratingRecs, world, lang)).filter((x) => x !== null);

  const latestGame = latest ? world.gameById.get(latest.mode.gameId) : undefined;
  const latestCombo = latest
    ? latest.mode.template.fields
        .filter((f) => f.type === "choice" && !latest.mode.template.boardKey.includes(f.key))
        .map((f) => world.itemById.get(Number(latest.record.values[f.key])))
        .filter((i) => i)
        .map((i) => (lang === "es" && i!.nameEs ? i!.nameEs : i!.name))
    : [];

  return (
    <section aria-labelledby="h-board">
      <div className="board">
        <div>
          {latest ? (
            <div className="lead">
              <p className="kicker" id="h-board">
                {!isMe && <>{player.displayName} · </>}
                {t("home.latestPb")} · {fmtDate(latest.record.playedAt, lang, "weekdayTime")}
              </p>
              <h1>
                <Link href={latest.href}>{latest.title}</Link>
              </h1>
              <p className="meta">
                {[
                  latestGame?.shortCode,
                  modeName(latest.mode, lang),
                  latest.rest,
                  ...latestCombo,
                  latest.proof === "clip" ? t("home.clipAttached") : latest.proof === "shot" ? t("home.shotAttached") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <BigTime text={latest.score} className="tick" />
              <div className="cells">
                {latest.gain ? (
                  <span className={`cell t ${latest.gainBetter ? "g" : "o"}`}>
                    {latest.gain} <small>{t("home.vsPb")}</small>
                  </span>
                ) : (
                  <span className="cell o t">
                    <small>{t("home.firstTime")}</small>
                  </span>
                )}
                <span className="cell o t">
                  {latest.dwr ?? "–"} <small>{t("home.vsWr")}</small>
                </span>
              </div>
            </div>
          ) : (
            <p className="empty-note" id="h-board">
              {t("home.nothing")} <Link href="/log">{t("nav.log")}</Link>
            </p>
          )}

          {blocks.map(({ mode, rows }) => {
            const game = world.gameById.get(mode.gameId)!;
            return (
              <div className="towerblock" key={mode.id}>
                <h3>{t("home.towerTitle", { mode: `${game.shortCode} ${modeName(mode, lang)}` })}</h3>
                <Tower rows={rows} />
              </div>
            );
          })}
          {blocks.some((b) => b.rows.some((r) => r.splits)) && (
            <p className="legend">
              <span style={{ ["--c" as string]: "var(--wr)" }}>{t("legend.wr")}</span>
              <span style={{ ["--c" as string]: "var(--pb)" }}>{t("legend.pb")}</span>
              <span style={{ ["--c" as string]: "var(--slow)" }}>{t("legend.slow")}</span>
            </p>
          )}
        </div>

        <div className="sessions">
          <h3>{t("home.sessions")}</h3>
          {sessions.length === 0 && <p className="empty-note">{t("home.noSessions")}</p>}
          {sessions.map((s) => (
            <Link className="s" href={s.href} key={s.href}>
              <span className="d">{s.day}</span>
              <span className="what">{s.what}</span>
              <span className={`res t ${s.resClass}`}>{s.res}</span>
              <span className="sub">{s.sub}</span>
              <span className="codes">
                {s.codes.map((c, i) => (
                  <b key={i}>{c}</b>
                ))}
                {s.more > 0 && <span className="dim">+{s.more}</span>}
              </span>
            </Link>
          ))}
          {ratings.map((r) => (
            <div className="mmr" key={r.href}>
              <span className="kicker">{r.label}</span>
              <span />
              <Link className="v t" href={r.href} style={{ textDecoration: "none" }}>
                {formatInt(r.value)}
              </Link>
              {r.monthDelta !== null && (
                <span className={`t ${r.monthDelta > 0 ? "pb" : r.monthDelta < 0 ? "slow" : "dim"}`}>
                  {t("home.ratingMonth", { delta: formatNumberDelta(r.monthDelta), month: r.monthName })}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function Tower({ rows }: { rows: TowerRow[] }) {
  const { t } = await getT();
  return (
    <div className="tower" role="table" aria-label={t("home.latestPb")}>
      <div className="th" role="row">
        <span />
        <span>{t("col.track")}</span>
        <span>{t("col.key")}</span>
        <span>{t("col.splits")}</span>
        <span>{t("col.time")}</span>
        <span>{t("col.gain")}</span>
        <span>{t("col.dwr")}</span>
        <span>{t("col.date")}</span>
        <span>{t("col.proof")}</span>
      </div>
      {rows.map((r, i) => (
        <Link className="tr" role="row" href={r.href} key={r.boardKey + r.mode.id}>
          <span className="pos">{i + 1}</span>
          <span className="trk">
            {r.title}
            {r.rest && <span className="ccm">{r.rest}</span>}
          </span>
          <span className="cc">{r.rest}</span>
          <SplitBars cells={r.splits} />
          <span className="time t">{r.score}</span>
          <span className={`num dpb t ${r.gainBetter ? "pb" : "dim"}`}>{r.gain ?? "–"}</span>
          <span className={`num dwr t ${r.dwr ? (r.dwrBetter ? "wr" : "") : "dim"}`}>{r.dwr ?? "–"}</span>
          <span className="date">{r.date}</span>
          <span className={`prf ${r.proof ? "has" : ""}`}>{r.proof === "clip" ? t("proof.clip") : r.proof === "shot" ? t("proof.shot") : "–"}</span>
        </Link>
      ))}
    </div>
  );
}
