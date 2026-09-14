import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import {
  AccessTokenClaims,
  AccessTokenInput,
  AccessTokenInvalidError,
  JwtSigningKey,
  RefreshInvalidError,
  RefreshTokenClaims,
  TwoFactorChallengeInvalidError,
} from "./types.js";

const ACCESS_TOKEN_TTL_SECONDS_DEFAULT = 900; // 15 min
const REFRESH_TOKEN_TTL_SECONDS_DEFAULT = 60 * 60 * 24 * 30; // 30 days
const TWO_FACTOR_CHALLENGE_TTL_SECONDS_DEFAULT = 5 * 60; // 5 min
const TWO_FACTOR_CHALLENGE_PURPOSE = "2fa-challenge";

export interface SignDeps {
  activeKey: JwtSigningKey;
}

export interface VerifyAccessTokenDeps {
  secret: Uint8Array;
  isDenylisted: (jti: string) => Promise<boolean>;
}

export interface VerifyRefreshTokenDeps {
  secret: Uint8Array;
}

export async function signAccessToken(
  deps: SignDeps,
  claims: AccessTokenInput,
  opts: { ttlSeconds?: number } = {},
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = randomUUID();
  const ttl = opts.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS_DEFAULT;
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    sessionId: claims.sessionId,
    // Omitted, not emptied, when the caller passes neither: a token that resolves authorization
    // server-side must carry no authorization claim at all, so there is nothing to read off it.
    ...(claims.roles !== undefined ? { roles: claims.roles } : {}),
    ...(claims.permissions !== undefined
      ? { permissions: claims.permissions }
      : {}),
  })
    .setProtectedHeader({ alg: "HS256", kid: deps.activeKey.kid })
    .setSubject(claims.sub)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(deps.activeKey.secret);
  return { token, jti, expiresAt: new Date((now + ttl) * 1000) };
}

export async function verifyAccessToken(
  deps: VerifyAccessTokenDeps,
  token: string,
): Promise<AccessTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, deps.secret, {
      algorithms: ["HS256"],
    }));
  } catch {
    throw new AccessTokenInvalidError();
  }

  const jti = payload.jti;
  if (!jti) throw new AccessTokenInvalidError("missing jti");
  if (await deps.isDenylisted(jti))
    throw new AccessTokenInvalidError("token revoked");

  return {
    sub: payload.sub as string,
    sessionId: payload.sessionId as string,
    roles: (payload.roles as string[]) ?? [],
    permissions: (payload.permissions as string[]) ?? [],
    jti,
  };
}

export async function signRefreshToken(
  deps: SignDeps,
  claims: Omit<RefreshTokenClaims, "jti">,
  opts: { ttlSeconds?: number; jti?: string } = {},
): Promise<{ token: string; jti: string }> {
  const jti = opts.jti ?? randomUUID();
  const ttl = opts.ttlSeconds ?? REFRESH_TOKEN_TTL_SECONDS_DEFAULT;
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    sessionId: claims.sessionId,
    sv: claims.sv,
  })
    .setProtectedHeader({ alg: "HS256", kid: deps.activeKey.kid })
    .setSubject(claims.sub)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(deps.activeKey.secret);
  return { token, jti };
}

// Short-TTL, purpose-scoped token proving "password already checked" without granting API
// access — carries no session/roles.
export async function signTwoFactorChallengeToken(
  deps: SignDeps,
  sub: string,
  opts: { ttlSeconds?: number } = {},
): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  const ttl = opts.ttlSeconds ?? TWO_FACTOR_CHALLENGE_TTL_SECONDS_DEFAULT;
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ purpose: TWO_FACTOR_CHALLENGE_PURPOSE })
    .setProtectedHeader({ alg: "HS256", kid: deps.activeKey.kid })
    .setSubject(sub)
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(deps.activeKey.secret);
  return { token, jti };
}

export async function verifyTwoFactorChallengeToken(
  deps: VerifyRefreshTokenDeps,
  token: string,
): Promise<{ sub: string }> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, deps.secret, {
      algorithms: ["HS256"],
    }));
  } catch {
    throw new TwoFactorChallengeInvalidError();
  }

  if (payload.purpose !== TWO_FACTOR_CHALLENGE_PURPOSE || !payload.sub)
    throw new TwoFactorChallengeInvalidError("malformed claims");
  return { sub: payload.sub };
}

export async function verifyRefreshToken(
  deps: VerifyRefreshTokenDeps,
  token: string,
): Promise<RefreshTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, deps.secret, {
      algorithms: ["HS256"],
    }));
  } catch {
    throw new RefreshInvalidError();
  }

  const jti = payload.jti;
  if (!jti || payload.sv === undefined || !payload.sessionId)
    throw new RefreshInvalidError("malformed claims");

  return {
    sub: payload.sub as string,
    sessionId: payload.sessionId as string,
    sv: payload.sv as number,
    jti,
  };
}
