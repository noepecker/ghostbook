import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { invites, users } from "@/lib/db/schema";
import { fmtDate } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { RegisterForm } from "@/components/AuthForms";
import { LangToggle } from "@/components/LangToggle";

export const metadata = { title: "Join" };

export default async function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { lang, t } = await getT();
  const [inv] = await db
    .select({ expiresAt: invites.expiresAt, by: users.displayName })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdBy))
    .where(and(eq(invites.token, token), isNull(invites.usedBy), gt(invites.expiresAt, new Date())));
  return (
    <div className="auth">
      <div className="brand">
        <span className="code">GB</span>
        <b>Ghostbook</b>
        <span style={{ marginLeft: "auto", height: 36, display: "flex" }}><LangToggle lang={lang} /></span>
      </div>
      {inv ? (
        <>
          <RegisterForm lang={lang} token={token} />
          <p className="foot">{t("register.invitedBy", { name: inv.by ?? "Ghostbook", date: fmtDate(inv.expiresAt, lang, "dayYear") })}</p>
        </>
      ) : (
        <div className="auth-inner form">
          <h2>{t("register.title")}</h2>
          <p className="errors">{t("register.bad")}</p>
        </div>
      )}
    </div>
  );
}
