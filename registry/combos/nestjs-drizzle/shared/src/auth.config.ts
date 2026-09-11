import type { PermissionCacheStore } from "./permission-cache.js";
import type { RateLimitDeps } from "@/lib/auth/core/rate-limit.js";

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");

export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface AppleOAuthCredentials {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  redirectUri: string;
}

export interface AuthConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  /**
   * A session's absolute lifetime, written to `sessions.expires_at` when it is created and
   * **never extended**. Refresh rotation issues a new refresh token each time, so without this a
   * continuously-active client could hold one session open forever; this is the cap that makes
   * "log in again after N days" true regardless of activity. `rotateRefreshToken` enforces it.
   */
  sessionTtlSeconds: number;
  /** App name shown inside authenticator apps next to the account (issuer part of the otpauth:// URI). */
  twoFactorIssuer: string;
  oauthProviders: {
    google?: GoogleOAuthCredentials;
    apple?: AppleOAuthCredentials;
  };
  /** Wire your own mailer here — if unset, requestPasswordReset() just returns the token without emailing it. */
  sendPasswordResetEmail?: (email: string, token: string) => Promise<void>;
  /**
   * How long a resolved permission set may sit in the cache. This is a safety net, not the
   * invalidation mechanism: correctness comes from the version counters in permission-cache.ts,
   * which make a stale entry unreachable the instant anything changes. Set to 0 to resolve from
   * the database on every request — same answers, more queries.
   */
  permissionCacheTtlSeconds: number;
  /**
   * Where resolved permissions are cached. Defaults to an in-process `Map`, which is correct for
   * a single instance; pass a Redis-backed implementation of `PermissionCacheStore` for several.
   * Keys are namespaced `simpleauthkit:authz:*`.
   */
  permissionCacheStore?: PermissionCacheStore;
  /**
   * Where rate-limit windows are counted. Defaults to an in-process `Map`, which is correct for
   * a single instance; pass a Redis-backed implementation of `RateLimitDeps` for several.
   */
  rateLimitStore?: RateLimitDeps;
}

export const defaultAuthConfig: AuthConfig = {
  accessTokenTtlSeconds: 900,
  permissionCacheTtlSeconds: 300,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  twoFactorIssuer: "simple-auth-kit",
  oauthProviders: {},
};
