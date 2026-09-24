import { PrismaPg } from "@prisma/adapter-pg";
import express, { type Express } from "express";
import { apiReference } from "@scalar/express-api-reference";
import type { RateLimitDeps } from "@/lib/auth/core/rate-limit";
import { AdminService } from "@/modules/admin/services/admin.service";
import { createAdminRouter } from "@/modules/admin/routers/admin.router";
import { AuditLogRepository } from "@/common/repositories/audit-log.repository";
import { AuditLogService } from "@/modules/audit-log/services/audit-log.service";
import { createAuditLogRouter } from "@/modules/audit-log/routers/audit-log.router";
import { PermissionService } from "@/modules/permissions/services/permission.service";
import { createPermissionRouter } from "@/modules/permissions/routers/permissions.router";
import { RoleService } from "@/modules/roles/services/role.service";
import { createRoleRouter } from "@/modules/roles/routers/roles.router";
import { authCoreErrorMiddleware } from "@/infra/middleware/auth-core-error.middleware";
import {
  AuthConfig,
  AuthConfigInput,
  defaultAuthConfig,
} from "@/common/config/auth.config";
import { createAuthMiddleware } from "@/common/auth/middleware/auth.middleware";
import { createAuthRouter } from "@/modules/auth/routers/auth.router";
import { AuthService } from "@/modules/auth/services/auth.service";
import { AuthzCache } from "@/common/auth/cache/authz-cache";
import {
  createAuthzMiddleware,
  createWorkspaceMiddleware,
} from "@/common/auth/middleware/authz.middleware";
import { PrismaClient } from "@/database/generated/prisma/client";
import { KeyProviderService } from "@/common/config/key-provider";
import { log } from "@/infra/logger/logger";
import {
  metricsCollector,
  metricsEndpoint,
  warnIfMetricsUnprotected,
} from "@/infra/metrics/metrics";
import { OAuthRepository } from "@/common/repositories/oauth.repository";
import { openApiSpec } from "@/infra/openapi/openapi-spec";
import { PasswordResetRepository } from "@/common/repositories/password-reset.repository";
import { InMemoryRateLimitStore } from "@/common/auth/cache/rate-limit.store";
import { RbacRepository } from "@/common/repositories/rbac.repository";
import { requestLogger } from "@/infra/middleware/request-logger.middleware";
import { responseEnvelope } from "@/infra/middleware/response-envelope.middleware";
import { SessionRepository } from "@/common/repositories/session.repository";
import { TwoFactorRepository } from "@/common/repositories/two-factor.repository";
import { createWorkspaceRouter } from "@/modules/auth/routers/workspace.router";
import { WorkspaceRepository } from "@/common/repositories/workspace.repository";

export interface CreateAuthAppOptions {
  /** Overrides merged on top of `defaultAuthConfig`, same shape as the reference combo's `AuthModule.forRoot(config)`. */
  config?: AuthConfigInput;
  /** Mount onto an existing Express app instead of creating a new one (e.g. to add your own business routes alongside). */
  app?: Express;
  /** A prebuilt authorization cache — pass one to read its `stats` (the proof does); built from `config.authzCache` otherwise. */
  authzCacheInstance?: AuthzCache;
}

/**
 * Express equivalent of the reference combo's `AuthModule.forRoot()`. There's no DI
 * container to hand providers to, so this factory does by hand what Nest's module
 * system does declaratively: build the Prisma client (via the pg adapter, same as the
 * reference), construct every plain-class dependency, wire them into the routers and
 * middleware, and mount everything on an Express app.
 */
