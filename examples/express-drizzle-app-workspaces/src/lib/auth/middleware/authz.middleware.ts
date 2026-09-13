import type { NextFunction, Request, RequestHandler, Response } from "express";
import { defineAbilitiesFor } from "../ability.js";
import { HttpError } from "../http-error.js";
import type { PermissionCache } from "../permission-cache.js";
import {
  memberCacheKey,
  type RbacRepository,
} from "../repositories/rbac.repository.js";
import "../request-context.js";

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

export interface AuthzMiddlewareDeps {
  rbac: RbacRepository;
  cache: PermissionCache;
}

/**
 * Extracted so both middlewares below resolve identically; only their behaviour on "no workspace
 * named" differs.
 *
 * The one lookup is `resolveAuthzContext`'s — anchored on the `[userId, workspaceId]` unique
 * index — and it goes through `PermissionCache`, keyed on that same pair, so the steady-state cost
 * is a cache read. The *semantics* stay "read from the database": every write that could change
 * the answer bumps a version counter and the cached entry becomes unreachable. A non-member is
 * never cached, so being added to a workspace is effective immediately.
 *
 * The CASL ability is derived from what came back, in memory, so gating routes on abilities costs
 * exactly what gating them on permission slugs did.
 *
 * Idempotent: a route may legitimately sit behind both middlewares, and resolving twice would
 * double the hot path's query count for no gain.
 */
async function resolve(deps: AuthzMiddlewareDeps, req: Request): Promise<void> {
  if (req.authz) return;

  const workspaceId = req.headers[WORKSPACE_HEADER];
  if (!req.auth || typeof workspaceId !== "string" || workspaceId.length === 0)
    return;

  const userId = req.auth.sub;
  const authz = await deps.cache.resolve<AuthzContext>(
    memberCacheKey(userId, workspaceId),
    () => deps.rbac.resolveAuthzContext(userId, workspaceId),
  );
  // Deliberately the same answer for "no such workspace" and "not your workspace": a caller
  // outside a workspace must not be able to probe whether it exists.
  if (!authz) throw new HttpError(403, "not a member of this workspace");
  req.authz = authz;
  // Scoped to this workspace by construction: the permissions it is built from are the ones that
  // membership carries *here*, so the ability /auth/me describes grants nothing anywhere else.
  req.ability = defineAbilitiesFor(authz.permissions);
}

/**
 * Resolves the authorization context when the request names a workspace, and does nothing when it
 * does not. Used on routes that work either way — `GET /auth/me` answers with no roles when no
 * workspace is named. Must run after the auth middleware.
 *
 * Replaces the reference combo's `AuthzGuard`.
 */
export function createAuthzMiddleware(
  deps: AuthzMiddlewareDeps,
): RequestHandler {
  return async function authzMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await resolve(deps, req);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * The same resolution, but the workspace is mandatory — every workspace-scoped route uses this.
 *
 * Replaces the reference combo's `WorkspaceGuard`.
 */
export function createWorkspaceMiddleware(
  deps: AuthzMiddlewareDeps,
): RequestHandler {
  return async function workspaceMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await resolve(deps, req);
      if (!req.authz)
        throw new HttpError(403, `${WORKSPACE_HEADER} header is required`);
      next();
    } catch (err) {
      next(err);
    }
  };
}
