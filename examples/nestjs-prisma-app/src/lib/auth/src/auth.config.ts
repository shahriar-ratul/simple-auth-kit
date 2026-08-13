import type { PermissionCacheStore } from "./permission-cache.js";

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

/** One global rate-limit bucket, shaped exactly like a @nestjs/throttler entry. `ttl` is milliseconds. */
export interface ThrottleBucket {
  name: string;
  ttl: number;
  limit: number;
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
  // Safety net, not the invalidation mechanism — correctness comes from the version counters in
  // permission-cache.ts. Set to 0 to resolve from the database on every request.
  permissionCacheTtlSeconds: number;
  // Defaults to an in-process Map; pass a Redis-backed PermissionCacheStore for multiple
  // instances. Keys are namespaced `easyauth:authz:*`.
  permissionCacheStore?: PermissionCacheStore;
  // Enforced by a globally registered ThrottlerGuard, per client IP, all buckets at once.
  // `false` removes the guard entirely — the escape hatch for load tests and proofs whose
  // request rate is the point, not an abuse signal.
  throttle: ThrottleBucket[] | false;
}

// Exported by name so `@SkipThrottle` call sites can name every default bucket —
// `@SkipThrottle()` bare only skips a throttler literally named "default", which none of these is.
export const defaultThrottleBuckets: ThrottleBucket[] = [
  { name: "short", ttl: 1_000, limit: 100 },
  { name: "medium", ttl: 10_000, limit: 200 },
  { name: "long", ttl: 60_000, limit: 400 },
];

export const defaultAuthConfig: AuthConfig = {
  accessTokenTtlSeconds: 900,
  permissionCacheTtlSeconds: 300,
  throttle: defaultThrottleBuckets,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  twoFactorIssuer: "easy-auth",
  oauthProviders: {},
};
