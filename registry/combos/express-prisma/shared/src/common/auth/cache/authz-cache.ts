// Resolved authorization, cached in memory.
//
// Two things make an entry stale. Every app write that changes authorization bumps the shared
// `authz_version` counter (see authz-version.ts), and each authorized request reads that one row
// — a primary-key lookup — and only trusts an entry stored under the same version, so a grant or
// revocation made through the app applies on the very next request, on every instance. A direct
// database edit bumps nothing, so every entry also expires after `ttlSeconds`: that bounds how
// long such an edit can go unseen.
//
// Permission changes are rare next to permission checks, so any write simply makes every entry
// stale — there are no per-user keys to keep in step.

/** Where the current version comes from — `RbacRepository.readAuthzVersion`. */
export interface AuthzVersionSource {
  readAuthzVersion(): Promise<bigint>;
}

/** Past this many entries the map is simply cleared — a bound, not an eviction policy. */
const MAX_ENTRIES = 10_000;

export class AuthzCache {
  /** Read by prove-cycle: N identical requests must cause one resolution, not N. */
  readonly stats = { resolutions: 0, hits: 0 };
  private readonly entries = new Map<
    string,
    { version: bigint; expiresAt: number; value: unknown }
  >();

  constructor(
    private readonly source: AuthzVersionSource,
    private readonly ttlSeconds: number,
  ) {}

  /**
   * Returns the cached answer for `key` if it was stored under the current version and has not
   * expired, otherwise calls `resolve` and caches a non-null result ("not a member" is never
   * cached). The version is read *before* resolving, so a write racing the resolution can only
   * leave an entry that is already stale, never one that hides the write.
   */
  async get<T>(
    key: string,
    resolve: () => Promise<T | null>,
  ): Promise<T | null> {
    const version = await this.source.readAuthzVersion();
    const entry = this.entries.get(key);
    if (entry && entry.version === version && entry.expiresAt > Date.now()) {
      this.stats.hits += 1;
      return entry.value as T;
    }

    this.stats.resolutions += 1;
    const value = await resolve();
    if (value !== null) {
      if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
      this.entries.set(key, {
        version,
        expiresAt: Date.now() + this.ttlSeconds * 1000,
        value,
      });
    }
    return value;
  }
}
