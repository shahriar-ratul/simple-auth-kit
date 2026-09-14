import { Module } from "@nestjs/common";
import { RoleController } from "./controllers/role.controller";
import { RoleService } from "./services/role.service";

// Plain feature module — no forRoot(). Relies on CoreAuthModule already being imported
// (it's @Global()) for RbacRepository/the Drizzle db/the guards/AUTH_CONFIG.
@Module({
  controllers: [RoleController],
  providers: [RoleService],
})
export class RoleModule {}
