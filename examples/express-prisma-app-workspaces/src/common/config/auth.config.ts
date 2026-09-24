import type { RateLimitDeps } from '@/core/rate-limit';
import type { AuthzCacheStore } from '@/common/auth/cache/authz-cache';

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
  /** `false` turns caching off: authorization is resolved from the database on every request. */
  enabled: boolean;
  /**
   * `true`: every request reads the `authz_version` row (one primary-key lookup) and re-resolves
   * when it changed, so a change made through the app applies on the next request, on every
   * server. `false`: skip that read and trust an entry until `ttlSeconds` — zero database reads
   * on a hit, and changes apply within the TTL.
   */
  revalidate: boolean;
  /**
   * How long an entry lives. Also the bound on how long a direct database edit — which bumps no
   * version — can go unseen.
   */
  ttlSeconds: number;
  /**
   * Where entries live. Defaults to in-process memory (`InMemoryAuthzCacheStore`); pass e.g. a
   * Redis-backed `AuthzCacheStore` to share entries across servers.
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
  /** How resolved authorization is cached. A partial object is merged over the defaults. */
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

/** What a consumer passes: any subset, including a partial `authzCache` (merged over its defaults). */
export type AuthConfigInput = Partial<Omit<AuthConfig, 'authzCache'>> & {
  authzCache?: Partial<AuthzCacheConfig>;
};

export const defaultAuthConfig: AuthConfig = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  authzCache: { enabled: true, revalidate: true, ttlSeconds: 30 },
  twoFactorIssuer: 'simple-auth-kit',
  oauthProviders: {},
};
