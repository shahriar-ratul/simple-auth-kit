import express, { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { RateLimitDeps } from '@/core/rate-limit';
import { createAdminRouter } from '@/modules/admin/routers/admin.router';
import { AdminService } from '@/modules/admin/services/admin.service';
import { createRolesRouter } from '@/modules/roles/routers/roles.router';
import { RolesService } from '@/modules/roles/services/roles.service';
import { createPermissionsRouter } from '@/modules/permissions/routers/permissions.router';
import { PermissionsService } from '@/modules/permissions/services/permissions.service';
import { createAuditLogRouter } from '@/modules/audit-log/routers/audit-log.router';
import { AuditLogService } from '@/modules/audit-log/services/audit-log.service';
import { AuditLogRepository } from '@/modules/audit-log/repositories/audit-log.repository';
import { authCoreErrorMiddleware } from '@/infra/middleware/auth-core-error.middleware';
import { AuthConfig, defaultAuthConfig } from '@/common/config/auth.config';
import { createAuthMiddleware } from '@/common/auth/middleware/auth.middleware';
import { createAuthRouter } from '@/modules/auth/routers/auth.router';
import { AuthService } from '@/modules/auth/services/auth.service';
import { createAuthzMiddleware } from '@/common/auth/middleware/authz.middleware';
import { DrizzleService } from '@/modules/drizzle/drizzle.service';
import { KeyProviderService } from '@/common/config/key-provider';
import { log } from '@/infra/logger/logger';
import { OAuthRepository } from '@/modules/auth/repositories/oauth.repository';
import { openApiSpec } from '@/infra/openapi/openapi-spec';
import { PasswordResetRepository } from '@/modules/auth/repositories/password-reset.repository';
import { InMemoryPermissionCacheStore, PermissionCache } from '@/common/auth/cache/permission-cache';
import { InMemoryRateLimitStore } from '@/common/auth/cache/rate-limit.store';
import { RbacRepository } from '@/modules/auth/repositories/rbac.repository';
import { requestLogger } from '@/infra/middleware/request-logger.middleware';
import { responseEnvelope } from '@/infra/middleware/response-envelope.middleware';
import { SessionRepository } from '@/modules/auth/repositories/session.repository';
import { TwoFactorRepository } from '@/modules/auth/repositories/two-factor.repository';

/**
 * Factory wiring a Drizzle `NodePgDatabase` (from a `pg.Pool`) plus all the plain classes,
 * then mounting `express.json()` + the auth, admin, roles, permissions, and audit-log routers.
 * Equivalent of the reference combo's `AuthModule.forRoot(...)`, just a function instead of a
 * NestJS dynamic module — there's no DI container here, so wiring is explicit constructor calls
 * in one place.
 *
 * Express has no equivalent of the reference combo's `APP_GUARD`/`APP_FILTER`/`APP_INTERCEPTOR`
 * ambient-global-provider problem — this function is already a plain, linear, inspectable
 * sequence of `app.use(...)` calls, and `options.app` (see `AuthConfig`) already lets a consumer
 * mount their own routes/middleware around it. So unlike the NestJS combos' split, there is no
 * "consumer wires globals themselves" reversal here: `createAuthApp` stays the single wiring
 * function, and the only thing this module split changes is which router/service file each route
 * lives in.
 */
export function createAuthApp(config: Partial<AuthConfig> = {}): Express {
  const drizzleService = new DrizzleService();
  const db = drizzleService.db;

  const resolvedConfig: AuthConfig = { ...defaultAuthConfig, ...config };
  const auditLog = new AuditLogRepository(db);
  const sessions = new SessionRepository(db, auditLog, resolvedConfig);
  const keys = new KeyProviderService();
  // Swap the store for a Redis-backed one by passing `rateLimitStore` in `config` — nothing in
  // this library's source changes.
  const rateLimit: RateLimitDeps = resolvedConfig.rateLimitStore ?? new InMemoryRateLimitStore();
  // The cache seam. Swap the store for a Redis-backed one by passing `permissionCacheStore` in
  // `config` — nothing in this library's source changes. Keys are namespaced simpleauthkit:authz:*.
  const permissionCache = new PermissionCache(
    resolvedConfig.permissionCacheStore ?? new InMemoryPermissionCacheStore(),
    resolvedConfig,
  );
  const rbac = new RbacRepository(db, permissionCache);
  const twoFactor = new TwoFactorRepository(db);
  const oauth = new OAuthRepository(db);
  const passwordReset = new PasswordResetRepository(db);
  const authService = new AuthService(
    db,
    sessions,
    keys,
    rateLimit,
    rbac,
    twoFactor,
    oauth,
    passwordReset,
    resolvedConfig,
  );
  const adminService = new AdminService(db, sessions, rbac);
  const rolesService = new RolesService(rbac);
  const permissionsService = new PermissionsService(rbac);
  const auditLogService = new AuditLogService(auditLog);

  const requireAuth = createAuthMiddleware(keys, sessions);
  // Roles are global here, but they are read from the database on the request that uses them —
  // the token carries none. See authz.middleware.ts.
  const requireAuthz = createAuthzMiddleware({ rbac, cache: permissionCache });

  if (!resolvedConfig.permissionCacheStore || !resolvedConfig.rateLimitStore) {
    log.warn(
      'auth',
      '[simple-auth-kit] permissionCacheStore/rateLimitStore not overridden — using in-memory defaults. ' +
        'Fine for a single instance; silently inconsistent (stale grants, wrong rate-limit counts) ' +
        'across replicas once you run more than one. Override permissionCacheStore/rateLimitStore ' +
        "in createAuthApp's config before scaling out.",
    );
  }

  const app = express();
  app.use(express.json());
  app.use(requestLogger());
  // Express equivalent of the reference combo's global APP_FILTER/APP_INTERCEPTOR — the
  // response envelope and error handling ship mounted here rather than something you add to
  // your own app.
  app.use(responseEnvelope());
  app.use(
    '/api/v1/admin',
    createAdminRouter({
      admin: adminService,
      authentication: requireAuth,
      authorization: requireAuthz,
    }),
  );
  app.use(
    '/api/v1/roles',
    createRolesRouter({
      roles: rolesService,
      authentication: requireAuth,
      authorization: requireAuthz,
    }),
  );
  app.use(
    '/api/v1/permissions',
    createPermissionsRouter({
      permissions: permissionsService,
      authentication: requireAuth,
      authorization: requireAuthz,
    }),
  );
  app.use(
    '/api/v1/audit-log',
    createAuditLogRouter({
      auditLog: auditLogService,
      authentication: requireAuth,
      authorization: requireAuthz,
    }),
  );
  app.use(
    '/api/v1/auth',
    createAuthRouter({
      auth: authService,
      config: resolvedConfig,
      authentication: requireAuth,
      authorization: requireAuthz,
    }),
  );
  // Hand-authored OpenAPI spec (see openapi-spec.ts) — this combo has no NestJS decorators to
  // generate one from, so it's served as static JSON, same as the nestjs-* combos' /docs-json.
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/docs-json', (req, res) => res.json(openApiSpec));
  app.use(authCoreErrorMiddleware);

  // Express has no framework-managed shutdown hook, so the pool is stashed here rather than
  // left unreachable — a consumer closes it on SIGTERM/SIGINT with
  // `(app.locals["drizzle"] as DrizzleService).close()`.
  app.locals['drizzle'] = drizzleService;

  return app;
}
