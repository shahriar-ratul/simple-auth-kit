import { DynamicModule, Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AbilityGuard } from "@/common/auth/ability/ability.guard";
import { AdminController } from "@/modules/admin/controllers/admin.controller";
import { AuditLogController } from "@/modules/audit-log/controllers/audit-log.controller";
import {
  AUTH_CONFIG,
  AuthConfig,
  defaultAuthConfig,
} from "@/common/config/auth.config";
import { AuthController } from "@/modules/auth/controllers/auth.controller";
import { AuthGuard } from "@/common/auth/guards/auth.guard";
import { AuthzGuard, WorkspaceGuard } from "@/common/auth/guards/authz.guard";
import { DrizzleModule } from "@/modules/drizzle/drizzle.module";
import { loadJwtSecret } from "@/common/config/key-provider";
import { AuthTokenService } from "@/common/auth/token.service";
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
} from "@/common/auth/cache/rate-limit.store";
import { PermissionController } from "@/modules/permissions/controllers/permission.controller";
import { RbacRepository } from "@/common/repositories/rbac.repository";
import { RoleController } from "@/modules/roles/controllers/role.controller";
import { WorkspaceController } from "@/modules/auth/controllers/workspace.controller";
import { WorkspaceRepository } from "@/common/repositories/workspace.repository";
import { AuditLogModule } from "@/modules/audit-log/audit-log.module";
import { SessionRepository } from "@/common/repositories/session.repository";
import { assertEveryRouteDeclaresATier } from "@/infra/route-tiers";
import { log } from "@/infra/logger/logger";

// Every controller this combo ships, across every feature module — the one array the boot-time
// tier check walks. Built here (rather than each feature module registering itself) so there's
// no circular import between this module and the feature modules it provides shared plumbing to.
const TIERED_CONTROLLERS = [
  AuthController,
  WorkspaceController,
  AdminController,
  RoleController,
  PermissionController,
  AuditLogController,
];

// The one remaining `forRoot()`: AUTH_CONFIG, the rate-limit store override, and OAuth
// credentials genuinely need consumer-supplied config. Everything else a consumer's own app used
// to get for free from AuthModule.forRoot() — the global exception filter, the response-envelope
// interceptor — is now assembled by hand in the consumer's own app.module.ts instead (see
// examples/nestjs-drizzle-app-workspaces/src/app.module.ts).
//
// @Global() so every feature module (AuthModule, AdminModule, RoleModule, PermissionModule,
// AuditLogModule) can inject what's in `exports` below without importing this module again.
// WorkspaceRepository is promoted here too, alongside RbacRepository — it's used both by
// WorkspaceController (in AuthModule) and by AdminController (in AdminModule), so it needs the
// same ambient availability RbacRepository already gets. SessionRepository is promoted for a
// different reason: AuthGuard depends on it directly (for the token-denylist check), and
// AuthGuard has to live here since every feature module needs it, so its own dependency needs
// the same ambient availability. Importing AuditLogModule is what makes that resolvable
// (SessionRepository writes through it).
@Global()
@Module({})
export class CoreAuthModule {
  static forRoot(config: Partial<AuthConfig> = {}): DynamicModule {
    // Fail-closed before anything else exists — nothing above this line allocates a database
    // connection or a port, so a failed boot leaves nothing behind.
    assertEveryRouteDeclaresATier(TIERED_CONTROLLERS, {
      authentication: AuthGuard,
      ability: AbilityGuard,
    });

    const resolved: AuthConfig = { ...defaultAuthConfig, ...config };

    if (!config.rateLimitStore) {
      log.warn(
        "auth",
        "[simple-auth-kit] rateLimitStore not overridden — using the in-memory default. " +
          "Fine for a single instance; wrong rate-limit counts across replicas once you run more " +
          "than one. Override rateLimitStore with a shared store (e.g. Redis) in " +
          "CoreAuthModule.forRoot() before scaling out.",
      );
    }

    return {
      module: CoreAuthModule,
      global: true,
      imports: [
        AuditLogModule,
        DrizzleModule,
        JwtModule.registerAsync({
          useFactory: () => ({
            secret: loadJwtSecret(),
            signOptions: { algorithm: "HS256" },
            verifyOptions: { algorithms: ["HS256"] },
          }),
        }),
      ],
      providers: [
        { provide: AUTH_CONFIG, useValue: resolved },
        AuthTokenService,
        {
          provide: RATE_LIMIT_STORE,
          useValue: config.rateLimitStore ?? new InMemoryRateLimitStore(),
        },
        RbacRepository,
        WorkspaceRepository,
        SessionRepository,
        AuthGuard,
        AuthzGuard,
        WorkspaceGuard,
        AbilityGuard,
      ],
      exports: [
        AUTH_CONFIG,
        AuthTokenService,
        RATE_LIMIT_STORE,
        RbacRepository,
        WorkspaceRepository,
        SessionRepository,
        AuthGuard,
        AuthzGuard,
        WorkspaceGuard,
        AbilityGuard,
      ],
    };
  }
}
