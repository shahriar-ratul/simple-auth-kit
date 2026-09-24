import { Inject, Injectable } from "@nestjs/common";
import { hashPassword } from "@/lib/auth/core/crypto";
import { blockUser, deactivateUser } from "@/lib/auth/core/session-policy";
import type { Revoker } from "@/lib/auth/core/types";
import { PrismaService } from "@/modules/prisma/prisma.service";
import { AuditLogRepository } from "@/common/repositories/audit-log.repository";
import {
  CountryInput,
  CountryListFilter,
  CountryListResult,
  CountryRepository,
  CountrySummary,
} from "@/common/repositories/country.repository";
import {
  CustomerInput,
  CustomerListFilter,
  CustomerListResult,
  CustomerRepository,
  CustomerSummary,
} from "@/common/repositories/customer.repository";
import {
  LanguageInput,
  LanguageListFilter,
  LanguageListResult,
  LanguageRepository,
  LanguageSummary,
} from "@/common/repositories/language.repository";
import {
  RbacRepository,
  toUserSummary,
  UserListFilter,
  UserListResult,
  UserSummary,
} from "@/common/repositories/rbac.repository";
import { SessionRepository } from "@/common/repositories/session.repository";
import { toId, toIdOrNull } from "@/common/helpers/id.helper";
import { bumpAuthzVersion } from "@/common/auth/cache/authz-version";

