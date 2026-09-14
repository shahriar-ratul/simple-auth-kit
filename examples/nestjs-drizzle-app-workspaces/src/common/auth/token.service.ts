// NOTE: the `@/core/*` import path below is a placeholder the CLI rewrites
// to your project's actual path alias at install time (see registry.json).
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AccessTokenClaims,
  AccessTokenInput,
  AccessTokenInvalidError,
  RefreshInvalidError,
  RefreshTokenClaims,
  TwoFactorChallengeInvalidError,
} from '@/core/types';

const ACCESS_TOKEN_TTL_SECONDS_DEFAULT = 900; // 15 min
const REFRESH_TOKEN_TTL_SECONDS_DEFAULT = 60 * 60 * 24 * 30; // 30 days
const TWO_FACTOR_CHALLENGE_TTL_SECONDS_DEFAULT = 5 * 60; // 5 min
const TWO_FACTOR_CHALLENGE_PURPOSE = '2fa-challenge';

// Same external contract as registry/core/token-service.ts (method names, claim shapes, TTL
// defaults, error classes) but signs/verifies through NestJS's JwtService instead of calling
// jose directly — the secret lives once in JwtModule.registerAsync (see core-auth.module.ts),
// not passed per call the way core's `deps.activeKey`/`deps.secret` are. Throws the exact same
// AuthCoreError subclasses core does, so AuthCoreErrorFilter needs no changes for this path.
@Injectable()
export class AuthTokenService {
  // Explicit @Inject() token, not bare type-based injection — tsx/esbuild doesn't emit
  // emitDecoratorMetadata's design:paramtypes, so relying on it silently resolves to undefined
  // at request time instead of failing at boot (same esbuild limitation as CLAUDE.md's DTO/
  // validation note; every other injected class in this combo already follows this pattern).
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async signAccessToken(
    claims: AccessTokenInput,
    opts: { ttlSeconds?: number } = {},
  ): Promise<{ token: string; jti: string; expiresAt: Date }> {
    const jti = randomUUID();
    const ttl = opts.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS_DEFAULT;
    const now = Math.floor(Date.now() / 1000);
    const token = await this.jwt.signAsync(
      {
        sessionId: claims.sessionId,
        // Omitted, not emptied, when the caller passes neither: a token that resolves
        // authorization server-side must carry no authorization claim at all.
        ...(claims.roles !== undefined ? { roles: claims.roles } : {}),
        ...(claims.permissions !== undefined ? { permissions: claims.permissions } : {}),
      },
      { subject: claims.sub, jwtid: jti, expiresIn: ttl },
    );
    return { token, jti, expiresAt: new Date((now + ttl) * 1000) };
  }

  async verifyAccessToken(
    token: string,
    deps: { isDenylisted: (jti: string) => Promise<boolean> },
  ): Promise<AccessTokenClaims> {
    let payload;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new AccessTokenInvalidError();
    }

    const jti = payload.jti;
    if (!jti) throw new AccessTokenInvalidError('missing jti');
    if (await deps.isDenylisted(jti)) throw new AccessTokenInvalidError('token revoked');

    return {
      sub: payload.sub as string,
      sessionId: payload.sessionId as string,
      roles: (payload.roles as string[]) ?? [],
      permissions: (payload.permissions as string[]) ?? [],
      jti,
    };
  }

  async signRefreshToken(
    claims: Omit<RefreshTokenClaims, 'jti'>,
    opts: { ttlSeconds?: number; jti?: string } = {},
  ): Promise<{ token: string; jti: string }> {
    const jti = opts.jti ?? randomUUID();
    const ttl = opts.ttlSeconds ?? REFRESH_TOKEN_TTL_SECONDS_DEFAULT;
    const token = await this.jwt.signAsync(
      { sessionId: claims.sessionId, sv: claims.sv },
      { subject: claims.sub, jwtid: jti, expiresIn: ttl },
    );
    return { token, jti };
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenClaims> {
    let payload;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new RefreshInvalidError();
    }

    const jti = payload.jti;
    if (!jti || payload.sv === undefined || !payload.sessionId) throw new RefreshInvalidError('malformed claims');

    return {
      sub: payload.sub as string,
      sessionId: payload.sessionId as string,
      sv: payload.sv as number,
      jti,
    };
  }

  // Short-TTL, purpose-scoped token proving "password already checked" without granting API
  // access — carries no session/roles.
  async signTwoFactorChallengeToken(
    sub: string,
    opts: { ttlSeconds?: number } = {},
  ): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const ttl = opts.ttlSeconds ?? TWO_FACTOR_CHALLENGE_TTL_SECONDS_DEFAULT;
    const token = await this.jwt.signAsync(
      { purpose: TWO_FACTOR_CHALLENGE_PURPOSE },
      { subject: sub, jwtid: jti, expiresIn: ttl },
    );
    return { token, jti };
  }

  async verifyTwoFactorChallengeToken(token: string): Promise<{ sub: string }> {
    let payload;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new TwoFactorChallengeInvalidError();
    }

    if (payload.purpose !== TWO_FACTOR_CHALLENGE_PURPOSE || !payload.sub)
      throw new TwoFactorChallengeInvalidError('malformed claims');
    return { sub: payload.sub };
  }
}
