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
import { AdminService } from "../services/admin.service";
import { AuthGuard } from "../../../common/auth/guards/auth.guard";
import {
  WORKSPACE_HEADER,
  WorkspaceGuard,
} from "../../../common/auth/guards/authz.guard";
import { CheckAbility } from "../../../infra/route-tiers";
import { DeleteReasonDto, OkResponseDto } from "../../../common/dto/shared.dto";
import {
  AssignRoleDto,
  CreateUserDto,
  GrantPermissionDto,
  UpdateUserDto,
  UserListResponseDto,
  UserSummaryDto,
} from "../dto/admin.dto";
import {
  CountryListResponseDto,
  CountrySummaryDto,
  CreateCountryDto,
  UpdateCountryDto,
} from "../dto/country.dto";
import {
  CreateCustomerDto,
  CustomerListResponseDto,
  CustomerSummaryDto,
  UpdateCustomerDto,
} from "../dto/customer.dto";
import {
  CreateLanguageDto,
  LanguageListResponseDto,
  LanguageSummaryDto,
  UpdateLanguageDto,
} from "../dto/language.dto";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new BadRequestException(`${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const optionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

// Administration *of one workspace*, and nothing else. `WorkspaceGuard` resolves the caller's
// membership of the workspace named by the `X-Workspace-Id` header into the roles/permissions
// that membership carries there, and every handler passes that resolved context down, so the
// query itself is scoped too. An admin of workspace A calling with workspace B's id is rejected
// because the context resolved is B's membership — scoped by construction, not a second check.
// Role/permission *catalog* management lives in RoleController/PermissionController; the audit
// log has its own AuditLogController.
@ApiTags("admin")
@Controller("v1/admin")
@ApiBearerAuth()
@ApiHeader({
  name: WORKSPACE_HEADER,
  required: true,
  description:
    "The workspace this request administers. The caller must be an admin member of it.",
})
@UseGuards(AuthGuard, WorkspaceGuard, AbilityGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("users")
  @CheckAbility("users:read")
  @ApiOperation({ summary: "[admin] List the members of this workspace" })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Email substring match",
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
  @ApiResponse({ status: 200, type: UserListResponseDto })
  async listUsers(
    @Req() req: Request,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.admin.listUsers(req.authz!, {
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post("users")
  @CheckAbility("users:manage")
  @ApiOperation({
    summary: "[admin] Create a user and add them to this workspace",
    description:
      "No invitation email — the account is usable immediately with the password given here.",
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, type: UserSummaryDto })
  async createUser(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.admin.createUser(
      req.authz!,
      {
        email: requireString(body.email, "email"),
        password: requireString(body.password, "password"),
        firstName: optionalString(body.firstName),
        lastName: optionalString(body.lastName),
        displayName: optionalString(body.displayName),
        phone: optionalString(body.phone),
        username: optionalString(body.username),
        photo: optionalString(body.photo),
        roles: Array.isArray(body.roles)
          ? body.roles.filter(
              (role): role is string => typeof role === "string",
            )
          : undefined,
      },
      req.auth!.sub,
    );
  }

  @Get("users/:userId")
  @CheckAbility("users:read")
  @ApiOperation({ summary: "[admin] Fetch a single member's profile" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 200, type: UserSummaryDto })
  async getUser(@Param("userId") userId: string, @Req() req: Request) {
    return this.admin.getUser(req.authz!, userId);
  }

  @Patch("users/:userId")
  @CheckAbility("users:manage")
  @ApiOperation({
    summary: "[admin] Edit a member's profile",
    description:
      "Profile fields only — email is the login identifier and is not editable here.",
  })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, type: UserSummaryDto })
  async updateUser(
    @Param("userId") userId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.admin.updateUser(
      req.authz!,
      userId,
      {
        firstName:
          body.firstName === null ? null : optionalString(body.firstName),
        lastName: body.lastName === null ? null : optionalString(body.lastName),
        displayName:
          body.displayName === null ? null : optionalString(body.displayName),
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
  async deleteUser(
    @Param("userId") userId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    if (userId === req.auth!.sub)
      throw new ForbiddenException("cannot delete your own account");
    await this.admin.deleteUser(
      req.authz!,
      userId,
      req.auth!.sub,
      optionalString(body?.reason),
    );
    return { ok: true };
  }

  @Post("users/:userId/roles")
  @CheckAbility("roles:assign")
  @ApiOperation({
    summary: "[admin] Assign a role to a member of this workspace",
  })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: AssignRoleDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async assignRole(
    @Param("userId") userId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.admin.assignRole(
      req.authz!,
      userId,
      requireString(body.role, "role"),
    );
    return { ok: true };
  }

  @Post("users/:userId/roles/:roleSlug/revoke")
  @CheckAbility("roles:assign")
  @ApiOperation({
    summary: "[admin] Revoke a role from a member of this workspace",
  })
  @ApiParam({ name: "userId" })
  @ApiParam({ name: "roleSlug" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async revokeRole(
    @Param("userId") userId: string,
    @Param("roleSlug") roleSlug: string,
    @Req() req: Request,
  ) {
    // Revoking your own admin role would strip the very permission that authorized the call,
    // with no way back in. Assigning to yourself is fine; it can't lock anyone out.
    if (userId === req.auth!.sub)
      throw new ForbiddenException("cannot change your own roles");
    await this.admin.revokeRole(req.authz!, userId, roleSlug);
    return { ok: true };
  }

  @Post("users/:userId/permissions")
  @CheckAbility("permissions:grant")
  @ApiOperation({
    summary: "[admin] Grant a permission directly to a member, bypassing roles",
    description: "The grant is scoped to this workspace.",
  })
  @ApiParam({ name: "userId" })
  @ApiBody({ type: GrantPermissionDto })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async grantPermission(
    @Param("userId") userId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.admin.grantPermission(
      req.authz!,
      userId,
      requireString(body.permission, "permission"),
      req.auth!.sub,
    );
    return { ok: true };
  }

  @Post("users/:userId/permissions/:permissionSlug/revoke")
  @CheckAbility("permissions:grant")
  @ApiOperation({
    summary: "[admin] Revoke a direct permission grant from a member",
  })
  @ApiParam({ name: "userId" })
  @ApiParam({ name: "permissionSlug" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async revokePermission(
    @Param("userId") userId: string,
    @Param("permissionSlug") permissionSlug: string,
    @Req() req: Request,
  ) {
    await this.admin.revokePermission(req.authz!, userId, permissionSlug);
    return { ok: true };
  }

  @Post("users/:userId/block")
  @CheckAbility("users:block")
  @ApiOperation({
    summary: "[admin] Block a member, revoking all their sessions immediately",
    description:
      "Blocking disables the whole account, so it is only allowed against a member of the workspace you administer.",
  })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async block(
    @Param("userId") userId: string,
    @Req() req: Request,
    @Ip() ip: string,
  ) {
    if (userId === req.auth!.sub)
      throw new ForbiddenException("cannot block your own account");
    await this.admin.block(req.authz!, userId, { userId: req.auth!.sub, ip });
    return { ok: true };
  }

  @Post("users/:userId/unblock")
  @CheckAbility("users:block")
  @ApiOperation({ summary: "[admin] Unblock a member" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async unblock(
    @Param("userId") userId: string,
    @Req() req: Request,
    @Ip() ip: string,
  ) {
    await this.admin.unblock(req.authz!, userId, { userId: req.auth!.sub, ip });
    return { ok: true };
  }

  @Post("users/:userId/deactivate")
  @CheckAbility("users:block")
  @ApiOperation({
    summary:
      "[admin] Deactivate a member, revoking all their sessions immediately",
    description:
      "Distinct from block/unblock — a routine administrative toggle, not a security action. Both independently deny login.",
  })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivate(
    @Param("userId") userId: string,
    @Req() req: Request,
    @Ip() ip: string,
  ) {
    if (userId === req.auth!.sub)
      throw new ForbiddenException("cannot deactivate your own account");
    await this.admin.deactivate(req.authz!, userId, {
      userId: req.auth!.sub,
      ip,
    });
    return { ok: true };
  }

  @Post("users/:userId/activate")
  @CheckAbility("users:block")
  @ApiOperation({ summary: "[admin] Reactivate a member" })
  @ApiParam({ name: "userId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activate(
    @Param("userId") userId: string,
    @Req() req: Request,
    @Ip() ip: string,
  ) {
    await this.admin.activate(req.authz!, userId, {
      userId: req.auth!.sub,
      ip,
    });
    return { ok: true };
  }

  // ---- countries ----
  // Unrelated to RBAC — reference data an admin maintains, scoped to this workspace. Kept in
  // AdminController rather than a dedicated module, out of scope for this pass.

  @Get("countries")
  @CheckAbility("countries:read")
  @ApiOperation({ summary: "[admin] List this workspace's countries" })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Matches name/code/isoCode",
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
  @ApiQuery({
    name: "activeOnly",
    required: false,
    type: Boolean,
    description:
      "Pass true for a picker/dropdown — false or omitted returns everything, active or not.",
  })
  @ApiResponse({ status: 200, type: CountryListResponseDto })
  async listCountries(
    @Req() req: Request,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.admin.listCountries(req.authz!.workspaceId, {
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
  async createCountry(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.admin.createCountry(
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
  @ApiOperation({
    summary: "[admin] Fetch a single country from this workspace",
  })
  @ApiParam({ name: "countryId" })
  @ApiResponse({ status: 200, type: CountrySummaryDto })
  async getCountry(@Param("countryId") countryId: string, @Req() req: Request) {
    return this.admin.getCountry(req.authz!.workspaceId, countryId);
  }

  @Patch("countries/:countryId")
  @CheckAbility("countries:manage")
  @ApiOperation({ summary: "[admin] Edit a country in this workspace" })
  @ApiParam({ name: "countryId" })
  @ApiBody({ type: UpdateCountryDto })
  @ApiResponse({ status: 200, type: CountrySummaryDto })
  async updateCountry(
    @Param("countryId") countryId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.admin.updateCountry(
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
  @ApiOperation({
    summary: "[admin] Delete a country from this workspace",
    description:
      "Soft-delete: the row survives for audit purposes and stops appearing in listings.",
  })
  @ApiParam({ name: "countryId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteCountry(
    @Param("countryId") countryId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.admin.deleteCountry(
      req.authz!.workspaceId,
      countryId,
      req.auth!.sub,
      optionalString(body?.reason),
    );
    return { ok: true };
  }

  @Post("countries/:countryId/activate")
  @CheckAbility("countries:status")
  @ApiOperation({ summary: "[admin] Reactivate a country" })
  @ApiParam({ name: "countryId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activateCountry(
    @Param("countryId") countryId: string,
    @Req() req: Request,
  ) {
    await this.admin.activateCountry(
      req.authz!.workspaceId,
      countryId,
      req.auth!.sub,
    );
    return { ok: true };
  }

  @Post("countries/:countryId/deactivate")
  @CheckAbility("countries:status")
  @ApiOperation({ summary: "[admin] Deactivate a country" })
  @ApiParam({ name: "countryId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivateCountry(
    @Param("countryId") countryId: string,
    @Req() req: Request,
  ) {
    await this.admin.deactivateCountry(
      req.authz!.workspaceId,
      countryId,
      req.auth!.sub,
    );
    return { ok: true };
  }

  // ---- languages ----

  @Get("languages")
  @CheckAbility("languages:read")
  @ApiOperation({ summary: "[admin] List this workspace's languages" })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Matches name/code/nativeName",
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
  @ApiQuery({
    name: "activeOnly",
    required: false,
    type: Boolean,
    description:
      "Pass true for a picker/dropdown — false or omitted returns everything, active or not.",
  })
  @ApiResponse({ status: 200, type: LanguageListResponseDto })
  async listLanguages(
    @Req() req: Request,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.admin.listLanguages(req.authz!.workspaceId, {
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
  async createLanguage(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.admin.createLanguage(
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
  @ApiOperation({
    summary: "[admin] Fetch a single language from this workspace",
  })
  @ApiParam({ name: "languageId" })
  @ApiResponse({ status: 200, type: LanguageSummaryDto })
  async getLanguage(
    @Param("languageId") languageId: string,
    @Req() req: Request,
  ) {
    return this.admin.getLanguage(req.authz!.workspaceId, languageId);
  }

  @Patch("languages/:languageId")
  @CheckAbility("languages:manage")
  @ApiOperation({ summary: "[admin] Edit a language in this workspace" })
  @ApiParam({ name: "languageId" })
  @ApiBody({ type: UpdateLanguageDto })
  @ApiResponse({ status: 200, type: LanguageSummaryDto })
  async updateLanguage(
    @Param("languageId") languageId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.admin.updateLanguage(
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
  @ApiOperation({
    summary: "[admin] Delete a language from this workspace",
    description:
      "Soft-delete: the row survives for audit purposes and stops appearing in listings.",
  })
  @ApiParam({ name: "languageId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteLanguage(
    @Param("languageId") languageId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.admin.deleteLanguage(
      req.authz!.workspaceId,
      languageId,
      req.auth!.sub,
      optionalString(body?.reason),
    );
    return { ok: true };
  }

  @Post("languages/:languageId/activate")
  @CheckAbility("languages:status")
  @ApiOperation({ summary: "[admin] Reactivate a language" })
  @ApiParam({ name: "languageId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activateLanguage(
    @Param("languageId") languageId: string,
    @Req() req: Request,
  ) {
    await this.admin.activateLanguage(
      req.authz!.workspaceId,
      languageId,
      req.auth!.sub,
    );
    return { ok: true };
  }

  @Post("languages/:languageId/deactivate")
  @CheckAbility("languages:status")
  @ApiOperation({ summary: "[admin] Deactivate a language" })
  @ApiParam({ name: "languageId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivateLanguage(
    @Param("languageId") languageId: string,
    @Req() req: Request,
  ) {
    await this.admin.deactivateLanguage(
      req.authz!.workspaceId,
      languageId,
      req.auth!.sub,
    );
    return { ok: true };
  }

  // ---- customers ----
  // End-users managed by admins — no login capability, not related to the RBAC User model above.

  @Get("customers")
  @CheckAbility("customers:read")
  @ApiOperation({ summary: "[admin] List this workspace's customers" })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Matches name/email/username/phone",
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
  @ApiQuery({
    name: "activeOnly",
    required: false,
    type: Boolean,
    description:
      "Pass true for a picker/dropdown — false or omitted returns everything, active or not.",
  })
  @ApiResponse({ status: 200, type: CustomerListResponseDto })
  async listCustomers(
    @Req() req: Request,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.admin.listCustomers(req.authz!.workspaceId, {
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
  async createCustomer(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.admin.createCustomer(
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
  @ApiOperation({
    summary: "[admin] Fetch a single customer from this workspace",
  })
  @ApiParam({ name: "customerId" })
  @ApiResponse({ status: 200, type: CustomerSummaryDto })
  async getCustomer(
    @Param("customerId") customerId: string,
    @Req() req: Request,
  ) {
    return this.admin.getCustomer(req.authz!.workspaceId, customerId);
  }

  @Patch("customers/:customerId")
  @CheckAbility("customers:manage")
  @ApiOperation({ summary: "[admin] Edit a customer in this workspace" })
  @ApiParam({ name: "customerId" })
  @ApiBody({ type: UpdateCustomerDto })
  @ApiResponse({ status: 200, type: CustomerSummaryDto })
  async updateCustomer(
    @Param("customerId") customerId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.admin.updateCustomer(
      req.authz!.workspaceId,
      customerId,
      {
        email: optionalString(body.email),
        firstName:
          body.firstName === null ? null : optionalString(body.firstName),
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
  @ApiOperation({
    summary: "[admin] Delete a customer from this workspace",
    description:
      "Soft-delete: the row survives for audit purposes and stops appearing in listings.",
  })
  @ApiParam({ name: "customerId" })
  @ApiBody({ type: DeleteReasonDto, required: false })
  @ApiResponse({ status: 200, type: OkResponseDto })
  async deleteCustomer(
    @Param("customerId") customerId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.admin.deleteCustomer(
      req.authz!.workspaceId,
      customerId,
      req.auth!.sub,
      optionalString(body?.reason),
    );
    return { ok: true };
  }

  @Post("customers/:customerId/activate")
  @CheckAbility("customers:status")
  @ApiOperation({ summary: "[admin] Reactivate a customer" })
  @ApiParam({ name: "customerId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async activateCustomer(
    @Param("customerId") customerId: string,
    @Req() req: Request,
  ) {
    await this.admin.activateCustomer(
      req.authz!.workspaceId,
      customerId,
      req.auth!.sub,
    );
    return { ok: true };
  }

  @Post("customers/:customerId/deactivate")
  @CheckAbility("customers:status")
  @ApiOperation({ summary: "[admin] Deactivate a customer" })
  @ApiParam({ name: "customerId" })
  @ApiResponse({ status: 201, type: OkResponseDto })
  async deactivateCustomer(
    @Param("customerId") customerId: string,
    @Req() req: Request,
  ) {
    await this.admin.deactivateCustomer(
      req.authz!.workspaceId,
      customerId,
      req.auth!.sub,
    );
    return { ok: true };
  }
}
