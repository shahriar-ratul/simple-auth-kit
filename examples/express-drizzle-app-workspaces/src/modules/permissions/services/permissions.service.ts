import { PermissionInput, PermissionSummary, RbacRepository } from '../../auth/repositories/rbac.repository';

/**
 * Thin wrapper over RbacRepository's permission-catalog methods — see the note on
 * `createAdminRouter` for why RbacRepository itself isn't split. The catalog is global, like the
 * reference combo's `Permission` table: what is workspace-scoped is which of a workspace's roles
 * and memberships point at each row, not the row itself.
 */
export class PermissionsService {
  constructor(private readonly rbac: RbacRepository) {}

  async listPermissions(): Promise<{ permissions: PermissionSummary[] }> {
    return { permissions: await this.rbac.listPermissions() };
  }

  async definePermission(input: PermissionInput, actorUserId: string | null): Promise<PermissionSummary> {
    return this.rbac.upsertPermission(input, actorUserId);
  }
}
