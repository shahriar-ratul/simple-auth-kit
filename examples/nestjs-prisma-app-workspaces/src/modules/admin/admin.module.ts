import { Module } from '@nestjs/common';
import { AdminController } from './controllers/admin.controller';
import { AdminService } from './services/admin.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CountryRepository } from './repositories/country.repository';
import { CustomerRepository } from './repositories/customer.repository';
import { LanguageRepository } from './repositories/language.repository';

// Plain feature module — no forRoot(). Relies on CoreAuthModule already being imported
// (it's @Global()) for RbacRepository/SessionRepository/PrismaClient/the guards/AUTH_CONFIG —
// SessionRepository (what block/deactivate use to revoke sessions) is promoted there because
// AuthGuard depends on it too, so it isn't redeclared here. Imports AuditLogModule itself for
// AuditLogRepository, which AdminService writes to directly for the user-scoped role/
// permission-grant audit events it owns (assign/revoke role, grant/revoke permission).
@Module({
  imports: [AuditLogModule],
  controllers: [AdminController],
  providers: [AdminService, CountryRepository, LanguageRepository, CustomerRepository],
})
export class AdminModule {}
