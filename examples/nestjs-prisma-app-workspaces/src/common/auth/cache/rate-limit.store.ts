import { Injectable } from '@nestjs/common';
import type { RateLimitDeps } from '@/core/rate-limit';

/**
 * In-memory window counter — fine for a single instance / the reference combo's proof.
 * Swap for Redis (INCR + PEXPIRE) behind this same `increment` signature once you run
 * more than one instance; nothing above this layer needs to change.
 */
@Injectable()
export class InMemoryRateLimitStore implements RateLimitDeps {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

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

/** DI token for the store. Provide your own to `CoreAuthModule.forRoot({ rateLimitStore })`. */
export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');
