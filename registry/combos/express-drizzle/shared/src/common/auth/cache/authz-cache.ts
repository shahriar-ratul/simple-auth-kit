// Caches each caller's resolved authorization context. Configured by `AuthConfig.authzCache`
// (see auth.config.ts for what each option does):
//
//   - enabled: false  → no caching; every request resolves from the database.
//   - revalidate: true → each request reads the `authz_version` row (one primary-key read) and
//     reuses an entry only if it was resolved at the same version. Every app write path that
//     changes a caller's authorization bumps that row (authz-version.ts), so such a change applies
//     on the very next request, on every server.
//   - revalidate: false → no version read; any unexpired entry is served. Zero database reads on a
//     hit, and changes apply within `ttlSeconds`.
//
// `ttlSeconds` always bounds an entry's life — the backstop for writes made behind the app's back
// (a raw SQL session), which don't bump the version. Entries live in an `AuthzCacheStore`:
// in-process memory by default, or anything with get/set — e.g. Redis — to share them across
// servers. This library never depends on a Redis client; you pass the store.

/** Where cached entries live. Values are opaque strings; `ttlSeconds` is the entry's lifetime. */
export interface AuthzCacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** A generous bound for one process; past it the oldest-inserted entry is evicted. */
const MAX_ENTRIES = 10_000;

/** The default store: a `Map` with expiry, scoped to one process. */
export class InMemoryAuthzCacheStore implements AuthzCacheStore {
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  async get(key: string): Promise<string | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    // Re-inserting moves the key to the end of the Map's insertion order.
    this.entries.delete(key);
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

export interface AuthzCacheOptions {
  enabled: boolean;
  revalidate: boolean;
  ttlSeconds: number;
  store: AuthzCacheStore;
  /** The current `authz_version`. Only called when `revalidate` is on. */
  readVersion(): Promise<number>;
}

export interface AuthzCache<T> {
  get(key: string, resolve: () => Promise<T | null>): Promise<T | null>;
  /** Counters for the proof harness: how often the cache resolved vs. served a hit. */
  readonly stats: { resolutions: number; hits: number };
}

export const AUTHZ_CACHE_NAMESPACE = "simpleauthkit:authz";

export function createAuthzCache<T>(options: AuthzCacheOptions): AuthzCache<T> {
  const stats = { resolutions: 0, hits: 0 };

  return {
    stats,
    async get(key, resolve) {
      if (!options.enabled) {
        stats.resolutions += 1;
        return resolve();
      }

      const storeKey = `${AUTHZ_CACHE_NAMESPACE}:${key}`;
      // Read before resolving: if a write lands in between, the entry is stored under the older
      // version and the next request, seeing the newer one, re-resolves.
      const version = options.revalidate ? await options.readVersion() : 0;
      const raw = await options.store.get(storeKey);
      if (raw !== undefined) {
        const entry = JSON.parse(raw) as { version: number; value: T };
        if (!options.revalidate || entry.version === version) {
          stats.hits += 1;
          return entry.value;
        }
      }

      stats.resolutions += 1;
      const value = await resolve();
      // Negative results aren't cached: "not a member" is re-read every time.
      if (value !== null)
        await options.store.set(
          storeKey,
          JSON.stringify({ version, value }),
          options.ttlSeconds,
        );
      return value;
    },
  };
}
