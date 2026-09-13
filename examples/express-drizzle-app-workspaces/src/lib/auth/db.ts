// Drizzle has no client *class* the way Prisma has `PrismaClient` — a `NodePgDatabase` is just a
// value returned by `drizzle(pool, { schema })`. This file exists only to give every repository a
// single place to import the resulting type from, rather than each one re-deriving
// `NodePgDatabase<typeof schema>` and risking two slightly different shapes.
//
// Unlike the nestjs-drizzle combo's equivalent file, there is no injection token here: plain
// Express has no DI container, so `createAuthApp` (see create-auth-app.ts) just builds the
// database and passes it to each class's constructor directly.
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;
