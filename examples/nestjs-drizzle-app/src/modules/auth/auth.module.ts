import { Module } from '@nestjs/common';
import { AuthController } from '@/modules/auth/controllers/auth.controller';
import { AuthService } from '@/modules/auth/services/auth.service';
import { OAuthRepository } from '@/modules/auth/repositories/oauth.repository';
import { PasswordResetRepository } from '@/modules/auth/repositories/password-reset.repository';
import { TwoFactorRepository } from '@/modules/auth/repositories/two-factor.repository';

// Plain module — no forRoot(), not global. Identity/session endpoints only; admin/roles/
// permissions/audit-log now live in their own modules. Relies on CoreAuthModule already being
// imported (it's @Global()) elsewhere in the app for RbacRepository/SessionRepository/the
// Drizzle db/the guards/AUTH_CONFIG — SessionRepository is promoted there too (AuthGuard
// depends on it), so it isn't redeclared here.
@Module({
  controllers: [AuthController],
  providers: [AuthService, TwoFactorRepository, OAuthRepository, PasswordResetRepository],
  exports: [AuthService],
})
export class AuthModule {}
