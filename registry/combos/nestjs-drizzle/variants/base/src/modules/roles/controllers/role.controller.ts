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
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AbilityGuard } from "../../../common/auth/ability/ability.guard.js";
import { AuthGuard } from "../../../common/auth/guards/auth.guard.js";
import { AuthzGuard } from "../../../common/auth/guards/authz.guard.js";
import { CheckAbility } from "../../../infra/route-tiers.js";
import {
  DeleteReasonDto,
  OkResponseDto,
} from "../../../common/dto/shared.dto.js";
import {
  AttachPermissionDto,
  CreateRoleDto,
  RoleListResponseDto,
  RoleSummaryDto,
  UpdateRoleDto,
} from "../dto/role.dto.js";
import { RoleService } from "../services/role.service.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new BadRequestException(`${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

// The role catalog for this deployment. Authority is a permission, never a role name — see the
// note on AdminController.
@ApiTags("roles")
@Controller("v1/roles")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard, AbilityGuard)
export class RoleController {
  constructor(@Inject(RoleService) private readonly roles: RoleService) {}

  @Get()
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "List the roles this deployment defines" })
  @ApiResponse({ status: 200, type: RoleListResponseDto })
  async listRoles() {
    return this.roles.listRoles();
  }

  @Post()
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "Create a role" })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({ status: 201, type: RoleSummaryDto })
  async createRole(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.roles.createRole(
      {
        slug: requireString(body.slug, "slug"),
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description: optionalString(body.description) ?? null,
        isDefault:
          typeof body.isDefault === "boolean" ? body.isDefault : undefined,
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      req.auth!.sub,
    );
  }

  @Patch(":roleId")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "Edit a role" })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, type: RoleSummaryDto })
  async updateRole(
    @Param("roleId") roleId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.roles.updateRole(
      roleId,
      {
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description:
          body.description === null ? null : optionalString(body.description),
        isDefault:
          typeof body.isDefault === "boolean" ? body.isDefault : undefined,
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      req.auth!.sub,
    );
  }

  @Delete(":roleId")
  @CheckAbility("roles:manage")
  @ApiOperation({
    summary: "Delete a role",
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
      roleId,
      req.auth!.sub,
      optionalString(body?.reason),
    );
    return { ok: true };
  }

  @Post(":roleId/permissions")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "Attach a permission to a role" })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: AttachPermissionDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async attachPermissionToRole(
    @Param("roleId") roleId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.roles.attachPermissionToRole(
      roleId,
      requireString(body.permission, "permission"),
      req.auth!.sub,
    );
    return { ok: true };
  }
}
