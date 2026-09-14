import { describe, expect, it } from "vitest";
import {
  signAccessToken,
  signRefreshToken,
  signTwoFactorChallengeToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyTwoFactorChallengeToken,
} from "../token-service";
import {
  AccessTokenInvalidError,
  RefreshInvalidError,
  TwoFactorChallengeInvalidError,
} from "../types";
import { generateTestSigningKey } from "./test-keys";

describe("token-service", () => {
  it("signs and verifies an access token round-trip", async () => {
    const key = generateTestSigningKey();
    const { token, jti } = await signAccessToken(
      { activeKey: key },
      {
        sub: "user-1",
        sessionId: "session-1",
        roles: ["member"],
        permissions: ["users:read"],
      },
    );

    const claims = await verifyAccessToken(
      { secret: key.secret, isDenylisted: async () => false },
      token,
    );

    expect(claims).toEqual({
      sub: "user-1",
      sessionId: "session-1",
      roles: ["member"],
      permissions: ["users:read"],
      jti,
    });
  });

  it("rejects a denylisted access token even if signature is valid", async () => {
    const key = generateTestSigningKey();
    const { token, jti } = await signAccessToken(
      { activeKey: key },
      { sub: "u", sessionId: "s", roles: [], permissions: [] },
    );

    await expect(
      verifyAccessToken(
        {
          secret: key.secret,
          isDenylisted: async (candidate) => candidate === jti,
        },
        token,
      ),
    ).rejects.toBeInstanceOf(AccessTokenInvalidError);
  });

  it("rejects an access token verified against a different secret", async () => {
    const key = generateTestSigningKey();
    const otherKey = generateTestSigningKey("other-kid");
    const { token } = await signAccessToken(
      { activeKey: key },
      { sub: "u", sessionId: "s", roles: [], permissions: [] },
    );

    await expect(
      verifyAccessToken(
        { secret: otherKey.secret, isDenylisted: async () => false },
        token,
      ),
    ).rejects.toBeInstanceOf(AccessTokenInvalidError);
  });

  it("signs and verifies a refresh token round-trip", async () => {
    const key = generateTestSigningKey();
    const { token, jti } = await signRefreshToken(
      { activeKey: key },
      { sub: "user-1", sessionId: "session-1", sv: 3 },
    );

    const claims = await verifyRefreshToken({ secret: key.secret }, token);
    expect(claims).toEqual({
      sub: "user-1",
      sessionId: "session-1",
      sv: 3,
      jti,
    });
  });

  it("rejects a refresh token verified against a different secret", async () => {
    const key = generateTestSigningKey();
    const otherKey = generateTestSigningKey("other-kid");
    const { token } = await signRefreshToken(
      { activeKey: key },
      { sub: "u", sessionId: "s", sv: 1 },
    );

    await expect(
      verifyRefreshToken({ secret: otherKey.secret }, token),
    ).rejects.toBeInstanceOf(RefreshInvalidError);
  });

  it("signs and verifies a two-factor challenge token round-trip", async () => {
    const key = generateTestSigningKey();
    const { token } = await signTwoFactorChallengeToken(
      { activeKey: key },
      "user-1",
    );

    const claims = await verifyTwoFactorChallengeToken(
      { secret: key.secret },
      token,
    );
    expect(claims).toEqual({ sub: "user-1" });
  });

  it("rejects an access token presented in place of a two-factor challenge token", async () => {
    const key = generateTestSigningKey();
    const { token } = await signAccessToken(
      { activeKey: key },
      { sub: "u", sessionId: "s", roles: [], permissions: [] },
    );

    await expect(
      verifyTwoFactorChallengeToken({ secret: key.secret }, token),
    ).rejects.toBeInstanceOf(TwoFactorChallengeInvalidError);
  });
});
