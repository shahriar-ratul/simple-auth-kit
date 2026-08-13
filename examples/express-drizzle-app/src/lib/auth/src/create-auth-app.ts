import express, { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createAdminRouter } from "./admin.router.js";
import { AuditLogRepository } from "./audit-log.repository.js";
import { authCoreErrorMiddleware } from "./auth-core-error.middleware.js";
import { AuthConfig, defaultAuthConfig } from "./auth.config.js";
import { createAuthMiddleware } from "./auth.middleware.js";
import { createAuthRouter } from "./auth.router.js";
import { AuthService } from "./auth.service.js";
import { createAuthzMiddleware } from "./authz.middleware.js";
import { KeyProviderService } from "./key-provider.js";
import { OAuthRepository } from "./oauth.repository.js";
import { openApiSpec } from "./openapi-spec.js";
import { PasswordResetRepository } from "./password-reset.repository.js";
import { InMemoryPermissionCacheStore, PermissionCache } from "./permission-cache.js";
import { InMemoryRateLimitStore } from "./rate-limit.store.js";
import { RbacRepository } from "./rbac.repository.js";
import { responseEnvelope } from "./response-envelope.middleware.js";
import * as schema from "./schema.js";
import { SessionRepository } from "./session.repository.js";
import { TwoFactorRepository } from "./two-factor.repository.js";

/**
 * Factory wiring a Drizzle `NodePgDatabase` (from a `pg.Pool`) plus all the plain classes,
 * then mounting `express.json()` + the auth and admin routers. Equivalent of the reference
 * combo's `AuthModule.forRoot(...)`, just a function instead of a NestJS dynamic module —
 * there's no DI container here, so wiring is explicit constructor calls in one place.
 */
export function createAuthApp(config: Partial<AuthConfig> = {}): Express {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const db = drizzle(pool, { schema });

  const resolvedConfig: AuthConfig = { ...defaultAuthConfig, ...config };
  const auditLog = new AuditLogRepository(db);
  const sessions = new SessionRepository(db, auditLog, resolvedConfig);
  const keys = new KeyProviderService();
  const rateLimit = new InMemoryRateLimitStore();
  // The cache seam. Swap the store for a Redis-backed one by passing `permissionCacheStore` in
  // `config` — nothing in this library's source changes. Keys are namespaced easyauth:authz:*.
  const permissionCache = new PermissionCache(resolvedConfig.permissionCacheStore ?? new InMemoryPermissionCacheStore(), resolvedConfig);
  const rbac = new RbacRepository(db, permissionCache);
  const twoFactor = new TwoFactorRepository(db);
  const oauth = new OAuthRepository(db);
  const passwordReset = new PasswordResetRepository(db);
  const authService = new AuthService(db, sessions, keys, rateLimit, auditLog, rbac, twoFactor, oauth, passwordReset, resolvedConfig);

  const requireAuth = createAuthMiddleware(keys, sessions);
  // Roles are global here, but they are read from the database on the request that uses them —
  // the token carries none. See authz.middleware.ts.
  const requireAuthz = createAuthzMiddleware({ rbac, cache: permissionCache });

  const app = express();
  app.use(express.json());
  app.use(responseEnvelope());
  app.use("/auth/admin", createAdminRouter({ auth: authService, authentication: requireAuth, authorization: requireAuthz }));
  app.use("/auth", createAuthRouter({ auth: authService, config: resolvedConfig, authentication: requireAuth, authorization: requireAuthz }));
  // Hand-authored OpenAPI spec (see openapi-spec.ts) — this combo has no NestJS decorators to
  // generate one from, so it's served as static JSON, same as the nestjs-* combos' /docs-json.
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get("/docs-json", (req, res) => res.json(openApiSpec));
  app.use(authCoreErrorMiddleware);

  return app;
}
