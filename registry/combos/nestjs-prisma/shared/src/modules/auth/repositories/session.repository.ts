import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { SessionStoreDeps } from "@/lib/auth/core/session-policy.js";
import type {
  AuditEvent,
  Revoker,
  SessionRecord,
} from "@/lib/auth/core/types.js";
import { PrismaClient } from "@/database/generated/prisma/client.js";
import { AUTH_CONFIG, AuthConfig } from "../../../common/config/auth.config.js";
import { AuditLogRepository } from "../../audit-log/repositories/audit-log.repository.js";
import { toId, toIdOrNull } from "../../../common/helpers/id.helper.js";

function toSessionRecord(row: {
  id: bigint;
  userId: bigint;
  sessionVersion: number;
  currentRefreshJti: string;
  provider: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: bigint | null;
  revokedByIp: string | null;
  createdAt: Date;
  userAgent: string | null;
  ip: string | null;
}): SessionRecord {
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

// `isRevoked` is derived from `revokedAt` here, not stored as its own fact — one place computing
// it keeps the two columns honest.
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
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AuditLogRepository) private readonly auditLog: AuditLogRepository,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    await this.auditLog.append(event);
  }

  async findSession(id: string): Promise<SessionRecord | null> {
    const row = await this.prisma.session.findUnique({
      where: { id: toId(id) },
    });
    return row ? toSessionRecord(row) : null;
  }

  async saveSession(session: SessionRecord): Promise<void> {
    const revoked = session.revokedAt !== null;
    await this.prisma.session.update({
      where: { id: toId(session.id) },
      data: {
        sessionVersion: session.sessionVersion,
        currentRefreshJti: session.currentRefreshJti,
        revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
        isRevoked: revoked,
        isActive: !revoked,
        revokedBy: toIdOrNull(session.revokedBy),
        revokedByIp: session.revokedByIp ?? null,
      },
    });
  }

  // expiresAt is set once here and never rewritten — an absolute cap, not a sliding window.
  // `id` is no longer client-supplied — the bigint PK auto-increments.
  async createSession(input: {
    userId: string;
    userAgent?: string;
    ip?: string;
    provider?: string;
  }): Promise<SessionRecord> {
    const userIdBig = toId(input.userId);
    const row = await this.prisma.session.create({
      data: {
        userId: userIdBig,
        currentRefreshJti: randomUUID(),
        provider: input.provider,
        userAgent: input.userAgent,
        ip: input.ip,
        expiresAt: new Date(Date.now() + this.config.sessionTtlSeconds * 1000),
        createdBy: userIdBig,
      },
    });
    return toSessionRecord(row);
  }

  async revokeAllByUser(userId: string, revoker?: Revoker): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId: toId(userId), revokedAt: null },
      data: { ...revocationFields(revoker), sessionVersion: { increment: 1 } },
    });
  }

  async revokeAllByUserExcept(
    userId: string,
    keepSessionId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId: toId(userId),
        id: { not: toId(keepSessionId) },
        revokedAt: null,
      },
      data: { ...revocationFields(revoker), sessionVersion: { increment: 1 } },
    });
  }

  async denylistJti(jti: string, ttlSeconds: number): Promise<void> {
    await this.prisma.denylistedAccessToken.upsert({
      where: { jti },
      create: { jti, expiresAt: new Date(Date.now() + ttlSeconds * 1000) },
      update: { expiresAt: new Date(Date.now() + ttlSeconds * 1000) },
    });
  }

  async isDenylisted(jti: string): Promise<boolean> {
    const row = await this.prisma.denylistedAccessToken.findUnique({
      where: { jti },
    });
    if (!row) return false;
    if (row.expiresAt.getTime() < Date.now()) return false; // expired; a cleanup job reaps these, see Phase 6
    return true;
  }
}
