import { Inject, Injectable } from '@nestjs/common';
import type { AuthzContext } from '../../../common/auth/guards/authz.guard';
import type { Paginated } from '../../../common/helpers/pagination';
import {
  AuditLogEntry,
  AuditLogListFilter,
  AuditLogRepository,
  toAuditLogEntry,
} from '../repositories/audit-log.repository';

@Injectable()
export class AuditLogService {
  constructor(@Inject(AuditLogRepository) private readonly auditLog: AuditLogRepository) {}

  // Pinned to the caller's workspace — the filter argument cannot widen it.
  async list(ctx: AuthzContext, filter: AuditLogListFilter): Promise<Paginated<AuditLogEntry>> {
    const { items, meta } = await this.auditLog.list({
      ...filter,
      workspaceId: ctx.workspaceId,
    });
    return { items: items.map(toAuditLogEntry), meta };
  }
}
