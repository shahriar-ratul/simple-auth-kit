// Resolved authorization, cached in a store the deployment supplies — configured by
// `AuthConfig.authzCache` (see auth.config.ts). There is no in-memory fallback: with no store,
// nothing is cached and every request resolves from the database.
//
// Every app write that changes authorization bumps the shared `authz_version` counter (see
// authz-version.ts). With `revalidate` on, each authorized request reads that one row — a
// primary-key lookup — and only trusts an entry stored under the same version, so a change made
// through the app applies on the very next request, on every server. With it off, an entry is
// trusted until it expires: no database read at all on a hit, and changes apply within the TTL.
// A direct database edit bumps nothing, so in both modes `ttlSeconds` bounds how long one can go
// unseen.
//
// Key layout: `simpleauthkit:authz:<userId>` (base) or `simpleauthkit:authz:<workspaceId>:<userId>`
// (workspaces) — workspace first, so one workspace's entries share a prefix the admin endpoint
// can list and clear without touching any other workspace's.
import type { AuthzCacheConfig } from "@/common/config/auth.config";

/**
 * Where cache entries live. String-valued so each operation maps onto one Redis command (GET,
 * SET EX, SCAN, DEL) — pass a Redis-backed implementation as `authzCache.store`. Nothing in the
 * kit depends on Redis.
 */
export interface AuthzCacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Optional — lets the admin endpoint list entries. */
  list?(
    prefix: string,
  ): Promise<Array<{ key: string; value: string; ttlSeconds: number | null }>>;
  /** Optional — deletes every entry under the prefix; returns how many. */
  clear?(prefix: string): Promise<number>;
  /** Optional — deletes one entry. Needed to invalidate a cached profile the moment it changes. */
  delete?(key: string): Promise<void>;
}

/** The profile fields the admin endpoint shows next to an entry. */
export interface ProfileSummary {
  email: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
}

/**
 * What the cache reads from the database — `RbacRepository`: the version (and how to bump it),
 * and, for the admin endpoint, a batched profile lookup for users whose profile isn't cached.
 */
export interface AuthzVersionSource {
  readAuthzVersion(): Promise<bigint>;
  bumpAuthzVersion(): Promise<bigint>;
  readProfileSummaries(userIds: string[]): Promise<Map<string, ProfileSummary>>;
}

export const AUTHZ_CACHE_KEY_PREFIX = "simpleauthkit:authz:";
/** `GET /auth/me`'s profile, cached per user under this prefix — profiles aren't workspace-scoped. */
export const PROFILE_CACHE_KEY_PREFIX = "simpleauthkit:profile:";

/** "Display name", else "first last", else null. */
function nameOf(profile: Partial<ProfileSummary>): string | null {
  if (profile.displayName) return profile.displayName;
  const full = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  return full || null;
}

/** The cache key for one principal: `<userId>`, or `<workspaceId>:<userId>` in a workspace. */
export function authzCacheKey(userId: string, workspaceId?: string): string {
  return workspaceId === undefined ? userId : `${workspaceId}:${userId}`;
}

interface StoredEntry {
  version: string | null;
  value: { roles?: string[]; permissions?: string[] } & Record<string, unknown>;
}

export interface AuthzCacheEntryView {
  key: string;
  userId: string;
  workspaceId?: string;
  version: string | null;
  stale: boolean;
  ttlSeconds: number | null;
  roles: string[];
  permissions: string[];
  email: string | null;
  name: string | null;
  profileCached: boolean;
}

export interface AuthzCacheInspection {
  active: boolean;
  enabled: boolean;
  revalidate: boolean;
  ttlSeconds: number;
  hasStore: boolean;
  canList: boolean;
  version: string;
  stats: { resolutions: number; hits: number; profileHits: number };
  entries: AuthzCacheEntryView[] | null;
}

export class AuthzCache {
  /** Since process start. Read by prove-cycle and the admin endpoint. */
  readonly stats = { resolutions: 0, hits: 0, profileHits: 0 };

  constructor(
    private readonly source: AuthzVersionSource,
    private readonly config: AuthzCacheConfig,
  ) {}

  /** Caching happens only when it is enabled *and* a store was supplied. */
  get active(): boolean {
    return this.config.enabled && this.config.store !== undefined;
  }

  /**
   * Returns the cached answer for `key` when the cache is active, otherwise calls `resolve`
   * (and, when active, caches a non-null result — "not a member" is never cached). With
   * `revalidate` on, the version is read *before* resolving, so a write racing the resolution
   * can only leave an entry that is already stale, never one that hides the write.
   */
  async get<T>(
    key: string,
    resolve: () => Promise<T | null>,
  ): Promise<T | null> {
    const store = this.config.store;
    if (!this.config.enabled || !store) {
      this.stats.resolutions += 1;
      return resolve();
    }

    const storeKey = AUTHZ_CACHE_KEY_PREFIX + key;
    const version = this.config.revalidate
      ? (await this.source.readAuthzVersion()).toString()
      : null;
    const raw = await store.get(storeKey);
    if (raw !== undefined) {
      const entry = JSON.parse(raw) as { version: string | null; value: T };
      if (version === null || entry.version === version) {
        this.stats.hits += 1;
        return entry.value;
      }
    }

    this.stats.resolutions += 1;
    const value = await resolve();
    if (value !== null)
      await store.set(
        storeKey,
        JSON.stringify({ version, value }),
        this.config.ttlSeconds,
      );
    return value;
  }

