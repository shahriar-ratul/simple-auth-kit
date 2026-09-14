import { describe, expect, it } from "vitest";
import { checkRateLimit, RateLimitDeps } from "../rate-limit";

function fakeCounter(): RateLimitDeps & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    increment: async (key) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
  };
}

describe("rate-limit", () => {
  it("allows requests under the max", async () => {
    const deps = fakeCounter();
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(deps, "login", "user-1");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests over the max", async () => {
    const deps = fakeCounter();
    for (let i = 0; i < 5; i++) await checkRateLimit(deps, "login", "user-1");
    const sixth = await checkRateLimit(deps, "login", "user-1");
    expect(sixth.allowed).toBe(false);
    expect(sixth.remaining).toBe(0);
  });

  it("scopes counters independently per identifier and scope", async () => {
    const deps = fakeCounter();
    for (let i = 0; i < 5; i++) await checkRateLimit(deps, "login", "user-1");
    const otherUser = await checkRateLimit(deps, "login", "user-2");
    const otherScope = await checkRateLimit(deps, "signup", "user-1");
    expect(otherUser.allowed).toBe(true);
    expect(otherScope.allowed).toBe(true);
  });
});
