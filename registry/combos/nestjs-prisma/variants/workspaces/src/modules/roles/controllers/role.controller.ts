import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AbilityGuard } from "../../../common/auth/ability/ability.guard";
import { AuthGuard } from "../../../common/auth/guards/auth.guard";
import {
  WORKSPACE_HEADER,
  WorkspaceGuard,
} from "../../../common/auth/guards/authz.guard";
import { CheckAbility } from "../../../infra/route-tiers";
import { DeleteReasonDto, OkResponseDto } from "../../../common/dto/shared.dto";
import {
  AttachPermissionDto,
  CreateRoleDto,
  RoleListResponseDto,
  RoleSummaryDto,
  UpdateRoleDto,
} from "../dto/role.dto";
import { RoleService } from "../services/role.service";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new BadRequestException(`${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

// The role catalog for the named workspace. Authority is a permission, never a role name — see
// the note on AdminController.
@ApiTags("roles")
@Controller("v1/roles")
@ApiBearerAuth()
@ApiHeader({
  name: WORKSPACE_HEADER,
  required: true,
  description:
    "The workspace this request acts in. The caller must be an admin member of it.",
})
@UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
export class RoleController {
  constructor(@Inject(RoleService) private readonly roles: RoleService) {}

  @Get()
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "List the roles this workspace defines" })
  @ApiQuery({
    name: "activeOnly",
    required: false,
    type: Boolean,
    description:
      "Pass true for a picker/dropdown — false or omitted returns everything, active or not.",
  })
  @ApiResponse({ status: 200, type: RoleListResponseDto })
  async listRoles(
    @Req() req: Request,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.roles.listRoles(req.authz!, activeOnly === "true");
  }

  @Post()
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "Create a role in this workspace" })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({ status: 201, type: RoleSummaryDto })
  async createRole(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.roles.createRole(
      req.authz!,
      {
        slug: requireString(body.slug, "slug"),
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description: optionalString(body.description) ?? null,
      },
      req.auth!.sub,
    );
  }

  @Patch(":roleId")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "Edit one of this workspace's roles" })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, type: RoleSummaryDto })
  async updateRole(
    @Param("roleId") roleId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.roles.updateRole(
      req.authz!,
      roleId,
      {
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description:
          body.description === null ? null : optionalString(body.description),
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      req.auth!.sub,
    );
  }

  @Delete(":roleId")
  @CheckAbility("roles:manage")
  @ApiOperation({
    summary: "Delete one of this workspace's roles",
    description:
      "Soft-delete: existing assignments are left in place rather than cascade-deleted, and the role simply stops being resolved.",
  })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteRole(
    @Param("roleId") roleId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.roles.deleteRole(
      req.authz!,
      roleId,
      req.auth!.sub,
      optionalString(body?.reason),
    );
    return { ok: true };
  }

  @Post(":roleId/permissions")
  @CheckAbility("roles:manage")
  @ApiOperation({
    summary: "Attach a permission to one of this workspace's roles",
  })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: AttachPermissionDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async attachPermissionToRole(
    @Param("roleId") roleId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.roles.attachPermissionToRole(
      req.authz!,
      roleId,
      requireString(body.permission, "permission"),
      req.auth!.sub,
    );
    return { ok: true };
  }

  @Post(":roleId/permissions/:permissionSlug/revoke")
  @CheckAbility("roles:manage")
  @ApiOperation({
    summary: "Detach a permission from one of this workspace's roles",
  })
  @ApiParam({ name: "roleId" })
  @ApiParam({ name: "permissionSlug" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async detachPermissionFromRole(
    @Param("roleId") roleId: string,
    @Param("permissionSlug") permissionSlug: string,
    @Req() req: Request,
  ) {
    await this.roles.detachPermissionFromRole(
      req.authz!,
      roleId,
      permissionSlug,
    );
    return { ok: true };
  }
}
