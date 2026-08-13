import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
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
import { DRIZZLE_DB } from "./db.js";
import { KeyProviderService } from "./key-provider.js";
import { OAuthRepository } from "./oauth.repository.js";
import { PasswordResetRepository } from "./password-reset.repository.js";
import { InMemoryPermissionCacheStore, PERMISSION_CACHE_STORE, PermissionCache } from "./permission-cache.js";
import { InMemoryRateLimitStore } from "./rate-limit.store.js";
import { RbacRepository } from "./rbac.repository.js";
import { ResponseInterceptor } from "./response.interceptor.js";
import { assertEveryRouteDeclaresATier } from "./route-tiers.js";
import * as schema from "./schema.js";
import { SessionRepository } from "./session.repository.js";
import { TwoFactorRepository } from "./two-factor.repository.js";
import { WorkspaceController } from "./workspace.controller.js";
import { WorkspaceRepository } from "./workspace.repository.js";

/**
 * Every controller this library ships, in one place. It is both what the module registers and
 * what the startup tier check walks, so a controller cannot be added to the app and left out of
 * the check — there is only one list.
 */
const AUTH_CONTROLLERS = [AuthController, AdminController, WorkspaceController];

@Module({})
export class AuthModule {
  static forRoot(config: Partial<AuthConfig> = {}): DynamicModule {
    // Fail-closed, before anything else exists. A route carrying none of @Public(),
    // @Authenticated() or @CheckAbility(...) — or carrying one that its guards contradict —
    // stops the process here, by name, rather than shipping as an open endpoint nobody noticed.
    // Nothing above this line allocates a connection pool or a port, so a failed boot leaves
    // nothing behind.
    assertEveryRouteDeclaresATier(AUTH_CONTROLLERS, { authentication: AuthGuard, ability: AbilityGuard });

    const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
    const db = drizzle(pool, { schema });
    return {
      module: AuthModule,
      controllers: AUTH_CONTROLLERS,
      providers: [
        { provide: AUTH_CONFIG, useValue: { ...defaultAuthConfig, ...config } },
        { provide: DRIZZLE_DB, useValue: db },
        // The cache seam. Swap the store for a Redis-backed one by passing `permissionCacheStore`
        // to forRoot — nothing in this library's source changes. Keys are namespaced easyauth:authz:*.
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
        AuthService,
        AuthGuard,
        AuthzGuard,
        WorkspaceGuard,
        AbilityGuard,
      ],
      exports: [AuthService, AuthGuard, AuthzGuard, WorkspaceGuard, AbilityGuard, PermissionCache, WorkspaceRepository, DRIZZLE_DB],
    };
  }
}
