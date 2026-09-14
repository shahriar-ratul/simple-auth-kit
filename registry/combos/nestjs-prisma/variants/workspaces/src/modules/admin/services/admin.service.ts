import { Inject, Injectable } from "@nestjs/common";
import { hashPassword } from "@/lib/auth/core/crypto";
import { blockUser, deactivateUser } from "@/lib/auth/core/session-policy";
import type { Revoker } from "@/lib/auth/core/types";
import { PrismaService } from "@/modules/prisma/prisma.service";
import type { AuthzContext } from "@/common/auth/guards/authz.guard";
import { AuditLogRepository } from "@/modules/audit-log/repositories/audit-log.repository";
import {
  CountryInput,
  CountryListFilter,
  CountryListResult,
  CountryRepository,
  CountrySummary,
} from "@/modules/admin/repositories/country.repository";
import {
  CustomerInput,
  CustomerListFilter,
  CustomerListResult,
  CustomerRepository,
  CustomerSummary,
} from "@/modules/admin/repositories/customer.repository";
import {
  LanguageInput,
  LanguageListFilter,
  LanguageListResult,
  LanguageRepository,
  LanguageSummary,
} from "@/modules/admin/repositories/language.repository";
import {
  MemberListFilter,
  MemberListResult,
  MemberSummary,
  RbacRepository,
  toMemberSummary,
} from "@/modules/auth/repositories/rbac.repository";
import { SessionRepository } from "@/modules/auth/repositories/session.repository";
import { WorkspaceRepository } from "@/modules/auth/repositories/workspace.repository";
import { toId, toIdOrNull } from "@/common/helpers/id.helper";

