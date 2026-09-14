import { Module } from "@nestjs/common";
import { PermissionController } from "./controllers/permission.controller.js";
import { PermissionService } from "./services/permission.service.js";

// Plain feature module — no forRoot(). Relies on CoreAuthModule already being imported
// (it's @Global()) for RbacRepository/PrismaClient/the guards/AUTH_CONFIG.
@Module({
  controllers: [PermissionController],
  providers: [PermissionService],
})
export class PermissionModule {}
