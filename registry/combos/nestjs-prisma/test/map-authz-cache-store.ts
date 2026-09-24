// A test-only `AuthzCacheStore`: a Map with expiry, implementing the optional `list`/`clear` too.
// The kit ships no in-memory store (caching needs a store the deployment supplies, e.g. Redis);
// the proof passes this one so the cache and its admin endpoints are exercised end to end.
import type { AuthzCacheStore } from "../src/common/auth/cache/authz-cache.js";

export class MapAuthzCacheStore implements AuthzCacheStore {
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  private live(key: string) {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | undefined> {
    return this.live(key)?.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async list(prefix: string) {
    const rows: Array<{
      key: string;
      value: string;
      ttlSeconds: number | null;
    }> = [];
    for (const key of [...this.entries.keys()]) {
      const entry = key.startsWith(prefix) ? this.live(key) : undefined;
      if (entry)
        rows.push({
          key,
          value: entry.value,
          ttlSeconds: Math.max(
            0,
            Math.ceil((entry.expiresAt - Date.now()) / 1000),
          ),
        });
    }
    return rows;
  }

  async clear(prefix: string): Promise<number> {
    let removed = 0;
    for (const key of [...this.entries.keys()])
      if (key.startsWith(prefix) && this.entries.delete(key)) removed += 1;
    return removed;
  }
}
