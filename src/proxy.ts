import { type NextRequest, NextResponse } from "next/server";

/**
 * Next 16 `proxy` (formerly middleware) for `/e/*` (brief Ф2 «Сессии»): without a session cookie →
 * `/login`. Only the cookie's presence is checked here (no DB in the proxy); the real check is
 * `requireUser` / `requireMember` in every page and action.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.get("toi_session")?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/e", "/e/:path*"] };
