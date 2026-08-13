import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AbilityGuard } from "./ability.guard.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { AuthzGuard } from "./authz.guard.js";
import { CheckAbility } from "./route-tiers.js";
import {
  AssignRoleDto,
  AttachPermissionDto,
  CreateRoleDto,
  CreateUserDto,
  DefinePermissionDto,
  DeleteReasonDto,
  GrantPermissionDto,
  OkResponseDto,
  PermissionListResponseDto,
  PermissionSummaryDto,
  RoleListResponseDto,
  RoleSummaryDto,
  UpdateRoleDto,
  UpdateUserDto,
} from "./dto/auth.dto.js";
import { AuditLogListResponseDto, UserListResponseDto, UserSummaryDto } from "./dto/admin.dto.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new BadRequestException(`${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/**
 * Administration of the whole deployment. Authority is a permission, never a role name:
 * `AuthzGuard` resolves the caller's roles and permissions from the database on this request,
 * builds the CASL ability from them, and `AbilityGuard` checks each route's `@CheckAbility`
 * against it. There is no role-based bypass — holding a role called "admin" that carries no
 * permissions gets exactly the same 403 as holding no role at all, which is why `npm run seed`
 * (which provisions the catalog and the roles that carry it) is a prerequisite for this
 * controller doing anything.
 *
 * Each route says what it demands; the rows say who is granted it. The slugs below are checked at
 * compile time against `PERMISSION_CATALOG` in `rbac.defaults.ts`, while who holds them — and
 * whether the permission is active at all — is edited through this very controller and takes
 * effect on the next request. `GET /auth/me` returns the caller's slugs, and a console rebuilds
 * the same ability from them with the same function the guard used.
 */
