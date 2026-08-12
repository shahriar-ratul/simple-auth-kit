import { PrismaPg } from "@prisma/adapter-pg";
import { DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AbilityGuard } from "./ability.guard.js";
import { AdminController } from "./admin.controller.js";
import { AuditLogGateway } from "./audit-log.gateway.js";
import { AuditLogRepository } from "./audit-log.repository.js";
import { AuthCoreErrorFilter } from "./auth-core-error.filter.js";
import { AUTH_CONFIG, AuthConfig, defaultAuthConfig } from "./auth.config.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { AuthzGuard } from "./authz.guard.js";
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

// Both what the module registers and what the startup tier check walks — one list, so a
// controller can't be added and left out of the check.
const AUTH_CONTROLLERS = [AuthController, AdminController];

@Module({})
export class AuthModule {
  static forRoot(config: Partial<AuthConfig> = {}): DynamicModule {
    // Fail-closed before anything else exists — nothing above this line allocates a database
    // client or a port, so a failed boot leaves nothing behind.
    assertEveryRouteDeclaresATier(AUTH_CONTROLLERS, { authentication: AuthGuard, ability: AbilityGuard });

    const resolved: AuthConfig = { ...defaultAuthConfig, ...config };
    const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
    return {
      module: AuthModule,
      imports: resolved.throttle === false ? [] : [ThrottlerModule.forRoot(resolved.throttle)],
      controllers: AUTH_CONTROLLERS,
      providers: [
        { provide: AUTH_CONFIG, useValue: resolved },
        { provide: PrismaClient, useValue: new PrismaClient({ adapter }) },
        // Swap for a Redis-backed store by passing `permissionCacheStore` to forRoot.
        { provide: PERMISSION_CACHE_STORE, useValue: config.permissionCacheStore ?? new InMemoryPermissionCacheStore() },
        PermissionCache,
        { provide: APP_FILTER, useClass: AuthCoreErrorFilter },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        // Registered from here rather than the consumer's root module so throttling ships with
        // the combo. Runs before the route-level guards, exactly like every other APP_GUARD.
        ...(resolved.throttle === false ? [] : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
        AuditLogRepository,
        AuditLogGateway,
        SessionRepository,
        KeyProviderService,
        InMemoryRateLimitStore,
        RbacRepository,
        TwoFactorRepository,
        OAuthRepository,
        PasswordResetRepository,
        CountryRepository,
        LanguageRepository,
        CustomerRepository,
        AuthService,
        AuthGuard,
        AuthzGuard,
        AbilityGuard,
      ],
      exports: [AuthService, AuthGuard, AuthzGuard, AbilityGuard, PermissionCache, PrismaClient],
    };
  }
}
