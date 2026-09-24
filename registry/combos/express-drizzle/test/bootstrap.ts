import "dotenv/config";
import type { Server } from "node:http";
import type {
  AuthzCache,
  CachedAuthz,
} from "../src/common/auth/cache/authz-cache.js";
import { createAuthApp } from "../src/modules/auth/create-auth-app.js";
import { MapAuthzCacheStore } from "./map-authz-cache-store.js";

// No mailer is wired up for the proof, so this stands in for one — prove-cycle.ts reads the
// raw token back out of here the same way a test inbox would, to exercise the reset flow.
export const capturedResetTokens = new Map<string, string>();

/** The running app's authz cache, for the proof's hit/resolution counters. Set by `bootstrap`. */
export let authzCache: AuthzCache<CachedAuthz> | undefined;

/** The proof's cache store — the library ships none; no store means no cache. */
export const authzCacheStore = new MapAuthzCacheStore();

export async function bootstrap(
  port: number,
): Promise<{ close: () => Promise<void> }> {
  const app = createAuthApp({
    // Was 2 seconds, "so the proof can exercise expiry-adjacent paths quickly" — except no
    // assertion in the proof waits for an access token to expire, so it bought nothing and
    // cost a real 1-in-10 flake: the admin's token could die mid-section and surface as a
    // confusing failure two assertions later. Long enough that expiry is never a variable,
    // short enough to stay realistic. See `renewingToken` in test/harness.ts for the other
    // half of the fix.
    accessTokenTtlSeconds: 300,
    // Short, so the proof can show a direct-database edit applying once cached contexts expire.
    authzCache: { ttlSeconds: 1, store: authzCacheStore },
    sendPasswordResetEmail: async (email, token) => {
      capturedResetTokens.set(email, token);
    },
  });
  authzCache = app.locals["authzCache"] as AuthzCache<CachedAuthz>;
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
