import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  blockUser,
  createSession,
  revokeAllSessionsForUser,
  revokeOtherSessionsForUser,
  revokeSession,
  rotateRefreshToken,
  SessionStoreDeps,
} from "../session-policy";
import {
  AuditEvent,
  RefreshInvalidError,
  RefreshReuseDetectedError,
  SessionRecord,
} from "../types";

/** What a store would read from config. Long enough that no test trips over it by accident. */
const SESSION_TTL_MS = 60 * 60 * 1000;

function fakeStore() {
  const sessions = new Map<string, SessionRecord>();
  const denylist = new Set<string>();
  const auditLog: AuditEvent[] = [];

  const deps: SessionStoreDeps = {
    findSession: async (id) => sessions.get(id) ?? null,
    saveSession: async (session) => {
      sessions.set(session.id, session);
    },
    createSession: async ({ userId, userAgent, ip, provider }) => {
      const session: SessionRecord = {
        id: randomUUID(),
        userId,
        sessionVersion: 0,
        currentRefreshJti: randomUUID(),
        provider,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        revokedAt: null,
        createdAt: new Date().toISOString(),
        userAgent,
        ip,
      };
      sessions.set(session.id, session);
      return session;
    },
    revokeAllByUser: async (userId, revoker) => {
      for (const session of sessions.values()) {
        if (session.userId === userId) {
          session.sessionVersion += 1;
          session.revokedAt = new Date().toISOString();
          session.revokedBy = revoker?.userId;
          session.revokedByIp = revoker?.ip;
        }
      }
    },
    revokeAllByUserExcept: async (userId, keepSessionId, revoker) => {
      for (const session of sessions.values()) {
        if (session.userId === userId && session.id !== keepSessionId) {
          session.sessionVersion += 1;
          session.revokedAt = new Date().toISOString();
          session.revokedBy = revoker?.userId;
          session.revokedByIp = revoker?.ip;
        }
      }
    },
    denylistJti: async (jti) => {
      denylist.add(jti);
    },
    isDenylisted: async (jti) => denylist.has(jti),
    appendAuditEvent: async (event) => {
      auditLog.push(event);
    },
  };

  return { deps, sessions, denylist, auditLog };
}

