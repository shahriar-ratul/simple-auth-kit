import { Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AbilityGuard } from '@/common/auth/ability/ability.guard';
import { AuthzCache } from '@/common/auth/cache/authz-cache';
import { AuthGuard } from '@/common/auth/guards/auth.guard';
import { WORKSPACE_HEADER, WorkspaceGuard } from '@/common/auth/guards/authz.guard';
import { CheckAbility } from '@/infra/route-tiers';
import { AuthzCacheClearDto, AuthzCacheInspectionDto } from '@/modules/admin/dto/authz-cache.dto';

// The authorization cache, as an operator sees it: its configuration, the current
// `authz_version`, and (when the store can list) the resolved roles/permissions cached for this
// workspace's members. Scoped to the workspace the request names — never another workspace's
// entries.
@ApiTags('admin')
@Controller('v1/admin/authz-cache')
@ApiBearerAuth()
@ApiHeader({
  name: WORKSPACE_HEADER,
  required: true,
  description: 'The workspace this request administers. The caller must be an admin member of it.',
})
@UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
export class AuthzCacheController {
  constructor(@Inject(AuthzCache) private readonly cache: AuthzCache) {}

  @Get()
  @CheckAbility('authz-cache:manage')
  @ApiOperation({
    summary: '[admin] Inspect the authorization cache',
    description: "`entries` is null when no store is configured or the store can't list.",
  })
  @ApiResponse({ status: 200, type: AuthzCacheInspectionDto })
  async inspect(@Req() req: Request) {
    return this.cache.inspect(req.authz!.workspaceId);
  }

  @Post('clear')
  @CheckAbility('authz-cache:manage')
  @ApiOperation({
    summary: '[admin] Clear the authorization cache',
    description:
      "Bumps `authz_version` (every entry on every server, in every workspace, is stale from the next request), then deletes this workspace's entries if the store can.",
  })
  @ApiResponse({ status: 201, type: AuthzCacheClearDto })
  async clear(@Req() req: Request) {
    return this.cache.clear(req.authz!.workspaceId);
  }
}
