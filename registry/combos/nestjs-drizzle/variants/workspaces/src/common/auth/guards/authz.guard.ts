import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { defineAbilitiesFor } from "@/common/auth/ability/ability";
import { RbacRepository } from "@/common/repositories/rbac.repository";

export const WORKSPACE_HEADER = "x-workspace-id";

/**
 * Roles and permissions belong to a *membership*, not a user, so they could not be baked into the
 * access token even in principle — the token is workspace-agnostic and one login serves every
 * workspace. A request names the workspace it is acting in via the `X-Workspace-Id` header, and
 * everything below is resolved from the database on that request.
 */
export interface AuthzContext {
  workspaceId: string;
  memberId: string;
  roles: string[];
  permissions: string[];
}

/**
 * Extracted so both guards below resolve identically; only their behaviour on "no workspace
 * named" differs.
 *
 * The one lookup is `resolveAuthzContext`'s — anchored on the `[userId, workspaceId]` unique
 * index — and it reads the live database on every request. Nothing is cached, so a change made
 * anywhere (the API, another service, a direct SQL write) applies on the very next request.
 *
 * The CASL ability is derived from what came back, in memory, so gating routes on abilities costs
 * exactly what gating them on permission slugs did.
 *
 * Idempotent: a route may legitimately sit behind both guards, and resolving twice would double
 * the hot path's query count for no gain.
 */
async function resolve(
  rbac: RbacRepository,
  context: ExecutionContext,
): Promise<void> {
  const req = context.switchToHttp().getRequest();
  if (req.authz) return;

  const workspaceId = req.headers[WORKSPACE_HEADER];
  if (!req.auth || typeof workspaceId !== "string" || workspaceId.length === 0)
    return;

  const userId = req.auth.sub as string;
  const authz = await rbac.resolveAuthzContext(userId, workspaceId);
  // Deliberately the same answer for "no such workspace" and "not your workspace": a caller
  // outside a workspace must not be able to probe whether it exists.
  if (!authz) throw new ForbiddenException("not a member of this workspace");
  req.authz = authz;
  // Scoped to this workspace by construction: the permissions it is built from are the ones that
  // membership carries *here*, so the ability /auth/me describes grants nothing anywhere else.
  req.ability = defineAbilitiesFor(authz.permissions);
}

/**
 * Resolves the authorization context when the request names a workspace, and does nothing when
 * it does not. Used on routes that work either way — `GET /auth/me` answers with no roles when
 * no workspace is named. Must run after `AuthGuard`.
 */
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(@Inject(RbacRepository) private readonly rbac: RbacRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await resolve(this.rbac, context);
    return true;
  }
}

/** The same resolution, but the workspace is mandatory — every workspace-scoped route uses this. */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(@Inject(RbacRepository) private readonly rbac: RbacRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await resolve(this.rbac, context);
    const req = context.switchToHttp().getRequest();
    if (!req.authz)
      throw new ForbiddenException(`${WORKSPACE_HEADER} header is required`);
    return true;
  }
}
