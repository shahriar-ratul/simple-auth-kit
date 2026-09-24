// `AuthzCache` exercised directly, with no HTTP and no real database: a stub resolver counts
// resolutions and a stub `authzVersion` delegate counts version reads, so each mode of
// `AuthConfig.authzCache` is proved by what it does and doesn't call.
import {
  defaultAuthConfig,
  type AuthConfig,
} from "../src/common/config/auth.config.js";
import {
  AuthzCache,
  type AuthzCacheStore,
} from "../src/common/auth/cache/authz-cache.js";
import type { PrismaService } from "../src/modules/prisma/prisma.service.js";
import { MapAuthzCacheStore } from "./map-authz-cache-store.js";

type Assert = (condition: boolean, message: string) => void;

function harness(authzCache: Partial<AuthConfig["authzCache"]>) {
  const counts = { versionReads: 0, resolutions: 0 };
  const prisma = {
    authzVersion: {
      findUnique: async () => {
        counts.versionReads += 1;
        return { version: 7n };
      },
    },
  } as unknown as PrismaService;
  const config: AuthConfig = {
    ...defaultAuthConfig,
    // A store unless the case says otherwise ("store" in authzCache, even as undefined).
    authzCache: {
      ...defaultAuthConfig.authzCache,
      store: new MapAuthzCacheStore(),
      ...authzCache,
    },
  };
  const cache = new AuthzCache(prisma, config);
  const resolve = async () => {
    counts.resolutions += 1;
    return { roles: ["member"], permissions: [] as string[] };
  };
  return { cache, counts, resolve };
}

export async function proveAuthzCacheModes(assert: Assert): Promise<void> {
  {
    const { cache, counts, resolve } = harness({ store: undefined });
    for (let i = 0; i < 3; i++) await cache.get("u1", resolve);
    assert(
      counts.resolutions === 3 && counts.versionReads === 0,
      `no authzCache.store means no cache: every call resolves and the version is never read (got ${counts.resolutions} resolutions, ${counts.versionReads} version reads)`,
    );
  }

  {
    const { cache, counts, resolve } = harness({ enabled: false });
    for (let i = 0; i < 3; i++) await cache.get("u1", resolve);
    assert(
      counts.resolutions === 3 && counts.versionReads === 0,
      `authzCache.enabled: false resolves on every call and never reads the version (got ${counts.resolutions} resolutions, ${counts.versionReads} version reads)`,
    );
  }

  {
    const { cache, counts, resolve } = harness({ revalidate: true });
    for (let i = 0; i < 3; i++) await cache.get("u1", resolve);
    assert(
      counts.resolutions === 1 && counts.versionReads === 3,
      `authzCache.revalidate: true reads the version on every call and resolves once (got ${counts.resolutions} resolutions, ${counts.versionReads} version reads)`,
    );
  }

  {
    const { cache, counts, resolve } = harness({
      revalidate: false,
      ttlSeconds: 1,
    });
    for (let i = 0; i < 3; i++) await cache.get("u1", resolve);
    assert(
      counts.resolutions === 1 && counts.versionReads === 0,
      `authzCache.revalidate: false reuses the entry with zero version reads (got ${counts.resolutions} resolutions, ${counts.versionReads} version reads)`,
    );
    await new Promise((r) => setTimeout(r, 1_100));
    await cache.get("u1", resolve);
    assert(
      counts.resolutions === 2 && counts.versionReads === 0,
      `…and re-resolves once the TTL passes (got ${counts.resolutions} resolutions)`,
    );
  }

  {
    const calls: string[] = [];
    const data = new Map<string, string>();
    const store: AuthzCacheStore = {
      async get(key) {
        calls.push(`get ${key}`);
        return data.get(key);
      },
      async set(key, value, ttlSeconds) {
        calls.push(`set ${key} ${ttlSeconds}`);
        data.set(key, value);
      },
    };
    const { cache, counts, resolve } = harness({ store, ttlSeconds: 45 });
    await cache.get("u9", resolve);
    const second = await cache.get("u9", resolve);
    assert(
      calls.join(" | ") ===
        "get simpleauthkit:authz:u9 | set simpleauthkit:authz:u9 45 | get simpleauthkit:authz:u9" &&
        counts.resolutions === 1 &&
        second?.roles[0] === "member",
      `a custom authzCache.store receives the get/set calls, namespaced and with the TTL (got ${calls.join(" | ")})`,
    );
    const stored = JSON.parse(data.get("simpleauthkit:authz:u9")!);
    assert(
      stored.version === "7" && stored.value.roles[0] === "member",
      "…and stores plain JSON { version, value }, so any string key/value store (e.g. Redis) fits",
    );
  }

  {
    const { cache, counts } = harness({});
    await cache.get("nobody", async () => {
      counts.resolutions += 1;
      return null;
    });
    await cache.get("nobody", async () => {
      counts.resolutions += 1;
      return null;
    });
    assert(counts.resolutions === 2, "a null result is never cached");
  }
}
