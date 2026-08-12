import { PrismaPg } from "@prisma/adapter-pg";
import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";
import { createAdminRouter } from "./admin.router.js";
import { AuditLogRepository } from "./audit-log.repository.js";
import { authCoreErrorMiddleware } from "./auth-core-error.middleware.js";
import { AuthConfig, defaultAuthConfig } from "./auth.config.js";
import { createAuthMiddleware } from "./auth.middleware.js";
import { createAuthRouter } from "./auth.router.js";
import { AuthService } from "./auth.service.js";
import { createAuthzMiddleware, createWorkspaceMiddleware } from "./authz.middleware.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { KeyProviderService } from "./key-provider.js";
import { OAuthRepository } from "./oauth.repository.js";
import { openApiSpec } from "./openapi-spec.js";
import { PasswordResetRepository } from "./password-reset.repository.js";
import { InMemoryPermissionCacheStore, PermissionCache } from "./permission-cache.js";
import { InMemoryRateLimitStore } from "./rate-limit.store.js";
import { RbacRepository } from "./rbac.repository.js";
import { SessionRepository } from "./session.repository.js";
import { TwoFactorRepository } from "./two-factor.repository.js";
import { createWorkspaceRouter } from "./workspace.router.js";
import { WorkspaceRepository } from "./workspace.repository.js";

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

  const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
  const prisma = new PrismaClient({ adapter });

  const auditLog = new AuditLogRepository(prisma);
  const sessions = new SessionRepository(prisma, auditLog, config);
  const keys = new KeyProviderService();
  const rateLimit = new InMemoryRateLimitStore();
  // The cache seam. Swap the store for a Redis-backed one by passing `permissionCacheStore` in
  // `config` — nothing in this library's source changes. Keys are namespaced easyauth:authz:*.
  const permissionCache = new PermissionCache(config.permissionCacheStore ?? new InMemoryPermissionCacheStore(), config);
  const rbac = new RbacRepository(prisma, permissionCache);
  const workspaces = new WorkspaceRepository(prisma, rbac);
  const twoFactor = new TwoFactorRepository(prisma);
  const oauth = new OAuthRepository(prisma);
  const passwordReset = new PasswordResetRepository(prisma);
  const authService = new AuthService(prisma, sessions, keys, rateLimit, auditLog, rbac, twoFactor, oauth, passwordReset, config);

  const authentication = createAuthMiddleware({ keys, sessions });
  // Roles belong to a workspace membership, resolved from the database on the request that names
  // the workspace. `authorization` tolerates a request that names none (GET /auth/me answers with
  // empty roles); `workspaceScope` does not. See authz.middleware.ts.
  const authorization = createAuthzMiddleware({ rbac, cache: permissionCache });
  const workspaceScope = createWorkspaceMiddleware({ rbac, cache: permissionCache });

  const app = options.app ?? express();
  app.use(express.json());
  // Swagger UI at /docs, raw OpenAPI JSON at /docs-json — parity with the nestjs-* combos'
  // SwaggerModule.setup("docs", ...), hand-authored instead of decorator-derived (see
  // openapi-spec.ts for why). `redirect: false` keeps the bare "/docs" path (no trailing
  // slash) a plain 200 instead of swagger-ui-express's default 301 to "/docs/" — the
  // underlying static asset middleware would otherwise treat the mount root as a directory
  // listing and redirect.
  app.use("/docs", swaggerUi.serveWithOptions({ redirect: false }), swaggerUi.setup(openApiSpec));
  app.get("/docs-json", (_req, res) => res.json(openApiSpec));
  // Mounted before /auth so `/auth/admin/*` reaches the admin router rather than falling
  // through to the identity router's 404.
  app.use("/auth/admin", createAdminRouter({ auth: authService, workspaces, authentication, workspaceScope }));
  app.use("/auth", createAuthRouter({ auth: authService, config, authentication, authorization }));
  app.use("/workspaces", createWorkspaceRouter({ workspaces, rbac, authentication, authorization, workspaceScope }));
  // Mounted last so it catches errors forwarded via `next(err)` from every route above.
  app.use(authCoreErrorMiddleware);

  return app;
}
