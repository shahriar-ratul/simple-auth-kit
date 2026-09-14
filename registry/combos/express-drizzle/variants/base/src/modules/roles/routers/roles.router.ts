import type { NextFunction, Request, RequestHandler, Response } from "express";
import { HttpError } from "../../../infra/errors/http-error";
import {
  ability,
  createTieredRouter,
  type TierMiddleware,
} from "../../../infra/route-tiers";
import { RolesService } from "../services/roles.service";
import "../../../infra/request-context";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new HttpError(400, `${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export interface RolesRouterDeps extends TierMiddleware {
  roles: RolesService;
}

/**
 * The role catalog for this deployment. Authority is a permission, never a role name — see the
 * note on `createAdminRouter`. Replaces the reference combo's `RoleController`. Mounted at
 * `/api/v1/roles` by create-auth-app.ts.
 */
export function createRolesRouter(deps: RolesRouterDeps): RequestHandler {
  const { roles, authentication, authorization } = deps;
  const router = createTieredRouter({ authentication, authorization });

  router.route(
    "get",
    "/",
    ability("roles:manage"),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(200).json(await roles.listRoles());
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/",
    ability("roles:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        res.status(201).json(
          await roles.createRole(
            {
              slug: requireString(body.slug, "slug"),
              name: optionalString(body.name),
              displayName: optionalString(body.displayName),
              description: optionalString(body.description) ?? null,
            },
            req.auth!.sub,
          ),
        );
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "patch",
    "/:roleId",
    ability("roles:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        res.status(200).json(
          await roles.updateRole(
            requireString(req.params.roleId, "roleId"),
            {
              name: optionalString(body.name),
              displayName: optionalString(body.displayName),
              description:
                body.description === null
                  ? null
                  : optionalString(body.description),
              isActive:
                typeof body.isActive === "boolean" ? body.isActive : undefined,
            },
            req.auth!.sub,
          ),
        );
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "delete",
    "/:roleId",
    ability("roles:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        await roles.deleteRole(
          requireString(req.params.roleId, "roleId"),
          req.auth!.sub,
          optionalString(body.reason),
        );
        res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/:roleId/permissions",
    ability("roles:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        await roles.attachPermissionToRole(
          requireString(req.params.roleId, "roleId"),
          requireString(body.permission, "permission"),
          req.auth!.sub,
        );
        res.status(201).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  return router.handler;
}
