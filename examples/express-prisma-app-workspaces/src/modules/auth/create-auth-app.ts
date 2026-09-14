import { PrismaPg } from "@prisma/adapter-pg";
import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";
import type { RateLimitDeps } from "@/core/rate-limit.js";
import { AdminService } from "../admin/services/admin.service.js";
import { createAdminRouter } from "../admin/routers/admin.router.js";
import { AuditLogRepository } from "../audit-log/repositories/audit-log.repository.js";
import { AuditLogService } from "../audit-log/services/audit-log.service.js";
import { createAuditLogRouter } from "../audit-log/routers/audit-log.router.js";
import { PermissionService } from "../permissions/services/permission.service.js";
import { createPermissionRouter } from "../permissions/routers/permissions.router.js";
import { RoleService } from "../roles/services/role.service.js";
import { createRoleRouter } from "../roles/routers/roles.router.js";
import { authCoreErrorMiddleware } from "../../infra/middleware/auth-core-error.middleware.js";
import {
  AuthConfig,
  defaultAuthConfig,
} from "../../common/config/auth.config.js";
import { createAuthMiddleware } from "../../common/auth/middleware/auth.middleware.js";
import { createAuthRouter } from "./routers/auth.router.js";
import { AuthService } from "./services/auth.service.js";
import {
  createAuthzMiddleware,
  createWorkspaceMiddleware,
} from "../../common/auth/middleware/authz.middleware.js";
import { PrismaClient } from "@/database/generated/prisma/client.js";
import { KeyProviderService } from "../../common/config/key-provider.js";
import { OAuthRepository } from "./repositories/oauth.repository.js";
import { openApiSpec } from "../../infra/openapi/openapi-spec.js";
import { PasswordResetRepository } from "./repositories/password-reset.repository.js";
import {
  InMemoryPermissionCacheStore,
  PermissionCache,
} from "../../common/auth/cache/permission-cache.js";
import { InMemoryRateLimitStore } from "../../common/auth/cache/rate-limit.store.js";
import { RbacRepository } from "./repositories/rbac.repository.js";
import { responseEnvelope } from "../../infra/middleware/response-envelope.middleware.js";
import { SessionRepository } from "./repositories/session.repository.js";
import { TwoFactorRepository } from "./repositories/two-factor.repository.js";
import { createWorkspaceRouter } from "./routers/workspace.router.js";
import { WorkspaceRepository } from "./repositories/workspace.repository.js";

export interface CreateAuthAppOptions {
  /** Overrides merged on top of `defaultAuthConfig`, same shape as the reference combo's `AuthModule.forRoot(config)`. */
  config?: Partial<AuthConfig>;
  /** Mount onto an existing Express app instead of creating a new one (e.g. to add your own business routes alongside). */
  app?: Express;
}

/**
 * Express equivalent of the reference combo's `AuthModule.forRoot()`. There's no DI
 * container to hand providers to, so this factory does by hand what Nest's module
 * system does declaratively: build the Prisma client (via the pg adapter, same as the
 * reference), construct every plain-class dependency, wire them into the routers and
 * middleware, and mount everything on an Express app.
 */
export function createAuthApp(options: CreateAuthAppOptions = {}): Express {
  const config: AuthConfig = { ...defaultAuthConfig, ...options.config };

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
  // The cache seam. Swap the store for a Redis-backed one by passing `permissionCacheStore` in
  // `config` — nothing in this library's source changes. Keys are namespaced simpleauthkit:authz:*.
  const permissionCache = new PermissionCache(
    config.permissionCacheStore ?? new InMemoryPermissionCacheStore(),
    config,
  );
  const rbac = new RbacRepository(prisma, permissionCache);
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
  const authorization = createAuthzMiddleware({ rbac, cache: permissionCache });
  const workspaceScope = createWorkspaceMiddleware({
    rbac,
    cache: permissionCache,
  });

  if (!config.permissionCacheStore || !config.rateLimitStore) {
    console.warn(
      "[simple-auth-kit] permissionCacheStore/rateLimitStore not overridden — using in-memory defaults. " +
        "Fine for a single instance; silently inconsistent (stale grants, wrong rate-limit counts) " +
        "across replicas once you run more than one. Override permissionCacheStore/rateLimitStore " +
        "in createAuthApp's config before scaling out.",
    );
  }

  const app = options.app ?? express();
  app.use(express.json());
  // Swagger UI at /docs, raw OpenAPI JSON at /docs-json — parity with the nestjs-* combos'
  // SwaggerModule.setup("docs", ...), hand-authored instead of decorator-derived (see
  // openapi-spec.ts for why). `redirect: false` keeps the bare "/docs" path (no trailing
  // slash) a plain 200 instead of swagger-ui-express's default 301 to "/docs/" — the
  // underlying static asset middleware would otherwise treat the mount root as a directory
  // listing and redirect.
  app.use(
    "/docs",
    swaggerUi.serveWithOptions({ redirect: false }),
    swaggerUi.setup(openApiSpec),
  );
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
