import { PrismaPg } from '@prisma/adapter-pg';
import { DynamicModule, Global, Module } from '@nestjs/common';
import { AbilityGuard } from './ability/ability.guard.js';
import { AdminController } from '../../modules/admin/controllers/admin.controller.js';
import { AuditLogController } from '../../modules/audit-log/controllers/audit-log.controller.js';
import { AUTH_CONFIG, AuthConfig, defaultAuthConfig } from '../config/auth.config.js';
import { AuthController } from '../../modules/auth/controllers/auth.controller.js';
import { AuthGuard } from './guards/auth.guard.js';
import { AuthzGuard } from './guards/authz.guard.js';
import { PrismaClient } from '@/database/generated/prisma/client.js';
import { KeyProviderService } from '../config/key-provider.js';
import { InMemoryPermissionCacheStore, PERMISSION_CACHE_STORE, PermissionCache } from './cache/permission-cache.js';
import { InMemoryRateLimitStore, RATE_LIMIT_STORE } from './cache/rate-limit.store.js';
import { PermissionController } from '../../modules/permissions/controllers/permission.controller.js';
import { RbacRepository } from '../../modules/auth/repositories/rbac.repository.js';
import { RoleController } from '../../modules/roles/controllers/role.controller.js';
import { AuditLogModule } from '../../modules/audit-log/audit-log.module.js';
import { SessionRepository } from '../../modules/auth/repositories/session.repository.js';
import { assertEveryRouteDeclaresATier } from '../../infra/route-tiers.js';

// Every controller this combo ships, across every feature module — the one array the boot-time
// tier check walks. Built here (rather than each feature module registering itself) so there's
// no circular import between this module and the feature modules it provides shared plumbing to.
const TIERED_CONTROLLERS = [AuthController, AdminController, RoleController, PermissionController, AuditLogController];

// The one remaining `forRoot()`: AUTH_CONFIG, cache/rate-limit store overrides, and OAuth
// credentials genuinely need consumer-supplied config. Everything else a consumer's own app used
// to get for free from AuthModule.forRoot() — the global exception filter, the response-envelope
// interceptor, ThrottlerModule + its APP_GUARD — is now assembled by hand in the consumer's own
// app.module.ts instead (see examples/nestjs-prisma-app/src/app.module.ts).
//
// @Global() so every feature module (AuthModule, AdminModule, RoleModule, PermissionModule,
// AuditLogModule) can inject what's in `exports` below without importing this module again.
// SessionRepository is promoted here too, alongside RbacRepository: AuthGuard depends on it
// directly (for the token-denylist check), and AuthGuard has to live here since every feature
// module needs it — so its own dependency needs the same ambient availability. Importing
// AuditLogModule is what makes that resolvable (SessionRepository writes through it).
@Global()
@Module({})
export class CoreAuthModule {
  static forRoot(config: Partial<AuthConfig> = {}): DynamicModule {
    // Fail-closed before anything else exists — nothing above this line allocates a database
    // client or a port, so a failed boot leaves nothing behind.
    assertEveryRouteDeclaresATier(TIERED_CONTROLLERS, {
      authentication: AuthGuard,
      ability: AbilityGuard,
    });

    const resolved: AuthConfig = { ...defaultAuthConfig, ...config };
    const adapter = new PrismaPg({
      connectionString: process.env['DATABASE_URL'],
    });

    if (!config.permissionCacheStore || !config.rateLimitStore) {
      console.warn(
        '[simple-auth-kit] permissionCacheStore/rateLimitStore not overridden — using in-memory defaults. ' +
          'Fine for a single instance; silently inconsistent (stale grants, wrong rate-limit counts) ' +
          'across replicas once you run more than one. Override permissionCacheStore/rateLimitStore ' +
          'with a shared store (e.g. Redis) in CoreAuthModule.forRoot() before scaling out.',
      );
    }

    return {
      module: CoreAuthModule,
      global: true,
      imports: [AuditLogModule],
      providers: [
        { provide: AUTH_CONFIG, useValue: resolved },
        { provide: PrismaClient, useValue: new PrismaClient({ adapter }) },
        // Swap for a Redis-backed store by passing `permissionCacheStore` to forRoot.
        {
          provide: PERMISSION_CACHE_STORE,
          useValue: config.permissionCacheStore ?? new InMemoryPermissionCacheStore(),
        },
        PermissionCache,
        KeyProviderService,
        {
          provide: RATE_LIMIT_STORE,
          useValue: config.rateLimitStore ?? new InMemoryRateLimitStore(),
        },
        RbacRepository,
        SessionRepository,
        AuthGuard,
        AuthzGuard,
        AbilityGuard,
      ],
      exports: [
        AUTH_CONFIG,
        PrismaClient,
        KeyProviderService,
        PERMISSION_CACHE_STORE,
        PermissionCache,
        RATE_LIMIT_STORE,
        RbacRepository,
        SessionRepository,
        AuthGuard,
        AuthzGuard,
        AbilityGuard,
      ],
    };
  }
}
