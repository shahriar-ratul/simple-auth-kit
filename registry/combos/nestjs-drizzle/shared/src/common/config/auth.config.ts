import type { RateLimitDeps } from "@/lib/auth/core/rate-limit";
import type { AuthzCacheStore } from "@/common/auth/cache/authz-cache";

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

export interface AuthzCacheConfig {
  /**
   * `false` turns caching off: authorization is resolved from the database on every request —
   * always exact, one multi-join read per authorized request.
   */
  enabled: boolean;
  /**
   * `true` (default): each request reads the single `authz_version` row and re-resolves if it
   * changed since the entry was cached. Every authorization write this app makes bumps that row,
   * so app-side changes apply on the very next request, on every server.
   * `false`: skip that read and trust a cached entry until `ttlSeconds` — zero database reads on a
   * hit, but any change (even one made through this app) can take up to `ttlSeconds` to apply.
   */
  revalidate: boolean;
  /**
   * How long an entry may be served at all. With `revalidate` on, this only bounds changes written
   * straight to the database (which don't bump `authz_version`); with it off, it bounds every change.
   */
  ttlSeconds: number;
  /**
   * Where entries live. Defaults to an in-process map (`InMemoryAuthzCacheStore`), one per server —
   * correct across servers when `revalidate` is on. Pass a shared store (e.g. Redis-backed) to share
   * entries between servers; nothing here depends on Redis.
   */
  store?: AuthzCacheStore;
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
  /** How resolved authorization (roles + permissions per user) is cached. See `AuthzCacheConfig`. */
  authzCache: AuthzCacheConfig;
  /**
   * Where rate-limit windows are counted. Defaults to an in-process `Map`, which is correct for
   * a single instance; pass a Redis-backed implementation of `RateLimitDeps` for several.
   */
  rateLimitStore?: RateLimitDeps;
}

export const defaultAuthConfig: AuthConfig = {
  accessTokenTtlSeconds: 900,
  authzCache: { enabled: true, revalidate: true, ttlSeconds: 30 },
  refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  twoFactorIssuer: "simple-auth-kit",
  oauthProviders: {},
};

/** What `CoreAuthModule.forRoot()` accepts: any subset, including a partial `authzCache`. */
export type AuthConfigInput = Partial<Omit<AuthConfig, "authzCache">> & {
  authzCache?: Partial<AuthzCacheConfig>;
};

/** Fills every omitted field from `defaultAuthConfig`, merging `authzCache` one level deep. */
export function resolveAuthConfig(config: AuthConfigInput = {}): AuthConfig {
  return {
    ...defaultAuthConfig,
    ...config,
    authzCache: { ...defaultAuthConfig.authzCache, ...config.authzCache },
  };
}
