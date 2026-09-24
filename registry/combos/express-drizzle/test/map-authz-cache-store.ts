// A Map-backed `AuthzCacheStore` with expiry, list and clear — for the proof only. The shipped
// library has no in-memory store on purpose: no store configured means no cache. A real
// deployment passes e.g. a Redis-backed store; this stands in for one.
import type { AuthzCacheStore } from "../src/common/auth/cache/authz-cache.js";

export class MapAuthzCacheStore implements AuthzCacheStore {
  readonly entries = new Map<string, { value: string; expiresAt: number }>();

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

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async list(prefix: string) {
    const out: Array<{
      key: string;
      value: string;
      ttlSeconds: number | null;
    }> = [];
    for (const key of [...this.entries.keys()]) {
      if (!key.startsWith(prefix)) continue;
      const entry = this.live(key);
      if (entry)
        out.push({
          key,
          value: entry.value,
          ttlSeconds: Math.max(
            0,
            Math.ceil((entry.expiresAt - Date.now()) / 1000),
          ),
        });
    }
    return out;
  }

  async clear(prefix: string): Promise<number> {
    let removed = 0;
    for (const key of [...this.entries.keys()])
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    return removed;
  }
}
