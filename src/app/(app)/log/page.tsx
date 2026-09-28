import { requireUser } from "@/lib/auth";
import { loadWorld } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { readLast } from "@/lib/lastlog";
import { buildLogProps } from "@/lib/logprops";
import { LogForm } from "@/components/LogForm";

export const metadata = { title: "Log a time" };

export default async function LogPage({ searchParams }: { searchParams: Promise<{ mode?: string; game?: string; key?: string }> }) {
  const me = await requireUser();
  const { lang } = await getT();
  const world = await loadWorld();
  const sp = await searchParams;
  const last = await readLast();

  let mode = sp.mode ? world.modeById.get(Number(sp.mode)) : undefined;
  let game = mode ? world.gameById.get(mode.gameId) : sp.game ? world.gameBySlug.get(sp.game) : undefined;
  if (!game && last) {
    mode = world.modeById.get(last.modeId);
    game = mode ? world.gameById.get(mode.gameId) : undefined;
  }
  game ??= world.games[0];
  const modes = world.modes.filter((m) => m.gameId === game.id);
  if (!mode || mode.gameId !== game.id) mode = last && modes.find((m) => m.id === last.modeId) ? world.modeById.get(last.modeId) : modes[0];

  const props = await buildLogProps(world, game, me.id, lang);

  return (
    <LogForm
      key={`${game.id}-${mode?.id ?? 0}-${sp.key ?? ""}`}
      lang={lang}
      {...props}
      meId={me.id}
      initialModeId={mode?.id ?? null}
      initialKey={sp.key ?? null}
    />
  );
}
