import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AbilityGuard } from '../../../common/auth/ability/ability.guard.js';
import { AdminService } from '../services/admin.service.js';
import { AuthGuard } from '../../../common/auth/guards/auth.guard.js';
import { AuthzGuard } from '../../../common/auth/guards/authz.guard.js';
import { CheckAbility } from '../../../infra/route-tiers.js';
import { DeleteReasonDto, OkResponseDto } from '../../../common/dto/shared.dto.js';
import {
  AssignRoleDto,
  CreateUserDto,
  GrantPermissionDto,
  UpdateUserDto,
  UserListResponseDto,
  UserSummaryDto,
} from '../dto/admin.dto.js';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new BadRequestException(`${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

// Administration of the whole deployment: user management, block/unblock/deactivate/activate,
// and user-scoped role/permission assignment. Role/permission *catalog* management (create a
// role, define a permission) lives in RoleController/PermissionController; the audit log has its
// own AuditLogController. Authority is a permission, never a role name — a role called "admin"
// that carries no permissions gets the same 403 as holding no role at all. Run `npm run seed`
// first to provision the catalog and the roles that carry it.
@ApiTags('admin')
@Controller('v1/admin')
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard, AbilityGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('users')
  @CheckAbility('users:read')
  @ApiOperation({ summary: '[admin] List users' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Email substring match',
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
  @ApiResponse({ status: 200, type: UserListResponseDto })
  async listUsers(@Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.admin.listUsers({
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('users')
  @CheckAbility('users:manage')
  @ApiOperation({
    summary: '[admin] Create a user directly',
    description: 'No invitation email — the account is usable immediately with the password given here.',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, type: UserSummaryDto })
  async createUser(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.admin.createUser(
      {
        email: requireString(body.email, 'email'),
        password: requireString(body.password, 'password'),
        firstName: optionalString(body.firstName),
        lastName: optionalString(body.lastName),
        displayName: optionalString(body.displayName),
        phone: optionalString(body.phone),
        username: optionalString(body.username),
        dob: optionalString(body.dob),
        gender: optionalString(body.gender),
        joinedDate: optionalString(body.joinedDate),
        isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
        roles: Array.isArray(body.roles)
          ? body.roles.filter((role): role is string => typeof role === 'string')
          : undefined,
      },
      req.auth!.sub,
    );
  }

  @Get('users/:userId')
  @CheckAbility('users:read')
  @ApiOperation({ summary: '[admin] Fetch a single user' })
  @ApiParam({ name: 'userId' })
  @ApiResponse({ status: 200, type: UserSummaryDto })
  async getUser(@Param('userId') userId: string) {
    return this.admin.getUser(userId);
  }

  @Patch('users/:userId')
  @CheckAbility('users:manage')
  @ApiOperation({
    summary: "[admin] Edit a user's profile",
    description: 'Profile fields only — email is the login identifier and is not editable here.',
  })
  @ApiParam({ name: 'userId' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, type: UserSummaryDto })
  async updateUser(@Param('userId') userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.admin.updateUser(
      userId,
      {
        firstName: body.firstName === null ? null : optionalString(body.firstName),
        lastName: body.lastName === null ? null : optionalString(body.lastName),
        displayName: body.displayName === null ? null : optionalString(body.displayName),
        phone: body.phone === null ? null : optionalString(body.phone),
        username: body.username === null ? null : optionalString(body.username),
        photo: body.photo === null ? null : optionalString(body.photo),
        dob: body.dob === null ? null : optionalString(body.dob),
        gender: body.gender === null ? null : optionalString(body.gender),
        joinedDate: optionalString(body.joinedDate),
      },
      req.auth!.sub,
    );
  }

  @Delete('users/:userId')
  @CheckAbility('users:manage')
  @ApiOperation({
    summary: '[admin] Delete a user',
    description:
      'Soft-delete: the row survives for audit purposes, stops appearing in listings, and can no longer authenticate.',
  })
  @ApiParam({ name: 'userId' })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteUser(@Param('userId') userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    if (userId === req.auth!.sub) throw new ForbiddenException('cannot delete your own account');
    await this.admin.deleteUser(userId, req.auth!.sub, optionalString(body?.reason));
    return { ok: true };
  }

  @Post('users/:userId/roles')
  @CheckAbility('roles:assign')
  @ApiOperation({ summary: '[admin] Assign a role to a user' })
  @ApiParam({ name: 'userId' })
  @ApiBody({ type: AssignRoleDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async assignRole(@Param('userId') userId: string, @Body() body: Record<string, unknown>) {
    await this.admin.assignRole(userId, requireString(body.role, 'role'));
    return { ok: true };
  }

  @Post('users/:userId/roles/:roleSlug/revoke')
  @CheckAbility('roles:assign')
  @ApiOperation({ summary: '[admin] Revoke a role from a user' })
  @ApiParam({ name: 'userId' })
  @ApiParam({ name: 'roleSlug' })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async revokeRole(@Param('userId') userId: string, @Param('roleSlug') roleSlug: string, @Req() req: Request) {
    // Revoking your own `admin` would strip the very permission that let you call this,
    // with no route back in. Assigning to yourself is fine — it can't lock anyone out.
    if (userId === req.auth!.sub) throw new ForbiddenException('cannot change your own roles');
    await this.admin.revokeRole(userId, roleSlug);
    return { ok: true };
  }

  @Post('users/:userId/permissions')
  @CheckAbility('permissions:grant')
  @ApiOperation({
    summary: '[admin] Grant a permission directly to a user, bypassing roles',
  })
  @ApiParam({ name: 'userId' })
  @ApiBody({ type: GrantPermissionDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async grantPermission(@Param('userId') userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.admin.grantPermission(userId, requireString(body.permission, 'permission'), req.auth!.sub);
    return { ok: true };
  }

  @Post('users/:userId/permissions/:permissionSlug/revoke')
  @CheckAbility('permissions:grant')
  @ApiOperation({
    summary: '[admin] Revoke a direct permission grant from a user',
  })
  @ApiParam({ name: 'userId' })
  @ApiParam({ name: 'permissionSlug' })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async revokePermission(@Param('userId') userId: string, @Param('permissionSlug') permissionSlug: string) {
    await this.admin.revokePermission(userId, permissionSlug);
    return { ok: true };
  }

  @Post('users/:userId/block')
  @CheckAbility('users:block')
  @ApiOperation({
    summary: '[admin] Block a user, revoking all their sessions immediately',
  })
  @ApiParam({ name: 'userId' })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async block(@Param('userId') userId: string, @Req() req: Request, @Ip() ip: string) {
    if (userId === req.auth!.sub) throw new ForbiddenException('cannot block your own account');
    await this.admin.block(userId, { userId: req.auth!.sub, ip });
    return { ok: true };
  }

  @Post('users/:userId/unblock')
  @CheckAbility('users:block')
  @ApiOperation({ summary: '[admin] Unblock a user' })
  @ApiParam({ name: 'userId' })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async unblock(@Param('userId') userId: string, @Req() req: Request) {
    await this.admin.unblock(userId, { userId: req.auth!.sub, ip: req.ip });
    return { ok: true };
  }

  @Post('users/:userId/deactivate')
  @CheckAbility('users:block')
  @ApiOperation({
    summary: '[admin] Deactivate a user, revoking all their sessions immediately',
    description:
      'Distinct from block/unblock — a routine administrative toggle, not a security action. Both independently deny login.',
  })
  @ApiParam({ name: 'userId' })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivate(@Param('userId') userId: string, @Req() req: Request) {
    if (userId === req.auth!.sub) throw new ForbiddenException('cannot deactivate your own account');
    await this.admin.deactivate(userId, { userId: req.auth!.sub, ip: req.ip });
    return { ok: true };
  }

  @Post('users/:userId/activate')
  @CheckAbility('users:block')
  @ApiOperation({ summary: '[admin] Reactivate a user' })
  @ApiParam({ name: 'userId' })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activate(@Param('userId') userId: string, @Req() req: Request) {
    await this.admin.activate(userId, { userId: req.auth!.sub, ip: req.ip });
    return { ok: true };
  }
}
