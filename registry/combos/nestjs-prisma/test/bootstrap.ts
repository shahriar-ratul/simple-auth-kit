import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AdminModule } from "../src/modules/admin/admin.module.js";
import { AuditLogModule } from "../src/modules/audit-log/audit-log.module.js";
import { AuthCoreErrorFilter } from "../src/infra/filters/auth-core-error.filter.js";
import { AuthModule } from "../src/modules/auth/auth.module.js";
import { CoreAuthModule } from "../src/common/auth/core-auth.module.js";
import { InMemoryPermissionCacheStore } from "../src/common/auth/cache/permission-cache.js";
import { PermissionModule } from "../src/modules/permissions/permissions.module.js";
import { ResponseInterceptor } from "../src/infra/interceptor/response.interceptor.js";
import { RoleModule } from "../src/modules/roles/roles.module.js";

// No mailer is wired up for the proof, so this stands in for one — prove-cycle.ts reads the
// raw token back out of here the same way a test inbox would, to exercise the reset flow.
export const capturedResetTokens = new Map<string, string>();

/**
 * The very store the app resolves permissions through. Exposed so `prove-cycle.ts` can assert
 * that N identical authorized requests cause one database resolution rather than N — a cache
 * nobody can prove is working is a bug surface, not an optimisation.
 */
export const permissionCacheStore = new InMemoryPermissionCacheStore();

/**
 * The app module is built *inside* `bootstrap()`, not at import time.
 *
 * `CoreAuthModule.forRoot` is where the startup route-tier check runs, and the proof needs to
 * call bootstrap twice: once with a deliberately untiered route present, expecting the boot to
 * fail, and once without. A module built at import time would have run the check before the
 * proof could arrange either case.
 *
 * This mirrors exactly what a consumer's own app.module.ts now assembles by hand (see
 * examples/nestjs-prisma-app/src/app.module.ts): CoreAuthModule.forRoot() for the shared
 * plumbing/config, each feature module explicitly, and the global filter/interceptor/throttler
 * that used to ship inside AuthModule.forRoot().
 */
export async function bootstrap(port: number) {
  const throttle = [{ name: "proof", ttl: 1_000, limit: 100_000 }];

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
        throttle,
        permissionCacheStore,
        sendPasswordResetEmail: async (email, token) => {
          capturedResetTokens.set(email, token);
        },
      }),
      // The proof fires hundreds of requests in well under a minute — the production buckets
      // (100/1s, 200/10s, 400/60s) would 429 it partway through. One generous bucket keeps the
      // throttler guard on every request without ever tripping, so its wiring is exercised
      // rather than switched off.
      ThrottlerModule.forRoot(throttle),
      AuthModule,
      AdminModule,
      RoleModule,
      PermissionModule,
      AuditLogModule,
    ],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_FILTER, useClass: AuthCoreErrorFilter },
      { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    ],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, { logger: false });
  // Every feature controller declares its own path as "v1/..." — "api" is set here, exactly as
  // a consumer's own main.ts does (see examples/nestjs-prisma-app/src/main.ts), so the proof
  // hits the same URLs a real deployment would.
  app.setGlobalPrefix("api");
  await app.listen(port);
  return app;
}
