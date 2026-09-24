import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/core/crypto";
import { blockUser, deactivateUser } from "@/lib/auth/core/session-policy";
import type { Revoker } from "@/lib/auth/core/types";
import type { Database } from "@/common/config/db";
import {
  RbacRepository,
  toUserSummary,
  UserListFilter,
  UserListResult,
  UserSummary,
} from "@/common/repositories/rbac.repository";
import { SessionRepository } from "@/common/repositories/session.repository";
import { users } from "@/database/schema";
import { toId, toIdOrNull } from "@/common/helpers/id.helper";
import { bumpAuthzVersion } from "@/common/auth/cache/authz-version";

/**
 * User management, block/unblock/deactivate/activate, and user-scoped role/permission
 * assignment. Role/permission *catalog* management lives in RolesService/PermissionsService
 * instead — see the note on `createAdminRouter`. `RbacRepository` is not split (security-critical,
 * used by `authz.middleware.ts` on every request); this service just takes it as a dependency,
 * same as the other new domain services do.
 */
export class AdminService {
  constructor(
    private readonly db: Database,
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

  /** Provisions an account directly — no invitation email, the account is usable immediately with the password given here. */
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
    await this.db
      .update(users)
      .set({ blocked: true, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
    await bumpAuthzVersion(this.db);
    // The administrator, not the blocked user, is what lands in `sessions.revoked_by`.
    await blockUser(this.sessions, userId, revoker);
  }

  async unblock(userId: string, revoker?: Revoker): Promise<void> {
    await this.db
      .update(users)
      .set({ blocked: false, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
    await bumpAuthzVersion(this.db);
  }

  /**
   * A routine administrative on/off toggle — distinct from `block`/`unblock`, which is a
   * security/moderation action. Both independently deny login; see the note on the `users` table.
   */
  async deactivate(userId: string, revoker?: Revoker): Promise<void> {
    await this.db
      .update(users)
      .set({ isActive: false, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
    await bumpAuthzVersion(this.db);
    await deactivateUser(this.sessions, userId, revoker);
  }

  async activate(userId: string, revoker?: Revoker): Promise<void> {
    await this.db
      .update(users)
      .set({ isActive: true, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
    await bumpAuthzVersion(this.db);
  }
}
