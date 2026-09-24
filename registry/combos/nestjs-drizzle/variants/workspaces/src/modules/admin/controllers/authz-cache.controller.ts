import { Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AbilityGuard } from "@/common/auth/ability/ability.guard";
import { AuthGuard } from "@/common/auth/guards/auth.guard";
import {
  WORKSPACE_HEADER,
  WorkspaceGuard,
} from "@/common/auth/guards/authz.guard";
import { AuthzCache } from "@/common/auth/cache/authz-cache";
import { CheckAbility } from "@/infra/route-tiers";

/**
 * Operator view of the authorization cache (`AuthzCache`): what it holds, and a way to drop it.
 * Scoped to the workspace named by `X-Workspace-Id`: only that workspace's entries are listed or deleted, never another's.
 * Clearing bumps `authz_version` first, so every server's entries go stale at once even if the
 * store can't delete them.
 */
@ApiTags("admin")
@Controller("v1/admin/authz-cache")
@ApiBearerAuth()
@ApiHeader({
  name: WORKSPACE_HEADER,
  required: true,
  description:
    "The workspace whose cache entries this request inspects or clears. The caller must be an admin member of it.",
})
@UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
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
  async inspect(@Req() req: Request) {
    return this.cache.inspect(req.authz!.workspaceId);
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
  async clear(@Req() req: Request) {
    return this.cache.clear(req.authz!.workspaceId);
  }
}
