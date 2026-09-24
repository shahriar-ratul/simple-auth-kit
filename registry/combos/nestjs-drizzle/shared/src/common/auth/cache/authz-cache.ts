// Resolved authorization, cached per user (base) or per membership (workspaces) — in a store the
// consumer supplies (e.g. Redis), never in process memory. Behaviour is set by
// `AuthConfig.authzCache`:
//   • no `store`, or `enabled: false` — no caching; every request resolves from the database.
//     There is no in-memory fallback, and this kit never depends on Redis itself.
//   • `revalidate: true` (default) — each request reads the single `authz_version` row first and
//     uses an entry only if it was cached under that same version. Every authorization write this
//     app makes bumps the version, so app-side changes are seen on the very next request, on
//     every server.
//   • `revalidate: false` — no version read; an entry is trusted until `ttlSeconds`.
//   • `ttlSeconds` — entries expire regardless, which bounds changes written straight to the
//     database (they don't bump the version).
//
// The version is read *before* resolving. A write that lands in between stores fresher data
// under an older version, which the next request sees as a mismatch and re-resolves, so a stale
// result is never stored under a current version.
//
// Keys: `simpleauthkit:authz:<userId>` (base) and `simpleauthkit:authz:<workspaceId>:<userId>`
// (workspaces) — workspace first, so one workspace's entries share a prefix that `inspect`/`clear`
// can scope to without ever touching another workspace's.
import type { AuthzCacheConfig } from "@/common/config/auth.config";

/** Entries are opaque strings, so any key-value store with expiry can back the cache. */
export interface AuthzCacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Optional — lets the admin endpoint list entries. */
  list?(
    prefix: string,
  ): Promise<Array<{ key: string; value: string; ttlSeconds: number | null }>>;
  /** Optional — deletes every entry under the prefix; returns how many. */
  clear?(prefix: string): Promise<number>;
  /** Optional — deletes one key; how profile edits made through the app reach the next request. */
  delete?(key: string): Promise<void>;
}

export const AUTHZ_CACHE_PREFIX = "simpleauthkit:authz:";
export const PROFILE_CACHE_PREFIX = "simpleauthkit:profile:";
const profileKey = (userId: string) => `${PROFILE_CACHE_PREFIX}${userId}`;

/** The cache key for one principal: `<userId>`, or `<workspaceId>:<userId>` for a membership. */
export const authzCacheKey = (userId: string, workspaceId?: string): string =>
  workspaceId === undefined
    ? `${AUTHZ_CACHE_PREFIX}${userId}`
    : `${AUTHZ_CACHE_PREFIX}${workspaceId}:${userId}`;

interface StoredEntry {
  version: string | null;
  value: { roles?: string[]; permissions?: string[] };
}

export interface AuthzCacheEntry {
  key: string;
  userId: string;
  workspaceId?: string;
  version: string | null;
  /** Cached under a version other than the current one — the next request re-resolves it. */
  stale: boolean;
  ttlSeconds: number | null;
  roles: string[];
  permissions: string[];
  email: string | null;
  /** `displayName`, else "first last", else null. */
  name: string | null;
  /** Whether this user's `GET /auth/me` profile is cached too. */
  profileCached: boolean;
}

/** The identity fields `inspect` shows per entry — from the profile cache, else the database. */
export interface CachedIdentity {
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}

export interface AuthzCacheDeps {
  /** Reads the current `authz_version`. */
  readVersion: () => Promise<number>;
  /** Bumps `authz_version` through the ORM — what `clear` uses to invalidate every server. */
  bumpVersion: () => Promise<void>;
  /** One batched read of the identities `inspect` couldn't find in the profile cache. */
  loadIdentities: (userIds: string[]) => Promise<Map<string, CachedIdentity>>;
}

const nameOf = (identity: CachedIdentity | undefined): string | null => {
  if (!identity) return null;
  if (identity.displayName) return identity.displayName;
  const full = [identity.firstName, identity.lastName]
    .filter(Boolean)
    .join(" ");
  return full || null;
};

export interface AuthzCacheInspection {
  /** Caching happens only when `enabled` and a `store` is configured. */
  active: boolean;
  enabled: boolean;
  revalidate: boolean;
  ttlSeconds: number;
  hasStore: boolean;
  /** Whether the store implements `list`, i.e. whether `entries` can be shown. */
  canList: boolean;
  version: string;
  /** Since this process started. */
  stats: { resolutions: number; hits: number; profileHits: number };
  entries: AuthzCacheEntry[] | null;
}

export class AuthzCache {
  /** Read by prove-cycle: N identical requests must cost exactly one resolution. */
  readonly stats = { resolutions: 0, hits: 0, profileHits: 0 };

  constructor(
    private readonly config: AuthzCacheConfig,
    private readonly deps: AuthzCacheDeps,
  ) {}

  private get active(): boolean {
    return this.config.enabled && this.config.store !== undefined;
  }

