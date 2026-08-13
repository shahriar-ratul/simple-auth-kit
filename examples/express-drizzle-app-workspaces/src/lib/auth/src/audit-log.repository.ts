import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AuditEvent } from "@/lib/auth/core/types.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";
import * as schema from "./schema.js";
import { toIdOrNull, toIdOrUndefined } from "./id.helper.js";

export interface AuditLogEntry {
  id: string;
  workspaceId: string | null;
  userId: string | null;
  name: string;
  action: string;
  info: unknown;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogListFilter {
  /** Set on every workspace-scoped read, so one workspace's admins never see another's entries. */
  workspaceId?: string;
  userId?: string;
  action?: string;
  since?: string;
  until?: string;
  page?: number;
  limit?: number;
}

/** An `auditLogs` row as `.select().from(auditLogs)` returns it. */
export type AuditLogRow = typeof schema.auditLogs.$inferSelect;

/** Shapes a raw row into the wire DTO. Applied by the caller (`AuthService.listAuditLog`), not here. */
export function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id.toString(),
    workspaceId: row.workspaceId?.toString() ?? null,
    userId: row.userId?.toString() ?? null,
    name: row.name,
    action: row.action,
    info: row.info,
    remarks: row.remarks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** "role_assigned" -> "Role assigned". Derived rather than passed in, so core never has to carry display text. */
export function humanizeAction(action: string): string {
  const words = action.split("_");
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
}

/**
 * Plain class, no decorators — Drizzle-specific sink for `SessionStoreDeps.appendAuditEvent`
 * (registry/core/session-policy.ts) plus the RBAC/2FA/OAuth/password-reset flows, mirroring
 * the reference combo's AuditLogRepository.
 */
export class AuditLogRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  /**
   * `workspaceId` is left null for events core raises (login, logout, password reset, ...) —
   * those happen to a user, not inside a workspace. Callers that *are* acting in a workspace
   * pass it, which is what scopes the admin audit-log read below.
   */
  async append(event: AuditEvent, opts: { workspaceId?: string; remarks?: string } = {}): Promise<void> {
    await this.db.insert(schema.auditLogs).values({
      action: event.type,
      name: humanizeAction(event.type),
      workspaceId: toIdOrNull(opts.workspaceId),
      userId: "userId" in event ? toIdOrNull(event.userId) : null,
      info: event,
      remarks: opts.remarks ?? null,
    });
  }

  /** Newest-first, page-paginated. Returns raw rows — shaping is the caller's job, see `toAuditLogEntry`. */
  async list(filter: AuditLogListFilter): Promise<Paginated<AuditLogRow>> {
    const page = normalizePage(filter.page);
    const limit = normalizeLimit(filter.limit);
    const conditions: SQL[] = [];

    const workspaceIdBig = toIdOrUndefined(filter.workspaceId);
    if (workspaceIdBig !== undefined) conditions.push(eq(schema.auditLogs.workspaceId, workspaceIdBig));
    const userIdBig = toIdOrUndefined(filter.userId);
    if (userIdBig !== undefined) conditions.push(eq(schema.auditLogs.userId, userIdBig));
    if (filter.action) conditions.push(eq(schema.auditLogs.action, filter.action));
    if (filter.since) conditions.push(gte(schema.auditLogs.createdAt, new Date(filter.since)));
    if (filter.until) conditions.push(lte(schema.auditLogs.createdAt, new Date(filter.until)));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(schema.auditLogs)
      .where(where)
      .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
      .limit(limit)
      .offset((page - 1) * limit);
    const [{ value: total }] = await this.db.select({ value: count() }).from(schema.auditLogs).where(where);

    return { items: rows, meta: buildPageMeta(page, limit, total) };
  }
}
