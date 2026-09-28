"use client";

import { upload } from "@vercel/blob/client";
import { attachProof } from "@/actions/records";

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;

export interface PendingFile {
  file: File;
  kind: "image" | "video";
  durationMs: number | null;
  error: string | null;
}

function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration * 1000 : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

export type ErrText = (key: "log.tooLong" | "log.tooBig" | "log.badType", p: Record<string, string | number>) => string;

/** Checks happen before anything leaves the phone: type, size, and clip length. */
export async function inspectFile(file: File, err: ErrText): Promise<PendingFile> {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
  if (!kind) return { file, kind: "image", durationMs: null, error: err("log.badType", { name: file.name }) };
  if (kind === "image") {
    return { file, kind, durationMs: null, error: file.size > MAX_IMAGE_BYTES ? err("log.tooBig", { name: file.name, mb: 20 }) : null };
  }
  if (file.size > MAX_VIDEO_BYTES) return { file, kind, durationMs: null, error: err("log.tooBig", { name: file.name, mb: 100 }) };
  const d = await videoDuration(file);
  if (d !== null && d > MAX_VIDEO_SECONDS * 1000 + 500) {
    return { file, kind, durationMs: d, error: err("log.tooLong", { name: file.name, secs: Math.round(d / 1000) }) };
  }
  return { file, kind, durationMs: d, error: null };
}

function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize("NFD").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40) || "proof";
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toLowerCase() : "";
  return ext ? `${base}.${ext}` : base;
}

/** Upload straight to the private Blob store, then register the file on the record. */
export async function uploadProof(
  recordId: number,
  p: PendingFile,
  onProgress: (pct: number) => void,
): Promise<void> {
  const blob = await upload(`proofs/${recordId}/${safeName(p.file.name)}`, p.file, {
    access: "private",
    handleUploadUrl: "/api/blob/upload",
    clientPayload: String(recordId),
    contentType: p.file.type,
    multipart: p.file.size > 8 * 1024 * 1024,
    onUploadProgress: (e) => onProgress(Math.round(e.percentage)),
  });
  const res = await attachProof({ recordId, url: blob.url, pathname: blob.pathname, durationMs: p.durationMs });
  if (!res.ok) throw new Error(res.error ?? "attach failed");
}

export function fileSize(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;
}
