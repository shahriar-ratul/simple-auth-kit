import { Module } from "@nestjs/common";
import { PermissionController } from "@/modules/permissions/controllers/permission.controller";
import { PermissionService } from "@/modules/permissions/services/permission.service";

// Plain feature module — no forRoot(). Relies on CoreAuthModule already being imported
// (it's @Global()) for RbacRepository/PrismaService/the guards/AUTH_CONFIG.
@Module({
  controllers: [PermissionController],
  providers: [PermissionService],
})
export class PermissionModule {}
