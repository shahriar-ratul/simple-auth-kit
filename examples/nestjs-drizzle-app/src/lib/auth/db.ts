// Drizzle has no client *class* the way Prisma has `PrismaClient`, so there's nothing to hand
// NestJS's DI as an implicit constructor type the way the reference combo does. We mint an
// explicit injection token instead (same idea as `AUTH_CONFIG` in auth.config.ts) and every
// constructor in this combo uses `@Inject(DRIZZLE_DB)` — matching the reference's explicit-token
// style, which is required (not just stylistic) for DI to keep working under esbuild-based
// tooling like tsx that skips `emitDecoratorMetadata`'s runtime type reflection.
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema.js";

export const DRIZZLE_DB = Symbol("DRIZZLE_DB");

export type Database = NodePgDatabase<typeof schema>;
