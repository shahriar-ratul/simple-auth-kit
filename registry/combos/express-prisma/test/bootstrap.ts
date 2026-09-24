import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/database/generated/prisma/client.js";
import { AuthzCache } from "../src/common/auth/cache/authz-cache.js";
import { defaultAuthConfig } from "../src/common/config/auth.config.js";
import { RbacRepository } from "../src/common/repositories/rbac.repository.js";
import { createAuthApp } from "../src/modules/auth/create-auth-app.js";

/**
 * The app's authorization cache, handed in from here so the proof can read its `stats` and show
 * that N identical authorized requests cause one database resolution rather than N. Its TTL is
 * `AUTHZ_CACHE_TTL_SECONDS`, kept short so the proof can wait out a direct database edit.
 */
export const AUTHZ_CACHE_TTL_SECONDS = 1;

/** Waits just past the authorization cache TTL, so a direct database edit is guaranteed visible. */
export function waitOutAuthzCache(): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, AUTHZ_CACHE_TTL_SECONDS * 1000 + 200),
  );
}
export const authzCache = new AuthzCache(
  new RbacRepository(
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
    }),
  ),
  { ...defaultAuthConfig.authzCache, ttlSeconds: AUTHZ_CACHE_TTL_SECONDS },
);

// No mailer is wired up for the proof, so this stands in for one — prove-cycle.ts reads the
// raw token back out of here the same way a test inbox would, to exercise the reset flow.
export const capturedResetTokens = new Map<string, string>();

/**
 * Returns the same `{ close() }` shape the reference combo's Nest application has, so
 * prove-cycle.ts is byte-identical across both combos — an `http.Server` closes via a
 * callback, not a promise.
 *
 * The app is built *inside* `bootstrap()`, not at import time: the proof calls it twice, once
 * with a deliberately untiered route present expecting the boot to fail, and once without.
 */
export async function bootstrap(
  port: number,
): Promise<{ close(): Promise<void> }> {
  const app = createAuthApp({
    authzCacheInstance: authzCache,
    config: {
      // Was 2 seconds, "so the proof can exercise expiry-adjacent paths quickly" — except no
      // assertion in the proof waits for an access token to expire, so it bought nothing and
      // cost a real 1-in-10 flake: the admin's token could die mid-section and surface as a
      // confusing failure two assertions later. Long enough that expiry is never a variable,
      // short enough to stay realistic. See `renewingToken` in test/harness.ts for the other
      // half of the fix.
      accessTokenTtlSeconds: 300,
      authzCache: { ttlSeconds: AUTHZ_CACHE_TTL_SECONDS },
      sendPasswordResetEmail: async (email, token) => {
        capturedResetTokens.set(email, token);
      },
    },
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(port, () => resolve(listening));
  });
  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
