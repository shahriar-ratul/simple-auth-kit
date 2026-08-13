import { PrismaPg } from "@prisma/adapter-pg";
import { DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { AbilityGuard } from "./ability.guard.js";
import { AdminController } from "./admin.controller.js";
import { AuditLogRepository } from "./audit-log.repository.js";
import { AuthCoreErrorFilter } from "./auth-core-error.filter.js";
import { AUTH_CONFIG, AuthConfig, defaultAuthConfig } from "./auth.config.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { AuthzGuard, WorkspaceGuard } from "./authz.guard.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { CountryRepository } from "./country.repository.js";
import { CustomerRepository } from "./customer.repository.js";
import { KeyProviderService } from "./key-provider.js";
import { LanguageRepository } from "./language.repository.js";
import { OAuthRepository } from "./oauth.repository.js";
import { PasswordResetRepository } from "./password-reset.repository.js";
import { InMemoryPermissionCacheStore, PERMISSION_CACHE_STORE, PermissionCache } from "./permission-cache.js";
import { InMemoryRateLimitStore } from "./rate-limit.store.js";
import { RbacRepository } from "./rbac.repository.js";
import { ResponseInterceptor } from "./response.interceptor.js";
import { assertEveryRouteDeclaresATier } from "./route-tiers.js";
import { SessionRepository } from "./session.repository.js";
import { TwoFactorRepository } from "./two-factor.repository.js";
import { WorkspaceController } from "./workspace.controller.js";
import { WorkspaceRepository } from "./workspace.repository.js";

// Both what the module registers and what the startup tier check walks — one list, so a
// controller can't be added and left out of the check.
const AUTH_CONTROLLERS = [AuthController, AdminController, WorkspaceController];

@Module({})
export class AuthModule {
  static forRoot(config: Partial<AuthConfig> = {}): DynamicModule {
    // Fail-closed before anything else exists — nothing above this line allocates a database
    // client or a port, so a failed boot leaves nothing behind.
    assertEveryRouteDeclaresATier(AUTH_CONTROLLERS, { authentication: AuthGuard, ability: AbilityGuard });

    const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
    return {
      module: AuthModule,
      controllers: AUTH_CONTROLLERS,
      providers: [
        { provide: AUTH_CONFIG, useValue: { ...defaultAuthConfig, ...config } },
        { provide: PrismaClient, useValue: new PrismaClient({ adapter }) },
        // Swap for a Redis-backed store by passing `permissionCacheStore` to forRoot.
        { provide: PERMISSION_CACHE_STORE, useValue: config.permissionCacheStore ?? new InMemoryPermissionCacheStore() },
        PermissionCache,
        { provide: APP_FILTER, useClass: AuthCoreErrorFilter },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        AuditLogRepository,
        SessionRepository,
        KeyProviderService,
        InMemoryRateLimitStore,
        RbacRepository,
        WorkspaceRepository,
        TwoFactorRepository,
        OAuthRepository,
        PasswordResetRepository,
        CountryRepository,
        LanguageRepository,
        CustomerRepository,
        AuthService,
        AuthGuard,
        AuthzGuard,
        WorkspaceGuard,
        AbilityGuard,
      ],
      exports: [AuthService, AuthGuard, AuthzGuard, WorkspaceGuard, AbilityGuard, PermissionCache, WorkspaceRepository, PrismaClient],
    };
  }
}
