import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AbilityGuard } from "../../../common/auth/ability/ability.guard";
import { AuditLogService } from "../services/audit-log.service";
import { AuthGuard } from "../../../common/auth/guards/auth.guard";
import {
  WORKSPACE_HEADER,
  WorkspaceGuard,
} from "../../../common/auth/guards/authz.guard";
import { CheckAbility } from "../../../infra/route-tiers";
import { AuditLogListResponseDto } from "../dto/audit-log.dto";

@ApiTags("audit-log")
@Controller("v1/audit-log")
@ApiBearerAuth()
@ApiHeader({
  name: WORKSPACE_HEADER,
  required: true,
  description:
    "The workspace this request acts in. The caller must be an admin member of it.",
})
@UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
export class AuditLogController {
  constructor(
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  @CheckAbility("audit-log:read")
  @ApiOperation({
    summary: "List this workspace's audit log entries, newest first",
  })
  @ApiQuery({ name: "userId", required: false })
  @ApiQuery({
    name: "action",
    required: false,
    description: "AuditEvent discriminant, e.g. 'role_assigned'",
  })
  @ApiQuery({
    name: "since",
    required: false,
    description: "ISO 8601 timestamp",
  })
  @ApiQuery({
    name: "until",
    required: false,
    description: "ISO 8601 timestamp",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "1-indexed. Defaults to 1.",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Defaults to 25, capped at 100.",
  })
  @ApiResponse({ status: 200, type: AuditLogListResponseDto })
  async listAuditLog(
    @Req() req: Request,
    @Query("userId") userId?: string,
    @Query("action") action?: string,
    @Query("since") since?: string,
    @Query("until") until?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.auditLog.list(req.authz!, {
      userId,
      action,
      since,
      until,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
