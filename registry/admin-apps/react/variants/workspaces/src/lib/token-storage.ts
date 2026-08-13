import { deleteCookie, getCookie, setCookie } from "cookies-next/client";
import type { AuthTokens, TokenStorage } from "@easy-auth/auth-client";

// Distinct from apps/admin-react's cookie on purpose: browsers scope cookies by host and
// ignore the port, so both consoles running on localhost share one cookie jar and a shared name
// would mean signing into one signs you out of the other.
const COOKIE_NAME = "easy-auth-workspaces-tokens";

/**
 * Frontend-managed cookie storage for the shared AuthClient — per the project's resolved
 * decision, this app caches tokens client-side in a (non-httpOnly) cookie rather than relying
 * on backend-issued cookies. The backend's `Authorization: Bearer` contract is unchanged; this
 * is purely where the SPA keeps the token between page loads/tabs.
 */
export const cookieTokenStorage: TokenStorage = {
  async get(): Promise<AuthTokens | null> {
    const raw = getCookie(COOKIE_NAME);
    if (!raw || typeof raw !== "string") return null;
    try {
      return JSON.parse(raw) as AuthTokens;
    } catch {
      return null;
    }
  },

  async set(tokens: AuthTokens): Promise<void> {
    setCookie(COOKIE_NAME, JSON.stringify(tokens), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days — refresh() rotates the actual token lifetimes server-side
      sameSite: "lax",
    });
  },

  async clear(): Promise<void> {
    deleteCookie(COOKIE_NAME, { path: "/" });
  },
};
