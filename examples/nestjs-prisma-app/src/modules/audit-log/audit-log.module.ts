import { Module } from '@nestjs/common';
import { AuditLogController } from './controllers/audit-log.controller.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';
import { AuditLogService } from './services/audit-log.service.js';

// Plain feature module — no forRoot(). Exports AuditLogRepository: SessionRepository
// (modules/auth) writes to it via appendAuditEvent(), AuditLogGateway (modules/auth, base
// variant) listens on it, and AdminModule writes to it directly for the user-scoped role/
// permission-grant events it owns — all three import AuditLogModule for it.
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogRepository, AuditLogService],
  exports: [AuditLogRepository],
})
export class AuditLogModule {}