export function createAuthApp(options: CreateAuthAppOptions = {}): Express {
  const config: AuthConfig = {
    ...defaultAuthConfig,
    ...options.config,
    // Merged a level deeper, so `authzCache: { ttlSeconds: 5 }` keeps the other defaults.
    authzCache: {
      ...defaultAuthConfig.authzCache,
      ...options.config?.authzCache,
    },
  };

  const adapter = new PrismaPg({
    connectionString: process.env["DATABASE_URL"],
  });
  const prisma = new PrismaClient({ adapter });

  const auditLog = new AuditLogRepository(prisma);
  const sessions = new SessionRepository(prisma, auditLog, config);
  const keys = new KeyProviderService();
  // Swap the store for a Redis-backed one by passing `rateLimitStore` in `config` — nothing in
  // this library's source changes.
  const rateLimit: RateLimitDeps =
    config.rateLimitStore ?? new InMemoryRateLimitStore();
  const rbac = new RbacRepository(prisma);
  const authzCache =
    options.authzCacheInstance ?? new AuthzCache(rbac, config.authzCache);
  const workspaces = new WorkspaceRepository(prisma, rbac);
  const twoFactor = new TwoFactorRepository(prisma);
  const oauth = new OAuthRepository(prisma);
  const passwordReset = new PasswordResetRepository(prisma);
  const authService = new AuthService(
    prisma,
    sessions,
    keys,
    rateLimit,
    twoFactor,
    oauth,
    passwordReset,
    config,
  );
  const adminService = new AdminService(
    prisma,
    sessions,
    auditLog,
    rbac,
    workspaces,
  );
  const roleService = new RoleService(rbac);
  const permissionService = new PermissionService(rbac);
  const auditLogService = new AuditLogService(auditLog);

  const authentication = createAuthMiddleware({ keys, sessions });
  // Roles belong to a workspace membership, resolved from the database on the request that names
  // the workspace. `authorization` tolerates a request that names none (GET /auth/me answers with
  // empty roles); `workspaceScope` does not. See authz.middleware.ts.
  const authorization = createAuthzMiddleware({ rbac, cache: authzCache });
  const workspaceScope = createWorkspaceMiddleware({ rbac, cache: authzCache });

  if (!config.rateLimitStore) {
    log.warn(
      "auth",
      "[simple-auth-kit] rateLimitStore not overridden — using the in-memory default. " +
        "Fine for a single instance; wrong rate-limit counts across replicas once you run more " +
        "than one. Override rateLimitStore in createAuthApp's config before scaling out.",
    );
  }

  warnIfMetricsUnprotected();

  const app = options.app ?? express();
  // First in the chain, ahead of body parsing: a request express.json() rejects as malformed, or
  // a tier middleware rejects as unauthenticated, is still a request this service served, and its
  // latency still counts. See infra/metrics/metrics.ts for why this is middleware and not a route.
  app.use(metricsCollector());
  app.use(express.json());
  app.use(requestLogger());
  // Mounted before responseEnvelope() below: Prometheus parses a bare text exposition format,
  // which the {success, statusCode, message, data} wrapper would render unparseable.
  app.get("/metrics", metricsEndpoint());
  // Scalar API reference at /docs, raw OpenAPI JSON at /docs-json — parity with the nestjs-*
  // combos' apiReference() mount, hand-authored instead of decorator-derived (see
  // openapi-spec.ts for why). Scalar renders a single HTML document rather than serving a
  // directory of static assets, so the bare "/docs" path needs no trailing-slash redirect
  // handling of its own.
  app.use("/docs", apiReference({ content: openApiSpec }));
  app.get("/docs-json", (_req, res) => res.json(openApiSpec));
  // Express equivalent of the reference combo's global APP_FILTER/APP_INTERCEPTOR — the
  // response envelope and error handling ship mounted here rather than something you add to
  // your own app.
  app.use(responseEnvelope());
  // Four separate routers — one per admin domain — plus the identity and workspace routers, each
  // mounted at its own top-level path; paths no longer overlap the way a single `/api/v1/admin`
  // mount did.
  app.use(
    "/api/v1/admin",
    createAdminRouter({ admin: adminService, authentication, workspaceScope }),
  );
  app.use(
    "/api/v1/roles",
    createRoleRouter({ roles: roleService, authentication, workspaceScope }),
  );
  app.use(
    "/api/v1/permissions",
    createPermissionRouter({
      permissions: permissionService,
      authentication,
      workspaceScope,
    }),
  );
  app.use(
    "/api/v1/audit-log",
    createAuditLogRouter({
      auditLog: auditLogService,
      authentication,
      workspaceScope,
    }),
  );
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      auth: authService,
      config,
      authentication,
      authorization,
    }),
  );
  app.use(
    "/api/v1/workspaces",
    createWorkspaceRouter({
      workspaces,
      rbac,
      authentication,
      authorization,
      workspaceScope,
    }),
  );
  // Mounted last so it catches errors forwarded via `next(err)` from every route above.
  app.use(authCoreErrorMiddleware);

  return app;
}
