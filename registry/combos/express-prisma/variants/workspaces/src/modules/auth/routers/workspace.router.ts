import { Router } from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { HttpError } from "../../../infra/errors/http-error.js";
import { RbacRepository } from "../repositories/rbac.repository.js";
import {
  ability,
  authenticated,
  createTieredRouter,
} from "../../../infra/route-tiers.js";
import { WorkspaceRepository } from "../repositories/workspace.repository.js";
import "../../../infra/request-context.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new HttpError(400, `${field} is required`);
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
    throw new HttpError(400, `${field} must be an array of strings`);
  return value as string[];
}

export interface WorkspaceRouterDeps {
  workspaces: WorkspaceRepository;
  rbac: RbacRepository;
  authentication: RequestHandler;
  /** Resolves a workspace when the request names one, and does nothing when it does not. */
  authorization: RequestHandler;
  /** The same resolution, but the `X-Workspace-Id` header is mandatory. */
  workspaceScope: RequestHandler;
}

/**
 * Workspace membership. Every route below that acts *inside* a workspace names it with the
 * `X-Workspace-Id` header rather than a path segment — the same rule the `/admin/*`, `/roles/*`, `/permissions/*`, `/audit-log` routes
 * follow, so there is exactly one way a request says which workspace it means.
 *
 * Three routes here are deliberately tier 2 — `authenticated()`, any logged-in caller — and the
 * permission catalog mints no slugs for them. That is a decision written on each route, not an
 * omission: the tier is a required argument, so a route with none is a compile error
 * (route-tiers.ts).
 *   • `POST /workspaces` and `GET /workspaces` are outside every workspace — any authenticated
 *     user may create one or list their own. There is no workspace whose permissions could be
 *     checked, and gating them on a permission granted *inside* some other workspace would mean
 *     your first workspace could only be created by someone who already had one.
 *   • `GET /workspaces/members` is gated on membership itself: the workspace middleware already
 *     proved the caller belongs to the workspace, and seeing who else is in a room you are in is
 *     not an administrative capability.
 * The three that mutate membership are permission-gated — see `rbac.defaults.ts` for the catalog.
 *
 * Two tiered routers, because the tier's middleware is what enforces the tier: the unscoped
 * routes resolve a workspace only if one is named, while everything under a workspace uses the
 * mandatory resolution. Mounting them in this order matters — the scoped router is consulted
 * first, so `/workspaces/members` reaches it rather than falling through.
 *
 * Replaces the reference combo's `WorkspaceController`.
 */
export function createWorkspaceRouter(
  deps: WorkspaceRouterDeps,
): RequestHandler {
  const { workspaces, rbac, authentication, authorization, workspaceScope } =
    deps;

  const scoped = createTieredRouter({
    authentication,
    authorization: workspaceScope,
  });
  const unscoped = createTieredRouter({ authentication, authorization });

  unscoped.route(
    "post",
    "/",
    authenticated(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        res
          .status(201)
          .json(
            await workspaces.create(
              req.auth!.sub,
              requireString(body.name, "name"),
            ),
          );
      } catch (err) {
        next(err);
      }
    },
  );

  unscoped.route(
    "get",
    "/",
    authenticated(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(200).json(await workspaces.listForUser(req.auth!.sub));
      } catch (err) {
        next(err);
      }
    },
  );

  scoped.route(
    "get",
    "/members",
    authenticated(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res
          .status(200)
          .json(await workspaces.listMembers(req.authz!.workspaceId));
      } catch (err) {
        next(err);
      }
    },
  );

  scoped.route(
    "post",
    "/members",
    ability("members:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        // No `roles` in the body means "whatever this workspace flags as the default role" — the
        // default lives in a row, not in this line.
        const roles =
          body.roles === undefined
            ? undefined
            : requireStringArray(body.roles, "roles");
        res
          .status(201)
          .json(
            await workspaces.addMember(
              req.authz!.workspaceId,
              requireString(body.email, "email"),
              roles,
            ),
          );
      } catch (err) {
        next(err);
      }
    },
  );

  scoped.route(
    "put",
    "/members/:memberId/roles",
    ability("roles:assign"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const memberId = requireString(req.params.memberId, "memberId");
        if (memberId === req.authz!.memberId)
          throw new HttpError(403, "cannot change your own roles");
        const body = req.body as Record<string, unknown>;
        res
          .status(200)
          .json(
            await rbac.setMemberRoles(
              req.authz!.workspaceId,
              memberId,
              requireStringArray(body.roles, "roles"),
            ),
          );
      } catch (err) {
        next(err);
      }
    },
  );

  scoped.route(
    "delete",
    "/members/:memberId",
    ability("members:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const memberId = requireString(req.params.memberId, "memberId");
        if (memberId === req.authz!.memberId)
          throw new HttpError(
            403,
            "cannot remove yourself from a workspace you administer",
          );
        await workspaces.removeMember(req.authz!.workspaceId, memberId);
        res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  const router = Router();
  router.use(scoped.handler);
  router.use(unscoped.handler);
  return router;
}
