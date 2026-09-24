import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { AdminModule } from "../src/modules/admin/admin.module.js";
import { AuditLogModule } from "../src/modules/audit-log/audit-log.module.js";
import { AuthzCache } from "../src/common/auth/cache/authz-cache.js";
import { AuthCoreErrorFilter } from "../src/infra/filters/auth-core-error.filter.js";
import { AuthModule } from "../src/modules/auth/auth.module.js";
import { CoreAuthModule } from "../src/common/auth/core-auth.module.js";
import { PermissionModule } from "../src/modules/permissions/permissions.module.js";
import { RequestLoggerInterceptor } from "../src/infra/interceptor/request-logger.interceptor.js";
import { ResponseInterceptor } from "../src/infra/interceptor/response.interceptor.js";
import { setupMetrics } from "../src/infra/metrics/metrics.js";
import { RoleModule } from "../src/modules/roles/roles.module.js";

// No mailer is wired up for the proof, so this stands in for one — prove-cycle.ts reads the
// raw token back out of here the same way a test inbox would, to exercise the reset flow.
export const capturedResetTokens = new Map<string, string>();

/** The running app's authorization cache, set by `bootstrap()` so the proof can read its stats. */
export let authzCache: AuthzCache | undefined;

/** Waits out the proof's 1-second authz cache TTL, so a direct database edit is visible. */
export const waitOutAuthzCache = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 1200));

/**
 * The app module is built *inside* `bootstrap()`, not at import time.
 *
 * `CoreAuthModule.forRoot` is where the startup route-tier check runs, and the proof needs to
 * call bootstrap twice: once with a deliberately untiered route present, expecting the boot to
 * fail, and once without. A module built at import time would have run the check before the
 * proof could arrange either case.
 *
 * This mirrors exactly what a consumer's own app.module.ts now assembles by hand (see
 * examples/nestjs-drizzle-app/src/app.module.ts): CoreAuthModule.forRoot() for the shared
 * plumbing/config, each feature module explicitly, and the global filter/interceptor that used
 * to ship inside AuthModule.forRoot(). This combo has no @nestjs/throttler wiring (unlike the
 * nestjs-prisma reference), so there is no ThrottlerModule/APP_GUARD here.
 */
export async function bootstrap(port: number) {
  @Module({
    imports: [
      CoreAuthModule.forRoot({
        // Was 2 seconds, "so the proof can exercise expiry-adjacent paths quickly" — except no
        // assertion in the proof waits for an access token to expire, so it bought nothing and
        // cost a real 1-in-10 flake: the admin's token could die mid-section and surface as a
        // confusing failure two assertions later. Long enough that expiry is never a variable,
        // short enough to stay realistic. See `renewingToken` in test/harness.ts for the other
        // half of the fix.
        accessTokenTtlSeconds: 300,
        // Short, so the proof can show a direct-database edit applying once cached contexts expire.
        authzCacheTtlSeconds: 1,
        sendPasswordResetEmail: async (email: string, token: string) => {
          capturedResetTokens.set(email, token);
        },
      }),
      AuthModule,
      AdminModule,
      RoleModule,
      PermissionModule,
      AuditLogModule,
    ],
    providers: [
      { provide: APP_FILTER, useClass: AuthCoreErrorFilter },
      // RequestLoggerInterceptor first: Nest's first-registered interceptor is outermost, so its
      // response-logging tap observes the value *after* ResponseInterceptor has enveloped it —
      // the same body the client receives.
      { provide: APP_INTERCEPTOR, useClass: RequestLoggerInterceptor },
      { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    ],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, { logger: false });
  authzCache = app.get(AuthzCache);
  // Every feature controller declares its own path as "v1/..." — "api" is set here, exactly as
  // a consumer's own main.ts does (see examples/nestjs-drizzle-app/src/main.ts), so the proof
  // hits the same URLs a real deployment would.
  app.setGlobalPrefix("api");
  // Exactly what a consumer's main.ts does (see examples/nestjs-prisma-app/src/main.ts), so the
  // proof scrapes the same `/metrics` a real deployment serves. setGlobalPrefix does not touch
  // raw middleware, so the endpoint stays at the root either way.
  setupMetrics(app);
  await app.listen(port);
  return app;
}
