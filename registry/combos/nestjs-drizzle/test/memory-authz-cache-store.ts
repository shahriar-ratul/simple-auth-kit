import type { AuthzCacheStore } from "../src/common/auth/cache/authz-cache.js";

/**
 * Test-only `AuthzCacheStore`: a `Map` with expiry, plus the optional `list`/`clear`. The kit
 * itself ships no in-memory store (no store = no cache); the proof uses this one to stand in for
 * the Redis-backed store a real deployment would supply.
 */
export class MemoryAuthzCacheStore implements AuthzCacheStore {
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
    return [...this.entries.keys()]
      .filter((key) => key.startsWith(prefix))
      .flatMap((key) => {
        const entry = this.live(key);
        return entry
          ? [
              {
                key,
                value: entry.value,
                ttlSeconds: Math.max(
                  0,
                  Math.ceil((entry.expiresAt - Date.now()) / 1000),
                ),
              },
            ]
          : [];
      });
  }

  async clear(prefix: string): Promise<number> {
    let removed = 0;
    for (const key of [...this.entries.keys()])
      if (key.startsWith(prefix) && this.entries.delete(key)) removed += 1;
    return removed;
  }
}
