// Generic OIDC social-login, plus one isolated helper (`signAppleClientSecret`) for Apple's
// deviation from the standard flow: its "client secret" is a short-lived signed JWT, not a
// static string.
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import {
  AuditEvent,
  OAuthExchangeError,
  OAuthProfileInvalidError,
} from "./types.js";

export interface OAuthProviderDescriptor {
  id: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  issuer: string;
  defaultScope: string;
}

export const GOOGLE_OIDC_PROVIDER: OAuthProviderDescriptor = {
  id: "google",
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
  issuer: "https://accounts.google.com",
  defaultScope: "openid email profile",
};

export const APPLE_OIDC_PROVIDER: OAuthProviderDescriptor = {
  id: "apple",
  authorizationEndpoint: "https://appleid.apple.com/auth/authorize",
  tokenEndpoint: "https://appleid.apple.com/auth/token",
  jwksUri: "https://appleid.apple.com/auth/keys",
  issuer: "https://appleid.apple.com",
  defaultScope: "openid email name",
};

export function buildAuthorizationUrl(
  provider: OAuthProviderDescriptor,
  opts: {
    clientId: string;
    redirectUri: string;
    state: string;
    scope?: string;
  },
): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scope ?? provider.defaultScope,
    state: opts.state,
  });
  // Apple requires form_post whenever the scope can return name/email (only sent on first consent)
  if (provider.id === "apple") params.set("response_mode", "form_post");
  return `${provider.authorizationEndpoint}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  provider: OAuthProviderDescriptor,
  opts: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
  },
): Promise<{ idToken: string; accessToken: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  const response = await fetch(provider.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok)
    throw new OAuthExchangeError(
      `token exchange failed with status ${response.status}`,
    );

  const json = (await response.json()) as {
    id_token?: string;
    access_token?: string;
  };
  if (!json.id_token)
    throw new OAuthExchangeError("provider response missing id_token");
  return { idToken: json.id_token, accessToken: json.access_token ?? "" };
}

// Apple requires `client_secret` to be a JWT signed with an Apple-issued private key, not a
// static string — call this before `exchangeCodeForTokens` for the `apple` provider only.
export async function signAppleClientSecret(opts: {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKeyPem: string;
  ttlSeconds?: number;
}): Promise<string> {
  const key = await importPKCS8(opts.privateKeyPem, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: opts.keyId })
    .setIssuer(opts.teamId)
    .setSubject(opts.clientId)
    .setAudience(APPLE_OIDC_PROVIDER.issuer)
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.ttlSeconds ?? 5 * 60))
    .sign(key);
}

export interface OAuthProfile {
  providerAccountId: string;
  email?: string;
  emailVerified: boolean;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Verifies the id_token's signature against the provider's live JWKS (cached per-provider by `jose`). */
export async function verifyIdTokenAndExtractProfile(
  provider: OAuthProviderDescriptor,
  opts: { clientId: string; idToken: string },
): Promise<OAuthProfile> {
  let jwks = jwksCache.get(provider.jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(provider.jwksUri));
    jwksCache.set(provider.jwksUri, jwks);
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(opts.idToken, jwks, {
      issuer: provider.issuer,
      audience: opts.clientId,
    }));
  } catch {
    throw new OAuthProfileInvalidError();
  }
  if (typeof payload.sub !== "string")
    throw new OAuthProfileInvalidError("missing sub claim");

  return {
    providerAccountId: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified:
      payload.email_verified === true || payload.email_verified === "true",
  };
}

export interface OAuthStoreDeps {
  findAccountByProvider: (
    provider: string,
    providerAccountId: string,
  ) => Promise<{ userId: string } | null>;
  linkAccount: (input: {
    userId: string;
    provider: string;
    providerAccountId: string;
    email?: string;
  }) => Promise<void>;
  findUserByVerifiedEmail: (email: string) => Promise<{ id: string } | null>;
  createUserFromOAuth: (input: { email?: string }) => Promise<{ id: string }>;
  appendAuditEvent?: (event: AuditEvent) => Promise<void>;
}

// Find-linked-account → else link-by-verified-email → else create-new-user. Only links by
// email when the provider asserts `email_verified` — an unverified email isn't proof of
// ownership.
export async function completeOAuthLogin(
  deps: OAuthStoreDeps,
  input: { provider: string; profile: OAuthProfile },
): Promise<{ userId: string; isNewUser: boolean }> {
  const existing = await deps.findAccountByProvider(
    input.provider,
    input.profile.providerAccountId,
  );
  if (existing) return { userId: existing.userId, isNewUser: false };

  const matchedByEmail =
    input.profile.email && input.profile.emailVerified
      ? await deps.findUserByVerifiedEmail(input.profile.email)
      : null;

  const userId = matchedByEmail
    ? matchedByEmail.id
    : (await deps.createUserFromOAuth({ email: input.profile.email })).id;
  const isNewUser = !matchedByEmail;

  await deps.linkAccount({
    userId,
    provider: input.provider,
    providerAccountId: input.profile.providerAccountId,
    email: input.profile.email,
  });
  await deps.appendAuditEvent?.({
    type: "oauth_account_linked",
    userId,
    provider: input.provider,
  });
  return { userId, isNewUser };
}
