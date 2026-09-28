"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Phone-only bar pinned to the bottom: the one thing you do right after a race. */
export function LogBar({ href, label, text }: { href: string; label: string; text: string }) {
  const path = usePathname();
  if (path.startsWith("/log")) return null;
  return (
    <>
      <div className="logbar-space" aria-hidden="true" />
      <Link className="logbar" href={href}>
        <b>{label}</b>
        <span>{text}</span>
      </Link>
    </>
  );
}
