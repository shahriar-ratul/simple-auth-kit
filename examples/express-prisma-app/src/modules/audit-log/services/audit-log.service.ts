import type { Paginated } from '../../../common/helpers/pagination';
import {
  AuditLogEntry,
  AuditLogListFilter,
  AuditLogRepository,
  toAuditLogEntry,
} from '../repositories/audit-log.repository';

export class AuditLogService {
  constructor(private readonly auditLog: AuditLogRepository) {}

  async list(filter: AuditLogListFilter): Promise<Paginated<AuditLogEntry>> {
    const { items, meta } = await this.auditLog.list(filter);
    return { items: items.map(toAuditLogEntry), meta };
  }
}
