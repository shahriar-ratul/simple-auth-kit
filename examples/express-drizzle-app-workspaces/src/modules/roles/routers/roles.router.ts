import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from '../../../infra/errors/http-error';
import { ability, createTieredRouter } from '../../../infra/route-tiers';
import { RolesService } from '../services/roles.service';
import '../../../infra/request-context';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new HttpError(400, `${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export interface RolesRouterDeps {
  roles: RolesService;
  authentication: RequestHandler;
  /** The mandatory workspace resolution — every route here acts inside one. See authz.middleware.ts. */
  workspaceScope: RequestHandler;
}

/**
 * The role catalog *of one workspace*, named by the `X-Workspace-Id` header. Authority is a
 * permission, never a role name — see the note on `createAdminRouter`. Replaces the reference
 * combo's `RoleController`. Mounted at `/api/v1/roles` by create-auth-app.ts.
 */
export function createRolesRouter(deps: RolesRouterDeps): RequestHandler {
  const { roles, authentication, workspaceScope } = deps;
  const router = createTieredRouter({
    authentication,
    authorization: workspaceScope,
  });

  router.route('get', '/', ability('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await roles.listRoles(req.authz!));
    } catch (err) {
      next(err);
    }
  });

  router.route('post', '/', ability('roles:manage'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      res.status(201).json(
        await roles.createRole(
          req.authz!,
          {
            slug: requireString(body.slug, 'slug'),
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
  });

  router.route(
    'patch',
    '/:roleId',
    ability('roles:manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        res.status(200).json(
          await roles.updateRole(
            req.authz!,
            requireString(req.params.roleId, 'roleId'),
            {
              name: optionalString(body.name),
              displayName: optionalString(body.displayName),
              description: body.description === null ? null : optionalString(body.description),
              isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
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
    'delete',
    '/:roleId',
    ability('roles:manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        await roles.deleteRole(
          req.authz!,
          requireString(req.params.roleId, 'roleId'),
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
    'post',
    '/:roleId/permissions',
    ability('roles:manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        await roles.attachPermissionToRole(
          req.authz!,
          requireString(req.params.roleId, 'roleId'),
          requireString(body.permission, 'permission'),
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
