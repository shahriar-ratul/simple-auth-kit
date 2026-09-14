import type { Paginated } from "../../../common/helpers/pagination.js";
import {
  AuditLogEntry,
  AuditLogListFilter,
  AuditLogRepository,
  toAuditLogEntry,
} from "../repositories/audit-log.repository.js";

export class AuditLogService {
  constructor(private readonly auditLog: AuditLogRepository) {}

  async list(filter: AuditLogListFilter): Promise<Paginated<AuditLogEntry>> {
    const { items, meta } = await this.auditLog.list(filter);
    return { items: items.map(toAuditLogEntry), meta };
  }
}
