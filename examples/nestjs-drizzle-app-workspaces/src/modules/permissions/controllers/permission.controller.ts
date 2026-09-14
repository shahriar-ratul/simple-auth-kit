import { BadRequestException, Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AbilityGuard } from '../../../common/auth/ability/ability.guard';
import { AuthGuard } from '../../../common/auth/guards/auth.guard';
import { WORKSPACE_HEADER, WorkspaceGuard } from '../../../common/auth/guards/authz.guard';
import { CheckAbility } from '../../../infra/route-tiers';
import { DefinePermissionDto, PermissionListResponseDto, PermissionSummaryDto } from '../dto/permission.dto';
import { PermissionService } from '../services/permission.service';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new BadRequestException(`${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

// The permission catalog is global, like the Permission table itself — what is scoped to a
// workspace is which of its roles and memberships point at each row. Still requires an
// X-Workspace-Id (same admin-surface gate every other route under WorkspaceGuard needs), even
// though these two handlers don't read the resolved workspace context.
@ApiTags('permissions')
@Controller('v1/permissions')
@ApiBearerAuth()
@ApiHeader({
  name: WORKSPACE_HEADER,
  required: true,
  description: 'The workspace this request acts in. The caller must be an admin member of it.',
})
@UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
export class PermissionController {
  constructor(@Inject(PermissionService) private readonly permissions: PermissionService) {}

  @Get()
  @CheckAbility('permissions:read')
  @ApiOperation({
    summary: 'List the permission catalog',
    description:
      'Grouped and ordered for a permission matrix. The catalog is global, like the Permission table: what is scoped to a workspace is which of its roles and memberships point at each row.',
  })
  @ApiResponse({ status: 200, type: PermissionListResponseDto })
  async listPermissions() {
    return this.permissions.listPermissions();
  }

  @Post()
  @CheckAbility('permissions:define')
  @ApiOperation({
    summary: 'Define or edit a permission',
    description:
      'Upserted on `slug`, which is the stable identifier grants and revocations use — renaming the display name never breaks a grant. ' +
      '`isActive: false` takes the permission out of every ability that carries it, in one write, effective on the next request — in every workspace.',
  })
  @ApiBody({ type: DefinePermissionDto })
  @ApiResponse({ status: 201, type: PermissionSummaryDto })
  async definePermission(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.permissions.definePermission(
      {
        slug: requireString(body.slug, 'slug'),
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description: body.description === null ? null : optionalString(body.description),
        group: optionalString(body.group),
        groupOrder: typeof body.groupOrder === 'number' ? body.groupOrder : undefined,
        order: typeof body.order === 'number' ? body.order : undefined,
        isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
      },
      req.auth!.sub,
    );
  }
}
