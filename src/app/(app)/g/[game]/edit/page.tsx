import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadWorld, modeRecordCounts } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { itemName, modeName } from "@/lib/present";
import { AddItemForm, EditGameForm, NewCatalogForm } from "@/components/GameForms";
import { ModeEditor } from "@/components/ModeEditor";
import { ListFilter } from "@/components/Picker";

export const metadata = { title: "Edit game" };

export default async function EditGamePage({ params }: { params: Promise<{ game: string }> }) {
  await requireUser();
  const { lang, t } = await getT();
  const world = await loadWorld();
  const { game: slug } = await params;
  const game = world.gameBySlug.get(slug);
  if (!game) notFound();
  const cats = world.catalogs.filter((c) => c.gameId === game.id);
  const items = world.catalogItems.get(game.id) ?? {};
  const modes = world.modes.filter((m) => m.gameId === game.id);
  const counts = await modeRecordCounts();
  const catList = cats.map((c) => ({ key: c.key, name: lang === "es" && c.nameEs ? c.nameEs : c.name }));

  return (
    <section>
      <div className="trackhead">
        <div>
          <p className="kicker">
            <Link href={`/g/${game.slug}`}>{game.name}</Link>
          </p>
          <h2>{t("editor.title", { game: game.shortCode })}</h2>
        </div>
      </div>
      <div className="editor">
        <div>
          <h3>{t("editor.gameInfo")}</h3>
          <EditGameForm lang={lang} id={game.id} name={game.name} short={game.shortCode} />

          <h3 style={{ marginTop: 36 }}>{t("editor.catalogs")}</h3>
          <p className="hint" style={{ marginBottom: 12 }}>{t("editor.catalogHint")}</p>
          {cats.map((c) => {
            const list = items[c.key] ?? [];
            return (
              <details className="cat" key={c.id} data-filter-scope>
                <summary>
                  <span>{lang === "es" && c.nameEs ? c.nameEs : c.name}</span>
                  <small>
                    {c.key} · {t("editor.items", { n: list.length })}
                  </small>
                </summary>
                {list.length > 12 && (
                  <ListFilter lang={lang} what={(lang === "es" && c.nameEs ? c.nameEs : c.name).toLowerCase()} target="li[data-filter]" total={list.length} />
                )}
                <ul>
                  {list.map((i) => (
                    <li key={i.id} data-filter={[i.name, i.nameEs].filter(Boolean).join("|")}>
                      {itemName(i, lang)}
                      {i.createdBy && <small>{t("editor.createdBy", { code: world.userById.get(i.createdBy)?.code ?? "?" })}</small>}
                    </li>
                  ))}
                </ul>
                <AddItemForm lang={lang} catalogId={c.id} />
              </details>
            );
          })}
          <NewCatalogForm lang={lang} gameId={game.id} />
        </div>

        <div>
          <h3>{t("editor.modes")}</h3>
          <p className="hint" style={{ marginBottom: 12 }}>{t("editor.modeHint")}</p>
          <div className="modes-list">
            {modes.map((m) => (
              <details className="mode" key={m.id}>
                <summary>
                  <span>{modeName(m, lang)}</span>
                  <small>{counts.get(m.id) ?? 0}</small>
                </summary>
                <ModeEditor lang={lang} gameId={game.id} modeId={m.id} initialName={m.name} initialNameEs={m.nameEs} initial={m.template} catalogs={catList} />
              </details>
            ))}
            <details className="mode" open={modes.length === 0}>
              <summary>
                <span>{t("editor.newMode")}</span>
                <small>+</small>
              </summary>
              <ModeEditor lang={lang} gameId={game.id} modeId={null} initialName="" initialNameEs={null} initial={null} catalogs={catList} />
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
