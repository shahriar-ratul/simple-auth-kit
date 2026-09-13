import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { AbilityGuard } from "./ability/ability.guard.js";
import { AdminController } from "./controllers/admin.controller.js";
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
import { AuthzGuard, WorkspaceGuard } from "./guards/authz.guard.js";
import { DRIZZLE_DB } from "./config/db.js";
import { KeyProviderService } from "./config/key-provider.js";
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
import * as schema from "./schema.js";
import { SessionRepository } from "./repositories/session.repository.js";
import { TwoFactorRepository } from "./repositories/two-factor.repository.js";
import { WorkspaceController } from "./controllers/workspace.controller.js";
import { WorkspaceRepository } from "./repositories/workspace.repository.js";

/**
 * Every controller this library ships, in one place. It is both what the module registers and
 * what the startup tier check walks, so a controller cannot be added to the app and left out of
 * the check — there is only one list.
 */
const AUTH_CONTROLLERS = [AuthController, AdminController, WorkspaceController];

// `forRoot()` is the entire integration surface — everything an app would normally wire by
// hand in its own root module (global exception filter, global response-envelope interceptor,
// the rate-limit guard + ThrottlerModule) is registered from inside it instead, so it ships
// with the combo. Don't re-register AuthCoreErrorFilter/ResponseInterceptor/ThrottlerGuard (or
// ThrottlerModule) in your own app module — forRoot() already did it; doing it again would
// double-register them as competing APP_FILTER/APP_INTERCEPTOR/APP_GUARD providers.
@Module({})
export class AuthModule {
  static forRoot(config: Partial<AuthConfig> = {}): DynamicModule {
    // Fail-closed, before anything else exists. A route carrying none of @Public(),
    // @Authenticated() or @CheckAbility(...) — or carrying one that its guards contradict —
    // stops the process here, by name, rather than shipping as an open endpoint nobody noticed.
    // Nothing above this line allocates a connection pool or a port, so a failed boot leaves
    // nothing behind.
    assertEveryRouteDeclaresATier(AUTH_CONTROLLERS, {
      authentication: AuthGuard,
      ability: AbilityGuard,
    });

    const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
    const db = drizzle(pool, { schema });

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
      controllers: AUTH_CONTROLLERS,
      providers: [
        { provide: AUTH_CONFIG, useValue: { ...defaultAuthConfig, ...config } },
        { provide: DRIZZLE_DB, useValue: db },
        // The cache seam. Swap the store for a Redis-backed one by passing `permissionCacheStore`
        // to forRoot — nothing in this library's source changes. Keys are namespaced simpleauthkit:authz:*.
        {
          provide: PERMISSION_CACHE_STORE,
          useValue:
            config.permissionCacheStore ?? new InMemoryPermissionCacheStore(),
        },
        PermissionCache,
        { provide: APP_FILTER, useClass: AuthCoreErrorFilter },
        { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
        AuditLogRepository,
        SessionRepository,
        KeyProviderService,
        {
          provide: RATE_LIMIT_STORE,
          useValue: config.rateLimitStore ?? new InMemoryRateLimitStore(),
        },
        RbacRepository,
        WorkspaceRepository,
        TwoFactorRepository,
        OAuthRepository,
        PasswordResetRepository,
        AuthService,
        AuthGuard,
        AuthzGuard,
        WorkspaceGuard,
        AbilityGuard,
      ],
      exports: [
        AuthService,
        AuthGuard,
        AuthzGuard,
        WorkspaceGuard,
        AbilityGuard,
        PermissionCache,
        WorkspaceRepository,
        DRIZZLE_DB,
      ],
    };
  }
}
