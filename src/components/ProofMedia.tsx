import type { Proof } from "@/lib/data";
import type { T } from "@/lib/i18n/dict";

function mb(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;
}

export function ProofMedia({ proof, t, caption, alt }: { proof: Proof; t: T; caption: string; alt: string }) {
  const src = `/api/proof/${proof.id}`;
  const secs = proof.durationMs ? Math.round(proof.durationMs / 1000) : null;
  return (
    <figure className="proof">
      {proof.kind === "video" ? (
        <video src={src} controls preload="metadata" playsInline aria-label={`${t("proof.play")}: ${alt}`} />
      ) : (
        <a href={src} target="_blank" rel="noopener" aria-label={t("proof.open")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private blob behind an authenticated redirect */}
          <img src={src} alt={alt} loading="lazy" />
        </a>
      )}
      <figcaption>
        <span>
          {proof.kind === "video" ? t("proof.clip") : t("proof.shot")}
          {secs !== null && ` · 0:${String(secs).padStart(2, "0")}`} · {mb(proof.size)}
        </span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}
