import type { RateLimitDeps } from "@/core/rate-limit.js";

/**
 * In-memory window counter — fine for a single instance / the reference combo's proof.
 * Swap for Redis (INCR + PEXPIRE) behind this same `increment` signature once you run
 * more than one instance; nothing above this layer needs to change.
 *
 * Plain class, no decorators — identical logic to the NestJS combos' equivalent, just
 * constructed directly instead of registered as an injectable provider.
 */
export class InMemoryRateLimitStore implements RateLimitDeps {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }
}
