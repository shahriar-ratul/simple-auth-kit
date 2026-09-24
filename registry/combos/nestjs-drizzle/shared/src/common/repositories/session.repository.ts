import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { SessionStoreDeps } from "@/lib/auth/core/session-policy";
import type { AuditEvent, Revoker, SessionRecord } from "@/lib/auth/core/types";
import { AuditLogRepository } from "@/common/repositories/audit-log.repository";
import { AUTH_CONFIG, AuthConfig } from "@/common/config/auth.config";
import { DRIZZLE_DB, type Database } from "@/common/config/db";
import { denylistedAccessTokens, sessions } from "@/database/schema";
import { toId, toIdOrNull } from "@/common/helpers/id.helper";

function toSessionRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id.toString(),
    userId: row.userId.toString(),
    sessionVersion: row.sessionVersion,
    currentRefreshJti: row.currentRefreshJti,
    provider: row.provider ?? undefined,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedBy: row.revokedBy?.toString() ?? undefined,
    revokedByIp: row.revokedByIp ?? undefined,
    createdAt: row.createdAt.toISOString(),
    userAgent: row.userAgent ?? undefined,
    ip: row.ip ?? undefined,
  };
}

/**
 * The revocation columns, written as one block wherever a session is revoked.
 *
 * `isRevoked` is derived from `revokedAt` here rather than being a fact of its own: the reference
 * schema carries both columns, and the only way two columns for one fact stay honest is if
 * exactly one place computes the second from the first.
 */
const revocationFields = (revoker?: Revoker) => ({
  revokedAt: new Date(),
  isRevoked: true,
  isActive: false,
  revokedBy: toIdOrNull(revoker?.userId),
  revokedByIp: revoker?.ip ?? null,
});

@Injectable()
export class SessionRepository implements SessionStoreDeps {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(AuditLogRepository) private readonly auditLog: AuditLogRepository,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /** Delegates to AuditLogRepository — makes the previously-optional, previously-unwired `SessionStoreDeps.appendAuditEvent` real. */
  async appendAuditEvent(event: AuditEvent): Promise<void> {
    await this.auditLog.append(event);
  }

  async findSession(id: string): Promise<SessionRecord | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, toId(id)))
      .limit(1);
    return row ? toSessionRecord(row) : null;
  }

  async saveSession(session: SessionRecord): Promise<void> {
    const revoked = session.revokedAt !== null;
    await this.db
      .update(sessions)
      .set({
        sessionVersion: session.sessionVersion,
        currentRefreshJti: session.currentRefreshJti,
        revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
        isRevoked: revoked,
        isActive: !revoked,
        revokedBy: toIdOrNull(session.revokedBy),
        revokedByIp: session.revokedByIp ?? null,
      })
      .where(eq(sessions.id, toId(session.id)));
  }

  /**
   * `expiresAt` is this repository's decision, not core's — the store is the half that knows the
   * deployment's configured session lifetime. It is set once here and never rewritten, which is
   * what makes it an absolute cap rather than a sliding window: see `sessionTtlSeconds`.
   *
   * `createdBy` is the user themselves. A session is only ever created by the person logging in,
   * so recording it costs nothing and leaves the column meaningful rather than always null.
   */
  async createSession(input: {
    userId: string;
    userAgent?: string;
    ip?: string;
    provider?: string;
  }): Promise<SessionRecord> {
    const userIdBig = toId(input.userId);
    const [row] = await this.db
      .insert(sessions)
      .values({
        userId: userIdBig,
        currentRefreshJti: randomUUID(),
        provider: input.provider,
        userAgent: input.userAgent,
        ip: input.ip,
        expiresAt: new Date(Date.now() + this.config.sessionTtlSeconds * 1000),
        createdBy: userIdBig,
      })
      .returning();
    return toSessionRecord(row);
  }

  /** Bulk revoke for one user. Sessions are user-level, never scoped to anything narrower. */
  async revokeAllByUser(userId: string, revoker?: Revoker): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        ...revocationFields(revoker),
        sessionVersion: sql`${sessions.sessionVersion} + 1`,
      })
      .where(
        and(eq(sessions.userId, toId(userId)), isNull(sessions.revokedAt)),
      );
  }

  async revokeAllByUserExcept(
    userId: string,
    keepSessionId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        ...revocationFields(revoker),
        sessionVersion: sql`${sessions.sessionVersion} + 1`,
      })
      .where(
        and(
          eq(sessions.userId, toId(userId)),
          ne(sessions.id, toId(keepSessionId)),
          isNull(sessions.revokedAt),
        ),
      );
  }

  async denylistJti(jti: string, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await this.db
      .insert(denylistedAccessTokens)
      .values({ jti, expiresAt })
      .onConflictDoUpdate({
        target: denylistedAccessTokens.jti,
        set: { expiresAt },
      });
  }

  async isDenylisted(jti: string): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(denylistedAccessTokens)
      .where(eq(denylistedAccessTokens.jti, jti))
      .limit(1);
    if (!row) return false;
    if (row.expiresAt.getTime() < Date.now()) return false; // expired; a cleanup job reaps these, see Phase 6
    return true;
  }
}
