import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main>
      <section>
        <p className="kicker">404</p>
        <h2 style={{ margin: "8px 0 20px" }}>{t("misc.notFound")}</h2>
        <Link className="btn" href="/">
          {t("misc.home")}
        </Link>
      </section>
    </main>
  );
}
