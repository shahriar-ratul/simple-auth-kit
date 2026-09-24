import type { RateLimitDeps } from '@/core/rate-limit';
import type { AuthzCacheStore } from '@/common/auth/cache/authz-cache';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

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

/** One global rate-limit bucket, shaped exactly like a @nestjs/throttler entry. `ttl` is milliseconds. */
export interface ThrottleBucket {
  name: string;
  ttl: number;
  limit: number;
}

export interface AuthzCacheConfig {
  /** `false`: no caching — authorization is resolved from the database on every request. */
  enabled: boolean;
  /**
   * `true`: read the one-row `authz_version` counter on each request and re-resolve if it
   * changed, so a change made through this app applies on the next request, on every server.
   * `false`: skip that read and trust an entry until `ttlSeconds` — zero database reads on a
   * hit, and changes apply within the TTL.
   */
  revalidate: boolean;
  /**
   * How long an entry lives. Also the longest a change written straight to the database (which
   * doesn't bump `authz_version`) can go unseen.
   */
  ttlSeconds: number;
  /**
   * Where entries live. Defaults to in-process memory; pass e.g. a Redis-backed store to share
   * entries across servers.
   */
  store?: AuthzCacheStore;
}

export interface AuthConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  // A session's absolute lifetime, never extended by refresh rotation — the cap that makes
  // "log in again after N days" true regardless of activity. Enforced by `rotateRefreshToken`.
  sessionTtlSeconds: number;
  /** App name shown inside authenticator apps (issuer part of the otpauth:// URI). */
  twoFactorIssuer: string;
  oauthProviders: {
    google?: GoogleOAuthCredentials;
    apple?: AppleOAuthCredentials;
  };
  /** Wire your own mailer here — if unset, requestPasswordReset() just returns the token without emailing it. */
  sendPasswordResetEmail?: (email: string, token: string) => Promise<void>;
  /** Caching of resolved authorization (roles + permissions). See `authz-cache.ts`. */
  authzCache: AuthzCacheConfig;
  // Defaults to an in-process Map; pass a Redis-backed RateLimitDeps for multiple instances.
  rateLimitStore?: RateLimitDeps;
  // Enforced by a globally registered ThrottlerGuard, per client IP, all buckets at once.
  // `false` removes the guard entirely — the escape hatch for load tests and proofs whose
  // request rate is the point, not an abuse signal.
  throttle: ThrottleBucket[] | false;
}

/** What `CoreAuthModule.forRoot()` accepts: any subset, including a partial `authzCache`. */
export type AuthConfigInput = Partial<Omit<AuthConfig, 'authzCache'>> & {
  authzCache?: Partial<AuthzCacheConfig>;
};

// Exported by name so `@SkipThrottle` call sites can name every default bucket —
// `@SkipThrottle()` bare only skips a throttler literally named "default", which none of these is.
export const defaultThrottleBuckets: ThrottleBucket[] = [
  { name: 'short', ttl: 1_000, limit: 100 },
  { name: 'medium', ttl: 10_000, limit: 200 },
  { name: 'long', ttl: 60_000, limit: 400 },
];

export const defaultAuthConfig: AuthConfig = {
  accessTokenTtlSeconds: 900,
  authzCache: { enabled: true, revalidate: true, ttlSeconds: 30 },
  throttle: defaultThrottleBuckets,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  twoFactorIssuer: 'simple-auth-kit',
  oauthProviders: {},
};
