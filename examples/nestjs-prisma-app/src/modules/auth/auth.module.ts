import { Module } from '@nestjs/common';
import { AuditLogGateway } from './gateways/audit-log.gateway.js';
import { AuditLogModule } from '../audit-log/audit-log.module.js';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { OAuthRepository } from './repositories/oauth.repository.js';
import { PasswordResetRepository } from './repositories/password-reset.repository.js';
import { TwoFactorRepository } from './repositories/two-factor.repository.js';

// Plain module — no forRoot(), not global. Identity/session endpoints only; admin/roles/
// permissions/audit-log now live in their own modules. Relies on CoreAuthModule already being
// imported (it's @Global()) elsewhere in the app for RbacRepository/SessionRepository/
// PrismaClient/the guards/AUTH_CONFIG — SessionRepository is promoted there too (AuthGuard
// depends on it), so it isn't redeclared here. Imports AuditLogModule for AuditLogRepository,
// which AuditLogGateway listens on to broadcast over the websocket.
@Module({
  imports: [AuditLogModule],
  controllers: [AuthController],
  providers: [AuthService, TwoFactorRepository, OAuthRepository, PasswordResetRepository, AuditLogGateway],
  exports: [AuthService],
})
export class AuthModule {}
