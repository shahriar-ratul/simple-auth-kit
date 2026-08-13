"use client";

import { deleteCookie, getCookie, setCookie } from "cookies-next/client";
import type { AuthTokens, TokenStorage } from "@easy-auth/auth-client";

// Per the project's resolved decision (see plan/README.md): frontend-managed cookies, not
// backend-issued httpOnly ones. The backend's `Authorization: Bearer` contract is unchanged —
// this is purely where the client caches the token pair between page loads. A plain (readable)
// cookie is fine here since nothing server-side in this app ever needs to see it; the browser
// attaches it to no request automatically, `AuthClient` reads it and sets the header itself.
const COOKIE_NAME = "easy_auth_tokens";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — well past the refresh token's own TTL, which is what actually gates session length

export const cookieTokenStorage: TokenStorage = {
  async get(): Promise<AuthTokens | null> {
    const raw = getCookie(COOKIE_NAME);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthTokens;
    } catch {
      return null;
    }
  },

  async set(tokens: AuthTokens): Promise<void> {
    setCookie(COOKIE_NAME, JSON.stringify(tokens), {
      maxAge: COOKIE_MAX_AGE_SECONDS,
      sameSite: "lax",
      path: "/",
    });
  },

  async clear(): Promise<void> {
    deleteCookie(COOKIE_NAME, { path: "/" });
  },
};
