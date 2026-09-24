// Resolved authorization, cached per user (base) or per membership (workspaces) — but only in a
// store the deployment supplies (e.g. Redis). There is no in-memory fallback: with no
// `authzCache.store` (or `enabled: false`) every request resolves from the database.
//
// Resolving roles + permissions is a multi-join read. With a store configured:
//   • `revalidate: true` (default) — each request first reads the one-row `authz_version`
//     counter (see `authz-version.ts`) and re-resolves if it moved. Every write this app makes to
//     authorization bumps it, so those changes apply on the next request, on every server.
//   • `revalidate: false` — no version read at all; an entry is trusted until `ttlSeconds`
//     (zero database reads on a hit; changes apply within the TTL).
// Either way `ttlSeconds` also bounds how long a write made outside the app (raw SQL, which
// doesn't bump the version) can go unseen.
//
// Keys: `simpleauthkit:authz:<userId>` (base) or `simpleauthkit:authz:<workspaceId>:<userId>`
// (workspaces — workspace first, so one workspace's entries share a prefix for `inspect`/`clear`).
// The version is read *before* resolving, so a write that lands in between stores fresher data
// under an older version, which the next request re-resolves — a stale result is never stored
// under a current version.
//
// The same store also holds each user's `/auth/me` profile under `simpleauthkit:profile:<userId>`
// (profiles are global, never per workspace) — but only if the store implements `delete`, since
// every write that changes a profile field deletes that key (`invalidateProfile`). A profile
// written straight to the database is seen once `ttlSeconds` passes.
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_CONFIG, type AuthConfig } from '@/common/config/auth.config';
import { bumpAuthzVersion, readAuthzVersion } from '@/common/auth/cache/authz-version';
import { toId } from '@/common/helpers/id.helper';
import { PrismaService } from '@/modules/prisma/prisma.service';

/** Where cached entries live. Values are JSON strings, so any string key/value store with a TTL fits. */
export interface AuthzCacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Optional — lets the admin endpoint list entries. */
  list?(prefix: string): Promise<Array<{ key: string; value: string; ttlSeconds: number | null }>>;
  /** Optional — deletes every entry under the prefix; returns how many. */
  clear?(prefix: string): Promise<number>;
  /** Optional — deletes one key. Profiles are cached only when the store implements it. */
  delete?(key: string): Promise<void>;
}

const KEY_PREFIX = 'simpleauthkit:authz:';
const PROFILE_PREFIX = 'simpleauthkit:profile:';

/** The fields of a cached profile `inspect()` reads; the rest is whatever `/auth/me` returns. */
interface ProfileFields {
  email?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

function nameOf(p: ProfileFields): string | null {
  return p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' ') || null;
}

/** Base: `simpleauthkit:authz:`; workspaces: `simpleauthkit:authz:<workspaceId>:`. */
function prefixFor(workspaceId?: string): string {
  return workspaceId === undefined ? KEY_PREFIX : `${KEY_PREFIX}${workspaceId}:`;
}

interface StoredEntry {
  version: string | null;
  value: { roles?: string[]; permissions?: string[] } | null;
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
  email: string | null;
  /** `displayName`, else "first last", else null. */
  name: string | null;
  /** The user's profile is in the cache right now. */
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
  entries: AuthzCacheEntry[] | null;
}

@Injectable()
export class AuthzCache {
  /** Since process start. Read by prove-cycle and by `inspect()`. */
  readonly stats = { resolutions: 0, hits: 0, profileHits: 0 };

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /** Caching happens only when enabled *and* a store was supplied. */
  private get active(): boolean {
    return this.config.authzCache.enabled && !!this.config.authzCache.store;
  }

  /** `key`: base `<userId>`; workspaces `<workspaceId>:<userId>`. */
  async get<T>(key: string, resolve: () => Promise<T | null>): Promise<T | null> {
    const { revalidate, ttlSeconds, store } = this.config.authzCache;
    if (!this.active || !store) {
      this.stats.resolutions += 1;
      return resolve();
    }

    const storeKey = KEY_PREFIX + key;
    const version = revalidate ? await readAuthzVersion(this.prisma) : null;
    const raw = await store.get(storeKey);
    if (raw !== undefined) {
      const entry = JSON.parse(raw) as { version: string | null; value: T };
      if (!revalidate || entry.version === version) {
        this.stats.hits += 1;
        return entry.value;
      }
    }

    this.stats.resolutions += 1;
    const value = await resolve();
    // Negative results ("not a member of this workspace") are never cached.
    if (value !== null) await store.set(storeKey, JSON.stringify({ version, value }), ttlSeconds);
    return value;
  }

