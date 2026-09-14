import type { Paginated } from "../../../common/helpers/pagination.js";
import type { AuthzContext } from "../../../common/auth/middleware/authz.middleware.js";
import {
  AuditLogEntry,
  AuditLogListFilter,
  AuditLogRepository,
  toAuditLogEntry,
} from "../repositories/audit-log.repository.js";

/** Pinned to the caller's workspace — the filter argument cannot widen it. */
export class AuditLogService {
  constructor(private readonly auditLog: AuditLogRepository) {}

  async list(
    ctx: AuthzContext,
    filter: AuditLogListFilter,
  ): Promise<Paginated<AuditLogEntry>> {
    const { items, meta } = await this.auditLog.list({
      ...filter,
      workspaceId: ctx.workspaceId,
    });
    return { items: items.map(toAuditLogEntry), meta };
  }
}
