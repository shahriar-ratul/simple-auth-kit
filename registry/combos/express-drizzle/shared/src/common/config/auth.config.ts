import type { RateLimitDeps } from "@/lib/auth/core/rate-limit";
import type { AuthzCacheStore } from "@/common/auth/cache/authz-cache";

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

/**
 * `AuthConfig.authzCache`. Pass any subset to `createAuthApp`; the rest keep their defaults.
 *
 * No store = no cache: there is no in-memory fallback. Caching is active only when `enabled` is
 * true AND a `store` is given; otherwise every authorized request resolves roles and permissions
 * from the database.
 */
export interface AuthzCacheConfig {
  /**
   * `false` turns caching off even when a store is given: every authorized request resolves roles
   * and permissions from the database.
   */
  enabled: boolean;
  /**
   * `true`: each request reads the `authz_version` row (one primary-key read) and re-resolves if it
   * changed since the entry was cached — every change this app makes bumps it, so app-side changes
   * apply on the next request, on every server. `false`: skip that read and trust an entry until
   * `ttlSeconds` — zero database reads on a hit, and changes apply within the TTL.
   */
  revalidate: boolean;
  /**
   * The longest an entry is served. Also the bound on how long a change made behind the app's back
   * (a raw SQL session, which bumps nothing) can take to apply.
   */
  ttlSeconds: number;
  /**
   * Where entries live — e.g. a Redis-backed `AuthzCacheStore`, shared by every server. Required
   * for caching: with no store there is no cache. Implement `list`/`clear` too to let
   * `GET /admin/authz-cache` list entries and `POST /admin/authz-cache/clear` delete them.
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
  /** How each caller's resolved roles and permissions are cached. See `AuthzCacheConfig`. */
  authzCache: AuthzCacheConfig;
  /** App name shown inside authenticator apps next to the account (issuer part of the otpauth:// URI). */
  twoFactorIssuer: string;
  oauthProviders: {
    google?: GoogleOAuthCredentials;
    apple?: AppleOAuthCredentials;
  };
  /**
   * Where rate-limit counters live. Defaults to an in-process `Map`, which is correct for a
   * single instance; pass a Redis-backed implementation of `RateLimitDeps` for several.
   */
  rateLimitStore?: RateLimitDeps;
  /** Wire your own mailer here — if unset, requestPasswordReset() just returns the token without emailing it. */
  sendPasswordResetEmail?: (email: string, token: string) => Promise<void>;
}

export const defaultAuthConfig: AuthConfig = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  authzCache: { enabled: true, revalidate: true, ttlSeconds: 30 },
  twoFactorIssuer: "simple-auth-kit",
  oauthProviders: {},
};

/** What `createAuthApp` accepts: every field optional, `authzCache` included field by field. */
export type AuthConfigInput = Partial<Omit<AuthConfig, "authzCache">> & {
  authzCache?: Partial<AuthzCacheConfig>;
};

/** Fills in the defaults — `authzCache` is merged key by key, so a partial one keeps the rest. */
export function resolveAuthConfig(config: AuthConfigInput = {}): AuthConfig {
  return {
    ...defaultAuthConfig,
    ...config,
    authzCache: { ...defaultAuthConfig.authzCache, ...config.authzCache },
  };
}
