import { Module } from '@nestjs/common';
import { AuditLogController } from '@/modules/audit-log/controllers/audit-log.controller';
import { AuditLogRepository } from '@/modules/audit-log/repositories/audit-log.repository';
import { AuditLogService } from '@/modules/audit-log/services/audit-log.service';

// Plain feature module — no forRoot(). Exports AuditLogRepository: SessionRepository
// (modules/auth) writes to it via appendAuditEvent(), and AdminModule writes to it directly for
// the user-scoped role/permission-grant events it owns — both import AuditLogModule for it.
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogRepository, AuditLogService],
  exports: [AuditLogRepository],
})
export class AuditLogModule {}
