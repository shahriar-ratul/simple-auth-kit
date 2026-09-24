import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
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
import { Authenticated, CheckAbility } from "@/infra/route-tiers";
import { OkResponseDto } from "@/common/dto/shared.dto";
import {
  AddMemberDto,
  CreateWorkspaceDto,
  MemberRolesResponseDto,
  MembershipSummaryDto,
  SetMemberRolesDto,
  WorkspaceSummaryDto,
} from "@/modules/auth/dto/workspace.dto";
import { RbacRepository } from "@/modules/auth/repositories/rbac.repository";
import { WorkspaceRepository } from "@/modules/auth/repositories/workspace.repository";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new BadRequestException(`${field} is required`);
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
    throw new BadRequestException(`${field} must be an array of strings`);
  return value as string[];
}

const WORKSPACE_HEADER_DOC = {
  name: WORKSPACE_HEADER,
  required: true,
  description:
    "The workspace this request acts in. The caller must be a member of it.",
};

// Every route below that acts *inside* a workspace names it with the `X-Workspace-Id` header
// rather than a path segment. `POST /workspaces` and `GET /workspaces` are tier 2
// (`@Authenticated()`, no permission slug) since they're outside any workspace — any
// authenticated user may create one or list their own. `GET /workspaces/members` is gated on
// membership itself, proven by `WorkspaceGuard`. The three that mutate membership are
// permission-gated — see `permission-slugs.ts` for the catalog.
@ApiTags("workspaces")
@Controller("v1/workspaces")
@ApiBearerAuth()
export class WorkspaceController {
  constructor(
    @Inject(WorkspaceRepository)
    private readonly workspaces: WorkspaceRepository,
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
  ) {}

  @Post()
  @Authenticated()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Create a workspace",
    description: "The creator becomes its first member, with the admin role.",
  })
  @ApiBody({ type: CreateWorkspaceDto })
  @ApiResponse({ status: 201, type: WorkspaceSummaryDto })
  async create(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.workspaces.create(
      req.auth!.sub,
      requireString(body.name, "name"),
    );
  }

  @Get()
  @Authenticated()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "List the workspaces the current user belongs to, with their roles in each",
  })
  @ApiResponse({ status: 200, type: [WorkspaceSummaryDto] })
  async listMine(@Req() req: Request) {
    return this.workspaces.listForUser(req.auth!.sub);
  }

  @Get("members")
  @Authenticated()
  @UseGuards(AuthGuard, WorkspaceGuard)
  @ApiHeader(WORKSPACE_HEADER_DOC)
  @ApiOperation({ summary: "List the members of the named workspace" })
  @ApiResponse({ status: 200, type: [MembershipSummaryDto] })
  async listMembers(@Req() req: Request) {
    return this.workspaces.listMembers(req.authz!.workspaceId);
  }

  @Post("members")
  @UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
  @CheckAbility("members:manage")
  @ApiHeader(WORKSPACE_HEADER_DOC)
  @ApiOperation({
    summary: "[admin] Add an existing user to the named workspace",
  })
  @ApiBody({ type: AddMemberDto })
  @ApiResponse({ status: 201, type: MembershipSummaryDto })
  async addMember(@Body() body: Record<string, unknown>, @Req() req: Request) {
    // No `roles` in the body means "whatever this workspace flags as the default role".
    const roles =
      body.roles === undefined
        ? undefined
        : requireStringArray(body.roles, "roles");
    return this.workspaces.addMember(
      req.authz!.workspaceId,
      requireString(body.email, "email"),
      roles,
    );
  }

  @Put("members/:memberId/roles")
  @UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
  @CheckAbility("roles:assign")
  @ApiHeader(WORKSPACE_HEADER_DOC)
  @ApiOperation({
    summary: "[admin] Replace a member's roles within the named workspace",
  })
  @ApiParam({ name: "memberId" })
  @ApiBody({ type: SetMemberRolesDto })
  @ApiResponse({ status: 200, type: MemberRolesResponseDto })
  async setMemberRoles(
    @Param("memberId") memberId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    if (memberId === req.authz!.memberId)
      throw new ForbiddenException("cannot change your own roles");
    return this.rbac.setMemberRoles(
      req.authz!.workspaceId,
      memberId,
      requireStringArray(body.roles, "roles"),
    );
  }

  @Delete("members/:memberId")
  @UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
  @CheckAbility("members:manage")
  @ApiHeader(WORKSPACE_HEADER_DOC)
  @ApiOperation({
    summary: "[admin] Remove a member from the named workspace",
    description: "Their direct permission grants go with the membership.",
  })
  @ApiParam({ name: "memberId" })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async removeMember(@Param("memberId") memberId: string, @Req() req: Request) {
    if (memberId === req.authz!.memberId)
      throw new ForbiddenException(
        "cannot remove yourself from a workspace you administer",
      );
    await this.workspaces.removeMember(req.authz!.workspaceId, memberId);
    return { ok: true };
  }
}
