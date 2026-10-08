import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

/** The owner area. Everything else this helper sees (/login, /auth, unknown paths) is public. */
function isOwnerArea(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Runs in proxy.ts for the owner area and auth routes (never for /s/* station links):
 * 1. refreshes the Supabase session and writes rotated cookies to the response;
 * 2. optimistic redirect: no valid session on /admin/* → /login?next=<path>;
 *    a signed-in visitor on /login → /admin.
 * This is a convenience, not the security boundary: app/(admin)/layout.tsx and every
 * Server Action re-check with requireAdmin(), and RLS enforces it in the database.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const env = getSupabasePublicEnv();
  // Not configured yet: let the page explain it instead of redirect-looping.
  if (!env) return response;

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Do not put code between createServerClient and getClaims(): it triggers the refresh.
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const authUnreachable = Boolean(error && error.name === "AuthRetryableFetchError");
  const { pathname, search } = request.nextUrl;

  const redirectWithCookies = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  };

  // If Supabase Auth cannot be reached, do not bounce people to /login: the page
  // shows the connection problem instead.
  if (!signedIn && !authUnreachable && isOwnerArea(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/admin") url.searchParams.set("next", `${pathname}${search}`);
    return redirectWithCookies(url);
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return redirectWithCookies(url);
  }

  return response;
}
