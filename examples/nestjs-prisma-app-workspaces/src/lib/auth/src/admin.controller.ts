import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Ip, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AbilityGuard } from "./ability.guard.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { WORKSPACE_HEADER, WorkspaceGuard } from "./authz.guard.js";
import { CheckAbility } from "./route-tiers.js";
import { WorkspaceRepository } from "./workspace.repository.js";
import { hashPassword } from "@/lib/auth/core/crypto.js";
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
import { CountryListResponseDto, CountrySummaryDto, CreateCountryDto, UpdateCountryDto } from "./dto/country.dto.js";
import { CreateCustomerDto, CustomerListResponseDto, CustomerSummaryDto, UpdateCustomerDto } from "./dto/customer.dto.js";
import { CreateLanguageDto, LanguageListResponseDto, LanguageSummaryDto, UpdateLanguageDto } from "./dto/language.dto.js";
import { CountryRepository } from "./country.repository.js";
import { CustomerRepository } from "./customer.repository.js";
import { LanguageRepository } from "./language.repository.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new BadRequestException(`${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const optionalBoolean = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

// Administration *of one workspace*, and nothing else. `WorkspaceGuard` resolves the caller's
// membership of the workspace named by the `X-Workspace-Id` header into the roles/permissions
// that membership carries there, and every handler passes that resolved context down, so the
// query itself is scoped too. An admin of workspace A calling with workspace B's id is rejected
// because the context resolved is B's membership — scoped by construction, not a second check.
@ApiTags("auth")
@Controller("auth/admin")
@ApiBearerAuth()
@ApiHeader({ name: WORKSPACE_HEADER, required: true, description: "The workspace this request administers. The caller must be an admin member of it." })
@UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
export class AdminController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository,
    @Inject(CountryRepository) private readonly countries: CountryRepository,
    @Inject(LanguageRepository) private readonly languages: LanguageRepository,
    @Inject(CustomerRepository) private readonly customers: CustomerRepository,
  ) {}

  @Get("users")
  @CheckAbility("users:read")
  @ApiOperation({ summary: "[admin] List the members of this workspace" })
  @ApiQuery({ name: "search", required: false, description: "Email substring match" })
  @ApiQuery({ name: "page", required: false, description: "1-indexed. Defaults to 1." })
  @ApiQuery({ name: "limit", required: false, description: "Defaults to 25, capped at 100." })
  @ApiResponse({ status: 200, type: UserListResponseDto })
  async listUsers(@Req() req: Request, @Query("search") search?: string, @Query("page") page?: string, @Query("limit") limit?: string) {
    return this.auth.listUsers(req.authz!, { search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined });
  }

  @Post("users")
  @CheckAbility("users:manage")
  @ApiOperation({
    summary: "[admin] Create a user and add them to this workspace",
    description: "No invitation email — the account is usable immediately with the password given here.",
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, type: UserSummaryDto })
  async createUser(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const passwordHash = await hashPassword(requireString(body.password, "password"));
    const member = await this.workspaces.createMember(
      req.authz!.workspaceId,
      {
        email: requireString(body.email, "email"),
        passwordHash,
        firstName: optionalString(body.firstName),
        lastName: optionalString(body.lastName),
        displayName: optionalString(body.displayName),
        phone: optionalString(body.phone),
        username: optionalString(body.username),
        photo: optionalString(body.photo),
        roles: Array.isArray(body.roles) ? body.roles.filter((role): role is string => typeof role === "string") : undefined,
      },
      req.auth!.sub,
    );
    return this.auth.getUser(req.authz!, member.userId);
  }

  @Get("users/:userId")
  @CheckAbility("users:read")
  @ApiOperation({ summary: "[admin] Fetch a single member's profile" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 200, type: UserSummaryDto })
  async getUser(@Param("userId") userId: string, @Req() req: Request) {
    return this.auth.getUser(req.authz!, userId);
  }

  @Patch("users/:userId")
  @CheckAbility("users:manage")
  @ApiOperation({ summary: "[admin] Edit a member's profile", description: "Profile fields only — email is the login identifier and is not editable here." })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, type: UserSummaryDto })
  async updateUser(@Param("userId") userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.updateUser(
      req.authz!,
      userId,
      {
        firstName: body.firstName === null ? null : optionalString(body.firstName),
        lastName: body.lastName === null ? null : optionalString(body.lastName),
        displayName: body.displayName === null ? null : optionalString(body.displayName),
        phone: body.phone === null ? null : optionalString(body.phone),
        username: body.username === null ? null : optionalString(body.username),
        photo: body.photo === null ? null : optionalString(body.photo),
      },
      req.auth!.sub,
    );
  }

  @Delete("users/:userId")
  @CheckAbility("users:manage")
  @ApiOperation({
    summary: "[admin] Delete a member's account",
    description:
      "Soft-delete: the row survives for audit purposes, stops appearing in listings, and can no longer authenticate. " +
      "This disables the account across every workspace it belongs to, not just this one — the same reach `block` already has.",
  })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteUser(@Param("userId") userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    if (userId === req.auth!.sub) throw new ForbiddenException("cannot delete your own account");
    await this.auth.deleteUser(req.authz!, userId, req.auth!.sub, optionalString(body?.reason));
    return { ok: true };
  }

  @Get("audit-log")
  @CheckAbility("audit-log:read")
  @ApiOperation({ summary: "[admin] List this workspace's audit log entries, newest first" })
  @ApiQuery({ name: "userId", required: false })
  @ApiQuery({ name: "action", required: false, description: "AuditEvent discriminant, e.g. 'role_assigned'" })
  @ApiQuery({ name: "since", required: false, description: "ISO 8601 timestamp" })
  @ApiQuery({ name: "until", required: false, description: "ISO 8601 timestamp" })
  @ApiQuery({ name: "page", required: false, description: "1-indexed. Defaults to 1." })
  @ApiQuery({ name: "limit", required: false, description: "Defaults to 25, capped at 100." })
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
    return this.auth.listAuditLog(req.authz!, {
      userId,
      action,
      since,
      until,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("permissions")
  @CheckAbility("permissions:read")
  @ApiOperation({
    summary: "[admin] List the permission catalog",
    description:
      "Grouped and ordered for a permission matrix. The catalog is global, like the Permission table: what is scoped to this workspace is which of its roles and memberships point at each row.",
  })
  @ApiQuery({ name: "activeOnly", required: false, type: Boolean, description: "Pass true for a picker/dropdown — false or omitted returns everything, active or not." })
  @ApiResponse({ status: 200, type: PermissionListResponseDto })
  async listPermissions(@Query("activeOnly") activeOnly?: string) {
    return this.auth.listPermissions(activeOnly === "true");
  }

  @Post("permissions")
  @CheckAbility("permissions:define")
  @ApiOperation({
    summary: "[admin] Define or edit a permission",
    description:
      "Upserted on `slug`, which is the stable identifier grants and revocations use — renaming the display name never breaks a grant. " +
      "`isActive: false` takes the permission out of every ability that carries it, in one write, effective on the next request — in every workspace.",
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
  @ApiOperation({ summary: "[admin] List the roles this workspace defines" })
  @ApiQuery({ name: "activeOnly", required: false, type: Boolean, description: "Pass true for a picker/dropdown — false or omitted returns everything, active or not." })
  @ApiResponse({ status: 200, type: RoleListResponseDto })
  async listRoles(@Req() req: Request, @Query("activeOnly") activeOnly?: string) {
    return this.auth.listRoles(req.authz!, activeOnly === "true");
  }

  @Post("roles")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "[admin] Create a role in this workspace" })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({ status: 201, type: RoleSummaryDto })
  async createRole(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.createRole(
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

  @Patch("roles/:roleId")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "[admin] Edit one of this workspace's roles" })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, type: RoleSummaryDto })
  async updateRole(@Param("roleId") roleId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.updateRole(
      req.authz!,
      roleId,
      {
        name: optionalString(body.name),
        displayName: optionalString(body.displayName),
        description: body.description === null ? null : optionalString(body.description),
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      req.auth!.sub,
    );
  }

  @Delete("roles/:roleId")
  @CheckAbility("roles:manage")
  @ApiOperation({
    summary: "[admin] Delete one of this workspace's roles",
    description: "Soft-delete: existing assignments are left in place rather than cascade-deleted, and the role simply stops being resolved.",
  })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteRole(@Param("roleId") roleId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.auth.deleteRole(req.authz!, roleId, req.auth!.sub, optionalString(body?.reason));
    return { ok: true };
  }

  @Post("roles/:roleId/permissions")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "[admin] Attach a permission to one of this workspace's roles" })
  @ApiParam({ name: "roleId" })
  @ApiBody({ type: AttachPermissionDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async attachPermissionToRole(@Param("roleId") roleId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.auth.attachPermissionToRole(req.authz!, roleId, requireString(body.permission, "permission"), req.auth!.sub);
    return { ok: true };
  }

  @Post("roles/:roleId/permissions/:permissionSlug/revoke")
  @CheckAbility("roles:manage")
  @ApiOperation({ summary: "[admin] Detach a permission from one of this workspace's roles" })
  @ApiParam({ name: "roleId" })
  @ApiParam({ name: "permissionSlug" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async detachPermissionFromRole(@Param("roleId") roleId: string, @Param("permissionSlug") permissionSlug: string, @Req() req: Request) {
    await this.auth.detachPermissionFromRole(req.authz!, roleId, permissionSlug);
    return { ok: true };
  }

  @Post("users/:userId/roles")
  @CheckAbility("roles:assign")
  @ApiOperation({ summary: "[admin] Assign a role to a member of this workspace" })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: AssignRoleDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async assignRole(@Param("userId") userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.auth.assignRole(req.authz!, userId, requireString(body.role, "role"));
    return { ok: true };
  }

  @Post("users/:userId/roles/:roleSlug/revoke")
  @CheckAbility("roles:assign")
  @ApiOperation({ summary: "[admin] Revoke a role from a member of this workspace" })
  @ApiParam({ name: "userId" })
  @ApiParam({ name: "roleSlug" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async revokeRole(@Param("userId") userId: string, @Param("roleSlug") roleSlug: string, @Req() req: Request) {
    // Revoking your own admin role would strip the very permission that authorized the call,
    // with no way back in. Assigning to yourself is fine; it can't lock anyone out.
    if (userId === req.auth!.sub) throw new ForbiddenException("cannot change your own roles");
    await this.auth.revokeRole(req.authz!, userId, roleSlug);
    return { ok: true };
  }

  @Post("users/:userId/permissions")
  @CheckAbility("permissions:grant")
  @ApiOperation({ summary: "[admin] Grant a permission directly to a member, bypassing roles", description: "The grant is scoped to this workspace." })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: GrantPermissionDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async grantPermission(@Param("userId") userId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.auth.grantPermission(req.authz!, userId, requireString(body.permission, "permission"), req.auth!.sub);
    return { ok: true };
  }

  @Post("users/:userId/permissions/:permissionSlug/revoke")
  @CheckAbility("permissions:grant")
  @ApiOperation({ summary: "[admin] Revoke a direct permission grant from a member" })
  @ApiParam({ name: "userId" })
  @ApiParam({ name: "permissionSlug" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async revokePermission(@Param("userId") userId: string, @Param("permissionSlug") permissionSlug: string, @Req() req: Request) {
    await this.auth.revokePermission(req.authz!, userId, permissionSlug);
    return { ok: true };
  }

  @Post("users/:userId/block")
  @CheckAbility("users:block")
  @ApiOperation({ summary: "[admin] Block a member, revoking all their sessions immediately",
    description: "Blocking disables the whole account, so it is only allowed against a member of the workspace you administer." })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async block(@Param("userId") userId: string, @Req() req: Request, @Ip() ip: string) {
    if (userId === req.auth!.sub) throw new ForbiddenException("cannot block your own account");
    await this.auth.block(req.authz!, userId, { userId: req.auth!.sub, ip });
    return { ok: true };
  }

  @Post("users/:userId/unblock")
  @CheckAbility("users:block")
  @ApiOperation({ summary: "[admin] Unblock a member" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async unblock(@Param("userId") userId: string, @Req() req: Request, @Ip() ip: string) {
    await this.auth.unblock(req.authz!, userId, { userId: req.auth!.sub, ip });
    return { ok: true };
  }

  @Post("users/:userId/deactivate")
  @CheckAbility("users:block")
  @ApiOperation({
    summary: "[admin] Deactivate a member, revoking all their sessions immediately",
    description: "Distinct from block/unblock — a routine administrative toggle, not a security action. Both independently deny login.",
  })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivate(@Param("userId") userId: string, @Req() req: Request, @Ip() ip: string) {
    if (userId === req.auth!.sub) throw new ForbiddenException("cannot deactivate your own account");
    await this.auth.deactivate(req.authz!, userId, { userId: req.auth!.sub, ip });
    return { ok: true };
  }

  @Post("users/:userId/activate")
  @CheckAbility("users:block")
  @ApiOperation({ summary: "[admin] Reactivate a member" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activate(@Param("userId") userId: string, @Req() req: Request, @Ip() ip: string) {
    await this.auth.activate(req.authz!, userId, { userId: req.auth!.sub, ip });
    return { ok: true };
  }

  // ---- countries ----

  @Get("countries")
  @CheckAbility("countries:read")
  @ApiOperation({ summary: "[admin] List this workspace's countries" })
  @ApiQuery({ name: "search", required: false, description: "Matches name/code/isoCode" })
  @ApiQuery({ name: "page", required: false, description: "1-indexed. Defaults to 1." })
  @ApiQuery({ name: "limit", required: false, description: "Defaults to 25, capped at 100." })
  @ApiQuery({ name: "activeOnly", required: false, type: Boolean, description: "Pass true for a picker/dropdown — false or omitted returns everything, active or not." })
  @ApiResponse({ status: 200, type: CountryListResponseDto })
  async listCountries(
    @Req() req: Request,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.countries.list(req.authz!.workspaceId, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      activeOnly: activeOnly === "true",
    });
  }

  @Post("countries")
  @CheckAbility("countries:manage")
  @ApiOperation({ summary: "[admin] Create a country in this workspace" })
  @ApiBody({ type: CreateCountryDto })
  @ApiResponse({ status: 201, type: CountrySummaryDto })
  async createCountry(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.countries.create(
      req.authz!.workspaceId,
      {
        code: requireString(body.code, "code"),
        name: requireString(body.name, "name"),
        emoji: requireString(body.emoji, "emoji"),
        phoneCode: requireString(body.phoneCode, "phoneCode"),
        currency: requireString(body.currency, "currency"),
        currencyName: requireString(body.currencyName, "currencyName"),
        isoCode: requireString(body.isoCode, "isoCode"),
        flag: optionalString(body.flag),
        isActive: optionalBoolean(body.isActive),
      },
      req.auth!.sub,
    );
  }

  @Get("countries/:countryId")
  @CheckAbility("countries:read")
  @ApiOperation({ summary: "[admin] Fetch a single country from this workspace" })
  @ApiParam({ name: "countryId" })
  @ApiResponse({ status: 200, type: CountrySummaryDto })
  async getCountry(@Param("countryId") countryId: string, @Req() req: Request) {
    return this.countries.get(req.authz!.workspaceId, countryId);
  }

  @Patch("countries/:countryId")
  @CheckAbility("countries:manage")
  @ApiOperation({ summary: "[admin] Edit a country in this workspace" })
  @ApiParam({ name: "countryId" })
  @ApiBody({ type: UpdateCountryDto })
  @ApiResponse({ status: 200, type: CountrySummaryDto })
  async updateCountry(@Param("countryId") countryId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.countries.update(
      req.authz!.workspaceId,
      countryId,
      {
        code: optionalString(body.code),
        name: optionalString(body.name),
        emoji: optionalString(body.emoji),
        phoneCode: optionalString(body.phoneCode),
        currency: optionalString(body.currency),
        currencyName: optionalString(body.currencyName),
        isoCode: optionalString(body.isoCode),
        flag: body.flag === null ? null : optionalString(body.flag),
        isActive: optionalBoolean(body.isActive),
      },
      req.auth!.sub,
    );
  }

  @Delete("countries/:countryId")
  @CheckAbility("countries:manage")
  @ApiOperation({ summary: "[admin] Delete a country from this workspace", description: "Soft-delete: the row survives for audit purposes and stops appearing in listings." })
  @ApiParam({ name: "countryId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteCountry(@Param("countryId") countryId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.countries.delete(req.authz!.workspaceId, countryId, req.auth!.sub, optionalString(body?.reason));
    return { ok: true };
  }

  @Post("countries/:countryId/activate")
  @CheckAbility("countries:status")
  @ApiOperation({ summary: "[admin] Reactivate a country" })
  @ApiParam({ name: "countryId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activateCountry(@Param("countryId") countryId: string, @Req() req: Request) {
    await this.countries.setActive(req.authz!.workspaceId, countryId, true, req.auth!.sub);
    return { ok: true };
  }

  @Post("countries/:countryId/deactivate")
  @CheckAbility("countries:status")
  @ApiOperation({ summary: "[admin] Deactivate a country" })
  @ApiParam({ name: "countryId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivateCountry(@Param("countryId") countryId: string, @Req() req: Request) {
    await this.countries.setActive(req.authz!.workspaceId, countryId, false, req.auth!.sub);
    return { ok: true };
  }

  // ---- languages ----

  @Get("languages")
  @CheckAbility("languages:read")
  @ApiOperation({ summary: "[admin] List this workspace's languages" })
  @ApiQuery({ name: "search", required: false, description: "Matches name/code/nativeName" })
  @ApiQuery({ name: "page", required: false, description: "1-indexed. Defaults to 1." })
  @ApiQuery({ name: "limit", required: false, description: "Defaults to 25, capped at 100." })
  @ApiQuery({ name: "activeOnly", required: false, type: Boolean, description: "Pass true for a picker/dropdown — false or omitted returns everything, active or not." })
  @ApiResponse({ status: 200, type: LanguageListResponseDto })
  async listLanguages(
    @Req() req: Request,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.languages.list(req.authz!.workspaceId, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      activeOnly: activeOnly === "true",
    });
  }

  @Post("languages")
  @CheckAbility("languages:manage")
  @ApiOperation({ summary: "[admin] Create a language in this workspace" })
  @ApiBody({ type: CreateLanguageDto })
  @ApiResponse({ status: 201, type: LanguageSummaryDto })
  async createLanguage(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.languages.create(
      req.authz!.workspaceId,
      {
        code: requireString(body.code, "code"),
        name: requireString(body.name, "name"),
        nativeName: requireString(body.nativeName, "nativeName"),
        direction: optionalString(body.direction),
        isDefault: optionalBoolean(body.isDefault),
        isActive: optionalBoolean(body.isActive),
      },
      req.auth!.sub,
    );
  }

  @Get("languages/:languageId")
  @CheckAbility("languages:read")
  @ApiOperation({ summary: "[admin] Fetch a single language from this workspace" })
  @ApiParam({ name: "languageId" })
  @ApiResponse({ status: 200, type: LanguageSummaryDto })
  async getLanguage(@Param("languageId") languageId: string, @Req() req: Request) {
    return this.languages.get(req.authz!.workspaceId, languageId);
  }

  @Patch("languages/:languageId")
  @CheckAbility("languages:manage")
  @ApiOperation({ summary: "[admin] Edit a language in this workspace" })
  @ApiParam({ name: "languageId" })
  @ApiBody({ type: UpdateLanguageDto })
  @ApiResponse({ status: 200, type: LanguageSummaryDto })
  async updateLanguage(@Param("languageId") languageId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.languages.update(
      req.authz!.workspaceId,
      languageId,
      {
        code: optionalString(body.code),
        name: optionalString(body.name),
        nativeName: optionalString(body.nativeName),
        direction: optionalString(body.direction),
        isDefault: optionalBoolean(body.isDefault),
        isActive: optionalBoolean(body.isActive),
      },
      req.auth!.sub,
    );
  }

  @Delete("languages/:languageId")
  @CheckAbility("languages:manage")
  @ApiOperation({ summary: "[admin] Delete a language from this workspace", description: "Soft-delete: the row survives for audit purposes and stops appearing in listings." })
  @ApiParam({ name: "languageId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteLanguage(@Param("languageId") languageId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.languages.delete(req.authz!.workspaceId, languageId, req.auth!.sub, optionalString(body?.reason));
    return { ok: true };
  }

  @Post("languages/:languageId/activate")
  @CheckAbility("languages:status")
  @ApiOperation({ summary: "[admin] Reactivate a language" })
  @ApiParam({ name: "languageId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activateLanguage(@Param("languageId") languageId: string, @Req() req: Request) {
    await this.languages.setActive(req.authz!.workspaceId, languageId, true, req.auth!.sub);
    return { ok: true };
  }

  @Post("languages/:languageId/deactivate")
  @CheckAbility("languages:status")
  @ApiOperation({ summary: "[admin] Deactivate a language" })
  @ApiParam({ name: "languageId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivateLanguage(@Param("languageId") languageId: string, @Req() req: Request) {
    await this.languages.setActive(req.authz!.workspaceId, languageId, false, req.auth!.sub);
    return { ok: true };
  }

  // ---- customers ----
  // End-users managed by admins — no login capability, not related to the RBAC User model above.

  @Get("customers")
  @CheckAbility("customers:read")
  @ApiOperation({ summary: "[admin] List this workspace's customers" })
  @ApiQuery({ name: "search", required: false, description: "Matches name/email/username/phone" })
  @ApiQuery({ name: "page", required: false, description: "1-indexed. Defaults to 1." })
  @ApiQuery({ name: "limit", required: false, description: "Defaults to 25, capped at 100." })
  @ApiQuery({ name: "activeOnly", required: false, type: Boolean, description: "Pass true for a picker/dropdown — false or omitted returns everything, active or not." })
  @ApiResponse({ status: 200, type: CustomerListResponseDto })
  async listCustomers(
    @Req() req: Request,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.customers.list(req.authz!.workspaceId, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      activeOnly: activeOnly === "true",
    });
  }

  @Post("customers")
  @CheckAbility("customers:manage")
  @ApiOperation({ summary: "[admin] Create a customer in this workspace" })
  @ApiBody({ type: CreateCustomerDto })
  @ApiResponse({ status: 201, type: CustomerSummaryDto })
  async createCustomer(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.customers.create(
      req.authz!.workspaceId,
      {
        email: requireString(body.email, "email"),
        firstName: optionalString(body.firstName),
        lastName: optionalString(body.lastName),
        username: optionalString(body.username),
        phone: optionalString(body.phone),
        dob: optionalString(body.dob),
        gender: optionalString(body.gender),
        joinedDate: optionalString(body.joinedDate),
        photo: optionalString(body.photo),
        isEmailVerified: optionalBoolean(body.isEmailVerified),
        isPhoneVerified: optionalBoolean(body.isPhoneVerified),
        isActive: optionalBoolean(body.isActive),
      },
      req.auth!.sub,
    );
  }

  @Get("customers/:customerId")
  @CheckAbility("customers:read")
  @ApiOperation({ summary: "[admin] Fetch a single customer from this workspace" })
  @ApiParam({ name: "customerId" })
  @ApiResponse({ status: 200, type: CustomerSummaryDto })
  async getCustomer(@Param("customerId") customerId: string, @Req() req: Request) {
    return this.customers.get(req.authz!.workspaceId, customerId);
  }

  @Patch("customers/:customerId")
  @CheckAbility("customers:manage")
  @ApiOperation({ summary: "[admin] Edit a customer in this workspace" })
  @ApiParam({ name: "customerId" })
  @ApiBody({ type: UpdateCustomerDto })
  @ApiResponse({ status: 200, type: CustomerSummaryDto })
  async updateCustomer(@Param("customerId") customerId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.customers.update(
      req.authz!.workspaceId,
      customerId,
      {
        email: optionalString(body.email),
        firstName: body.firstName === null ? null : optionalString(body.firstName),
        lastName: body.lastName === null ? null : optionalString(body.lastName),
        username: body.username === null ? null : optionalString(body.username),
        phone: body.phone === null ? null : optionalString(body.phone),
        dob: body.dob === null ? null : optionalString(body.dob),
        gender: body.gender === null ? null : optionalString(body.gender),
        joinedDate: optionalString(body.joinedDate),
        photo: body.photo === null ? null : optionalString(body.photo),
        isEmailVerified: optionalBoolean(body.isEmailVerified),
        isPhoneVerified: optionalBoolean(body.isPhoneVerified),
        isActive: optionalBoolean(body.isActive),
      },
      req.auth!.sub,
    );
  }

  @Delete("customers/:customerId")
  @CheckAbility("customers:manage")
  @ApiOperation({ summary: "[admin] Delete a customer from this workspace", description: "Soft-delete: the row survives for audit purposes and stops appearing in listings." })
  @ApiParam({ name: "customerId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteCustomer(@Param("customerId") customerId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.customers.delete(req.authz!.workspaceId, customerId, req.auth!.sub, optionalString(body?.reason));
    return { ok: true };
  }

  @Post("customers/:customerId/activate")
  @CheckAbility("customers:status")
  @ApiOperation({ summary: "[admin] Reactivate a customer" })
  @ApiParam({ name: "customerId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activateCustomer(@Param("customerId") customerId: string, @Req() req: Request) {
    await this.customers.setActive(req.authz!.workspaceId, customerId, true, req.auth!.sub);
    return { ok: true };
  }

  @Post("customers/:customerId/deactivate")
  @CheckAbility("customers:status")
  @ApiOperation({ summary: "[admin] Deactivate a customer" })
  @ApiParam({ name: "customerId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivateCustomer(@Param("customerId") customerId: string, @Req() req: Request) {
    await this.customers.setActive(req.authz!.workspaceId, customerId, false, req.auth!.sub);
    return { ok: true };
  }
}