  /** The store, if profiles are cached: the cache is active and the store can `delete`. */
  private get profileStore(): AuthzCacheStore | undefined {
    const store = this.config.authzCache.store;
    return this.active && store?.delete ? store : undefined;
  }

  /** The `/auth/me` profile for a user, from the cache when it has one. */
  async getProfile<T extends object>(userId: string, load: () => Promise<T>): Promise<T> {
    const store = this.profileStore;
    if (!store) return load();
    const key = PROFILE_PREFIX + userId;
    const raw = await store.get(key);
    if (raw !== undefined) {
      this.stats.profileHits += 1;
      return JSON.parse(raw) as T;
    }
    const profile = await load();
    await store.set(key, JSON.stringify(profile), this.config.authzCache.ttlSeconds);
    return profile;
  }

  /** Call after every write that changes a field `/auth/me` shows. */
  async invalidateProfile(userId: string | bigint): Promise<void> {
    await this.profileStore?.delete?.(PROFILE_PREFIX + userId.toString());
  }

  /** The cache's configuration, the current version, and (if the store can list) its entries. */
  async inspect(workspaceId?: string): Promise<AuthzCacheInspection> {
    const { enabled, revalidate, ttlSeconds, store } = this.config.authzCache;
    const version = await readAuthzVersion(this.prisma);
    const prefix = prefixFor(workspaceId);
    const rows = store?.list ? (await store.list(prefix)).filter((row) => row.key.startsWith(prefix)) : null;
    return {
      active: this.active,
      enabled,
      revalidate,
      ttlSeconds,
      hasStore: !!store,
      canList: !!store?.list,
      version,
      stats: { ...this.stats },
      entries: rows && (await this.describe(rows, prefix, version, workspaceId)),
    };
  }

  private async describe(
    rows: Array<{ key: string; value: string; ttlSeconds: number | null }>,
    prefix: string,
    version: string,
    workspaceId: string | undefined,
  ): Promise<AuthzCacheEntry[]> {
    const userIds = rows.map((row) => row.key.slice(prefix.length));
    // Profiles from the cache where present; the rest in one batched query.
    const cached = new Map<string, ProfileFields>();
    const store = this.config.authzCache.store;
    if (store)
      for (const userId of new Set(userIds)) {
        const raw = await store.get(PROFILE_PREFIX + userId);
        if (raw !== undefined) cached.set(userId, JSON.parse(raw) as ProfileFields);
      }
    const missing = [...new Set(userIds)]
      .filter((userId) => !cached.has(userId))
      .flatMap((userId) => {
        try {
          return [toId(userId)];
        } catch {
          return [];
        }
      });
    const fromDb = new Map<string, ProfileFields>(
      missing.length
        ? (
            await this.prisma.user.findMany({
              where: { id: { in: missing } },
              select: {
                id: true,
                email: true,
                displayName: true,
                firstName: true,
                lastName: true,
              },
            })
          ).map((user) => [user.id.toString(), user])
        : [],
    );

    return rows.map((row, i): AuthzCacheEntry => {
      const userId = userIds[i];
      const stored = JSON.parse(row.value) as StoredEntry;
      const profile = cached.get(userId) ?? fromDb.get(userId);
      return {
        key: row.key,
        userId,
        ...(workspaceId === undefined ? {} : { workspaceId }),
        version: stored.version,
        stale: stored.version !== version,
        ttlSeconds: row.ttlSeconds,
        roles: stored.value?.roles ?? [],
        permissions: stored.value?.permissions ?? [],
        email: profile?.email ?? null,
        name: profile ? nameOf(profile) : null,
        profileCached: cached.has(userId),
      };
    });
  }

  /**
   * Bumps `authz_version` first — which alone makes every entry on every server stale — then
   * deletes this scope's entries and cached profiles if the store can. Profiles are global, so a
   * workspace clears only the profiles of the users it had entries for. `removed` (authz entries
   * plus profile keys) is null when the store can't clear.
   */
  async clear(workspaceId?: string): Promise<{ version: string; removed: number | null }> {
    const { version } = await bumpAuthzVersion(this.prisma);
    const store = this.config.authzCache.store;
    if (!store?.clear) return { version: version.toString(), removed: null };

    const prefix = prefixFor(workspaceId);
    let profiles = 0;
    if (workspaceId === undefined) {
      profiles = await store.clear(PROFILE_PREFIX);
    } else if (store.list && store.delete) {
      for (const row of await store.list(prefix)) {
        const key = PROFILE_PREFIX + row.key.slice(prefix.length);
        if ((await store.get(key)) === undefined) continue;
        await store.delete(key);
        profiles += 1;
      }
    }
    const removed = (await store.clear(prefix)) + profiles;
    return { version: version.toString(), removed };
  }
}
