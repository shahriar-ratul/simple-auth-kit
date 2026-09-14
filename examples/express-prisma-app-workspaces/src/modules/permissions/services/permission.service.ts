import { PermissionInput, PermissionSummary, RbacRepository } from '@/modules/auth/repositories/rbac.repository';

/**
 * Thin wrapper over RbacRepository's permission-catalog methods — see the note on AdminService
 * for why RbacRepository itself isn't split. The catalog is global, like the `Permission` table:
 * what is workspace-scoped is which of a workspace's roles point at it, so neither method here
 * takes an `AuthzContext` — only the router's `ability(...)` tier is workspace-scoped.
 */
export class PermissionService {
  constructor(private readonly rbac: RbacRepository) {}

  async listPermissions(): Promise<{ permissions: PermissionSummary[] }> {
    return { permissions: await this.rbac.listPermissions() };
  }

  async definePermission(input: PermissionInput, actorUserId: string | null): Promise<PermissionSummary> {
    return this.rbac.upsertPermission(input, actorUserId);
  }
}
