import Link from "next/link";
import { notFound } from "next/navigation";
import { mayEdit } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadWorld, recordById, recordsForModes } from "@/lib/data";
import { fmtDate } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { bestBefore, computePBs, gap, ownerKeys, squadKey, userKey } from "@/lib/pb";
import {
  boardLabel,
  boardPath,
  formatGap,
  formatScore,
  formatValue,
  modeName,
  participantCode,
  participantName,
  playersLabel,
  recordTitle,
} from "@/lib/present";
import { fieldLabel, parseBoardKey } from "@/lib/template";
import { formatInt, formatSplit } from "@/lib/time";
import { ProofMedia } from "@/components/ProofMedia";
import { ProofAdder } from "@/components/ProofAdder";
import { DeleteRecord } from "@/components/DeleteRecord";
import { LogBar } from "@/components/LogBar";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await recordById(Number(id));
  if (!rec) return { title: "Record" };
  const world = await loadWorld();
  const { lang } = await getT();
  const mode = world.modeById.get(rec.modeId)!;
  return { title: `${recordTitle(mode, rec, world, lang)} · ${formatScore(mode.template, rec.score)}` };
}

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const rec = Number.isInteger(Number(id)) ? await recordById(Number(id)) : null;
  if (!rec) notFound();
  const { lang, t } = await getT();
  const world = await loadWorld();
  const mode = world.modeById.get(rec.modeId)!;
  const game = world.gameById.get(mode.gameId)!;
  const tpl = mode.template;
  const dir = tpl.direction;
  const scoreF = tpl.fields.find((f) => f.key === tpl.score)!;
  const playersF = tpl.fields.find((f) => f.type === "players");
  const stats = playersF?.stats ?? [];
  const title = recordTitle(mode, rec, world, lang);
  const board = boardLabel(mode, rec.boardKey, world, lang);

  // every record in this game's categories, for "on this board" and "squad records on this map"
  const gameModes = world.modes.filter((m) => m.gameId === game.id);
  const all = await recordsForModes(gameModes.map((m) => m.id));
  const sameBoard = all.filter((r) => r.modeId === rec.modeId && r.boardKey === rec.boardKey);
  const sq = squadKey(rec.participants);
  const owner = sq ?? (rec.participants.find((p) => p.userId === me.id)?.userId ? userKey(me.id) : ownerKeys(rec)[0]);
  const best = owner ? computePBs(sameBoard, dir).get(rec.boardKey)?.get(owner) : undefined;
  const before = owner ? bestBefore(sameBoard, dir, owner, rec.boardKey, rec) : null;
  const isBest = best?.id === rec.id;

  // squad (or player) records on the same first key value (the map / the track), across categories
  const parts = parseBoardKey(rec.boardKey);
  const anchorKey = tpl.boardKey.find((k) => tpl.fields.find((f) => f.key === k)?.type === "choice");
  const anchorVal = anchorKey ? parts[anchorKey] : undefined;
  const squadRows: { href: string; what: string; res: string; date: string }[] = [];
  if (owner && anchorVal) {
    for (const m of gameModes) {
      const mk = m.template.boardKey.find((k) => m.template.fields.find((f) => f.key === k)?.type === "choice");
      if (!mk) continue;
      const recs = all.filter((r) => r.modeId === m.id && parseBoardKey(r.boardKey)[mk] === anchorVal && ownerKeys(r).includes(owner));
      const pbs = computePBs(recs, m.template.direction);
      for (const [bk, owners] of pbs) {
        const r = owners.get(owner);
        if (!r) continue;
        const bl = boardLabel(m, bk, world, lang);
        const sf = m.template.fields.find((f) => f.key === m.template.score);
        squadRows.push({
          href: boardPath(game, m, bk, world),
          what: [modeName(m, lang), bl.rest].filter(Boolean).join(" · "),
          res: `${sf && sf.type !== "time" ? fieldLabel(sf, lang) + " " : ""}${formatScore(m.template, r.score)}`,
          date: fmtDate(r.playedAt, lang, "day"),
        });
      }
    }
  }

  const facts = tpl.fields
    .filter((f) => f.key !== tpl.score && f.type !== "players" && !(anchorKey === f.key))
    .map((f) => {
      const v = rec.values[f.key];
      if (v === undefined || v === null || v === "") return null;
      if (f.type === "boolean" && !v) return null;
      let text = formatValue(f, v, world, lang);
      if (f.type === "splits" && Array.isArray(v)) text = v.map((x) => (typeof x === "number" ? formatSplit(x) : "–")).join(" · ");
      return { label: fieldLabel(f, lang), text };
    })
    .filter((x) => x !== null);
  if (playersF) facts.push({ label: fieldLabel(playersF, lang), text: playersLabel(rec.participants.length, lang) });

  const creator = rec.createdBy ? world.userById.get(rec.createdBy) : undefined;
  const canEdit = mayEdit(me, rec);
  const editor = rec.updatedBy ? world.userById.get(rec.updatedBy) : undefined;
  const scoreText = formatScore(tpl, rec.score);
  const isTime = scoreF.type === "time";

  return (
    <section aria-labelledby="h-rec">
      <div className="zhead">
        <div>
          <p className="kicker">
            <Link href={`/g/${game.slug}`}>{game.shortCode}</Link> · {modeName(mode, lang)}
            {board.rest && <> · {board.rest}</>} · {fmtDate(rec.playedAt, lang, "weekdayTime")}
          </p>
          <h2 id="h-rec">{title}</h2>
        </div>
        <div className="round">
          <span>{fieldLabel(scoreF, lang)}</span>
          <b className={`t ${isTime && scoreText.length > 7 ? "long" : ""}`}>{scoreText}</b>
        </div>
      </div>

      <div className="zgrid">
        <div>
          {rec.participants.length > 0 && (
            <>
              <h3>{playersF ? fieldLabel(playersF, lang) : t("record.squad")}</h3>
              <div className="tower squad" role="table" aria-label={t("record.squad")} style={{ ["--stats" as string]: stats.length }}>
                <div className="th" role="row">
                  <span />
                  <span />
                  <span>{t("col.player")}</span>
                  {stats.map((s) => (
                    <span key={s.key}>{fieldLabel(s, lang).toUpperCase()}</span>
                  ))}
                </div>
                {rec.participants.map((p, i) => (
                  <div className="tr" role="row" key={p.id}>
                    <span className="pos">{i + 1}</span>
                    <span className="tla">{participantCode(world, p)}</span>
                    <span>
                      {p.userId ? (
                        <Link href={`/p/${world.userById.get(p.userId)?.username}`}>{participantName(world, p)}</Link>
                      ) : (
                        <>
                          {participantName(world, p)} <span className="dim">· {t("record.guest")}</span>
                        </>
                      )}
                    </span>
                    {stats.map((s) => (
                      <span className="num t" key={s.key}>
                        {typeof p.stats?.[s.key] === "number" ? formatInt(p.stats[s.key]) : "–"}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          <dl className="facts">
            {facts.map((f) => (
              <div key={f.label} style={{ display: "contents" }}>
                <dt>{f.label}</dt>
                <dd className="t">{f.text}</dd>
              </div>
            ))}
            <dt>{t("record.onThisBoard")}</dt>
            <dd>
              <Link href={boardPath(game, mode, rec.boardKey, world)}>{[board.title, board.rest].filter(Boolean).join(" · ")}</Link>
              {" · "}
              {isBest ? (
                <>
                  <span className="pb">{sq ? t("record.squadBest") : t("record.personalBest")}</span>
                  {before && before.score !== null && rec.score !== null && (
                    <>
                      {" · "}
                      {t("record.previous", { value: formatScore(tpl, before.score), date: fmtDate(before.playedAt, lang, "day") })}{" "}
                      <span className="pb t">{formatGap(tpl, gap(rec.score, before.score, dir))}</span>
                    </>
                  )}
                </>
              ) : best ? (
                <span className="dim">{t("record.notBest", { value: formatScore(tpl, best.score), date: fmtDate(best.playedAt, lang, "day") })}</span>
              ) : null}
            </dd>
          </dl>

          {rec.notes && (
            <p className="note">
              {rec.notes}
              <cite>{t("record.noteBy", { name: creator?.displayName ?? "?" })}</cite>
            </p>
          )}
          {!rec.notes && creator && <p className="hint" style={{ marginTop: 20 }}>{t("record.loggedBy", { name: creator.displayName })}</p>}
          {rec.updatedAt && (
            <p className="hint" style={{ marginTop: rec.notes || creator ? 6 : 20 }}>
              {t("record.editedBy", { name: editor?.displayName ?? "?", date: fmtDate(rec.updatedAt, lang, "weekdayTime") })}
            </p>
          )}
        </div>

        <div className="aside">
          <h3>{rec.proofs.length === 1 ? t("proof.oneFile") : rec.proofs.length ? t("proof.files", { n: rec.proofs.length }) : t("proof.title")}</h3>
          {rec.proofs.length ? (
            <div className={`thumbs ${rec.proofs.length === 1 ? "one" : ""}`}>
              {rec.proofs.map((p) => (
                <ProofMedia key={p.id} proof={p} t={t} alt={`${title} ${scoreText}`} caption={fmtDate(p.createdAt, lang, "time")} />
              ))}
            </div>
          ) : (
            <p className="dim">{t("proof.noneYet")}</p>
          )}
          {canEdit && <ProofAdder recordId={rec.id} lang={lang} />}

          {squadRows.length > 0 && (
            <>
              <h3 style={{ marginTop: 28 }}>{t("record.squadRecords", { title: anchorVal ? board.title : title })}</h3>
              <table className="hist">
                <tbody>
                  {squadRows.map((r) => (
                    <tr key={r.href}>
                      <td>
                        <Link href={r.href}>{r.what}</Link>
                      </td>
                      <td className="t">{r.res}</td>
                      <td>{r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {canEdit && (
            <div className="danger">
              <Link className="btn ghost" href={`/r/${rec.id}/edit`}>
                {t("record.edit")}
              </Link>
              <DeleteRecord recordId={rec.id} lang={lang} />
            </div>
          )}
        </div>
      </div>
      <LogBar
        fromPage
        href={`/log?mode=${mode.id}&key=${encodeURIComponent(rec.boardKey)}`}
        label={t("nav.log")}
        text={t("logbar.here", { what: [board.title, board.rest].filter(Boolean).join(" · ") })}
      />
    </section>
  );
}
