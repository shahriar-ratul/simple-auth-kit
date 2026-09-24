import { Inject, Injectable } from '@nestjs/common';
import { PermissionInput, PermissionSummary, RbacRepository } from '@/common/repositories/rbac.repository';

/** Thin wrapper over RbacRepository's permission-catalog methods — see the note on AdminController for why RbacRepository itself isn't split. */
@Injectable()
export class PermissionService {
  constructor(@Inject(RbacRepository) private readonly rbac: RbacRepository) {}

  async listPermissions(): Promise<{ permissions: PermissionSummary[] }> {
    return { permissions: await this.rbac.listPermissions() };
  }

  async definePermission(input: PermissionInput, actorUserId: string | null): Promise<PermissionSummary> {
    return this.rbac.upsertPermission(input, actorUserId);
  }
}