  /**
   * What the cache is doing, for the admin endpoint. `entries` is `null` unless the store can
   * list; in a workspace only that workspace's entries are listed, never another's.
   */
  async inspect(workspaceId?: string): Promise<AuthzCacheInspection> {
    const store = this.config.store;
    const version = (await this.source.readAuthzVersion()).toString();
    const prefix = this.prefixFor(workspaceId);
    let entries: AuthzCacheEntryView[] | null = null;
    if (store?.list) {
      const rows = await store.list(prefix);
      const userIds = rows.map((row) => row.key.slice(prefix.length));
      // Cached profiles first; one batched database query for the rest.
      const cached = new Map<string, ProfileSummary>();
      for (const userId of userIds) {
        const raw = await store.get(PROFILE_CACHE_KEY_PREFIX + userId);
        if (raw !== undefined)
          cached.set(userId, JSON.parse(raw) as ProfileSummary);
      }
      const missing = userIds.filter((id) => !cached.has(id));
      const fromDb = missing.length
        ? await this.source.readProfileSummaries(missing)
        : new Map<string, ProfileSummary>();
      entries = rows.map((row, i) => {
        const parsed = JSON.parse(row.value) as StoredEntry;
        const userId = userIds[i]!;
        const profile = cached.get(userId) ?? fromDb.get(userId);
        return {
          key: row.key,
          userId,
          ...(workspaceId === undefined ? {} : { workspaceId }),
          version: parsed.version,
          stale: parsed.version !== version,
          ttlSeconds: row.ttlSeconds,
          roles: parsed.value.roles ?? [],
          permissions: parsed.value.permissions ?? [],
          email: profile?.email ?? null,
          name: profile ? nameOf(profile) : null,
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
   * Bumps the version first — which alone invalidates every authorization entry on every server
   * — then deletes what the store holds under the same prefix `inspect` lists, when it can, plus
   * cached profiles: every one in the base variant, but in a workspace only those of the users
   * whose entries were listed there (profiles are global; another workspace's users are left be).
   * `removed` counts authorization entries plus profile keys deleted.
   */
  async clear(
    workspaceId?: string,
  ): Promise<{ version: string; removed: number | null }> {
    const version = (await this.source.bumpAuthzVersion()).toString();
    const store = this.config.store;
    if (!store?.clear) return { version, removed: null };

    const prefix = this.prefixFor(workspaceId);
    let removed = 0;
    if (workspaceId === undefined) {
      removed += await store.clear(prefix);
      removed += await store.clear(PROFILE_CACHE_KEY_PREFIX);
      return { version, removed };
    }
    const userIds = store.list
      ? (await store.list(prefix)).map((row) => row.key.slice(prefix.length))
      : [];
    removed += await store.clear(prefix);
    if (store.delete)
      for (const userId of userIds) {
        const key = PROFILE_CACHE_KEY_PREFIX + userId;
        if ((await store.get(key)) === undefined) continue;
        await store.delete(key);
        removed += 1;
      }
    return { version, removed };
  }

  /**
   * `GET /auth/me`'s profile for `userId`, from the store when the cache is active (a
   * `profileHits` hit), otherwise from `resolve` — cached for `ttlSeconds` when active. Every app
   * write that changes a field it shows calls `invalidateProfile`; the TTL bounds direct edits.
   */
  async getProfile<T>(userId: string, resolve: () => Promise<T>): Promise<T> {
    const store = this.config.store;
    if (!this.config.enabled || !store) return resolve();
    const key = PROFILE_CACHE_KEY_PREFIX + userId;
    const raw = await store.get(key);
    if (raw !== undefined) {
      this.stats.profileHits += 1;
      return JSON.parse(raw) as T;
    }
    const value = await resolve();
    await store.set(key, JSON.stringify(value), this.config.ttlSeconds);
    return value;
  }

  /** Drops a cached profile so the next `GET /auth/me` reads it fresh. A no-op without a store. */
  async invalidateProfile(userId: string): Promise<void> {
    await this.config.store?.delete?.(PROFILE_CACHE_KEY_PREFIX + userId);
  }

  private prefixFor(workspaceId?: string): string {
    return workspaceId === undefined
      ? AUTHZ_CACHE_KEY_PREFIX
      : `${AUTHZ_CACHE_KEY_PREFIX}${workspaceId}:`;
  }
}
