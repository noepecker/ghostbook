import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadWorld, recordsForBoard, worldRecordsFor } from "@/lib/data";
import { fmtAgo, fmtDate } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { bestSplits, computePBs, gap, pbProgression, splitStates, userKey } from "@/lib/pb";
import { boardKeyFromPath, boardLabel, boardPath, formatGap, formatScore, formatValue, itemName, modeName, playersLabel } from "@/lib/present";
import { fieldLabel, parseBoardKey } from "@/lib/template";
import { formatDelta, formatSplit, formatTime } from "@/lib/time";
import { splitsFieldKey, splitsOf } from "@/lib/views";
import { BigTime } from "@/components/Bits";
import { ProofMedia } from "@/components/ProofMedia";
import { StepChart } from "@/components/StepChart";
import { LogBar } from "@/components/LogBar";

type Params = { game: string; mode: string; key: string[] };

async function resolve(p: Params) {
  const world = await loadWorld();
  const game = world.gameBySlug.get(p.game);
  const mode = game && world.modes.find((m) => m.gameId === game.id && m.slug === p.mode);
  const boardKey = game && mode ? boardKeyFromPath(game, mode, p.key, world) : null;
  return { world, game, mode, boardKey };
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { world, mode, boardKey } = await resolve(await params);
  if (!mode || !boardKey) return { title: "Board" };
  const { lang } = await getT();
  const b = boardLabel(mode, boardKey, world, lang);
  return { title: [b.title, b.rest].filter(Boolean).join(" · ") };
}

const CLS = { wr: "wr", pb: "pb", slow: "slow", none: "dim" } as const;

