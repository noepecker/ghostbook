import { setLanguage } from "@/actions/auth";
import type { Lang } from "@/lib/i18n/dict";

export function LangToggle({ lang }: { lang: Lang }) {
  return (
    <form action={setLanguage} className="lang" role="group" aria-label={lang === "es" ? "Idioma" : "Language"}>
      <button type="submit" name="lang" value="en" aria-pressed={lang === "en"} lang="en">EN</button>
      <button type="submit" name="lang" value="es" aria-pressed={lang === "es"} lang="es">ES</button>
    </form>
  );
}
