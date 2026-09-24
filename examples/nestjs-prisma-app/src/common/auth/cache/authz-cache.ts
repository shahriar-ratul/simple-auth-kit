// Resolved authorization, cached per user (base) or per membership (workspaces).
//
// Resolving roles + permissions is a multi-join read; checking whether anything changed is a
// single-row read of `authz_version` (see `authz-version.ts`). An entry is a hit only while the
// version is unchanged AND it is younger than `authzCacheTtlSeconds`:
//   • every write this app makes to authorization bumps the version, so API-driven changes are
//     seen on the very next request;
//   • writes made outside the app (raw SQL) don't bump it, so the TTL bounds how long those can
//     go unseen (30 seconds by default).
//
// The version is read *before* resolving. A write that lands in between stores fresher data
// under an older version, which the next request sees as a mismatch and re-resolves, so a stale
// result is never stored under a current version.
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_CONFIG, type AuthConfig } from '@/common/config/auth.config';
import { readAuthzVersion } from '@/common/auth/cache/authz-version';
import { PrismaService } from '@/modules/prisma/prisma.service';

/** A crude bound: permission changes are rare, so clearing everything when full is fine. */
const MAX_ENTRIES = 10_000;

@Injectable()
export class AuthzCache {
  /** Read by prove-cycle: N identical requests must cost exactly one resolution. */
  readonly stats = { resolutions: 0, hits: 0 };
  private readonly entries = new Map<string, { version: string; expiresAt: number; value: unknown }>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async get<T>(key: string, resolve: () => Promise<T | null>): Promise<T | null> {
    const version = await readAuthzVersion(this.prisma);
    const entry = this.entries.get(key);
    if (entry && entry.version === version && entry.expiresAt > Date.now()) {
      this.stats.hits += 1;
      return entry.value as T;
    }
    this.stats.resolutions += 1;
    const value = await resolve();
    // Negative results ("not a member of this workspace") are never cached.
    if (value === null) {
      this.entries.delete(key);
      return value;
    }
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    this.entries.set(key, {
      version,
      expiresAt: Date.now() + this.config.authzCacheTtlSeconds * 1000,
      value,
    });
    return value;
  }
}
