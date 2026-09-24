import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuditLogModule } from './modules/audit-log/audit-log.module.js';
import { AuthCoreErrorFilter } from './infra/filters/auth-core-error.filter.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CoreAuthModule } from './common/auth/core-auth.module.js';
import { PermissionModule } from './modules/permissions/permissions.module.js';
import { RequestLoggerInterceptor } from './infra/interceptor/request-logger.interceptor.js';
import { ResponseInterceptor } from './infra/interceptor/response.interceptor.js';
import { RoleModule } from './modules/roles/roles.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { authStoresFromEnv } from './redis-stores.js';

// This is now the whole integration surface a consumer assembles by hand — it used to ship
// bundled inside AuthModule.forRoot(). ConfigModule/ThrottlerModule and the global
// filter/interceptor/guard are ordinary application concerns; CoreAuthModule.forRoot() is the
// one remaining piece that still needs a config object (AUTH_CONFIG, cache/rate-limit store
// overrides, OAuth credentials).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CoreAuthModule.forRoot({ ...authStoresFromEnv() }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1_000, limit: 100 },
      { name: 'medium', ttl: 10_000, limit: 200 },
      { name: 'long', ttl: 60_000, limit: 400 },
    ]),
    AuthModule,
    AdminModule,
    RoleModule,
    PermissionModule,
    AuditLogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AuthCoreErrorFilter },
    // RequestLoggerInterceptor first: Nest's first-registered interceptor is outermost, so its
    // response-logging tap observes the value *after* ResponseInterceptor has enveloped it — the
    // same body the client receives.
    { provide: APP_INTERCEPTOR, useClass: RequestLoggerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
