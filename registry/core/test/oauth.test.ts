import {
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
  SignJWT,
} from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPLE_OIDC_PROVIDER,
  buildAuthorizationUrl,
  completeOAuthLogin,
  exchangeCodeForTokens,
  GOOGLE_OIDC_PROVIDER,
  OAuthProviderDescriptor,
  OAuthStoreDeps,
  signAppleClientSecret,
  verifyIdTokenAndExtractProfile,
} from "../oauth";
import {
  AuditEvent,
  OAuthExchangeError,
  OAuthProfileInvalidError,
} from "../types";

describe("oauth: buildAuthorizationUrl", () => {
  it("builds a standard authorization URL for google", () => {
    const url = new URL(
      buildAuthorizationUrl(GOOGLE_OIDC_PROVIDER, {
        clientId: "client-1",
        redirectUri: "https://app/cb",
        state: "state-1",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("response_mode")).toBeNull();
  });

  it("adds response_mode=form_post for apple", () => {
    const url = new URL(
      buildAuthorizationUrl(APPLE_OIDC_PROVIDER, {
        clientId: "client-1",
        redirectUri: "https://app/cb",
        state: "state-1",
      }),
    );
    expect(url.searchParams.get("response_mode")).toBe("form_post");
  });
});

describe("oauth: exchangeCodeForTokens", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => vi.unstubAllGlobals());

  it("returns the id_token and access_token from a successful exchange", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id_token: "the-id-token",
          access_token: "the-access-token",
        }),
        { status: 200 },
      ),
    );

    const result = await exchangeCodeForTokens(GOOGLE_OIDC_PROVIDER, {
      clientId: "c",
      clientSecret: "s",
      redirectUri: "https://app/cb",
      code: "auth-code",
    });
    expect(result).toEqual({
      idToken: "the-id-token",
      accessToken: "the-access-token",
    });
  });

  it("throws OAuthExchangeError on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response("bad request", { status: 400 }));
    await expect(
      exchangeCodeForTokens(GOOGLE_OIDC_PROVIDER, {
        clientId: "c",
        clientSecret: "s",
        redirectUri: "https://app/cb",
        code: "bad",
      }),
    ).rejects.toBeInstanceOf(OAuthExchangeError);
  });

  it("throws OAuthExchangeError when the response has no id_token", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "only-access" }), {
        status: 200,
      }),
    );
    await expect(
      exchangeCodeForTokens(GOOGLE_OIDC_PROVIDER, {
        clientId: "c",
        clientSecret: "s",
        redirectUri: "https://app/cb",
        code: "x",
      }),
    ).rejects.toBeInstanceOf(OAuthExchangeError);
  });
});

describe("oauth: signAppleClientSecret", () => {
  it("produces a JWT signed with the given ES256 key, with the right issuer/subject/audience", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const privateKeyPem = await exportPKCS8(privateKey);

    const secret = await signAppleClientSecret({
      teamId: "TEAM123",
      clientId: "com.example.app",
      keyId: "KEY456",
      privateKeyPem,
    });

    const { payload } = await jwtVerify(secret, publicKey, {
      algorithms: ["ES256"],
    });
    expect(payload.iss).toBe("TEAM123");
    expect(payload.sub).toBe("com.example.app");
    expect(payload.aud).toBe(APPLE_OIDC_PROVIDER.issuer);
  });
});

