import { Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AbilityGuard } from "@/common/auth/ability/ability.guard";
import { AuthzCache } from "@/common/auth/cache/authz-cache";
import { AuthGuard } from "@/common/auth/guards/auth.guard";
import { AuthzGuard } from "@/common/auth/guards/authz.guard";
import { CheckAbility } from "@/infra/route-tiers";
import {
  AuthzCacheClearDto,
  AuthzCacheInspectionDto,
} from "@/modules/admin/dto/authz-cache.dto";

// The authorization cache, as an operator sees it: its configuration, the current
// `authz_version`, and (when the store can list) every cached user's resolved roles/permissions.
@ApiTags("admin")
@Controller("v1/admin/authz-cache")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard, AbilityGuard)
export class AuthzCacheController {
  constructor(@Inject(AuthzCache) private readonly cache: AuthzCache) {}

  @Get()
  @CheckAbility("authz-cache:manage")
  @ApiOperation({
    summary: "[admin] Inspect the authorization cache",
    description:
      "`entries` is null when no store is configured or the store can't list.",
  })
  @ApiResponse({ status: 200, type: AuthzCacheInspectionDto })
  async inspect() {
    return this.cache.inspect();
  }

  @Post("clear")
  @CheckAbility("authz-cache:manage")
  @ApiOperation({
    summary: "[admin] Clear the authorization cache",
    description:
      "Bumps `authz_version` (every entry on every server is stale from the next request), then deletes the entries if the store can.",
  })
  @ApiResponse({ status: 201, type: AuthzCacheClearDto })
  async clear() {
    return this.cache.clear();
  }
}
