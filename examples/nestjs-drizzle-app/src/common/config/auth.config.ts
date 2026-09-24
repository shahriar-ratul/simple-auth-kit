import type { RateLimitDeps } from '@/core/rate-limit';

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
  // How long a cached authorization may be served without re-reading it. Changes made through
  // this app are seen on the next request regardless (they bump `authz_version`); this only
  // bounds how long a change written straight to the database can go unseen.
  authzCacheTtlSeconds: number;
  /**
   * Where rate-limit windows are counted. Defaults to an in-process `Map`, which is correct for
   * a single instance; pass a Redis-backed implementation of `RateLimitDeps` for several.
   */
  rateLimitStore?: RateLimitDeps;
}

export const defaultAuthConfig: AuthConfig = {
  accessTokenTtlSeconds: 900,
  authzCacheTtlSeconds: 30,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  twoFactorIssuer: 'simple-auth-kit',
  oauthProviders: {},
};
