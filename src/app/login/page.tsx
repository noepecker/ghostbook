import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "@/components/AuthForms";
import { LangToggle } from "@/components/LangToggle";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { lang, t } = await getT();
  const { next } = await searchParams;
  return (
    <div className="auth">
      <div className="brand">
        <span className="code">GB</span>
        <b>Ghostbook</b>
        <span style={{ marginLeft: "auto", height: 36, display: "flex" }}><LangToggle lang={lang} /></span>
      </div>
      <LoginForm lang={lang} next={next ?? "/"} />
      <p className="foot">{t("login.note")}</p>
    </div>
  );
}
