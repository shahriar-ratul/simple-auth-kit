import { Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AbilityGuard } from "@/common/auth/ability/ability.guard";
import { AuthGuard } from "@/common/auth/guards/auth.guard";
import { AuthzGuard } from "@/common/auth/guards/authz.guard";
import { AuthzCache } from "@/common/auth/cache/authz-cache";
import { CheckAbility } from "@/infra/route-tiers";

/**
 * Operator view of the authorization cache (`AuthzCache`): what it holds, and a way to drop it.
 * Covers the whole deployment's cache: every principal's entry.
 * Clearing bumps `authz_version` first, so every server's entries go stale at once even if the
 * store can't delete them.
 */
@ApiTags("admin")
@Controller("v1/admin/authz-cache")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard, AbilityGuard)
export class AuthzCacheController {
  constructor(@Inject(AuthzCache) private readonly cache: AuthzCache) {}

  @Get()
  @CheckAbility("authz-cache:manage")
  @ApiOperation({
    summary:
      "[admin] Inspect the authorization cache: config, current version, stats and entries",
  })
  @ApiResponse({
    status: 200,
    description:
      "{ active, enabled, revalidate, ttlSeconds, hasStore, canList, version, stats, entries } — entries is null when the store can't list.",
  })
  async inspect() {
    return this.cache.inspect(undefined);
  }

  @Post("clear")
  @CheckAbility("authz-cache:manage")
  @ApiOperation({
    summary:
      "[admin] Clear the authorization cache: bumps authz_version, then deletes stored entries",
  })
  @ApiResponse({
    status: 201,
    description:
      "{ version, removed } — removed is null when the store can't delete entries.",
  })
  async clear() {
    return this.cache.clear(undefined);
  }
}
