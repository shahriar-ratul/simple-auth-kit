import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { defineAbilitiesFor } from "../ability/ability";
import { PermissionCache } from "../cache/permission-cache";
import {
  memberCacheKey,
  RbacRepository,
} from "../../../modules/auth/repositories/rbac.repository";

export const WORKSPACE_HEADER = "x-workspace-id";

// Roles and permissions belong to a *membership*, not a user — the token is workspace-agnostic
// and one login serves every workspace. A request names the workspace it acts in via the
// `X-Workspace-Id` header, and everything below is resolved from the database on that request.
export interface AuthzContext {
  workspaceId: string;
  memberId: string;
  roles: string[];
  permissions: string[];
}

// Extracted so both guards below resolve identically; only their behavior on "no workspace
// named" differs. Goes through `PermissionCache`, keyed on `[userId, workspaceId]`, so the
// steady-state cost is a cache read. A non-member is never cached, so being added to a
// workspace is effective immediately. Idempotent: a route may sit behind both guards, and
// resolving twice would double the hot path's query count for no gain.
async function resolve(
  rbac: RbacRepository,
  cache: PermissionCache,
  context: ExecutionContext,
): Promise<void> {
  const req = context.switchToHttp().getRequest();
  if (req.authz) return;

  const workspaceId = req.headers[WORKSPACE_HEADER];
  if (!req.auth || typeof workspaceId !== "string" || workspaceId.length === 0)
    return;

  const userId = req.auth.sub as string;
  const authz = await cache.resolve<AuthzContext>(
    memberCacheKey(userId, workspaceId),
    () => rbac.resolveAuthzContext(userId, workspaceId),
  );
  // Same answer for "no such workspace" and "not your workspace" — a caller outside a workspace
  // must not be able to probe whether it exists.
  if (!authz) throw new ForbiddenException("not a member of this workspace");
  req.authz = authz;
  req.ability = defineAbilitiesFor(authz.permissions);
}

// Resolves the authorization context when the request names a workspace, and does nothing
// otherwise — used on routes that work either way (`GET /auth/me` answers with no roles when no
// workspace is named). Must run after `AuthGuard`.
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
    @Inject(PermissionCache) private readonly cache: PermissionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await resolve(this.rbac, this.cache, context);
    return true;
  }
}

// The same resolution, but the workspace is mandatory — every workspace-scoped route uses this.
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
    @Inject(PermissionCache) private readonly cache: PermissionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await resolve(this.rbac, this.cache, context);
    const req = context.switchToHttp().getRequest();
    if (!req.authz)
      throw new ForbiddenException(`${WORKSPACE_HEADER} header is required`);
    return true;
  }
}
