import { cookies } from "next/headers";
import type { AuthTokens, TokenStorage } from "@easy-auth/auth-client";

// Server-side twin of lib/token-storage.ts — same cookie name and JSON shape, so tokens written
// here (NextAuth authorize()) are immediately readable by the browser-side AuthClient and vice
// versa. Only usable where the Next.js cookie jar is mutable (server actions, route handlers).
const COOKIE_NAME = "easy_auth_tokens";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const serverCookieTokenStorage: TokenStorage = {
  async get(): Promise<AuthTokens | null> {
    const raw = (await cookies()).get(COOKIE_NAME)?.value;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthTokens;
    } catch {
      return null;
    }
  },

  async set(tokens: AuthTokens): Promise<void> {
    (await cookies()).set(COOKIE_NAME, JSON.stringify(tokens), {
      maxAge: COOKIE_MAX_AGE_SECONDS,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
  },

  async clear(): Promise<void> {
    (await cookies()).delete(COOKIE_NAME);
  },
};
