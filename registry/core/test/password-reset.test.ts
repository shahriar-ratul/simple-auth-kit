import { beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../crypto";
import {
  requestPasswordReset,
  resetPassword,
  PasswordResetStoreDeps,
} from "../password-reset";
import { AuditEvent, PasswordResetTokenInvalidError } from "../types";

interface FakeTokenRow {
  userId: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
}

function fakeStore() {
  const tokens = new Map<string, FakeTokenRow>();
  const passwordHashes = new Map<string, string>();
  const auditLog: AuditEvent[] = [];

  const deps: PasswordResetStoreDeps = {
    saveResetToken: async ({ userId, tokenHash, expiresAt }) => {
      tokens.set(tokenHash, { userId, tokenHash, expiresAt, consumedAt: null });
    },
    findValidResetToken: async (tokenHash) => tokens.get(tokenHash) ?? null,
    consumeResetToken: async (tokenHash) => {
      const row = tokens.get(tokenHash);
      if (row) row.consumedAt = new Date().toISOString();
    },
    setPasswordHash: async (userId, passwordHash) => {
      passwordHashes.set(userId, passwordHash);
    },
    appendAuditEvent: async (event) => {
      auditLog.push(event);
    },
  };

  return { deps, tokens, passwordHashes, auditLog };
}

describe("password-reset", () => {
  let store: ReturnType<typeof fakeStore>;

  beforeEach(() => {
    store = fakeStore();
  });

  it("issues a reset token and records an audit event", async () => {
    const { token } = await requestPasswordReset(store.deps, "user-1");
    expect(token).toHaveLength(64); // 32 bytes hex
    expect(store.tokens.get(hashToken(token))?.userId).toBe("user-1");
    expect(store.auditLog).toContainEqual({
      type: "password_reset_requested",
      userId: "user-1",
    });
  });

  it("resets the password on a valid token and consumes it", async () => {
    const { token } = await requestPasswordReset(store.deps, "user-1");
    const { userId } = await resetPassword(
      store.deps,
      token,
      "new-correct-horse-battery-staple",
    );

    expect(userId).toBe("user-1");
    expect(store.passwordHashes.get("user-1")).toBeDefined();
    expect(store.tokens.get(hashToken(token))?.consumedAt).not.toBeNull();
    expect(store.auditLog).toContainEqual({
      type: "password_reset_completed",
      userId: "user-1",
    });
  });

  it("rejects an unknown token", async () => {
    await expect(
      resetPassword(store.deps, "not-a-real-token", "new-pass"),
    ).rejects.toBeInstanceOf(PasswordResetTokenInvalidError);
  });

  it("rejects a token that has already been consumed", async () => {
    const { token } = await requestPasswordReset(store.deps, "user-1");
    await resetPassword(store.deps, token, "first-reset-password");

    await expect(
      resetPassword(store.deps, token, "second-reset-password"),
    ).rejects.toBeInstanceOf(PasswordResetTokenInvalidError);
  });

  it("rejects an expired token", async () => {
    const { token } = await requestPasswordReset(store.deps, "user-1", {
      ttlSeconds: -1,
    });
    await expect(
      resetPassword(store.deps, token, "new-pass"),
    ).rejects.toBeInstanceOf(PasswordResetTokenInvalidError);
  });
});