/**
 * Member management, block/unblock/deactivate/activate, member-scoped role/permission
 * assignment, and countries/languages/customers (unrelated to RBAC, kept here — see
 * AdminController's note). Role/permission *catalog* management lives in RoleService/
 * PermissionService instead. Every method takes the caller's AuthzContext and reaches the
 * database through a workspace-scoped query — an admin of one workspace has no expressible way
 * to name a row in another.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(AuditLogRepository) private readonly auditLog: AuditLogRepository,
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
    @Inject(WorkspaceRepository)
    private readonly workspaces: WorkspaceRepository,
    @Inject(CountryRepository) private readonly countries: CountryRepository,
    @Inject(LanguageRepository) private readonly languages: LanguageRepository,
    @Inject(CustomerRepository) private readonly customers: CustomerRepository,
  ) {}

  async listUsers(
    ctx: AuthzContext,
    filter: MemberListFilter,
  ): Promise<MemberListResult> {
    const { items, meta } = await this.rbac.listMembers(
      ctx.workspaceId,
      filter,
    );
    return { items: items.map(toMemberSummary), meta };
  }

  async getUser(ctx: AuthzContext, userId: string): Promise<MemberSummary> {
    return this.rbac.getMember(ctx.workspaceId, userId);
  }

  async createUser(
    ctx: AuthzContext,
    input: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
      phone?: string;
      username?: string;
      photo?: string;
      roles?: string[];
    },
    actorUserId: string | null,
  ): Promise<MemberSummary> {
    const passwordHash = await hashPassword(input.password);
    const member = await this.workspaces.createMember(
      ctx.workspaceId,
      {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        phone: input.phone,
        username: input.username,
        photo: input.photo,
        roles: input.roles,
      },
      actorUserId,
    );
    return this.rbac.getMember(ctx.workspaceId, member.userId);
  }

  async updateUser(
    ctx: AuthzContext,
    userId: string,
    input: {
      firstName?: string | null;
      lastName?: string | null;
      displayName?: string | null;
      phone?: string | null;
      username?: string | null;
      photo?: string | null;
    },
    actorUserId: string | null,
  ): Promise<MemberSummary> {
    return this.rbac.updateMember(ctx.workspaceId, userId, input, actorUserId);
  }

  async deleteUser(
    ctx: AuthzContext,
    userId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.rbac.deleteMember(ctx.workspaceId, userId, actorUserId, reason);
  }

  async assignRole(
    ctx: AuthzContext,
    userId: string,
    roleSlug: string,
  ): Promise<void> {
    await this.rbac.assignRoleToMember(ctx.workspaceId, userId, roleSlug);
    await this.auditLog.append(
      { type: "role_assigned", userId, role: roleSlug },
      { workspaceId: ctx.workspaceId },
    );
  }

  async revokeRole(
    ctx: AuthzContext,
    userId: string,
    roleSlug: string,
  ): Promise<void> {
    await this.rbac.revokeRoleFromMember(ctx.workspaceId, userId, roleSlug);
    await this.auditLog.append(
      { type: "role_revoked", userId, role: roleSlug },
      { workspaceId: ctx.workspaceId },
    );
  }

  async grantPermission(
    ctx: AuthzContext,
    userId: string,
    permissionSlug: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.rbac.grantPermissionToMember(
      ctx.workspaceId,
      userId,
      permissionSlug,
      actorUserId,
    );
    await this.auditLog.append(
      { type: "permission_granted", userId, permission: permissionSlug },
      { workspaceId: ctx.workspaceId },
    );
  }

  async revokePermission(
    ctx: AuthzContext,
    userId: string,
    permissionSlug: string,
  ): Promise<void> {
    await this.rbac.revokePermissionFromMember(
      ctx.workspaceId,
      userId,
      permissionSlug,
    );
    await this.auditLog.append(
      { type: "permission_revoked", userId, permission: permissionSlug },
      { workspaceId: ctx.workspaceId },
    );
  }

  // Gated on the target being a member of the caller's workspace — otherwise an admin of one
  // workspace could disable an account they have no relationship with.
  async block(
    ctx: AuthzContext,
    userId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { blocked: true, updatedBy: toIdOrNull(revoker?.userId) },
    });
    await blockUser(this.sessions, userId, revoker);
    // Belt and braces: the block is already enforced on the authentication path, but drop the
    // cache entry anyway so nothing about a blocked account is served from memory.
    await this.rbac.invalidateMember(userId, ctx.workspaceId);
  }

  async unblock(
    ctx: AuthzContext,
    userId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { blocked: false, updatedBy: toIdOrNull(revoker?.userId) },
    });
  }

  /**
   * A routine administrative on/off toggle — distinct from `block`/`unblock`, which is a
   * security/moderation action. Both independently deny login; see the note on the `User` model.
   */
  async deactivate(
    ctx: AuthzContext,
    userId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { isActive: false, updatedBy: toIdOrNull(revoker?.userId) },
    });
    await deactivateUser(this.sessions, userId, revoker);
    await this.rbac.invalidateMember(userId, ctx.workspaceId);
  }

  async activate(
    ctx: AuthzContext,
    userId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { isActive: true, updatedBy: toIdOrNull(revoker?.userId) },
    });
  }

  // ---- countries ----

  async listCountries(
    workspaceId: string,
    filter: CountryListFilter,
  ): Promise<CountryListResult> {
    return this.countries.list(workspaceId, filter);
  }

  async getCountry(
    workspaceId: string,
    countryId: string,
  ): Promise<CountrySummary> {
    return this.countries.get(workspaceId, countryId);
  }

  async createCountry(
    workspaceId: string,
    input: CountryInput,
    actorUserId: string | null,
  ): Promise<CountrySummary> {
    return this.countries.create(workspaceId, input, actorUserId);
  }

  async updateCountry(
    workspaceId: string,
    countryId: string,
    input: Partial<CountryInput>,
    actorUserId: string | null,
  ): Promise<CountrySummary> {
    return this.countries.update(workspaceId, countryId, input, actorUserId);
  }

  async deleteCountry(
    workspaceId: string,
    countryId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.countries.delete(workspaceId, countryId, actorUserId, reason);
  }

  async activateCountry(
    workspaceId: string,
    countryId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.countries.setActive(workspaceId, countryId, true, actorUserId);
  }

  async deactivateCountry(
    workspaceId: string,
    countryId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.countries.setActive(workspaceId, countryId, false, actorUserId);
  }

  // ---- languages ----

  async listLanguages(
    workspaceId: string,
    filter: LanguageListFilter,
  ): Promise<LanguageListResult> {
    return this.languages.list(workspaceId, filter);
  }

  async getLanguage(
    workspaceId: string,
    languageId: string,
  ): Promise<LanguageSummary> {
    return this.languages.get(workspaceId, languageId);
  }

  async createLanguage(
    workspaceId: string,
    input: LanguageInput,
    actorUserId: string | null,
  ): Promise<LanguageSummary> {
    return this.languages.create(workspaceId, input, actorUserId);
  }

  async updateLanguage(
    workspaceId: string,
    languageId: string,
    input: Partial<LanguageInput>,
    actorUserId: string | null,
  ): Promise<LanguageSummary> {
    return this.languages.update(workspaceId, languageId, input, actorUserId);
  }

  async deleteLanguage(
    workspaceId: string,
    languageId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.languages.delete(workspaceId, languageId, actorUserId, reason);
  }

  async activateLanguage(
    workspaceId: string,
    languageId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.languages.setActive(workspaceId, languageId, true, actorUserId);
  }

  async deactivateLanguage(
    workspaceId: string,
    languageId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.languages.setActive(workspaceId, languageId, false, actorUserId);
  }

  // ---- customers ----
  // End-users managed by admins — no login capability, not related to the RBAC `WorkspaceMember` above.

  async listCustomers(
    workspaceId: string,
    filter: CustomerListFilter,
  ): Promise<CustomerListResult> {
    return this.customers.list(workspaceId, filter);
  }

  async getCustomer(
    workspaceId: string,
    customerId: string,
  ): Promise<CustomerSummary> {
    return this.customers.get(workspaceId, customerId);
  }

  async createCustomer(
    workspaceId: string,
    input: CustomerInput,
    actorUserId: string | null,
  ): Promise<CustomerSummary> {
    return this.customers.create(workspaceId, input, actorUserId);
  }

  async updateCustomer(
    workspaceId: string,
    customerId: string,
    input: Partial<CustomerInput>,
    actorUserId: string | null,
  ): Promise<CustomerSummary> {
    return this.customers.update(workspaceId, customerId, input, actorUserId);
  }

  async deleteCustomer(
    workspaceId: string,
    customerId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.customers.delete(workspaceId, customerId, actorUserId, reason);
  }

  async activateCustomer(
    workspaceId: string,
    customerId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.customers.setActive(workspaceId, customerId, true, actorUserId);
  }

  async deactivateCustomer(
    workspaceId: string,
    customerId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.customers.setActive(workspaceId, customerId, false, actorUserId);
  }
}
