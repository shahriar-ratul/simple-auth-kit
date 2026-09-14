import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/core/crypto';
import { blockUser, deactivateUser } from '@/core/session-policy';
import type { Revoker } from '@/core/types';
import { DRIZZLE_DB, type Database } from '@/common/config/db';
import { AuditLogRepository } from '@/modules/audit-log/repositories/audit-log.repository';
import {
  RbacRepository,
  toUserSummary,
  UserListFilter,
  UserListResult,
  UserSummary,
} from '@/modules/auth/repositories/rbac.repository';
import { SessionRepository } from '@/modules/auth/repositories/session.repository';
import { users } from '@/database/schema';
import { toId, toIdOrNull } from '@/common/helpers/id.helper';

/**
 * User management, block/unblock/deactivate/activate, and user-scoped role/permission
 * assignment. Role/permission *catalog* management lives in RoleService/PermissionService
 * instead.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(AuditLogRepository) private readonly auditLog: AuditLogRepository,
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
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

  async deleteUser(userId: string, actorUserId: string | null, reason?: string): Promise<void> {
    await this.rbac.deleteUser(userId, actorUserId, reason);
  }

  async assignRole(userId: string, roleSlug: string): Promise<void> {
    await this.rbac.assignRoleToUser(userId, roleSlug);
    await this.auditLog.append({
      type: 'role_assigned',
      userId,
      role: roleSlug,
    });
  }

  async revokeRole(userId: string, roleSlug: string): Promise<void> {
    await this.rbac.revokeRoleFromUser(userId, roleSlug);
    await this.auditLog.append({
      type: 'role_revoked',
      userId,
      role: roleSlug,
    });
  }

  async grantPermission(userId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    await this.rbac.grantPermissionToUser(userId, permissionSlug, actorUserId);
    await this.auditLog.append({
      type: 'permission_granted',
      userId,
      permission: permissionSlug,
    });
  }

  async revokePermission(userId: string, permissionSlug: string): Promise<void> {
    await this.rbac.revokePermissionFromUser(userId, permissionSlug);
    await this.auditLog.append({
      type: 'permission_revoked',
      userId,
      permission: permissionSlug,
    });
  }

  async block(userId: string, revoker?: Revoker): Promise<void> {
    await this.db
      .update(users)
      .set({ blocked: true, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
    await blockUser(this.sessions, userId, revoker);
    // Belt and braces: the block is already enforced on the authentication path, but drop the
    // cache entry anyway so nothing about a blocked account is served from memory.
    await this.rbac.invalidateUser(userId);
  }

  async unblock(userId: string, revoker?: Revoker): Promise<void> {
    await this.db
      .update(users)
      .set({ blocked: false, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
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
    await deactivateUser(this.sessions, userId, revoker);
    await this.rbac.invalidateUser(userId);
  }

  async activate(userId: string, revoker?: Revoker): Promise<void> {
    await this.db
      .update(users)
      .set({ isActive: true, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
  }
}
