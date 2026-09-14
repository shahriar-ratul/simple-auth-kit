import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AbilityGuard } from "../../../common/auth/ability/ability.guard";
import { AuthGuard } from "../../../common/auth/guards/auth.guard";
import { AuthzGuard } from "../../../common/auth/guards/authz.guard";
import { CheckAbility } from "../../../infra/route-tiers";
import {
  DefinePermissionDto,
  PermissionListResponseDto,
  PermissionSummaryDto,
} from "../dto/permission.dto";
import { PermissionService } from "../services/permission.service";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new BadRequestException(`${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

// The permission catalog for this deployment — the whole vocabulary of authorization; there is
// nothing about it outside these rows. See the note on AdminController.
@ApiTags("permissions")
@Controller("v1/permissions")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard, AbilityGuard)
export class PermissionController {
  constructor(
    @Inject(PermissionService) private readonly permissions: PermissionService,
  ) {}

  @Get()
  @CheckAbility("permissions:read")
  @ApiOperation({
    summary: "List the permission catalog",
    description:
      "Grouped and ordered for a permission matrix. This is the whole vocabulary of the deployment — there is nothing about authorization outside these rows.",
  })
  @ApiResponse({ status: 200, type: PermissionListResponseDto })
  async listPermissions() {
    return this.permissions.listPermissions();
  }

  @Post()
  @CheckAbility("permissions:define")
  @ApiOperation({
    summary: "Define or edit a permission",
    description:
      "Upserted on `slug`, which is the stable identifier grants and revocations use — renaming the display name never breaks a grant. " +
      "`isActive: false` takes the permission out of every ability that carries it, in one write, effective on the next request.",
  })
  @ApiBody({ type: DefinePermissionDto })
  @ApiResponse({ status: 201, type: PermissionSummaryDto })
  async definePermission(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.permissions.definePermission(
      {
        slug: requireString(body.slug, "slug"),
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description:
          body.description === null ? null : optionalString(body.description),
        group: optionalString(body.group),
        groupOrder:
          typeof body.groupOrder === "number" ? body.groupOrder : undefined,
        order: typeof body.order === "number" ? body.order : undefined,
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      req.auth!.sub,
    );
  }
}
