import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { blockUser, deactivateUser } from "@/core/session-policy.js";
import type { Revoker } from "@/core/types.js";
import { DRIZZLE_DB, type Database } from "../../../common/config/db.js";
import type { AuthzContext } from "../../../common/auth/guards/authz.guard.js";
import { AuditLogRepository } from "../../audit-log/repositories/audit-log.repository.js";
import {
  MemberListFilter,
  MemberListResult,
  MemberSummary,
  RbacRepository,
  toMemberSummary,
} from "../../auth/repositories/rbac.repository.js";
import { SessionRepository } from "../../auth/repositories/session.repository.js";
import { users } from "@/database/schema.js";
import { toId, toIdOrNull } from "../../../common/helpers/id.helper.js";

/**
 * Member management, block/unblock/deactivate/activate, and member-scoped role/permission
 * assignment — all workspace-scoped, see the note on AdminController. Role/permission *catalog*
 * management lives in RoleService/PermissionService instead.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(AuditLogRepository) private readonly auditLog: AuditLogRepository,
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
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

  /**
   * Blocking is an account-level action, so it is gated on the target being a member of the
   * caller's workspace — otherwise an admin of one workspace could disable an account they
   * have no relationship with.
   */
  async block(
    ctx: AuthzContext,
    userId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.db
      .update(users)
      .set({ blocked: true, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
    // The administrator, not the blocked user, is what lands in `sessions.revoked_by`.
    await blockUser(this.sessions, userId, revoker);
    // Belt and braces. The block is enforced on the authentication path — login and refresh both
    // refuse a blocked user, and AuthGuard never consults the permission cache — so a warm entry
    // cannot defeat it. Dropping the entry anyway means nothing about a blocked account is being
    // served from memory.
    await this.rbac.invalidateMember(userId, ctx.workspaceId);
  }

  async unblock(
    ctx: AuthzContext,
    userId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.db
      .update(users)
      .set({ blocked: false, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
  }

  /**
   * A routine administrative on/off toggle — distinct from `block`/`unblock`, which is a
   * security/moderation action. Both independently deny login; see the note on the `users` table.
   */
  async deactivate(
    ctx: AuthzContext,
    userId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.db
      .update(users)
      .set({ isActive: false, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
    await deactivateUser(this.sessions, userId, revoker);
    await this.rbac.invalidateMember(userId, ctx.workspaceId);
  }

  async activate(
    ctx: AuthzContext,
    userId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.db
      .update(users)
      .set({ isActive: true, updatedBy: toIdOrNull(revoker?.userId) })
      .where(eq(users.id, toId(userId)));
  }
}
