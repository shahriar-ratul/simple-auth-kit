// Optional Redis for simple-auth-kit's two swappable stores — this file belongs to the example
// app, not the kit (the kit never depends on Redis; `simple-auth-kit update` never touches it).
//
//   REDIS_URL=redis://localhost:6379  where Redis is. Setting it alone changes nothing: each use
//                                     below opts in separately, so Redis can serve one and not
//                                     the other (or only your own code).
//   REDIS_AUTHZ_CACHE=true            keep permission-cache entries in Redis, shared by every
//                                     server (default false: each server's own memory)
//   REDIS_RATE_LIMIT=true             keep login rate-limit counters in Redis, so the limit holds
//                                     across servers (default false: per-server memory)
//   AUTHZ_CACHE_ENABLED=false         turn the permission cache off entirely, whatever the store —
//                                     every request reads permissions from the database
//
// Run Redis locally with: docker compose up -d redis (this app's docker-compose.yml)
import Redis from 'ioredis';
import type { AuthzCacheStore } from '@/common/auth/cache/authz-cache';
import type { RateLimitDeps } from '@/core/rate-limit';

export interface AuthStoreConfig {
  authzCache: { enabled: boolean; store?: AuthzCacheStore };
  rateLimitStore?: RateLimitDeps;
}

const flag = (name: string) => process.env[name] === 'true';

/** Spread into the auth config. With no env set it is exactly the kit's in-memory default. */
export function authStoresFromEnv(): AuthStoreConfig {
  const config: AuthStoreConfig = {
    authzCache: { enabled: process.env['AUTHZ_CACHE_ENABLED'] !== 'false' },
  };
  const useForCache = flag('REDIS_AUTHZ_CACHE');
  const useForRateLimit = flag('REDIS_RATE_LIMIT');
  if (!useForCache && !useForRateLimit) return config;

  const url = process.env['REDIS_URL'];
  if (!url) throw new Error('REDIS_AUTHZ_CACHE / REDIS_RATE_LIMIT is true but REDIS_URL is not set');
  const redis = new Redis(url);

  if (useForCache) {
    config.authzCache.store = {
      get: async (key) => (await redis.get(key)) ?? undefined,
      set: async (key, value, ttlSeconds) => {
        await redis.set(key, value, 'EX', ttlSeconds);
      },
    };
  }
  if (useForRateLimit) {
    config.rateLimitStore = {
      // One counter per key per window: the first hit starts the window's expiry.
      increment: async (key, windowMs) => {
        const count = await redis.incr(key);
        if (count === 1) await redis.pexpire(key, windowMs);
        return count;
      },
    };
  }
  return config;
}
