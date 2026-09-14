import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { PermissionService } from '@/modules/permissions/services/permission.service';
import { HttpError } from '@/infra/errors/http-error';
import { ability, createTieredRouter, type TierMiddleware } from '@/infra/route-tiers';
import '@/infra/request-context';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new HttpError(400, `${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export interface PermissionRouterDeps extends TierMiddleware {
  permissions: PermissionService;
}

/**
 * The permission catalog itself — the whole authorization vocabulary of the deployment. One of
 * four routers (with admin/roles/audit-log) replacing the reference combo's `AdminController`.
 * Mounted at `/permissions` by create-auth-app.ts.
 */
export function createPermissionRouter(deps: PermissionRouterDeps): RequestHandler {
  const { permissions, authentication, authorization } = deps;
  const router = createTieredRouter({ authentication, authorization });

  router.route('get', '/', ability('permissions:read'), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await permissions.listPermissions());
    } catch (err) {
      next(err);
    }
  });

  router.route('post', '/', ability('permissions:define'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      res.status(201).json(
        await permissions.definePermission(
          {
            slug: requireString(body.slug, 'slug'),
            name: optionalString(body.name),
            displayName: optionalString(body.displayName),
            description: body.description === null ? null : optionalString(body.description),
            group: optionalString(body.group),
            groupOrder: typeof body.groupOrder === 'number' ? body.groupOrder : undefined,
            order: typeof body.order === 'number' ? body.order : undefined,
            isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
          },
          req.auth!.sub,
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  return router.handler;
}
