import { Global, Module } from "@nestjs/common";
import { DRIZZLE_DB } from "@/common/config/db";
import { DrizzleService } from "@/modules/drizzle/drizzle.service";

// @Global() so DRIZZLE_DB is available everywhere without every feature module importing this
// one directly — same reasoning as CoreAuthModule itself. Repositories keep injecting the
// DRIZZLE_DB token (not DrizzleService) so none of them need to change; this module is just what
// now produces that token, replacing the old bare `new Pool()` construction that used to live
// inline in core-auth.module.ts.
@Global()
@Module({
  providers: [
    DrizzleService,
    {
      provide: DRIZZLE_DB,
      useFactory: (drizzleService: DrizzleService) => drizzleService.db,
      inject: [DrizzleService],
    },
  ],
  exports: [DRIZZLE_DB],
})
export class DrizzleModule {}
