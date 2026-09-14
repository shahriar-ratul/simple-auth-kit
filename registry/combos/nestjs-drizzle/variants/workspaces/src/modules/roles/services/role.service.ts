import { Inject, Injectable } from "@nestjs/common";
import type { AuthzContext } from "@/common/auth/guards/authz.guard";
import {
  RbacRepository,
  RoleSummary,
} from "@/modules/auth/repositories/rbac.repository";

/** Thin wrapper over RbacRepository's role-catalog methods — see the note on AdminController for why RbacRepository itself isn't split. */
@Injectable()
export class RoleService {
  constructor(@Inject(RbacRepository) private readonly rbac: RbacRepository) {}

  async listRoles(ctx: AuthzContext): Promise<{ roles: RoleSummary[] }> {
    return { roles: await this.rbac.listRoles(ctx.workspaceId) };
  }

  async createRole(
    ctx: AuthzContext,
    input: {
      slug: string;
      name?: string;
      displayName?: string;
      description?: string | null;
    },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    return this.rbac.createRole(ctx.workspaceId, input, actorUserId);
  }

  async updateRole(
    ctx: AuthzContext,
    roleId: string,
    input: {
      name?: string;
      displayName?: string;
      description?: string | null;
      isActive?: boolean;
    },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    return this.rbac.updateRole(ctx.workspaceId, roleId, input, actorUserId);
  }

  async deleteRole(
    ctx: AuthzContext,
    roleId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.rbac.deleteRole(ctx.workspaceId, roleId, actorUserId, reason);
  }

  async attachPermissionToRole(
    ctx: AuthzContext,
    roleId: string,
    permissionSlug: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.rbac.attachPermissionToRole(
      ctx.workspaceId,
      roleId,
      permissionSlug,
      actorUserId,
    );
  }
}
