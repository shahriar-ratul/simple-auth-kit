// Resolved authorization, cached per user (base) or per membership (workspaces).
//
// Resolving roles + permissions is a multi-join read; checking whether anything changed is a
// single-row read of `authz_version` (see `authz-version.ts`). Behaviour is set by
// `AuthConfig.authzCache`:
//   • `enabled: false` — no caching; every request resolves from the database.
//   • `revalidate: true` (default) — each request reads the version first and uses an entry only
//     if it was cached under that same version. Every authorization write this app makes bumps
//     the version, so app-side changes are seen on the very next request, on every server.
//   • `revalidate: false` — no version read; an entry is trusted until `ttlSeconds`.
//   • `ttlSeconds` — entries expire regardless, which bounds changes written straight to the
//     database (they don't bump the version).
//   • `store` — where entries live. In-process memory by default; any `AuthzCacheStore` (e.g. a
//     Redis-backed one) to share entries between servers.
//
// The version is read *before* resolving. A write that lands in between stores fresher data
// under an older version, which the next request sees as a mismatch and re-resolves, so a stale
// result is never stored under a current version.
import type { AuthzCacheConfig } from "@/common/config/auth.config";

/** Entries are opaque strings, so any key-value store with expiry can back the cache. */
export interface AuthzCacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** Past this many entries the oldest insertion is evicted. */
const MAX_ENTRIES = 10_000;

/** The default store: a per-process `Map` with expiry. */
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
    // Re-inserting moves the key to the end, so the first key is always the oldest insertion.
    this.entries.delete(key);
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

const KEY_PREFIX = "simpleauthkit:authz:";

export class AuthzCache {
  /** Read by prove-cycle: N identical requests must cost exactly one resolution. */
  readonly stats = { resolutions: 0, hits: 0 };
  private readonly store: AuthzCacheStore;

  constructor(
    private readonly config: AuthzCacheConfig,
    /** Reads the current `authz_version`; only called when `revalidate` is on. */
    private readonly readVersion: () => Promise<number>,
  ) {
    this.store = config.store ?? new InMemoryAuthzCacheStore();
  }

  async get<T>(
    key: string,
    resolve: () => Promise<T | null>,
  ): Promise<T | null> {
    if (!this.config.enabled) {
      this.stats.resolutions += 1;
      return resolve();
    }

    const version = this.config.revalidate ? await this.readVersion() : null;
    const raw = await this.store.get(KEY_PREFIX + key);
    if (raw !== undefined) {
      const entry = JSON.parse(raw) as { version: number | null; value: T };
      if (!this.config.revalidate || entry.version === version) {
        this.stats.hits += 1;
        return entry.value;
      }
    }

    this.stats.resolutions += 1;
    const value = await resolve();
    // Negative results ("not a member of this workspace") are never cached.
    if (value !== null) {
      await this.store.set(
        KEY_PREFIX + key,
        JSON.stringify({ version, value }),
        this.config.ttlSeconds,
      );
    }
    return value;
  }
}
