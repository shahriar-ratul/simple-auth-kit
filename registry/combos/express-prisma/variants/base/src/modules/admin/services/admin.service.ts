import { hashPassword } from "@/lib/auth/core/crypto";
import { blockUser, deactivateUser } from "@/lib/auth/core/session-policy";
import type { Revoker } from "@/lib/auth/core/types";
import { PrismaClient } from "@/database/generated/prisma/client";
import {
  RbacRepository,
  toUserSummary,
  UserListFilter,
  UserListResult,
  UserSummary,
} from "@/modules/auth/repositories/rbac.repository";
import { SessionRepository } from "@/modules/auth/repositories/session.repository";
import { toId, toIdOrNull } from "@/common/helpers/id.helper";

/**
 * User management, block/unblock/deactivate/activate, and user-scoped role/permission
 * assignment — everything `admin.router.ts` mounts at `/admin`. Role/permission *catalog*
 * management lives in RoleService/PermissionService instead; audit log listing in
 * AuditLogService. See the note on RbacRepository (rbac.repository.ts) for why it isn't split
 * the same way the router/service layer is: every one of these services takes the same instance
 * as a constructor dependency, exactly like `admin.router.ts` used to take `AuthService`.
 */
export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessions: SessionRepository,
    private readonly rbac: RbacRepository,
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
    await this.sessions.appendAuditEvent({
      type: "role_assigned",
      userId,
      role: roleSlug,
    });
  }

  async revokeRole(userId: string, roleSlug: string): Promise<void> {
    await this.rbac.revokeRoleFromUser(userId, roleSlug);
    await this.sessions.appendAuditEvent({
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
    await this.sessions.appendAuditEvent({
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
    await this.sessions.appendAuditEvent({
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
    // The administrator, not the blocked user, is what lands in `sessions.revoked_by`.
    await blockUser(this.sessions, userId, revoker);
    // Belt and braces. The block is enforced on the authentication path — login and refresh both
    // refuse a blocked user, and AuthGuard never consults the permission cache — so a warm entry
    // cannot defeat it. Dropping the entry anyway means nothing about a blocked account is being
    // served from memory.
    await this.rbac.invalidateUser(userId);
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
    await deactivateUser(this.sessions, userId, revoker);
    await this.rbac.invalidateUser(userId);
  }

  async activate(userId: string, revoker?: Revoker): Promise<void> {
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { isActive: true, updatedBy: toIdOrNull(revoker?.userId) },
    });
  }
}
