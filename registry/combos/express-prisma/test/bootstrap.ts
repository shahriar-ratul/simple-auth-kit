import "dotenv/config";
import { createAuthApp } from "../src/create-auth-app.js";
import { InMemoryPermissionCacheStore } from "../src/cache/permission-cache.js";

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
    config: {
      // Was 2 seconds, "so the proof can exercise expiry-adjacent paths quickly" — except no
      // assertion in the proof waits for an access token to expire, so it bought nothing and
      // cost a real 1-in-10 flake: the admin's token could die mid-section and surface as a
      // confusing failure two assertions later. Long enough that expiry is never a variable,
      // short enough to stay realistic. See `renewingToken` in test/harness.ts for the other
      // half of the fix.
      accessTokenTtlSeconds: 300,
      permissionCacheStore,
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
