// Authorization is resolved from the database on every authorized request — a grant or
// revocation takes effect on the caller's next request, not their next token — which puts one
// multi-join read on the hot path. This module caches that read without changing the semantics.
//
//   1. Version-key invalidation, never eviction: a cache key embeds two generation counters, and
//      bumping one makes every key built from the old value unreachable in a single write.
//   2. Two counters: a *subject* counter per principal, bumped by that user's own role/grant
//      changes; a global *policy* counter, bumped by role-composition or permission-activation
//      changes. A single global counter would flush everyone on any one user's grant change.
//   3. The store is an injected interface with an in-memory default — swap in Redis via
//      `AuthModule.forRoot` without touching this file. Keys are namespaced `simpleauthkit:authz:*`.
//
// Authentication is deliberately not cached here: token validity/denylist/blocked-user checks
// happen on `AuthGuard`, which never reads this cache. Negative results aren't cached either —
// "not a member of this workspace" is re-read every time.
import { Inject, Injectable } from "@nestjs/common";
import { AUTH_CONFIG, AuthConfig } from "../config/auth.config.js";

/** DI token for the store. Provide your own to `AuthModule.forRoot({ permissionCacheStore })`. */
export const PERMISSION_CACHE_STORE = Symbol("PERMISSION_CACHE_STORE");

export const CACHE_NAMESPACE = "simpleauthkit:authz";

// Small and string-valued: each op maps onto one Redis command (GET, MGET, SET EX, INCR).
export interface PermissionCacheStore {
  get(key: string): Promise<string | undefined>;
  getMany(keys: readonly string[]): Promise<Array<string | undefined>>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  bump(key: string): Promise<number>;
}

// Default store: a Map with expiry, scoped to one process. Correct for single-instance
// deployments; a multi-instance deployment should pass a shared store instead, since a version
// bumped on one instance isn't seen by the others.
//
// `stats` isn't decoration — `prove-cycle` asserts N identical authorized requests cause one
// database resolution, not N.
export class InMemoryPermissionCacheStore implements PermissionCacheStore {
  readonly stats = { hits: 0, misses: 0, writes: 0 };
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();

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
    const next =
      Number(entry && entry.expiresAt > Date.now() ? entry.value : 0) + 1;
    // Version counters outlive entries on purpose: a counter that expired back to 0 would make
    // every superseded entry reachable again.
    this.entries.set(key, {
      value: String(next),
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
    return next;
  }
}

// Exported so anything writing RBAC rows outside this application (a second service, a
// migration, a psql session) can bump the counter itself — otherwise an out-of-band write is
// only picked up once the cache entry expires.
export const POLICY_VERSION_KEY = `${CACHE_NAMESPACE}:policy-version`;
export const subjectVersionKey = (subject: string) =>
  `${CACHE_NAMESPACE}:subject-version:${subject}`;
const entryKey = (subject: string, policy: string, subjectVersion: string) =>
  `${CACHE_NAMESPACE}:entry:${subject}:p${policy}:s${subjectVersion}`;

// Reads through to the database once per (principal, policy version, subject version). Used by
// each variant's `AuthzGuard` — the variants differ only in what a "subject" is (a user id in
// `base`, a `userId:workspaceId` pair in `workspaces`), so this file is shared while the guards
// aren't.
@Injectable()
export class PermissionCache {
  constructor(
    @Inject(PERMISSION_CACHE_STORE)
    private readonly store: PermissionCacheStore,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  // Concurrent misses on the same key collapse into one `load()` — in-process, so a cold key
  // under load costs one database read per instance rather than one per request.
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async resolve<T>(
    subject: string,
    load: () => Promise<T | null>,
  ): Promise<T | null> {
    const ttl = this.config.permissionCacheTtlSeconds;
    if (ttl <= 0) return load(); // caching off; the semantics are identical, only the cost differs

    const [policy = "0", version = "0"] = await this.store.getMany([
      POLICY_VERSION_KEY,
      subjectVersionKey(subject),
    ]);
    const key = entryKey(subject, policy, version);

    const cached = await this.store.get(key);
    if (cached !== undefined) return JSON.parse(cached) as T;

    const existing = this.inFlight.get(key);
    if (existing) return (await existing) as T | null;

    const pending = (async () => {
      const resolved = await load();
      // A negative result is not written: see the module comment. Only a real answer is cached.
      if (resolved !== null)
        await this.store.set(key, JSON.stringify(resolved), ttl);
      return resolved;
    })();

    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      this.inFlight.delete(key);
    }
  }

  // One principal's role assignments or direct grants changed.
  async invalidateSubject(subject: string): Promise<void> {
    await this.store.bump(subjectVersionKey(subject));
  }

  // What a role carries changed, or a permission was activated/deactivated — affects everyone.
  async invalidatePolicy(): Promise<void> {
    await this.store.bump(POLICY_VERSION_KEY);
  }
}