describe("oauth: verifyIdTokenAndExtractProfile", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => vi.unstubAllGlobals());

  async function fakeProvider(
    jwksUri: string,
  ): Promise<{
    provider: OAuthProviderDescriptor;
    sign: (claims: Record<string, unknown>) => Promise<string>;
  }> {
    const { privateKey, publicKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    const jwk = await exportJWK(publicKey);
    fetchMock.mockImplementation(async (input: string | URL) => {
      if (String(input) === jwksUri)
        return new Response(
          JSON.stringify({
            keys: [{ ...jwk, kid: "test-kid", alg: "RS256", use: "sig" }],
          }),
        );
      throw new Error(`unexpected fetch: ${input}`);
    });

    const provider: OAuthProviderDescriptor = {
      ...GOOGLE_OIDC_PROVIDER,
      jwksUri,
      issuer: "https://issuer.example",
    };
    const sign = (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
        .setIssuer(provider.issuer)
        .setAudience("client-1")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

    return { provider, sign };
  }

  it("extracts a verified profile from a valid id_token", async () => {
    const { provider, sign } = await fakeProvider("https://jwks.example/1");
    const idToken = await sign({
      sub: "provider-user-1",
      email: "alice@example.com",
      email_verified: true,
    });

    const profile = await verifyIdTokenAndExtractProfile(provider, {
      clientId: "client-1",
      idToken,
    });
    expect(profile).toEqual({
      providerAccountId: "provider-user-1",
      email: "alice@example.com",
      emailVerified: true,
    });
  });

  it("defaults emailVerified to false when the claim is absent", async () => {
    const { provider, sign } = await fakeProvider("https://jwks.example/2");
    const idToken = await sign({ sub: "provider-user-2" });

    const profile = await verifyIdTokenAndExtractProfile(provider, {
      clientId: "client-1",
      idToken,
    });
    expect(profile.emailVerified).toBe(false);
    expect(profile.email).toBeUndefined();
  });

  it("rejects an id_token signed for a different audience", async () => {
    const { provider, sign } = await fakeProvider("https://jwks.example/3");
    const idToken = await sign({ sub: "provider-user-3" });

    await expect(
      verifyIdTokenAndExtractProfile(provider, {
        clientId: "some-other-client",
        idToken,
      }),
    ).rejects.toBeInstanceOf(OAuthProfileInvalidError);
  });
});

describe("oauth: completeOAuthLogin", () => {
  function fakeStore() {
    const accounts = new Map<string, { userId: string }>();
    const users = new Map<
      string,
      { id: string; email?: string; emailVerified: boolean }
    >();
    const auditLog: AuditEvent[] = [];
    let nextId = 1;

    const deps: OAuthStoreDeps = {
      findAccountByProvider: async (provider, providerAccountId) =>
        accounts.get(`${provider}:${providerAccountId}`) ?? null,
      linkAccount: async ({ userId, provider, providerAccountId }) => {
        accounts.set(`${provider}:${providerAccountId}`, { userId });
      },
      findUserByVerifiedEmail: async (email) => {
        for (const user of users.values())
          if (user.email === email && user.emailVerified)
            return { id: user.id };
        return null;
      },
      createUserFromOAuth: async ({ email }) => {
        const id = `user-${nextId++}`;
        users.set(id, { id, email, emailVerified: true });
        return { id };
      },
      appendAuditEvent: async (event) => {
        auditLog.push(event);
      },
    };
    return { deps, accounts, users, auditLog };
  }

  it("creates a new user on first login and links the account", async () => {
    const store = fakeStore();
    const result = await completeOAuthLogin(store.deps, {
      provider: "google",
      profile: {
        providerAccountId: "g-1",
        email: "bob@example.com",
        emailVerified: true,
      },
    });

    expect(result.isNewUser).toBe(true);
    expect(store.accounts.get("google:g-1")?.userId).toBe(result.userId);
    expect(store.auditLog).toContainEqual({
      type: "oauth_account_linked",
      userId: result.userId,
      provider: "google",
    });
  });

  it("returns the same user on a repeat login without creating a duplicate", async () => {
    const store = fakeStore();
    const first = await completeOAuthLogin(store.deps, {
      provider: "google",
      profile: {
        providerAccountId: "g-1",
        email: "bob@example.com",
        emailVerified: true,
      },
    });
    const second = await completeOAuthLogin(store.deps, {
      provider: "google",
      profile: {
        providerAccountId: "g-1",
        email: "bob@example.com",
        emailVerified: true,
      },
    });

    expect(second.userId).toBe(first.userId);
    expect(second.isNewUser).toBe(false);
  });

  it("links to an existing user by verified email instead of creating a new one", async () => {
    const store = fakeStore();
    const existing = await store.deps.createUserFromOAuth({
      email: "carol@example.com",
    });

    const result = await completeOAuthLogin(store.deps, {
      provider: "apple",
      profile: {
        providerAccountId: "a-1",
        email: "carol@example.com",
        emailVerified: true,
      },
    });

    expect(result.userId).toBe(existing.id);
    expect(result.isNewUser).toBe(false);
  });

  it("does not link by email when the provider has not verified it", async () => {
    const store = fakeStore();
    await store.deps.createUserFromOAuth({ email: "dave@example.com" });

    const result = await completeOAuthLogin(store.deps, {
      provider: "apple",
      profile: {
        providerAccountId: "a-2",
        email: "dave@example.com",
        emailVerified: false,
      },
    });

    expect(result.isNewUser).toBe(true);
  });
});
