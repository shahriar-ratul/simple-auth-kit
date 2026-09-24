// Resolved authorization, cached per user (base) or per membership (workspaces).
//
// Resolving roles + permissions is a multi-join read. How the cache trades freshness for reads is
// configured by `AuthConfig.authzCache`:
//   • `enabled: false` — no cache; every request resolves from the database.
//   • `revalidate: true` (default) — each request first reads the one-row `authz_version`
//     counter (see `authz-version.ts`) and re-resolves if it moved. Every write this app makes to
//     authorization bumps it, so those changes apply on the next request, on every server.
//   • `revalidate: false` — no version read at all; an entry is trusted until `ttlSeconds`
//     (zero database reads on a hit; changes apply within the TTL).
// Either way `ttlSeconds` also bounds how long a write made outside the app (raw SQL, which
// doesn't bump the version) can go unseen.
//
// Entries live in an `AuthzCacheStore`: in-process memory by default, or anything string-keyed
// with a TTL (e.g. Redis) to share entries across servers. The version is read *before*
// resolving, so a write that lands in between stores fresher data under an older version, which
// the next request re-resolves — a stale result is never stored under a current version.
import { Inject, Injectable } from "@nestjs/common";
import { AUTH_CONFIG, type AuthConfig } from "@/common/config/auth.config";
import { readAuthzVersion } from "@/common/auth/cache/authz-version";
import { PrismaService } from "@/modules/prisma/prisma.service";

/** Where cached entries live. Values are JSON strings, so any string key/value store with a TTL fits. */
export interface AuthzCacheStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** The default store: a Map with expiry, local to this process. */
export class InMemoryAuthzCacheStore implements AuthzCacheStore {
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(private readonly maxEntries = 10_000) {}

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
    // Re-inserting moves the key to the end, so Map order stays oldest-insertion-first.
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

const KEY_PREFIX = "simpleauthkit:authz:";

@Injectable()
export class AuthzCache {
  /** Read by prove-cycle: N identical requests must cost exactly one resolution. */
  readonly stats = { resolutions: 0, hits: 0 };
  private readonly store: AuthzCacheStore;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {
    this.store = config.authzCache.store ?? new InMemoryAuthzCacheStore();
  }

  async get<T>(
    key: string,
    resolve: () => Promise<T | null>,
  ): Promise<T | null> {
    const { enabled, revalidate, ttlSeconds } = this.config.authzCache;
    if (!enabled) {
      this.stats.resolutions += 1;
      return resolve();
    }

    const storeKey = KEY_PREFIX + key;
    const version = revalidate ? await readAuthzVersion(this.prisma) : null;
    const raw = await this.store.get(storeKey);
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
    if (value !== null)
      await this.store.set(
        storeKey,
        JSON.stringify({ version, value }),
        ttlSeconds,
      );
    return value;
  }
}
