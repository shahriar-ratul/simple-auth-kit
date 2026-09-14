import { Module } from '@nestjs/common';
import { RoleController } from '@/modules/roles/controllers/role.controller';
import { RoleService } from '@/modules/roles/services/role.service';

// Plain feature module — no forRoot(). Relies on CoreAuthModule already being imported
// (it's @Global()) for RbacRepository/PrismaService/the guards/AUTH_CONFIG.
@Module({
  controllers: [RoleController],
  providers: [RoleService],
})
export class RoleModule {}
