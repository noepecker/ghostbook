"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { refreshWorldRecords } from "@/lib/wr/refresh";

export async function refreshWrs(_: { msg?: string; bad?: boolean }, form: FormData): Promise<{ msg?: string; bad?: boolean }> {
  await requireUser();
  const { lang, t } = await getT();
  const game = String(form.get("game") ?? "") || undefined;
  const [r] = await refreshWorldRecords(db, { gameSlug: game });
  if (!r) return {};
  if (r.tooSoonUntil) return { msg: t("games.wrTooSoon", { time: fmtDate(r.tooSoonUntil, lang, "time") }), bad: true };
  if (r.error) return { msg: t("games.wrFailed", { source: r.source, error: r.error }), bad: true };
  revalidatePath("/", "layout");
  return { msg: t("games.wrRefreshed", { n: r.updated }) };
}
