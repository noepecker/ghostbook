"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { makeT, type Lang } from "@/lib/i18n/dict";
import { uploadProof, type PendingFile } from "@/lib/upload-client";
import { Glyphs } from "./Bits";
import { ProofPicker } from "./ProofPicker";

export function ProofAdder({ recordId, lang }: { recordId: number; lang: Lang }) {
  const t = makeT(lang);
  const router = useRouter();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = files.filter((f) => !f.error);
  async function go() {
    setBusy(true);
    for (const f of ready) {
      try {
        await uploadProof(recordId, f, (pct) => setStatus(t("log.uploading", { name: f.file.name, pct })));
      } catch (e) {
        setStatus(t("log.uploadFailed", { name: f.file.name, error: (e as Error).message }));
        setBusy(false);
        return;
      }
    }
    setFiles([]);
    setStatus(null);
    setBusy(false);
    router.refresh();
  }
  return (
    <div style={{ marginTop: 14 }}>
      <Glyphs />
      <ProofPicker lang={lang} files={files} onChange={setFiles} />
      {ready.length > 0 && (
        <button type="button" className="btn" style={{ marginTop: 10 }} onClick={go} disabled={busy}>
          {t("record.addProof")}
        </button>
      )}
      {status && <p className="hint" role="status">{status}</p>}
    </div>
  );
}
