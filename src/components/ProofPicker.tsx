"use client";

import { useRef } from "react";
import { makeT, type Lang } from "@/lib/i18n/dict";
import { fileSize, inspectFile, type PendingFile } from "@/lib/upload-client";

export function ProofPicker({ lang, files, onChange }: { lang: Lang; files: PendingFile[]; onChange: (f: PendingFile[]) => void }) {
  const t = makeT(lang);
  const input = useRef<HTMLInputElement>(null);
  async function pick(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) next.push(await inspectFile(f, (k, p) => t(k, p)));
    onChange(next);
    if (input.current) input.current.value = "";
  }
  return (
    <>
      <button type="button" className="attach" onClick={() => input.current?.click()}>
        <svg width="22" height="22" aria-hidden="true">
          <use href="#g-clip" />
        </svg>
        <span>
          <b>{t("log.attach")}</b>
          <span>{t("log.attachHint")}</span>
        </span>
      </button>
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => pick(e.target.files)} />
      {files.length > 0 && (
        <ul className="files">
          {files.map((f, i) => (
            <li key={i}>
              <b className={f.error ? "bad" : ""}>{f.kind === "video" ? t("proof.clip").toUpperCase() : t("proof.shot").toUpperCase()}</b>
              <span className={f.error ? "bad" : ""} title={f.error ?? f.file.name}>
                {f.error ?? `${f.file.name} · ${fileSize(f.file.size)}${f.durationMs ? ` · ${Math.round(f.durationMs / 1000)} s` : ""}`}
              </span>
              <button type="button" className="linkish" onClick={() => onChange(files.filter((_, j) => j !== i))}>
                {t("log.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