/**
 * User management, block/unblock/deactivate/activate, user-scoped role/permission assignment,
 * and countries/languages/customers (unrelated to RBAC, kept here — see AdminController's note).
 * Role/permission *catalog* management lives in RoleService/PermissionService instead.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(AuditLogRepository) private readonly auditLog: AuditLogRepository,
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
    @Inject(CountryRepository) private readonly countries: CountryRepository,
    @Inject(LanguageRepository) private readonly languages: LanguageRepository,
    @Inject(CustomerRepository) private readonly customers: CustomerRepository,
  ) {}

  async listUsers(filter: UserListFilter): Promise<UserListResult> {
    const { items, meta } = await this.rbac.listUsers(filter);
    return { items: items.map(toUserSummary), meta };
  }

  async getUser(userId: string): Promise<UserSummary> {
    return this.rbac.getUser(userId);
  }

  async createUser(
    input: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
      phone?: string;
      username?: string;
      photo?: string;
      dob?: string;
      gender?: string;
      joinedDate?: string;
      isActive?: boolean;
      roles?: string[];
    },
    actorUserId: string | null,
  ): Promise<UserSummary> {
    const passwordHash = await hashPassword(input.password);
    return this.rbac.createUser({ ...input, passwordHash }, actorUserId);
  }

  async updateUser(
    userId: string,
    input: {
      firstName?: string | null;
      lastName?: string | null;
      displayName?: string | null;
      phone?: string | null;
      username?: string | null;
      photo?: string | null;
      dob?: string | null;
      gender?: string | null;
      joinedDate?: string;
    },
    actorUserId: string | null,
  ): Promise<UserSummary> {
    return this.rbac.updateUser(userId, input, actorUserId);
  }

  async deleteUser(
    userId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.rbac.deleteUser(userId, actorUserId, reason);
  }

  async assignRole(userId: string, roleSlug: string): Promise<void> {
    await this.rbac.assignRoleToUser(userId, roleSlug);
    await this.auditLog.append({
      type: "role_assigned",
      userId,
      role: roleSlug,
    });
  }

  async revokeRole(userId: string, roleSlug: string): Promise<void> {
    await this.rbac.revokeRoleFromUser(userId, roleSlug);
    await this.auditLog.append({
      type: "role_revoked",
      userId,
      role: roleSlug,
    });
  }

  async grantPermission(
    userId: string,
    permissionSlug: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.rbac.grantPermissionToUser(userId, permissionSlug, actorUserId);
    await this.auditLog.append({
      type: "permission_granted",
      userId,
      permission: permissionSlug,
    });
  }

  async revokePermission(
    userId: string,
    permissionSlug: string,
  ): Promise<void> {
    await this.rbac.revokePermissionFromUser(userId, permissionSlug);
    await this.auditLog.append({
      type: "permission_revoked",
      userId,
      permission: permissionSlug,
    });
  }

  async block(userId: string, revoker?: Revoker): Promise<void> {
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { blocked: true, updatedBy: toIdOrNull(revoker?.userId) },
    });
    await bumpAuthzVersion(this.prisma);
    await blockUser(this.sessions, userId, revoker);
  }

  async unblock(userId: string, revoker?: Revoker): Promise<void> {
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { blocked: false, updatedBy: toIdOrNull(revoker?.userId) },
    });
  }

  /**
   * A routine administrative on/off toggle — distinct from `block`/`unblock`, which is a
   * security/moderation action. Both independently deny login; see the note on the `User` model.
   */
  async deactivate(userId: string, revoker?: Revoker): Promise<void> {
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { isActive: false, updatedBy: toIdOrNull(revoker?.userId) },
    });
    await bumpAuthzVersion(this.prisma);
    await deactivateUser(this.sessions, userId, revoker);
  }

  async activate(userId: string, revoker?: Revoker): Promise<void> {
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { isActive: true, updatedBy: toIdOrNull(revoker?.userId) },
    });
  }

  // ---- countries ----

  async listCountries(filter: CountryListFilter): Promise<CountryListResult> {
    return this.countries.list(filter);
  }

  async getCountry(countryId: string): Promise<CountrySummary> {
    return this.countries.get(countryId);
  }

  async createCountry(
    input: CountryInput,
    actorUserId: string | null,
  ): Promise<CountrySummary> {
    return this.countries.create(input, actorUserId);
  }

  async updateCountry(
    countryId: string,
    input: Partial<CountryInput>,
    actorUserId: string | null,
  ): Promise<CountrySummary> {
    return this.countries.update(countryId, input, actorUserId);
  }

  async deleteCountry(
    countryId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.countries.delete(countryId, actorUserId, reason);
  }

  async activateCountry(
    countryId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.countries.setActive(countryId, true, actorUserId);
  }

  async deactivateCountry(
    countryId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.countries.setActive(countryId, false, actorUserId);
  }

  // ---- languages ----

  async listLanguages(filter: LanguageListFilter): Promise<LanguageListResult> {
    return this.languages.list(filter);
  }

  async getLanguage(languageId: string): Promise<LanguageSummary> {
    return this.languages.get(languageId);
  }

  async createLanguage(
    input: LanguageInput,
    actorUserId: string | null,
  ): Promise<LanguageSummary> {
    return this.languages.create(input, actorUserId);
  }

  async updateLanguage(
    languageId: string,
    input: Partial<LanguageInput>,
    actorUserId: string | null,
  ): Promise<LanguageSummary> {
    return this.languages.update(languageId, input, actorUserId);
  }

  async deleteLanguage(
    languageId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.languages.delete(languageId, actorUserId, reason);
  }

  async activateLanguage(
    languageId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.languages.setActive(languageId, true, actorUserId);
  }

  async deactivateLanguage(
    languageId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.languages.setActive(languageId, false, actorUserId);
  }

  // ---- customers ----
  // End-users managed by admins — no login capability, not related to the RBAC `User` model above.

  async listCustomers(filter: CustomerListFilter): Promise<CustomerListResult> {
    return this.customers.list(filter);
  }

  async getCustomer(customerId: string): Promise<CustomerSummary> {
    return this.customers.get(customerId);
  }

  async createCustomer(
    input: CustomerInput,
    actorUserId: string | null,
  ): Promise<CustomerSummary> {
    return this.customers.create(input, actorUserId);
  }

  async updateCustomer(
    customerId: string,
    input: Partial<CustomerInput>,
    actorUserId: string | null,
  ): Promise<CustomerSummary> {
    return this.customers.update(customerId, input, actorUserId);
  }

  async deleteCustomer(
    customerId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.customers.delete(customerId, actorUserId, reason);
  }

  async activateCustomer(
    customerId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.customers.setActive(customerId, true, actorUserId);
  }

  async deactivateCustomer(
    customerId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.customers.setActive(customerId, false, actorUserId);
  }
}
