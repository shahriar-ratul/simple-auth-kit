// Caches each caller's resolved authorization context. Configured by `AuthConfig.authzCache`
// (see auth.config.ts for what each option does).
//
// The cache is active only when it is enabled AND a store is configured. There is no in-memory
// fallback: with no store, every request resolves from the database and nothing is read or
// written here. This library never depends on a Redis client — you pass the store.
//
//   - revalidate: true → each request reads the `authz_version` row (one primary-key read) and
//     reuses an entry only if it was resolved at the same version. Every app write path that
//     changes a caller's authorization bumps that row (authz-version.ts), so such a change applies
//     on the very next request, on every server.
//   - revalidate: false → no version read; any unexpired entry is served. Zero database reads on a
//     hit, and changes apply within `ttlSeconds`.
//
// `ttlSeconds` always bounds an entry's life — the backstop for writes made behind the app's back
// (a raw SQL session), which don't bump the version.
//
// Key layout: `simpleauthkit:authz:<userId>`, or `simpleauthkit:authz:<workspaceId>:<userId>` for a
// workspace-scoped context — workspace first, so one workspace's entries share a prefix.

/** Where cached entries live — e.g. Redis. Values are opaque strings. */
export interface AuthzCacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Optional — lets the admin endpoint list entries. */
  list?(
    prefix: string,
  ): Promise<Array<{ key: string; value: string; ttlSeconds: number | null }>>;
  /** Optional — deletes every entry under the prefix; returns how many. */
  clear?(prefix: string): Promise<number>;
}

export interface AuthzCacheOptions {
  enabled: boolean;
  revalidate: boolean;
  ttlSeconds: number;
  store?: AuthzCacheStore;
  /** The current `authz_version`. */
  readVersion(): Promise<number>;
  /** Moves `authz_version` on — invalidates every cached entry, on every server. */
  bumpVersion(): Promise<void>;
}

/** What is cached: a caller's role and permission slugs (plus whatever else the context holds). */
export interface CachedAuthz {
  roles: string[];
  permissions: string[];
}

export interface AuthzCacheEntry {
  key: string;
  userId: string;
  workspaceId?: string;
  version: string | null;
  stale: boolean;
  ttlSeconds: number | null;
  roles: string[];
  permissions: string[];
}

export interface AuthzCacheInspection {
  active: boolean;
  enabled: boolean;
  revalidate: boolean;
  ttlSeconds: number;
  hasStore: boolean;
  canList: boolean;
  version: string;
  stats: { resolutions: number; hits: number };
  entries: AuthzCacheEntry[] | null;
}

export interface AuthzCache<T extends CachedAuthz> {
  /** `key` is `<userId>` or `<workspaceId>:<userId>` — see `authzCacheKey`. */
  get(key: string, resolve: () => Promise<T | null>): Promise<T | null>;
  /** The configuration, the current version, and (when the store can list) the cached entries —
   * only `workspaceId`'s entries when one is given. */
  inspect(workspaceId?: string): Promise<AuthzCacheInspection>;
  /** Bumps the version first (invalidating every entry on every server), then deletes the stored
   * entries under the same prefix `inspect` reads. `removed` is null when the store can't clear. */
  clear(
    workspaceId?: string,
  ): Promise<{ version: string; removed: number | null }>;
  /** Counters since process start: how often the cache resolved vs. served a hit. */
  readonly stats: { resolutions: number; hits: number };
}

export const AUTHZ_CACHE_NAMESPACE = "simpleauthkit:authz";

/** The cache key for a caller: workspace first, so a workspace's entries share a prefix. */
export function authzCacheKey(userId: string, workspaceId?: string): string {
  return workspaceId === undefined ? userId : `${workspaceId}:${userId}`;
}

function prefixFor(workspaceId?: string): string {
  return workspaceId === undefined
    ? `${AUTHZ_CACHE_NAMESPACE}:`
    : `${AUTHZ_CACHE_NAMESPACE}:${workspaceId}:`;
}

export function createAuthzCache<T extends CachedAuthz>(
  options: AuthzCacheOptions,
): AuthzCache<T> {
  const stats = { resolutions: 0, hits: 0 };
  const store = options.enabled ? options.store : undefined;

  return {
    stats,

    async get(key, resolve) {
      if (!store) {
        stats.resolutions += 1;
        return resolve();
      }

      const storeKey = `${AUTHZ_CACHE_NAMESPACE}:${key}`;
      // Read before resolving: if a write lands in between, the entry is stored under the older
      // version and the next request, seeing the newer one, re-resolves.
      const version = options.revalidate ? await options.readVersion() : null;
      const raw = await store.get(storeKey);
      if (raw !== undefined) {
        const entry = JSON.parse(raw) as { version: number | null; value: T };
        if (!options.revalidate || entry.version === version) {
          stats.hits += 1;
          return entry.value;
        }
      }

      stats.resolutions += 1;
      const value = await resolve();
      // Negative results aren't cached: "not a member" is re-read every time.
      if (value !== null)
        await store.set(
          storeKey,
          JSON.stringify({ version, value }),
          options.ttlSeconds,
        );
      return value;
    },

    async inspect(workspaceId) {
      const version = await options.readVersion();
      const prefix = prefixFor(workspaceId);
      const listed = store?.list ? await store.list(prefix) : null;
      const entries =
        listed?.map(({ key, value, ttlSeconds }): AuthzCacheEntry => {
          const parsed = JSON.parse(value) as {
            version: number | null;
            value: T;
          };
          const parts = key.slice(AUTHZ_CACHE_NAMESPACE.length + 1).split(":");
          const userId = parts[parts.length - 1]!;
          return {
            key,
            userId,
            ...(parts.length > 1 ? { workspaceId: parts[0]! } : {}),
            version: parsed.version === null ? null : String(parsed.version),
            stale: parsed.version !== version,
            ttlSeconds,
            roles: parsed.value.roles,
            permissions: parsed.value.permissions,
          };
        }) ?? null;
      return {
        active: store !== undefined,
        enabled: options.enabled,
        revalidate: options.revalidate,
        ttlSeconds: options.ttlSeconds,
        hasStore: options.store !== undefined,
        canList: typeof options.store?.list === "function",
        version: String(version),
        stats: { ...stats },
        entries,
      };
    },

    async clear(workspaceId) {
      await options.bumpVersion();
      const version = await options.readVersion();
      const removed = options.store?.clear
        ? await options.store.clear(prefixFor(workspaceId))
        : null;
      return { version: String(version), removed };
    },
  };
}
