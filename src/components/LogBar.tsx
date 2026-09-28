"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Board and record pages render their own bar, prefilled with that board.
const PAGE_OWNS_BAR = [/^\/g\/[^/]+\/[^/]+\/.+/, /^\/r\/\d+/];

/** Phone-only bar pinned to the bottom: the one thing you do right after a race. */
export function LogBar({ href, label, text, fromPage = false }: { href: string; label: string; text: string; fromPage?: boolean }) {
  const path = usePathname();
  if (path.startsWith("/log")) return null;
  if (!fromPage && PAGE_OWNS_BAR.some((re) => re.test(path))) return null;
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
