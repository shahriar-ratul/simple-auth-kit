import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AUTH_API_INTERNAL_URL } from "@/lib/env";
import { apiAuthPrefix, authRoutes, DEFAULT_LOGIN_REDIRECT, publicRoutes } from "@/routes";

const TOKEN_COOKIE = "easy_auth_tokens";

function loginRedirect(nextUrl: URL) {
  let callbackUrl = nextUrl.pathname;
  if (nextUrl.search) callbackUrl += nextUrl.search;
  return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, nextUrl));
}

export default auth(async (req) => {
  const isLoggedIn = !!req.auth;
  const { nextUrl } = req;

  const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix);
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);

  if (isPublicRoute || isApiAuthRoute) return;

  if (isAuthRoute) {
    if (isLoggedIn) return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    return;
  }

  if (!isLoggedIn) return loginRedirect(nextUrl);

  // The NextAuth session being alive doesn't mean the backend session behind it still is —
  // verify the cached access token server-side on every protected navigation, so a revocation
  // (logout-all, block, deactivate) takes effect at the next click, not at session expiry.
  const raw = req.cookies.get(TOKEN_COOKIE)?.value;
  let accessToken: string | undefined;
  try {
    accessToken = raw ? (JSON.parse(raw) as { accessToken?: string }).accessToken : undefined;
  } catch {
    accessToken = undefined;
  }
  if (!accessToken) {
    const res = loginRedirect(nextUrl);
    res.cookies.delete(TOKEN_COOKIE);
    return res;
  }

  try {
    const verify = await fetch(`${AUTH_API_INTERNAL_URL}/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    // 401 alone isn't a verdict — the access token may merely need the refresh rotation the
    // client performs itself. Only an explicitly dead session (403 blocked/deactivated) or a
    // 401 with no refresh token to fall back on forces a logout here.
    if (verify.status === 401) {
      const hasRefreshToken = (() => {
        try {
          return raw ? !!(JSON.parse(raw) as { refreshToken?: string }).refreshToken : false;
        } catch {
          return false;
        }
      })();
      if (!hasRefreshToken) {
        const res = loginRedirect(nextUrl);
        res.cookies.delete(TOKEN_COOKIE);
        return res;
      }
    } else if (verify.status === 403) {
      const res = loginRedirect(nextUrl);
      res.cookies.delete(TOKEN_COOKIE);
      return res;
    }
  } catch {
    // Backend unreachable — let the page render; client-side calls will surface the error.
  }

  return;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
