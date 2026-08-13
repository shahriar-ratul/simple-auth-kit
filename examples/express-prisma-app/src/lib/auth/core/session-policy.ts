import { randomUUID } from "node:crypto";
import { AuditEvent, RefreshInvalidError, RefreshReuseDetectedError, RefreshTokenClaims, Revoker, SessionRecord } from "./types.js";

export interface SessionStoreDeps {
  findSession: (sessionId: string) => Promise<SessionRecord | null>;
  saveSession: (session: SessionRecord) => Promise<void>;
  /**
   * The store, not core, decides `expiresAt` — it is the half of the system that knows the
   * deployment's configured session lifetime. Core only enforces whatever it is handed back.
   */
  createSession: (input: { userId: string; userAgent?: string; ip?: string; provider?: string }) => Promise<SessionRecord>;
  revokeAllByUser: (userId: string, revoker?: Revoker) => Promise<void>;
  revokeAllByUserExcept: (userId: string, keepSessionId: string, revoker?: Revoker) => Promise<void>;
  denylistJti: (jti: string, ttlSeconds: number) => Promise<void>;
  isDenylisted: (jti: string) => Promise<boolean>;
  appendAuditEvent?: (event: AuditEvent) => Promise<void>;
}

export async function createSession(
  deps: SessionStoreDeps,
  input: { userId: string; userAgent?: string; ip?: string; provider?: string },
): Promise<SessionRecord> {
  const session = await deps.createSession(input);
  await deps.appendAuditEvent?.({ type: "session_created", sessionId: session.id, userId: session.userId });
  return session;
}

// A stale/revoked token (sv mismatch) just fails; a jti mismatch on a still-valid session means
// the token was already rotated away and this one is a replay — kill the whole session family.
export async function rotateRefreshToken(
  deps: SessionStoreDeps,
  presented: RefreshTokenClaims,
): Promise<{ session: SessionRecord; nextJti: string }> {
  const session = await deps.findSession(presented.sessionId);
  if (!session || session.revokedAt) throw new RefreshInvalidError();
  // The session's own absolute lifetime, independent of any token's. Rotation is the only place a
  // session can be extended, so checking it here is what stops an endlessly-rotated refresh token
  // from outliving the session it belongs to.
  if (new Date(session.expiresAt).getTime() <= Date.now()) throw new RefreshInvalidError("session expired");
  if (session.sessionVersion !== presented.sv) throw new RefreshInvalidError("session version stale");

  if (session.currentRefreshJti !== presented.jti) {
    // No revoker: this is the system reacting to a replayed token, not a person acting.
    await deps.revokeAllByUser(session.userId);
    await deps.appendAuditEvent?.({ type: "refresh_reuse_detected", sessionId: session.id, userId: session.userId });
    throw new RefreshReuseDetectedError();
  }

  const nextJti = randomUUID();
  const updated: SessionRecord = { ...session, currentRefreshJti: nextJti };
  await deps.saveSession(updated);
  return { session: updated, nextJti };
}

export async function revokeSession(deps: SessionStoreDeps, sessionId: string, revoker?: Revoker): Promise<void> {
  const session = await deps.findSession(sessionId);
  if (!session) return;
  const updated: SessionRecord = {
    ...session,
    sessionVersion: session.sessionVersion + 1,
    revokedAt: new Date().toISOString(),
    revokedBy: revoker?.userId,
    revokedByIp: revoker?.ip,
  };
  await deps.saveSession(updated);
  await deps.appendAuditEvent?.({ type: "session_revoked", sessionId: session.id, userId: session.userId });
}

export async function revokeAllSessionsForUser(deps: SessionStoreDeps, userId: string, revoker?: Revoker): Promise<void> {
  await deps.revokeAllByUser(userId, revoker);
  await deps.appendAuditEvent?.({ type: "all_sessions_revoked", userId });
}

export async function revokeOtherSessionsForUser(deps: SessionStoreDeps, userId: string, keepSessionId: string, revoker?: Revoker): Promise<void> {
  await deps.revokeAllByUserExcept(userId, keepSessionId, revoker);
  await deps.appendAuditEvent?.({ type: "other_sessions_revoked", userId, keepSessionId });
}

export async function revokeAccessToken(deps: SessionStoreDeps, jti: string, remainingTtlSeconds: number): Promise<void> {
  await deps.denylistJti(jti, remainingTtlSeconds);
}

// Block revokes every session immediately, not just future logins; `revoker` is the
// administrator, so the row says who ended it, not merely that it ended.
export async function blockUser(deps: SessionStoreDeps, userId: string, revoker?: Revoker): Promise<void> {
  await deps.revokeAllByUser(userId, revoker);
  await deps.appendAuditEvent?.({ type: "user_blocked", userId });
}

// Same shape as blockUser but a distinct audit trail — deactivation is a routine administrative
// toggle, not a security action, and the two are tracked independently (see the `isActive` /
// `blocked` split on `User`). Reactivating, like unblocking, revokes nothing.
export async function deactivateUser(deps: SessionStoreDeps, userId: string, revoker?: Revoker): Promise<void> {
  await deps.revokeAllByUser(userId, revoker);
  await deps.appendAuditEvent?.({ type: "user_deactivated", userId });
}
