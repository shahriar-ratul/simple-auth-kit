// Resolved authorization, cached — configured by `AuthConfig.authzCache` (see auth.config.ts).
//
// Every app write that changes authorization bumps the shared `authz_version` counter (see
// authz-version.ts). With `revalidate` on, each authorized request reads that one row — a
// primary-key lookup — and only trusts an entry stored under the same version, so a change made
// through the app applies on the very next request, on every server. With it off, an entry is
// trusted until it expires: no database read at all on a hit, and changes apply within the TTL.
// A direct database edit bumps nothing, so in both modes `ttlSeconds` bounds how long one can go
// unseen.
//
// Permission changes are rare next to permission checks, so any write simply makes every entry
// stale — there are no per-user keys to keep in step.
import type { AuthzCacheConfig } from '@/common/config/auth.config';

/**
 * Where cache entries live. String-valued so each operation maps onto one Redis command (GET,
 * SET EX) — pass a Redis-backed implementation as `authzCache.store` to share entries across
 * servers. Nothing here depends on Redis.
 */
export interface AuthzCacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** Past this many entries the oldest insertion is evicted — a bound, not an LRU. */
const MAX_ENTRIES = 10_000;

/** The default store: a `Map` with expiry, scoped to one process. */
export class InMemoryAuthzCacheStore implements AuthzCacheStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

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
    // Re-inserting moves the key to the end, so insertion order stays "oldest first".
    this.entries.delete(key);
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

/** Where the current version comes from — `RbacRepository.readAuthzVersion`. */
export interface AuthzVersionSource {
  readAuthzVersion(): Promise<bigint>;
}

const KEY_PREFIX = 'simpleauthkit:authz:';

export class AuthzCache {
  /** Read by prove-cycle: N identical requests must cause one resolution, not N. */
  readonly stats = { resolutions: 0, hits: 0 };
  private readonly store: AuthzCacheStore;

  constructor(
    private readonly source: AuthzVersionSource,
    private readonly config: AuthzCacheConfig,
  ) {
    this.store = config.store ?? new InMemoryAuthzCacheStore();
  }

  /**
   * Returns the cached answer for `key` when the configuration allows it, otherwise calls
   * `resolve` and caches a non-null result ("not a member" is never cached). With `revalidate`
   * on, the version is read *before* resolving, so a write racing the resolution can only leave
   * an entry that is already stale, never one that hides the write.
   */
  async get<T>(key: string, resolve: () => Promise<T | null>): Promise<T | null> {
    if (!this.config.enabled) {
      this.stats.resolutions += 1;
      return resolve();
    }

    const storeKey = KEY_PREFIX + key;
    const version = this.config.revalidate ? (await this.source.readAuthzVersion()).toString() : null;
    const raw = await this.store.get(storeKey);
    if (raw !== undefined) {
      const entry = JSON.parse(raw) as { version: string | null; value: T };
      if (version === null || entry.version === version) {
        this.stats.hits += 1;
        return entry.value;
      }
    }

    this.stats.resolutions += 1;
    const value = await resolve();
    if (value !== null) await this.store.set(storeKey, JSON.stringify({ version, value }), this.config.ttlSeconds);
    return value;
  }
}
