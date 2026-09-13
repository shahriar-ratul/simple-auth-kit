import { PrismaPg } from "@prisma/adapter-pg";
import { DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AbilityGuard } from "./ability/ability.guard.js";
import { AdminController } from "./controllers/admin.controller.js";
import { AuditLogGateway } from "./gateways/audit-log.gateway.js";
import { AuditLogRepository } from "./repositories/audit-log.repository.js";
import { AuthCoreErrorFilter } from "./filters/auth-core-error.filter.js";
import {
  AUTH_CONFIG,
  AuthConfig,
  defaultAuthConfig,
} from "./config/auth.config.js";
import { AuthController } from "./controllers/auth.controller.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { AuthService } from "./services/auth.service.js";
import { AuthzGuard } from "./guards/authz.guard.js";
import { PrismaClient } from "./../generated/prisma/client.js";
import { CountryRepository } from "./repositories/country.repository.js";
import { CustomerRepository } from "./repositories/customer.repository.js";
import { KeyProviderService } from "./config/key-provider.js";
import { LanguageRepository } from "./repositories/language.repository.js";
import { OAuthRepository } from "./repositories/oauth.repository.js";
import { PasswordResetRepository } from "./repositories/password-reset.repository.js";
import {
  InMemoryPermissionCacheStore,
  PERMISSION_CACHE_STORE,
  PermissionCache,
} from "./cache/permission-cache.js";
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
} from "./cache/rate-limit.store.js";
import { RbacRepository } from "./repositories/rbac.repository.js";
import { ResponseInterceptor } from "./interceptors/response.interceptor.js";
import { assertEveryRouteDeclaresATier } from "./route-tiers.js";
import { SessionRepository } from "./repositories/session.repository.js";
import { TwoFactorRepository } from "./repositories/two-factor.repository.js";

// Both what the module registers and what the startup tier check walks — one list, so a
// controller can't be added and left out of the check.
const AUTH_CONTROLLERS = [AuthController, AdminController];

// `forRoot()` is the entire integration surface — everything an app would normally wire by
// hand in its own root module (global exception filter, global response-envelope interceptor,
// the rate-limit guard + ThrottlerModule) is registered from inside it instead, so it ships
// with the combo. Don't re-register AuthCoreErrorFilter/ResponseInterceptor/ThrottlerGuard (or
// ThrottlerModule) in your own app module — forRoot() already did it; doing it again would
// double-register them as competing APP_FILTER/APP_INTERCEPTOR/APP_GUARD providers.
@Module({})
export class AuthModule {
  static forRoot(config: Partial<AuthConfig> = {}): DynamicModule {
    // Fail-closed before anything else exists — nothing above this line allocates a database
    // client or a port, so a failed boot leaves nothing behind.
    assertEveryRouteDeclaresATier(AUTH_CONTROLLERS, {
      authentication: AuthGuard,
      ability: AbilityGuard,
    });

    const resolved: AuthConfig = { ...defaultAuthConfig, ...config };
    const adapter = new PrismaPg({
      connectionString: process.env["DATABASE_URL"],
    });

    if (!config.permissionCacheStore || !config.rateLimitStore) {
      console.warn(
        "[simple-auth-kit] permissionCacheStore/rateLimitStore not overridden — using in-memory defaults. " +
          "Fine for a single instance; silently inconsistent (stale grants, wrong rate-limit counts) " +
          "across replicas once you run more than one. Override permissionCacheStore/rateLimitStore " +
          "with a shared store (e.g. Redis) in AuthModule.forRoot() before scaling out.",
      );
    }
    return {
      module: AuthModule,
      imports:
        resolved.throttle === false
          ? []
          : [ThrottlerModule.forRoot(resolved.throttle)],
      controllers: AUTH_CONTROLLERS,
      providers: [
        { provide: AUTH_CONFIG, useValue: resolved },
        { provide: PrismaClient, useValue: new PrismaClient({ adapter }) },
        // Swap for a Redis-backed store by passing `permissionCacheStore` to forRoot.
        {
          provide: PERMISSION_CACHE_STORE,
          useValue:
            config.permissionCacheStore ?? new InMemoryPermissionCacheStore(),
        },
        PermissionCache,
        { provide: APP_FILTER, useClass: AuthCoreErrorFilter },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        // Registered from here rather than the consumer's root module so throttling ships with
        // the combo. Runs before the route-level guards, exactly like every other APP_GUARD.
        ...(resolved.throttle === false
          ? []
          : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
        AuditLogRepository,
        AuditLogGateway,
        SessionRepository,
        KeyProviderService,
        {
          provide: RATE_LIMIT_STORE,
          useValue: config.rateLimitStore ?? new InMemoryRateLimitStore(),
        },
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
      exports: [
        AuthService,
        AuthGuard,
        AuthzGuard,
        AbilityGuard,
        PermissionCache,
        PrismaClient,
      ],
    };
  }
}
