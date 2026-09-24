import { Module } from '@nestjs/common';
import { AdminController } from '@/modules/admin/controllers/admin.controller';
import { AuthzCacheController } from '@/modules/admin/controllers/authz-cache.controller';
import { AdminService } from '@/modules/admin/services/admin.service';
import { AuditLogModule } from '@/modules/audit-log/audit-log.module';
import { CountryRepository } from '@/common/repositories/country.repository';
import { CustomerRepository } from '@/common/repositories/customer.repository';
import { LanguageRepository } from '@/common/repositories/language.repository';

// Plain feature module — no forRoot(). Relies on CoreAuthModule already being imported
// (it's @Global()) for RbacRepository/SessionRepository/PrismaService/the guards/AUTH_CONFIG —
// SessionRepository (what block/deactivate use to revoke sessions) is promoted there because
// AuthGuard depends on it too, so it isn't redeclared here. Imports AuditLogModule itself for
// AuditLogRepository, which AdminService writes to directly for the user-scoped role/
// permission-grant audit events it owns (assign/revoke role, grant/revoke permission).
@Module({
  imports: [AuditLogModule],
  controllers: [AdminController, AuthzCacheController],
  providers: [AdminService, CountryRepository, LanguageRepository, CustomerRepository],
})
export class AdminModule {}