  /** `key` comes from `authzCacheKey`. */
  async get<T>(
    key: string,
    resolve: () => Promise<T | null>,
  ): Promise<T | null> {
    const store = this.config.store;
    if (!this.config.enabled || !store) {
      this.stats.resolutions += 1;
      return resolve();
    }

    const version = this.config.revalidate
      ? String(await this.deps.readVersion())
      : null;
    const raw = await store.get(key);
    if (raw !== undefined) {
      const entry = JSON.parse(raw) as { version: string | null; value: T };
      if (!this.config.revalidate || entry.version === version) {
        this.stats.hits += 1;
        return entry.value;
      }
    }

    this.stats.resolutions += 1;
    const value = await resolve();
    // Negative results ("not a member of this workspace") are never cached.
    if (value !== null) {
      await store.set(
        key,
        JSON.stringify({ version, value }),
        this.config.ttlSeconds,
      );
    }
    return value;
  }

  /**
   * The caller's own profile (what `GET /auth/me` shows), cached in the same store for
   * `ttlSeconds`. Only while the cache is active; otherwise `load` runs every time.
   */
  async profile<T extends object>(
    userId: string,
    load: () => Promise<T>,
  ): Promise<T> {
    const store = this.config.store;
    if (!this.config.enabled || !store) return load();
    const raw = await store.get(profileKey(userId));
    if (raw !== undefined) {
      this.stats.profileHits += 1;
      return JSON.parse(raw) as T;
    }
    const value = await load();
    await store.set(
      profileKey(userId),
      JSON.stringify(value),
      this.config.ttlSeconds,
    );
    return value;
  }

  /** Called by every app write that changes a field the profile shows. */
  async forgetProfile(userId: string): Promise<void> {
    await this.config.store?.delete?.(profileKey(userId));
  }

  private prefix(workspaceId?: string): string {
    return workspaceId === undefined
      ? AUTHZ_CACHE_PREFIX
      : `${AUTHZ_CACHE_PREFIX}${workspaceId}:`;
  }

  /**
   * What the cache holds, for the admin endpoint. With a `workspaceId`, only that workspace's
   * entries are listed. `entries` is null when the store can't list.
   */
  async inspect(workspaceId?: string): Promise<AuthzCacheInspection> {
    const store = this.config.store;
    const version = String(await this.deps.readVersion());
    const prefix = this.prefix(workspaceId);
    const listed = store?.list ? await store.list(prefix) : null;

    let entries: AuthzCacheEntry[] | null = null;
    if (listed && store) {
      const userIds = listed.map(({ key }) => key.slice(prefix.length));
      const cached = new Map<string, CachedIdentity>();
      for (const userId of new Set(userIds)) {
        const raw = await store.get(profileKey(userId));
        if (raw !== undefined)
          cached.set(userId, JSON.parse(raw) as CachedIdentity);
      }
      const missing = [...new Set(userIds)].filter((id) => !cached.has(id));
      const loaded = missing.length
        ? await this.deps.loadIdentities(missing)
        : new Map<string, CachedIdentity>();

      entries = listed.map(({ key, value, ttlSeconds }, i): AuthzCacheEntry => {
        const stored = JSON.parse(value) as StoredEntry;
        const userId = userIds[i];
        const identity = cached.get(userId) ?? loaded.get(userId);
        return {
          key,
          userId,
          ...(workspaceId === undefined ? {} : { workspaceId }),
          version: stored.version,
          stale: stored.version !== version,
          ttlSeconds,
          roles: stored.value.roles ?? [],
          permissions: stored.value.permissions ?? [],
          email: identity?.email ?? null,
          name: nameOf(identity),
          profileCached: cached.has(userId),
        };
      });
    }
    return {
      active: this.active,
      enabled: this.config.enabled,
      revalidate: this.config.revalidate,
      ttlSeconds: this.config.ttlSeconds,
      hasStore: store !== undefined,
      canList: typeof store?.list === "function",
      version,
      stats: { ...this.stats },
      entries,
    };
  }

  /**
   * Invalidates the cache: bumps `authz_version` first (so every server's entries go stale at
   * once, whatever the store), then deletes the entries under the same prefix `inspect` uses, and
   * the matching profile entries — all of them for the whole deployment, or, for one workspace,
   * only the profiles of the users that workspace's entries belonged to (profiles are global, so
   * another workspace's users keep theirs). `removed` counts both, and is null when there is no
   * store or it can't clear.
   */
  async clear(
    workspaceId?: string,
  ): Promise<{ version: string; removed: number | null }> {
    await this.deps.bumpVersion();
    const store = this.config.store;
    let removed: number | null = null;
    if (store?.clear) {
      const prefix = this.prefix(workspaceId);
      if (workspaceId === undefined) {
        removed =
          (await store.clear(prefix)) +
          (await store.clear(PROFILE_CACHE_PREFIX));
      } else {
        const userIds = store.list
          ? (await store.list(prefix)).map(({ key }) =>
              key.slice(prefix.length),
            )
          : [];
        removed = await store.clear(prefix);
        if (store.delete)
          for (const userId of new Set(userIds)) {
            if ((await store.get(profileKey(userId))) === undefined) continue;
            await store.delete(profileKey(userId));
            removed += 1;
          }
      }
    }
    return { version: String(await this.deps.readVersion()), removed };
  }
}
