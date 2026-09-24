import type { AuthzCacheStore } from "../src/common/auth/cache/authz-cache.js";

/**
 * Test-only `AuthzCacheStore`: a `Map` with expiry, implementing the optional `list`/`clear` so
 * the admin endpoint can be proved end to end. Deliberately not in src/ — the kit ships no
 * in-memory cache store; a deployment supplies a real one (e.g. Redis) or runs without a cache.
 */
export class MapAuthzCacheStore implements AuthzCacheStore {
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();

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
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async list(
    prefix: string,
  ): Promise<Array<{ key: string; value: string; ttlSeconds: number | null }>> {
    const now = Date.now();
    return [...this.entries]
      .filter(([key, entry]) => key.startsWith(prefix) && entry.expiresAt > now)
      .map(([key, entry]) => ({
        key,
        value: entry.value,
        ttlSeconds: Math.ceil((entry.expiresAt - now) / 1000),
      }));
  }

  async clear(prefix: string): Promise<number> {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of [...this.entries])
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        if (entry.expiresAt > now) removed += 1;
      }
    return removed;
  }
}
