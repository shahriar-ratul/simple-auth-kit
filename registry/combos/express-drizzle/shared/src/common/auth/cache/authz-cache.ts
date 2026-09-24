// Caches each caller's resolved authorization context.
//
// Two ways an entry stops being served:
//   1. Version: every write path in this app that changes what `resolveAuthzContext` returns bumps
//      the `authz_version` row (see authz-version.ts). Each request reads that one row and reuses
//      an entry only if it was resolved at the same version — so a change made through this app,
//      on any instance, applies on the very next request. The common case (nothing changed) costs
//      one primary-key read instead of the multi-join resolution.
//   2. TTL: every entry also expires after `authzCacheTtlSeconds`. That is the backstop for writes
//      made behind the app's back (a raw SQL session), which don't bump the version.

export interface AuthzCacheDeps {
  /** The current `authz_version`. */
  readVersion(): Promise<number>;
  /** Maximum age of an entry, in seconds. */
  ttlSeconds: number;
}

export interface AuthzCache<T> {
  get(key: string, resolve: () => Promise<T | null>): Promise<T | null>;
  /** Counters for the proof harness: how often the cache resolved vs. served a hit. */
  readonly stats: { resolutions: number; hits: number };
}

/** A generous bound for one process; past it the map is simply cleared and refilled. */
const MAX_ENTRIES = 10_000;

export function createAuthzCache<T>(deps: AuthzCacheDeps): AuthzCache<T> {
  const entries = new Map<
    string,
    { version: number; expiresAt: number; value: T }
  >();
  const stats = { resolutions: 0, hits: 0 };
  let lastVersion: number | undefined;

  return {
    stats,
    async get(key, resolve) {
      // Read before resolving: if a write lands in between, the entry is stored under the older
      // version and the next request, seeing the newer one, re-resolves.
      const version = await deps.readVersion();
      if (version !== lastVersion) {
        // Every entry is stale once the version moves; drop them rather than let them linger.
        entries.clear();
        lastVersion = version;
      }
      const now = Date.now();
      const cached = entries.get(key);
      if (cached && cached.version === version && cached.expiresAt > now) {
        stats.hits += 1;
        return cached.value;
      }

      stats.resolutions += 1;
      const value = await resolve();
      // Negative results aren't cached: "not a member" is re-read every time.
      if (value === null) {
        entries.delete(key);
      } else {
        if (entries.size >= MAX_ENTRIES) entries.clear();
        entries.set(key, {
          version,
          expiresAt: now + deps.ttlSeconds * 1000,
          value,
        });
      }
      return value;
    },
  };
}
