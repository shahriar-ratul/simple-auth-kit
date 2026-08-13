import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { AuthClient } from "@easy-auth/auth-client";
import { AUTH_API_INTERNAL_URL } from "@/lib/env";
import { serverCookieTokenStorage } from "@/lib/server-token-storage";

declare module "next-auth" {
  interface User {
    expired_at?: number;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      expired_at?: number;
    };
  }
}

/**
 * Thrown from authorize() when the account has 2FA enabled: the challenge token rides out to the
 * login form in the error code so the second signIn() call can complete it.
 */
export class TwoFactorRequiredError extends CredentialsSignin {
  constructor(challengeToken: string) {
    super();
    this.code = `2fa_required:${challengeToken}`;
  }
}

// Server-side AuthClient sharing the browser client's cookie (name + JSON shape), so a login
// completed here is immediately visible to every existing client-side call site.
const serverAuthClient = new AuthClient({
  baseUrl: AUTH_API_INTERNAL_URL,
  storage: serverCookieTokenStorage,
});

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  // Self-hosted deployment — the app serves whatever host it's bound to (localhost, docker
  // service name, LAN IP); there's no fixed AUTH_URL to pin, so trust the incoming Host header.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        identifier: {},
        password: {},
        challengeToken: {},
        code: {},
      },
      async authorize(credentials) {
        const { identifier, password, challengeToken, code } = credentials as Partial<
          Record<"identifier" | "password" | "challengeToken" | "code", string>
        >;

        if (challengeToken && code) {
          await serverAuthClient.loginTwoFactor({ challengeToken, code });
        } else {
          if (!identifier || !password) return null;
          const result = await serverAuthClient.login({ identifier, password });
          if ("twoFactorRequired" in result) throw new TwoFactorRequiredError(result.challengeToken);
        }

        const me = await serverAuthClient.me();
        return {
          id: me.sub,
          email: me.email,
          name: me.displayName ?? ([me.firstName, me.lastName].filter(Boolean).join(" ") || me.username),
          image: me.photo,
          expired_at: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.expired_at = user.expired_at;
      if (typeof token.expired_at === "number" && Date.now() >= token.expired_at) return null;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.expired_at = token.expired_at as number | undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
