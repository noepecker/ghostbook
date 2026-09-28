"use client";

import { useTransition } from "react";
import { deleteRecord } from "@/actions/records";
import { makeT, type Lang } from "@/lib/i18n/dict";

export function DeleteRecord({ recordId, lang }: { recordId: number; lang: Lang }) {
  const t = makeT(lang);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn warn"
      disabled={pending}
      onClick={() => {
        if (confirm(t("record.deleteConfirm"))) start(() => deleteRecord(recordId));
      }}
    >
      {t("record.delete")}
    </button>
  );
}
