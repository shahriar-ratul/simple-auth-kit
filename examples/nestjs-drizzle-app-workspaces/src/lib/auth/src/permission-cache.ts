// The caching seam in front of permission resolution.
//
// Authorization is resolved from the database on every authorized request — that is what makes a
// grant or a revocation take effect on the caller's *next request* rather than their next token.
// Left naked, that puts one multi-join read on the hot path of every call. This module is the
// seam that keeps the semantics and removes the read, and it is here from the start because
// retrofitting a cache into a hot path is exactly the change that is expensive later.
//
// Three decisions, all of which a consumer can see and none of which they have to accept:
//
//   1. **Version-key invalidation, never eviction.** Nothing hunts down and deletes cache entries.
//      A cache key contains two generation counters, and bumping a counter makes every key that
//      embedded the old value unreachable in one write. That matters because one role change can
//      affect an unbounded number of users, and there is no scan that scales.
//
//   2. **Two counters, not one.**
//        • a *subject* counter per principal (`userId`, or `userId:workspaceId`), bumped by the
//          frequent, narrow operations: this user's role assignments and direct grants;
//        • a *policy* counter, global, bumped by the rare, wide ones: what a role carries, and
//          whether a permission is active at all.
//      A single global counter would be simpler but would flush every user's entry every time an
//      administrator touched one user's grants. Per-role counters would be more surgical still,
//      but resolving them needs the role→user fan-out this scheme exists to avoid, on the read
//      path, for every request. The cost of what is chosen here is honest and bounded: a role
//      composition change or a permission being deactivated re-resolves everyone once. Those are
//      administrator actions measured in per-day, not per-second.
//
//   3. **The store is an injected interface with an in-memory default.** Same style as
//      `TokenStorage` in packages/auth-client: a consumer swaps in Redis by passing a store to
//      `AuthModule.forRoot`, without editing a line of this library. Keys are namespaced
//      (`simpleauthkit:authz:*`) so a shared Redis stays separable. No Redis dependency is added here.
//
// What is deliberately *not* cached: authentication. Whether a token is valid, denylisted, or
// belongs to a blocked user is decided on the authentication path (`AuthGuard`), which never
// reads this cache — so blocking a user or revoking a session cannot be defeated by a warm entry.
// Negative results are not cached either: "not a member of this workspace" is re-read every time,
// so being added to a workspace is effective immediately rather than after a TTL.
import { Inject, Injectable } from "@nestjs/common";
import { AUTH_CONFIG, AuthConfig } from "./auth.config.js";

/** DI token for the store. Provide your own to `AuthModule.forRoot({ permissionCacheStore })`. */
export const PERMISSION_CACHE_STORE = Symbol("PERMISSION_CACHE_STORE");

/** Every key this library writes starts here, so a shared Redis can be separated by prefix. */
export const CACHE_NAMESPACE = "simpleauthkit:authz";

/**
 * The four operations a permission cache needs. Deliberately small and string-valued: every one
 * maps onto a single Redis command (`GET`, `MGET`, `SET ... EX`, `INCR`), so the Redis
 * implementation is a dozen lines and needs no transaction.
 */
export interface PermissionCacheStore {
  get(key: string): Promise<string | undefined>;
  getMany(keys: readonly string[]): Promise<Array<string | undefined>>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Atomic increment, returning the new value. `INCR` in Redis; correct here because Node is single-threaded. */
  bump(key: string): Promise<number>;
}

/**
 * The default store: a `Map` with expiry, scoped to one process.
 *
 * Correct for a single-instance deployment and for development. Across several instances each
 * keeps its own copy, and a version bumped on one is not seen by the others — so a multi-instance
 * deployment should pass a shared store. That is the whole reason the interface exists.
 *
 * `stats` is not decoration: it is how `prove-cycle` asserts that N identical authorized requests
 * cause one database resolution rather than N. A cache nobody can prove is working is a bug
 * surface.
 */
