import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AbilityGuard } from '../../../common/auth/ability/ability.guard.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { AuthGuard } from '../../../common/auth/guards/auth.guard.js';
import { AuthzGuard } from '../../../common/auth/guards/authz.guard.js';
import { CheckAbility } from '../../../infra/route-tiers.js';
import { AuditLogListResponseDto } from '../dto/audit-log.dto.js';

@ApiTags('audit-log')
@Controller('v1/audit-log')
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard, AbilityGuard)
export class AuditLogController {
  constructor(@Inject(AuditLogService) private readonly auditLog: AuditLogService) {}

  @Get()
  @CheckAbility('audit-log:read')
  @ApiOperation({ summary: 'List audit log entries, newest first' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({
    name: 'action',
    required: false,
    description: "AuditEvent discriminant, e.g. 'role_assigned'",
  })
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'ISO 8601 timestamp',
  })
  @ApiQuery({
    name: 'until',
    required: false,
    description: 'ISO 8601 timestamp',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '1-indexed. Defaults to 1.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Defaults to 25, capped at 100.',
  })
  @ApiResponse({ status: 200, type: AuditLogListResponseDto })
  async listAuditLog(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLog.list({
      userId,
      action,
      since,
      until,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
