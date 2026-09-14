import { Module } from "@nestjs/common";
import { AuthController } from "./controllers/auth.controller";
import { AuthService } from "./services/auth.service";
import { OAuthRepository } from "./repositories/oauth.repository";
import { PasswordResetRepository } from "./repositories/password-reset.repository";
import { TwoFactorRepository } from "./repositories/two-factor.repository";
import { WorkspaceController } from "./controllers/workspace.controller";

// Plain module — no forRoot(), not global. Identity/session endpoints (AuthController) plus
// workspace membership itself (WorkspaceController — creating/listing workspaces and managing
// membership is neither "admin of a deployment" nor one of the split-out RBAC-catalog domains,
// so it stays alongside identity rather than moving into AdminModule). Admin/roles/permissions/
// audit-log now live in their own modules. Relies on CoreAuthModule already being imported
// (it's @Global()) elsewhere in the app for RbacRepository/WorkspaceRepository/SessionRepository/
// the Drizzle db/the guards/AUTH_CONFIG — SessionRepository is promoted there too (AuthGuard
// depends on it), so it isn't redeclared here.
@Module({
  controllers: [AuthController, WorkspaceController],
  providers: [
    AuthService,
    TwoFactorRepository,
    OAuthRepository,
    PasswordResetRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