export class InMemoryPermissionCacheStore implements PermissionCacheStore {
  readonly stats = { hits: 0, misses: 0, writes: 0 };
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | undefined> {
    const entry = this.entries.get(key);
    if (!entry) {
      this.stats.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      this.stats.misses += 1;
      return undefined;
    }
    this.stats.hits += 1;
    return entry.value;
  }

  async getMany(keys: readonly string[]): Promise<Array<string | undefined>> {
    // Version reads are bookkeeping, not cache traffic — counting them in hits/misses would make
    // the hit rate meaningless, and `prove-cycle` asserts on that number.
    return keys.map((key) => {
      const entry = this.entries.get(key);
      return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
    });
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.stats.writes += 1;
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async bump(key: string): Promise<number> {
    const entry = this.entries.get(key);
    const next = Number(entry && entry.expiresAt > Date.now() ? entry.value : 0) + 1;
    // Version counters outlive entries on purpose: a counter that expired back to 0 would make
    // every superseded entry reachable again.
    this.entries.set(key, { value: String(next), expiresAt: Number.MAX_SAFE_INTEGER });
    return next;
  }
}

/**
 * The two version counters. Exported because anything writing RBAC rows *outside* this
 * application — a second service, a migration, a `psql` session — is outside the invalidation
 * protocol, and bumping the counter is how such a writer says so. Without that, an out-of-band
 * write is picked up when the entry expires (`permissionCacheTtlSeconds`), not immediately.
 */
export const POLICY_VERSION_KEY = `${CACHE_NAMESPACE}:policy-version`;
export const subjectVersionKey = (subject: string) => `${CACHE_NAMESPACE}:subject-version:${subject}`;
const entryKey = (subject: string, policy: string, subjectVersion: string) => `${CACHE_NAMESPACE}:entry:${subject}:p${policy}:s${subjectVersion}`;

/**
 * Reads through to the database, once per (principal, policy version, subject version).
 *
 * Used by each variant's `AuthzGuard`. The variants differ only in what a "subject" is — a user
 * id in `base`, a `userId:workspaceId` pair in `workspaces` — which is why this file can be
 * shared while the guards cannot.
 */
@Injectable()
export class PermissionCache {
  constructor(
    @Inject(PERMISSION_CACHE_STORE) private readonly store: PermissionCacheStore,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /**
   * Concurrent misses on the same key collapse into one `load()`.
   *
   * In-process, which is enough for the default store: a cold key under load costs one database
   * read per instance rather than one per request. A distributed single-flight (a short-lived
   * lock key in the shared store) replaces this without touching callers — the seam is that
   * `load` is a thunk and the map is private.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * @param subject the identity these permissions belong to — the cache key's principal
   * @param load    resolves from the database on a miss. Returning `null` is not cached.
   */
  async resolve<T>(subject: string, load: () => Promise<T | null>): Promise<T | null> {
    const ttl = this.config.permissionCacheTtlSeconds;
    if (ttl <= 0) return load(); // caching off; the semantics are identical, only the cost differs

    const [policy = "0", version = "0"] = await this.store.getMany([POLICY_VERSION_KEY, subjectVersionKey(subject)]);
    const key = entryKey(subject, policy, version);

    const cached = await this.store.get(key);
    if (cached !== undefined) return JSON.parse(cached) as T;

    const existing = this.inFlight.get(key);
    if (existing) return (await existing) as T | null;

    const pending = (async () => {
      const resolved = await load();
      // A negative result is not written: see the module comment. Only a real answer is cached.
      if (resolved !== null) await this.store.set(key, JSON.stringify(resolved), ttl);
      return resolved;
    })();

    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Invalidates one principal: their role assignments or their direct grants changed. One write,
   * no fan-out, and every entry that embedded the old counter is unreachable from that moment.
   */
  async invalidateSubject(subject: string): Promise<void> {
    await this.store.bump(subjectVersionKey(subject));
  }

  /**
   * Invalidates everyone: what a role carries changed, or a permission was activated or
   * deactivated. One write, whatever the number of users affected — which is the point, because
   * the alternative is enumerating them.
   */
  async invalidatePolicy(): Promise<void> {
    await this.store.bump(POLICY_VERSION_KEY);
  }
}
