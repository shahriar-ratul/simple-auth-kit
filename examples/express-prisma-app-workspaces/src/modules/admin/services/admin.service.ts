import { hashPassword } from '@/core/crypto';
import { blockUser, deactivateUser } from '@/core/session-policy';
import type { Revoker } from '@/core/types';
import { PrismaClient } from '@/database/generated/prisma/client';
import type { AuthzContext } from '@/common/auth/middleware/authz.middleware';
import { AuditLogRepository } from '@/common/repositories/audit-log.repository';
import {
  MemberListFilter,
  MemberListResult,
  MemberSummary,
  RbacRepository,
  toMemberSummary,
} from '@/common/repositories/rbac.repository';
import { SessionRepository } from '@/common/repositories/session.repository';
import { WorkspaceRepository } from '@/common/repositories/workspace.repository';
import { toId, toIdOrNull } from '@/common/helpers/id.helper';

/**
 * Member management, block/unblock/deactivate/activate, and member-scoped role/permission
 * assignment — everything `admin.router.ts` mounts at `/admin`. Role/permission *catalog*
 * management lives in RoleService/PermissionService instead; audit log listing in
 * AuditLogService. Every method takes the caller's AuthzContext and reaches the database through
 * a workspace-scoped query — an admin of one workspace has no expressible way to name a row in
 * another. See the note on RbacRepository (rbac.repository.ts) for why it isn't split the same
 * way the router/service layer is: every one of these services takes the same instance as a
 * constructor dependency, exactly like `admin.router.ts` used to take `AuthService`.
 */
export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessions: SessionRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly rbac: RbacRepository,
    private readonly workspaces: WorkspaceRepository,
  ) {}

  async listUsers(ctx: AuthzContext, filter: MemberListFilter): Promise<MemberListResult> {
    const { items, meta } = await this.rbac.listMembers(ctx.workspaceId, filter);
    return { items: items.map(toMemberSummary), meta };
  }

  async getUser(ctx: AuthzContext, userId: string): Promise<MemberSummary> {
    return this.rbac.getMember(ctx.workspaceId, userId);
  }

  // No invitation email — the account is usable immediately with the password given here.
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

  // Soft-delete: the row survives for audit purposes, stops appearing in listings, and can no
  // longer authenticate. This disables the account across every workspace it belongs to, not
  // just this one — the same reach `block` already has.
  async deleteUser(ctx: AuthzContext, userId: string, actorUserId: string | null, reason?: string): Promise<void> {
    await this.rbac.deleteMember(ctx.workspaceId, userId, actorUserId, reason);
  }

  async assignRole(ctx: AuthzContext, userId: string, roleSlug: string): Promise<void> {
    await this.rbac.assignRoleToMember(ctx.workspaceId, userId, roleSlug);
    await this.auditLog.append({ type: 'role_assigned', userId, role: roleSlug }, { workspaceId: ctx.workspaceId });
  }

  async revokeRole(ctx: AuthzContext, userId: string, roleSlug: string): Promise<void> {
    await this.rbac.revokeRoleFromMember(ctx.workspaceId, userId, roleSlug);
    await this.auditLog.append({ type: 'role_revoked', userId, role: roleSlug }, { workspaceId: ctx.workspaceId });
  }

  async grantPermission(
    ctx: AuthzContext,
    userId: string,
    permissionSlug: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.rbac.grantPermissionToMember(ctx.workspaceId, userId, permissionSlug, actorUserId);
    await this.auditLog.append(
      { type: 'permission_granted', userId, permission: permissionSlug },
      { workspaceId: ctx.workspaceId },
    );
  }

  async revokePermission(ctx: AuthzContext, userId: string, permissionSlug: string): Promise<void> {
    await this.rbac.revokePermissionFromMember(ctx.workspaceId, userId, permissionSlug);
    await this.auditLog.append(
      { type: 'permission_revoked', userId, permission: permissionSlug },
      { workspaceId: ctx.workspaceId },
    );
  }

  /**
   * Blocking is an account-level action, so it is gated on the target being a member of the
   * caller's workspace — otherwise an admin of one workspace could disable an account they
   * have no relationship with.
   */
  async block(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { blocked: true, updatedBy: toIdOrNull(revoker?.userId) },
    });
    // The administrator, not the blocked user, is what lands in `sessions.revoked_by`.
    await blockUser(this.sessions, userId, revoker);
  }

  async unblock(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
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
  async deactivate(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { isActive: false, updatedBy: toIdOrNull(revoker?.userId) },
    });
    await deactivateUser(this.sessions, userId, revoker);
  }

  async activate(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { isActive: true, updatedBy: toIdOrNull(revoker?.userId) },
    });
  }
}