export default async function BoardPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ p?: string }> }) {
  const me = await requireUser();
  const { lang, t } = await getT();
  const { world, game, mode, boardKey } = await resolve(await params);
  if (!game || !mode || !boardKey) notFound();
  const { p } = await searchParams;
  const player = (p && world.users.find((u) => u.username === p)) || world.userById.get(me.id)!;
  const tpl = mode.template;
  const dir = tpl.direction;
  const label = boardLabel(mode, boardKey, world, lang);
  const scoreF = tpl.fields.find((f) => f.key === tpl.score)!;
  const isTime = scoreF.type === "time";
  const precision = scoreF.precision ?? "ms";

  const [recs, [wr]] = await Promise.all([
    recordsForBoard(mode.id, boardKey),
    worldRecordsFor([mode.id]).then((all) => [all.find((w) => w.boardKey === boardKey) ?? null]),
  ]);
  const owner = userKey(player.id);
  const mine = recs.filter((r) => r.participants.some((x) => x.userId === player.id));
  const steps = pbProgression(mine, dir, owner, boardKey);
  const pb = steps.length ? steps[steps.length - 1].record : null;
  const prev = steps.length > 1 ? steps[steps.length - 2].record : null;

  // splits: this PB, own best, WR
  const sk = splitsFieldKey(mode);
  const pbSplits = pb ? splitsOf(pb, sk) : null;
  const own = bestSplits(mine.map((r) => splitsOf(r, sk) ?? []));
  const wrSplits = wr?.splits && pbSplits && wr.splits.length === pbSplits.length ? wr.splits : null;
  const states = pbSplits ? splitStates(pbSplits, own, wrSplits) : [];
  const sumOfBest = pbSplits && own.length === pbSplits.length && own.every((x) => x !== null) ? own.reduce<number>((a, b) => a + (b as number), 0) : null;

  // family on this board
  const pbs = computePBs(recs, dir).get(boardKey) ?? new Map();
  const family = world.users
    .map((u) => ({ u, rec: pbs.get(userKey(u.id)) }))
    .filter((x) => x.rec && x.rec.score !== null)
    .sort((a, b) => (dir === "lower" ? a.rec!.score! - b.rec!.score! : b.rec!.score! - a.rec!.score!));

  // tabs: sibling boards that differ in one small key field (150cc / 200cc, Non-SC / Glitch, Solo / Duo …)
  const parts = parseBoardKey(boardKey);
  const tabGroups = tpl.boardKey
    .map((k) => tpl.fields.find((f) => f.key === k)!)
    .filter((f) => f && (f.type === "choice" || f.type === "players") && f.key !== tpl.boardKey[0])
    .map((f) => {
      let opts: { value: string; text: string }[] = [];
      if (f.type === "choice") {
        const items = world.catalogItems.get(game.id)?.[f.catalog ?? ""] ?? [];
        if (items.length > 6) return null;
        opts = items.map((i) => ({ value: String(i.id), text: String((i.meta?.short as string) ?? itemName(i, lang)) }));
      } else {
        const min = f.min ?? 1;
        const max = Math.min(f.max ?? 4, 8);
        for (let n = min; n <= max; n++) opts.push({ value: String(n), text: playersLabel(n, lang) });
      }
      return {
        field: f,
        opts: opts.map((o) => {
          const key = tpl.boardKey.map((k) => `${k}=${k === f.key ? o.value : parts[k] ?? ""}`).join("|");
          return { ...o, href: boardPath(game, mode, key, world) + (player.id !== me.id ? `?p=${player.username}` : ""), current: parts[f.key] === o.value };
        }),
      };
    })
    .filter((g) => g !== null);

  const combo = pb
    ? tpl.fields
        .filter((f) => !tpl.boardKey.includes(f.key) && f.key !== tpl.score && (f.type === "choice" || f.type === "text" || f.type === "boolean" || f.type === "integer"))
        .filter((f) => pb.values[f.key] !== undefined && pb.values[f.key] !== "" && pb.values[f.key] !== null)
        .map((f) => ({ label: fieldLabel(f, lang), value: formatValue(f, pb.values[f.key], world, lang) }))
    : [];
  const quietRoute = tpl.boardKey
    .map((k) => tpl.fields.find((f) => f.key === k)!)
    .filter((f) => f?.type === "choice" && world.itemById.get(Number(parts[f.key]))?.meta?.quiet)
    .map((f) => ({ label: fieldLabel(f, lang), value: itemName(world.itemById.get(Number(parts[f.key])), lang) }));

  const firstAt = steps[0]?.record.playedAt;
  const monthsSpan = firstAt ? Math.round((Date.now() - firstAt.getTime()) / (30.44 * 86400_000)) : 0;
  const monthsText = monthsSpan < 1 ? t("board.lessThanMonth") : monthsSpan === 1 ? t("board.month") : t("board.months", { n: monthsSpan });
  const monthNames = Array.from({ length: 12 }, (_, i) => fmtDate(new Date(Date.UTC(2026, i, 15)), lang, "month").slice(0, 3));
  const wrText = wr ? formatScore(tpl, wr.score) : null;
  const pbProof = pb ? pb.proofs.find((x) => x.kind === "video") ?? pb.proofs[0] : null;
  const logHref = `/log?mode=${mode.id}&key=${encodeURIComponent(boardKey)}`;
  const pdelta = (v: number | null | undefined) => (v === null || v === undefined || !pb?.score ? null : gap(v, pb.score, dir));

  return (
    <section aria-labelledby="h-track">
      <div className="trackhead">
        <div>
          <p className="kicker">
            <Link href={`/g/${game.slug}`}>{t("board.kicker", { mode: modeName(mode, lang), game: game.name })}</Link>
            {player.id !== me.id && <> · {player.displayName}</>}
          </p>
          <h2 id="h-track">{label.title}</h2>
        </div>
        {tabGroups.length > 0 && (
          <div className="tabgroups">
            {tabGroups.map((g) => (
              <nav className="tabs" key={g.field.key} aria-label={fieldLabel(g.field, lang)}>
                {g.opts.map((o) => (
                  <Link key={o.value} href={o.href} aria-current={o.current ? "page" : undefined}>
                    {o.text}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
        )}
      </div>

      <div className="track">
        <div>
          {pb ? (
            <>
              <div className="pbline">
                {isTime ? (
                  <BigTime text={formatScore(tpl, pb.score)} />
                ) : (
                  <div className="round">
                    <span>{fieldLabel(scoreF, lang)}</span>
                    <b className="t">{formatScore(tpl, pb.score)}</b>
                  </div>
                )}
                <div className="cells">
                  {prev && prev.score !== null && pb.score !== null && (
                    <span className="cell g t">
                      {formatGap(tpl, gap(pb.score, prev.score, dir))} <small>{t("home.vsPb")}</small>
                    </span>
                  )}
                  <span className="cell o t">
                    {wr && pb.score !== null ? formatGap(tpl, gap(pb.score, wr.score, dir)) : "–"}{" "}
                    <small>{wr ? t("board.vsWr", { holder: `${wr.holder}${wr.holderCountry ? " " + wr.holderCountry : ""}`.toUpperCase() }) : t("home.vsWr")}</small>
                  </span>
                  {sumOfBest !== null && (
                    <span className="cell o t">
                      {formatTime(sumOfBest)} <small>{t("board.sumOfBest")}</small>
                    </span>
                  )}
                </div>
              </div>

              {pbSplits && (
                <>
                  <table className="splits">
                    <thead>
                      <tr>
                        <th>{t("col.split")}</th>
                        <th>{t("col.thisPb")}</th>
                        <th className="hide-s">{t("col.yourBest")}</th>
                        {wrSplits && <th>{`${t("col.wr")} · ${wr!.holder}`.toUpperCase()}</th>}
                        {wrSplits && <th>{t("col.dwr")}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pbSplits.map((v, i) => (
                        <tr key={i}>
                          <td>{t("board.split", { n: i + 1 })}</td>
                          <td className={`t ${CLS[states[i]]}`}>{v === null ? "–" : formatSplit(v)}</td>
                          <td className="t mute hide-s">{own[i] === null ? "–" : formatSplit(own[i] as number)}</td>
                          {wrSplits && <td className="t mute">{formatSplit(wrSplits[i])}</td>}
                          {wrSplits && <td className={`t ${v !== null && v < wrSplits[i] ? "wr" : ""}`}>{v === null ? "–" : formatDelta(v - wrSplits[i])}</td>}
                        </tr>
                      ))}
                      <tr className="tot">
                        <td>{t("board.total")}</td>
                        <td className="t">{formatScore(tpl, pb.score)}</td>
                        <td className="t mute hide-s">{sumOfBest !== null ? formatTime(sumOfBest) : "–"}</td>
                        {wrSplits && <td className="t mute">{wrText}</td>}
                        {wrSplits && <td className="t">{pb.score !== null ? formatDelta(pb.score - wr!.score) : "–"}</td>}
                      </tr>
                    </tbody>
                  </table>
                  <p className="legend">
                    <span style={{ ["--c" as string]: "var(--pb)" }}>{t("legend.pb")}</span>
                    <span style={{ ["--c" as string]: "var(--slow)" }}>{t("legend.slow")}</span>
                    {wrSplits && <span style={{ ["--c" as string]: "var(--wr)" }}>{t("legend.wr")}</span>}
                  </p>
                </>
              )}

              <div className="chartwrap">
                <h3>{steps.length > 1 ? t("board.history", { n: steps.length - 1, months: monthsText }) : t("board.historyOne")}</h3>
                <StepChart
                  points={steps.map((s) => ({ at: s.record.playedAt.toISOString(), v: s.record.score as number }))}
                  wr={wr?.score ?? null}
                  wrLabel={wr ? `WR ${wrText} · ${wr.holder}` : null}
                  direction={dir}
                  kind={isTime ? "time" : "number"}
                  precision={precision}
                  months={monthNames}
                  ariaLabel={t("board.chartLabel", {
                    board: [label.title, label.rest].filter(Boolean).join(" "),
                    from: formatScore(tpl, steps[0].record.score),
                    to: formatScore(tpl, pb.score),
                  })}
                />
              </div>
            </>
          ) : (
            <div className="nothing">
              <p>{t("board.noTime", { name: player.displayName })}</p>
              <Link className="btn" href={logHref}>
                {t("board.logHere")}
              </Link>
            </div>
          )}
        </div>

        <div className="aside">
          {pb && (
            <>
              <h3>{t("proof.title")}</h3>
              {pbProof ? (
                <ProofMedia proof={pbProof} t={t} alt={`${label.title} ${formatScore(tpl, pb.score)}`} caption={fmtDate(pb.playedAt, lang, "full")} />
              ) : (
                <p className="dim">{t("proof.noneYet")}</p>
              )}
            </>
          )}

          {pb && (combo.length > 0 || quietRoute.length > 0) && (
            <>
              <h3>{t("board.combo")}</h3>
              <dl className="combo">
                {[...combo, ...quietRoute].map((c) => (
                  <div key={c.label} style={{ display: "contents" }}>
                    <dt>{c.label}</dt>
                    <dd>{c.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          <h3>{t("board.wr")}</h3>
          {wr ? (
            <dl className="combo">
              <dt>{t("board.wrTime")}</dt>
              <dd className="t">
                {wr.videoUrl ? (
                  <a href={wr.videoUrl} target="_blank" rel="noopener noreferrer">
                    {wrText}
                  </a>
                ) : (
                  wrText
                )}
              </dd>
              <dt>{t("board.wrPlayer")}</dt>
              <dd>
                {wr.holder}
                {wr.holderCountry && <> · {wr.holderCountry}</>}
              </dd>
              {(wr.character || wr.kart) && (
                <>
                  <dt>{t("board.combo")}</dt>
                  <dd>{[wr.character, wr.kart].filter(Boolean).join(" · ")}</dd>
                </>
              )}
              <dt>{t("board.wrDate")}</dt>
              <dd>
                {wr.playedOn ? fmtDate(new Date(wr.playedOn + "T12:00:00Z"), lang, "dayYear") : "–"} ·{" "}
                {wr.sourceUrl ? (
                  <a href={wr.sourceUrl} target="_blank" rel="noopener noreferrer">
                    mkwrs.com
                  </a>
                ) : null}
              </dd>
            </dl>
          ) : (
            <p className="dim">{t("board.wrNone")}</p>
          )}
          {wr && <p className="hint">{t("board.wrFetched", { when: fmtAgo(wr.fetchedAt, lang) })}</p>}

          {steps.length > 0 && (
            <>
              <h3>{t("board.improvements")}</h3>
              <table className="hist">
                <tbody>
                  {[...steps].reverse().slice(0, 12).map((s) => (
                    <tr key={s.record.id}>
                      <td>
                        <Link href={`/r/${s.record.id}`}>{fmtDate(s.record.playedAt, lang, "dayYear")}</Link>
                      </td>
                      <td className="t">{formatScore(tpl, s.record.score)}</td>
                      <td className={`t ${s.previous ? "pb" : "dim"}`}>
                        {s.previous && s.record.score !== null && s.previous.score !== null ? formatGap(tpl, gap(s.record.score, s.previous.score, dir)) : t("board.first")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>{t("board.family")}</h3>
          {family.length === 0 || (family.length === 1 && family[0].u.id === player.id) ? (
            <p className="dim">{t("board.familyNone")}</p>
          ) : (
            <table className="hist">
              <tbody>
                {family.map(({ u, rec }) => {
                  const d = u.id === player.id ? null : pdelta(rec!.score);
                  return (
                    <tr key={u.id} className={u.id === player.id ? "me" : undefined}>
                      <td>
                        <Link href={`${boardPath(game, mode, boardKey, world)}${u.id === me.id ? "" : `?p=${u.username}`}`}>
                          <span className="tla">{u.code}</span> {u.displayName}
                        </Link>
                      </td>
                      <td className="t">{formatScore(tpl, rec!.score)}</td>
                      <td className={`t ${d === null ? "dim" : d < 0 ? "pb" : "slow"}`}>{d === null ? "–" : formatGap(tpl, d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {mine.length > 0 && (
            <details className="cat" style={{ marginTop: 28 }}>
              <summary>
                <span>{t("board.attempts")}</span>
                <small>{mine.length}</small>
              </summary>
              <table className="hist">
                <tbody>
                  {[...mine].reverse().map((r) => {
                    const d = pdelta(r.score);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/r/${r.id}`}>{fmtDate(r.playedAt, lang, "full")}</Link>
                        </td>
                        <td className="t">{formatScore(tpl, r.score)}</td>
                        <td className={`t ${d === null || d === 0 ? "dim" : "slow"}`}>{d === null || d === 0 ? "PB" : formatGap(tpl, d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          )}

          <p style={{ marginTop: 28 }}>
            <Link className="btn ghost" href={logHref}>
              {t("board.logHere")}
            </Link>
          </p>
        </div>
      </div>
      <LogBar fromPage href={logHref} label={t("nav.log")} text={t("logbar.here", { what: [label.title, label.rest].filter(Boolean).join(" · ") })} />
    </section>
  );
}
