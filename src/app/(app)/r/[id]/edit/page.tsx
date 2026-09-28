import { notFound } from "next/navigation";
import { mayEdit } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadWorld, recordById } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { buildLogProps } from "@/lib/logprops";
import { LogForm, type EditSeed } from "@/components/LogForm";

export const metadata = { title: "Edit record" };

export default async function EditRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const rec = Number.isInteger(Number(id)) ? await recordById(Number(id)) : null;
  if (!rec || !mayEdit(me, rec)) notFound();
  const { lang } = await getT();
  const world = await loadWorld();
  const mode = world.modeById.get(rec.modeId)!;
  const game = world.gameById.get(mode.gameId)!;
  const props = await buildLogProps(world, game, me.id, lang, rec.id);

  const edit: EditSeed = {
    recordId: rec.id,
    modeId: rec.modeId,
    values: rec.values,
    parts: rec.participants.map((p) => ({
      userId: p.userId,
      guestName: p.guestName,
      stats: Object.fromEntries(Object.entries(p.stats ?? {}).map(([k, v]) => [k, String(v)])),
    })),
    playedAt: rec.playedAt.toISOString(),
    notes: rec.notes ?? "",
    proofs: rec.proofs.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: p.pathname.split("/").pop() ?? p.pathname,
      size: Number(p.size),
      durationMs: p.durationMs,
    })),
  };

  return <LogForm lang={lang} {...props} meId={me.id} initialModeId={rec.modeId} initialKey={null} edit={edit} />;
}