describe("session-policy", () => {
  let store: ReturnType<typeof fakeStore>;

  beforeEach(() => {
    store = fakeStore();
  });

  it("creates a session and records an audit event", async () => {
    const session = await createSession(store.deps, { userId: "user-1" });
    expect(session.sessionVersion).toBe(0);
    expect(session.revokedAt).toBeNull();
    expect(store.auditLog).toContainEqual({
      type: "session_created",
      sessionId: session.id,
      userId: "user-1",
    });
  });

  it("rotates a refresh token on legitimate use, issuing a new jti", async () => {
    const session = await createSession(store.deps, { userId: "user-1" });
    const { session: rotated, nextJti } = await rotateRefreshToken(store.deps, {
      sub: "user-1",
      sessionId: session.id,
      sv: session.sessionVersion,
      jti: session.currentRefreshJti,
    });

    expect(nextJti).not.toBe(session.currentRefreshJti);
    expect(rotated.currentRefreshJti).toBe(nextJti);
  });

  it("detects reuse of an already-rotated refresh token and kills the whole session family", async () => {
    const session = await createSession(store.deps, { userId: "user-1" });
    const staleJti = session.currentRefreshJti;

    await rotateRefreshToken(store.deps, {
      sub: "user-1",
      sessionId: session.id,
      sv: session.sessionVersion,
      jti: staleJti,
    });

    await expect(
      rotateRefreshToken(store.deps, {
        sub: "user-1",
        sessionId: session.id,
        sv: session.sessionVersion,
        jti: staleJti,
      }),
    ).rejects.toBeInstanceOf(RefreshReuseDetectedError);

    const updated = await store.deps.findSession(session.id);
    expect(updated?.revokedAt).not.toBeNull();
    expect(
      store.auditLog.some((e) => e.type === "refresh_reuse_detected"),
    ).toBe(true);
  });

  it("rejects a refresh token whose sv is stale (session was revoked)", async () => {
    const session = await createSession(store.deps, { userId: "user-1" });
    await revokeSession(store.deps, session.id);

    await expect(
      rotateRefreshToken(store.deps, {
        sub: "user-1",
        sessionId: session.id,
        sv: 0, // the sv the client had before revoke bumped it
        jti: session.currentRefreshJti,
      }),
    ).rejects.toBeInstanceOf(RefreshInvalidError);
  });

  it("revokeAllSessionsForUser kills every session for that user only", async () => {
    const a = await createSession(store.deps, { userId: "user-1" });
    const b = await createSession(store.deps, { userId: "user-1" });
    const other = await createSession(store.deps, { userId: "user-2" });

    await revokeAllSessionsForUser(store.deps, "user-1");

    expect((await store.deps.findSession(a.id))?.revokedAt).not.toBeNull();
    expect((await store.deps.findSession(b.id))?.revokedAt).not.toBeNull();
    expect((await store.deps.findSession(other.id))?.revokedAt).toBeNull();
  });

  it("revokeOtherSessionsForUser keeps the current session alive and kills the rest", async () => {
    const current = await createSession(store.deps, { userId: "user-1" });
    const other = await createSession(store.deps, { userId: "user-1" });

    await revokeOtherSessionsForUser(store.deps, "user-1", current.id);

    expect((await store.deps.findSession(current.id))?.revokedAt).toBeNull();
    expect((await store.deps.findSession(other.id))?.revokedAt).not.toBeNull();
    expect(
      store.auditLog.some((e) => e.type === "other_sessions_revoked"),
    ).toBe(true);
  });

  it("blockUser revokes every session immediately, not just future logins", async () => {
    const session = await createSession(store.deps, { userId: "user-1" });
    await blockUser(store.deps, "user-1");

    expect(
      (await store.deps.findSession(session.id))?.revokedAt,
    ).not.toBeNull();
    expect(store.auditLog.some((e) => e.type === "user_blocked")).toBe(true);
  });

  it("records who revoked a session, and from where", async () => {
    const session = await createSession(store.deps, { userId: "user-1" });
    await revokeSession(store.deps, session.id, {
      userId: "user-1",
      ip: "10.0.0.9",
    });

    const revoked = await store.deps.findSession(session.id);
    expect(revoked?.revokedBy).toBe("user-1");
    expect(revoked?.revokedByIp).toBe("10.0.0.9");
  });

  it("blockUser records the administrator as the revoker, not the blocked user", async () => {
    const session = await createSession(store.deps, { userId: "user-1" });
    await blockUser(store.deps, "user-1", {
      userId: "admin-1",
      ip: "10.0.0.1",
    });

    // The distinction the column exists for: afterwards the row says an administrator ended this,
    // not merely that it ended.
    const revoked = await store.deps.findSession(session.id);
    expect(revoked?.userId).toBe("user-1");
    expect(revoked?.revokedBy).toBe("admin-1");
  });

  it("a refresh-reuse kill records no revoker — nobody did it", async () => {
    const session = await createSession(store.deps, { userId: "user-1" });
    const staleJti = session.currentRefreshJti;
    await rotateRefreshToken(store.deps, {
      sub: "user-1",
      sessionId: session.id,
      sv: session.sessionVersion,
      jti: staleJti,
    });

    await expect(
      rotateRefreshToken(store.deps, {
        sub: "user-1",
        sessionId: session.id,
        sv: session.sessionVersion,
        jti: staleJti,
      }),
    ).rejects.toBeInstanceOf(RefreshReuseDetectedError);

    expect(
      (await store.deps.findSession(session.id))?.revokedBy,
    ).toBeUndefined();
  });

  it("refuses to rotate a session past its own expiry, however valid the token is", async () => {
    const session = await createSession(store.deps, { userId: "user-1" });
    // Everything about the presented token stays correct — only the wall clock has moved on.
    store.sessions.set(session.id, {
      ...session,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(
      rotateRefreshToken(store.deps, {
        sub: "user-1",
        sessionId: session.id,
        sv: session.sessionVersion,
        jti: session.currentRefreshJti,
      }),
    ).rejects.toBeInstanceOf(RefreshInvalidError);
  });

  it("carries the login provider onto the session", async () => {
    const session = await createSession(store.deps, {
      userId: "user-1",
      provider: "google",
    });
    expect(session.provider).toBe("google");
    expect(
      (await createSession(store.deps, { userId: "user-1" })).provider,
    ).toBeUndefined();
  });
});