@ApiTags("auth")
@Controller("auth/admin")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard, AbilityGuard)
export class AdminController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("users")
  @CheckAbility("users:read")
  @ApiOperation({ summary: "[admin] List users" })
  @ApiQuery({ name: "search", required: false, description: "Email substring match" })
  @ApiQuery({ name: "page", required: false, description: "1-indexed. Defaults to 1." })
  @ApiQuery({ name: "limit", required: false, description: "Defaults to 25, capped at 100." })
  @ApiResponse({ status: 200, type: UserListResponseDto })
  async listUsers(@Query("search") search?: string, @Query("page") page?: string, @Query("limit") limit?: string) {
    return this.auth.listUsers({ search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  }

  @Post("users")
  @CheckAbility("users:manage")
  @ApiOperation({ summary: "[admin] Create a user directly", description: "No invitation email — the account is usable immediately with the password given here." })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, type: UserSummaryDto })
  async createUser(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.createUser(
      {
        email: requireString(body.email, "email"),
        password: requireString(body.password, "password"),
        firstName: optionalString(body.firstName),
        lastName: optionalString(body.lastName),
        displayName: optionalString(body.displayName),
        phone: optionalString(body.phone),
        username: optionalString(body.username),
        dob: optionalString(body.dob),
        gender: optionalString(body.gender),
        joinedDate: optionalString(body.joinedDate),
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
        roles: Array.isArray(body.roles) ? body.roles.filter((role): role is string => typeof role === "string") : undefined,
      },
      req.auth!.sub,
    );
  }

  @Get("users/:userId")
  @CheckAbility("users:read")
  @ApiOperation({ summary: "[admin] Fetch a single user" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 200, type: UserSummaryDto })
  async getUser(@Param("userId") userId: string) {
    return this.auth.getUser(userId);
  }

  @Patch("users/:userId")
  @CheckAbility("users:manage")
  @ApiOperation({ summary: "[admin] Edit a user's profile", description: "Profile fields only — email is the login identifier and is not editable here." })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, type: UserSummaryDto })
  async updateUser(@Param("userId") userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.updateUser(
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

  @Delete("users/:userId")
  @CheckAbility("users:manage")
  @ApiOperation({
    summary: "[admin] Delete a user",
    description: "Soft-delete: the row survives for audit purposes, stops appearing in listings, and can no longer authenticate.",
  })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteUser(@Param("userId") userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    if (userId === req.auth!.sub) throw new ForbiddenException("cannot delete your own account");
    await this.auth.deleteUser(userId, req.auth!.sub, optionalString(body?.reason));
    return { ok: true };
  }

  @Get("audit-log")
  @CheckAbility("audit-log:read")
  @ApiOperation({ summary: "[admin] List audit log entries, newest first" })
  @ApiQuery({ name: "userId", required: false })
  @ApiQuery({ name: "action", required: false, description: "AuditEvent discriminant, e.g. 'role_assigned'" })
  @ApiQuery({ name: "since", required: false, description: "ISO 8601 timestamp" })
  @ApiQuery({ name: "until", required: false, description: "ISO 8601 timestamp" })
  @ApiQuery({ name: "page", required: false, description: "1-indexed. Defaults to 1." })
  @ApiQuery({ name: "limit", required: false, description: "Defaults to 25, capped at 100." })
  @ApiResponse({ status: 200, type: AuditLogListResponseDto })
  async listAuditLog(
    @Query("userId") userId?: string,
    @Query("action") action?: string,
    @Query("since") since?: string,
    @Query("until") until?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.auth.listAuditLog({ userId, action, since, until, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  }

  @Get("permissions")
  @CheckAbility("permissions:read")
  @ApiOperation({
    summary: "[admin] List the permission catalog",
    description: "Grouped and ordered for a permission matrix. This is the whole vocabulary of the deployment — there is nothing about authorization outside these rows.",
  })
  @ApiResponse({ status: 200, type: PermissionListResponseDto })
  async listPermissions() {
    return this.auth.listPermissions();
  }

  @Post("permissions")
  @CheckAbility("permissions:define")
  @ApiOperation({
    summary: "[admin] Define or edit a permission",
    description:
      "Upserted on `slug`, which is the stable identifier grants and revocations use — renaming the display name never breaks a grant. " +
      "`isActive: false` takes the permission out of every ability that carries it, in one write, effective on the next request.",
  })
  @ApiBody({ type: DefinePermissionDto })
  @ApiResponse({ status: 201, type: PermissionSummaryDto })
  async definePermission(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.definePermission(
      {
        slug: requireString(body.slug, "slug"),
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description: body.description === null ? null : optionalString(body.description),
        group: optionalString(body.group),
        groupOrder: typeof body.groupOrder === "number" ? body.groupOrder : undefined,
        order: typeof body.order === "number" ? body.order : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      req.auth!.sub,
    );
  }

  @Get("roles")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "[admin] List the roles this deployment defines" })
  @ApiResponse({ status: 200, type: RoleListResponseDto })
  async listRoles() {
    return this.auth.listRoles();
  }

  @Post("roles")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "[admin] Create a role" })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({ status: 201, type: RoleSummaryDto })
  async createRole(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.createRole(
      {
        slug: requireString(body.slug, "slug"),
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description: optionalString(body.description) ?? null,
        isDefault: typeof body.isDefault === "boolean" ? body.isDefault : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      req.auth!.sub,
    );
  }

  @Patch("roles/:roleId")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "[admin] Edit a role" })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, type: RoleSummaryDto })
  async updateRole(@Param("roleId") roleId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.updateRole(
      roleId,
      {
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description: body.description === null ? null : optionalString(body.description),
        isDefault: typeof body.isDefault === "boolean" ? body.isDefault : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      req.auth!.sub,
    );
  }

  @Delete("roles/:roleId")
  @CheckAbility("roles:manage")
  @ApiOperation({
    summary: "[admin] Delete a role",
    description: "Soft-delete: existing assignments are left in place rather than cascade-deleted, and the role simply stops being resolved.",
  })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteRole(@Param("roleId") roleId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.auth.deleteRole(roleId, req.auth!.sub, optionalString(body?.reason));
    return { ok: true };
  }

  @Post("roles/:roleId/permissions")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "[admin] Attach a permission to a role" })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: AttachPermissionDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async attachPermissionToRole(@Param("roleId") roleId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.auth.attachPermissionToRole(roleId, requireString(body.permission, "permission"), req.auth!.sub);
    return { ok: true };
  }

  @Post("users/:userId/roles")
  @CheckAbility("roles:assign")
  @ApiOperation({ summary: "[admin] Assign a role to a user" })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: AssignRoleDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async assignRole(@Param("userId") userId: string, @Body() body: Record<string, unknown>) {
    await this.auth.assignRole(userId, requireString(body.role, "role"));
    return { ok: true };
  }

  @Post("users/:userId/roles/:roleSlug/revoke")
  @CheckAbility("roles:assign")
  @ApiOperation({ summary: "[admin] Revoke a role from a user" })
  @ApiParam({ name: "userId" })
  @ApiParam({ name: "roleSlug" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async revokeRole(@Param("userId") userId: string, @Param("roleSlug") roleSlug: string, @Req() req: Request) {
    // Revoking your own `admin` would strip the very permission that let you call this,
    // with no route back in. Assigning to yourself is fine — it can't lock anyone out.
    if (userId === req.auth!.sub) throw new ForbiddenException("cannot change your own roles");
    await this.auth.revokeRole(userId, roleSlug);
    return { ok: true };
  }

  @Post("users/:userId/permissions")
  @CheckAbility("permissions:grant")
  @ApiOperation({ summary: "[admin] Grant a permission directly to a user, bypassing roles" })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: GrantPermissionDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async grantPermission(@Param("userId") userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.auth.grantPermission(userId, requireString(body.permission, "permission"), req.auth!.sub);
    return { ok: true };
  }

  @Post("users/:userId/permissions/:permissionSlug/revoke")
  @CheckAbility("permissions:grant")
  @ApiOperation({ summary: "[admin] Revoke a direct permission grant from a user" })
  @ApiParam({ name: "userId" })
  @ApiParam({ name: "permissionSlug" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async revokePermission(@Param("userId") userId: string, @Param("permissionSlug") permissionSlug: string) {
    await this.auth.revokePermission(userId, permissionSlug);
    return { ok: true };
  }

  @Post("users/:userId/block")
  @CheckAbility("users:block")
  @ApiOperation({ summary: "[admin] Block a user, revoking all their sessions immediately" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async block(@Param("userId") userId: string, @Req() req: Request) {
    if (userId === req.auth!.sub) throw new ForbiddenException("cannot block your own account");
    await this.auth.block(userId, { userId: req.auth!.sub, ip: req.ip });
    return { ok: true };
  }

  @Post("users/:userId/unblock")
  @CheckAbility("users:block")
  @ApiOperation({ summary: "[admin] Unblock a user" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async unblock(@Param("userId") userId: string, @Req() req: Request) {
    await this.auth.unblock(userId, { userId: req.auth!.sub, ip: req.ip });
    return { ok: true };
  }

  @Post("users/:userId/deactivate")
  @CheckAbility("users:block")
  @ApiOperation({
    summary: "[admin] Deactivate a user, revoking all their sessions immediately",
    description: "Distinct from block/unblock — a routine administrative toggle, not a security action. Both independently deny login.",
  })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivate(@Param("userId") userId: string, @Req() req: Request) {
    if (userId === req.auth!.sub) throw new ForbiddenException("cannot deactivate your own account");
    await this.auth.deactivate(userId, { userId: req.auth!.sub, ip: req.ip });
    return { ok: true };
  }

  @Post("users/:userId/activate")
  @CheckAbility("users:block")
  @ApiOperation({ summary: "[admin] Reactivate a user" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activate(@Param("userId") userId: string, @Req() req: Request) {
    await this.auth.activate(userId, { userId: req.auth!.sub, ip: req.ip });
    return { ok: true };
  }
}
