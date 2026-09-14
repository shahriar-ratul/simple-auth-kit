import { Inject, Injectable } from "@nestjs/common";
import type { Paginated } from "../../../common/helpers/pagination.js";
import {
  AuditLogEntry,
  AuditLogListFilter,
  AuditLogRepository,
  toAuditLogEntry,
} from "../repositories/audit-log.repository.js";

@Injectable()
export class AuditLogService {
  constructor(
    @Inject(AuditLogRepository) private readonly auditLog: AuditLogRepository,
  ) {}

  async list(filter: AuditLogListFilter): Promise<Paginated<AuditLogEntry>> {
    const { items, meta } = await this.auditLog.list(filter);
    return { items: items.map(toAuditLogEntry), meta };
  }
}
