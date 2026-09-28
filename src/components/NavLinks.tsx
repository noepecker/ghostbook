"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links, label }: { links: { href: string; label: string; log?: boolean }[]; label: string }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label={label}>
      {links.map((l) => {
        const active = !l.log && (l.href === "/" ? path === "/" || path.startsWith("/p/") : path.startsWith(l.href));
        return (
          <Link key={l.href} href={l.href} className={l.log ? "log" : undefined} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
