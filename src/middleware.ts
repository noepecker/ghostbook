import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no session cookie, no pages. The session itself is checked against the
// database in every page, server action and route handler (requireUser).
const PUBLIC = [/^\/login$/, /^\/register\/[^/]+$/, /^\/api\/cron\//];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (req.cookies.has("gb_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Unauthorized", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
