import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * - /s/* (station workspaces, no account): never touches Supabase Auth; adds
 *   Referrer-Policy: no-referrer and X-Robots-Tag: noindex so the token in the URL is
 *   not leaked to other sites or indexed.
 * - /: no public page; redirect to /admin (the owner area).
 * - /admin, /login, /auth: refresh the owner's Supabase session cookie and redirect a
 *   signed-out visitor away from /admin (see lib/supabase/proxy.ts).
 */
export async function proxy(request: NextRequest) {
  return harden(await route(request));
}

async function route(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (pathname === "/s" || pathname.startsWith("/s/")) {
    const response = NextResponse.next();
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return updateSession(request);
}

/** No framing by other sites (clickjacking on the owner area) and no MIME sniffing. */
function harden(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except: /api (the sync route authenticates with its own bearer
     * secret), Next internals, and static files in /public (images, icons).
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
