export type RateLimitScope = 'login' | 'refresh' | 'signup' | 'password-reset';

export interface RateLimitDeps {
  /** Increments the counter for `key` within the current window and returns the new count. */
  increment: (key: string, windowMs: number) => Promise<number>;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

const DEFAULTS: Record<RateLimitScope, RateLimitOptions> = {
  login: { windowMs: 60_000, max: 5 },
  refresh: { windowMs: 60_000, max: 20 },
  signup: { windowMs: 60 * 60_000, max: 10 },
  'password-reset': { windowMs: 60 * 60_000, max: 5 },
};

export function rateLimitKey(scope: RateLimitScope, identifier: string): string {
  return `authrl:${scope}:${identifier}`;
}

export async function checkRateLimit(
  deps: RateLimitDeps,
  scope: RateLimitScope,
  identifier: string,
  opts: Partial<RateLimitOptions> = {},
): Promise<{ allowed: boolean; remaining: number }> {
  const { windowMs, max } = { ...DEFAULTS[scope], ...opts };
  const count = await deps.increment(rateLimitKey(scope, identifier), windowMs);
  return { allowed: count <= max, remaining: Math.max(0, max - count) };
}
