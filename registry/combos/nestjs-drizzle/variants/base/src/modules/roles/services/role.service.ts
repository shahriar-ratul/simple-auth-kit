import { Inject, Injectable } from "@nestjs/common";
import {
  RbacRepository,
  RoleSummary,
} from "../../auth/repositories/rbac.repository";

/** Thin wrapper over RbacRepository's role-catalog methods — see the note on AdminController for why RbacRepository itself isn't split. */
@Injectable()
export class RoleService {
  constructor(@Inject(RbacRepository) private readonly rbac: RbacRepository) {}

  async listRoles(): Promise<{ roles: RoleSummary[] }> {
    return { roles: await this.rbac.listRoles() };
  }

  async createRole(
    input: {
      slug: string;
      name?: string;
      displayName?: string;
      description?: string | null;
      isDefault?: boolean;
      isActive?: boolean;
    },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    return this.rbac.createRole(input, actorUserId);
  }

  async updateRole(
    roleId: string,
    input: {
      name?: string;
      displayName?: string;
      description?: string | null;
      isDefault?: boolean;
      isActive?: boolean;
    },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    return this.rbac.updateRole(roleId, input, actorUserId);
  }

  async deleteRole(
    roleId: string,
    actorUserId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.rbac.deleteRole(roleId, actorUserId, reason);
  }

  async attachPermissionToRole(
    roleId: string,
    permissionSlug: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.rbac.attachPermissionToRole(roleId, permissionSlug, actorUserId);
  }
}
