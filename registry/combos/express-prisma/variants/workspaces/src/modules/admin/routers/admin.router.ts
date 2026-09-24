import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthzCache } from "@/common/auth/cache/authz-cache";
import { AdminService } from "@/modules/admin/services/admin.service";
import { HttpError } from "@/infra/errors/http-error";
import { ability, createTieredRouter } from "@/infra/route-tiers";
import "@/infra/request-context";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new HttpError(400, `${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export interface AdminRouterDeps {
  admin: AdminService;
  authzCache: AuthzCache;
  authentication: RequestHandler;
  /** The mandatory workspace resolution — every route here acts inside one. See authz.middleware.ts. */
  workspaceScope: RequestHandler;
}

/**
 * User management *of one workspace*, named by the `X-Workspace-Id` header: CRUD,
 * block/unblock/deactivate/activate, and user-scoped role/permission assignment. Authority is a
 * permission, never a role name: the workspace middleware resolves the caller's membership and
 * the roles and permissions it carries **in that workspace**, builds the CASL ability from them,
 * and each route's `ability(...)` tier checks its slugs against it. There is no role-based bypass
 * — holding a role called "admin" that carries no permissions gets exactly the same 403 as
 * holding no role at all, which is why `npm run seed` (which provisions the catalog and the
 * roles that carry it) is a prerequisite for this router doing anything.
 *
 * Every handler passes `req.authz` down to the service, and every service method reaches the
 * database through a workspace-scoped query. That is the security property this model rests on:
 * an admin of one workspace has no expressible way to name a row in another.
 *
 * Role/permission *catalog* management lives in roles.router.ts/permissions.router.ts instead;
 * audit log listing in audit-log.router.ts.
 *
 * One of four routers (with roles/permissions/audit-log) replacing the reference combo's
 * `AdminController`. Mounted at `/admin` by create-auth-app.ts; `createTieredRouter` stands in
 * for its `@UseGuards(AuthGuard, AuthzGuard, AbilityGuard)` — see route-tiers.ts for why the tier
 * is a required argument rather than a decorator.
 */
export function createAdminRouter(deps: AdminRouterDeps): RequestHandler {
  const { admin, authzCache, authentication, workspaceScope } = deps;
  const router = createTieredRouter({
    authentication,
    authorization: workspaceScope,
  });

  router.route(
    "get",
    "/users",
    ability("users:read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { search, page, limit } = req.query as Record<
          string,
          string | undefined
        >;
        res.status(200).json(
          await admin.listUsers(req.authz!, {
            search,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
          }),
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // No invitation email — the account is usable immediately with the password given here.
  router.route(
    "post",
    "/users",
    ability("users:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        res.status(201).json(
          await admin.createUser(
            req.authz!,
            {
              email: requireString(body.email, "email"),
              password: requireString(body.password, "password"),
              firstName: optionalString(body.firstName),
              lastName: optionalString(body.lastName),
              displayName: optionalString(body.displayName),
              phone: optionalString(body.phone),
              username: optionalString(body.username),
              roles: Array.isArray(body.roles)
                ? body.roles.filter(
                    (role): role is string => typeof role === "string",
                  )
                : undefined,
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
    "get",
    "/users/:userId",
    ability("users:read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res
          .status(200)
          .json(
            await admin.getUser(
              req.authz!,
              requireString(req.params.userId, "userId"),
            ),
          );
      } catch (err) {
        next(err);
      }
    },
  );

  // Profile fields only — email is the login identifier and is not editable here.
  router.route(
    "patch",
    "/users/:userId",
    ability("users:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = requireString(req.params.userId, "userId");
        const body = req.body as Record<string, unknown>;
        res.status(200).json(
          await admin.updateUser(
            req.authz!,
            userId,
            {
              firstName:
                body.firstName === null ? null : optionalString(body.firstName),
              lastName:
                body.lastName === null ? null : optionalString(body.lastName),
              displayName:
                body.displayName === null
                  ? null
                  : optionalString(body.displayName),
              phone: body.phone === null ? null : optionalString(body.phone),
              username:
                body.username === null ? null : optionalString(body.username),
              photo: body.photo === null ? null : optionalString(body.photo),
            },
            req.auth!.sub,
          ),
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // Soft-delete: the row survives for audit purposes, stops appearing in listings, and can no
  // longer authenticate. This disables the account across every workspace it belongs to, not
  // just this one — the same reach `block` already has.
  router.route(
    "delete",
    "/users/:userId",
    ability("users:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = requireString(req.params.userId, "userId");
        if (userId === req.auth!.sub)
          throw new HttpError(403, "cannot delete your own account");
        await admin.deleteUser(
          req.authz!,
          userId,
          req.auth!.sub,
          optionalString(
            (req.body as Record<string, unknown> | undefined)?.reason,
          ),
        );
        res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/users/:userId/roles",
    ability("roles:assign"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        await admin.assignRole(
          req.authz!,
          requireString(req.params.userId, "userId"),
          requireString(body.role, "role"),
        );
        res.status(201).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/users/:userId/roles/:roleSlug/revoke",
    ability("roles:assign"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = requireString(req.params.userId, "userId");
        // Revoking your own `admin` would strip the very permission that let you call this,
        // with no route back in. Assigning to yourself is fine — it can't lock anyone out.
        if (userId === req.auth!.sub)
          throw new HttpError(403, "cannot change your own roles");
        await admin.revokeRole(
          req.authz!,
          userId,
          requireString(req.params.roleSlug, "roleSlug"),
        );
        res.status(201).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/users/:userId/permissions",
    ability("permissions:grant"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Record<string, unknown>;
        await admin.grantPermission(
          req.authz!,
          requireString(req.params.userId, "userId"),
          requireString(body.permission, "permission"),
          req.auth!.sub,
        );
        res.status(201).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/users/:userId/permissions/:permissionSlug/revoke",
    ability("permissions:grant"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await admin.revokePermission(
          req.authz!,
          requireString(req.params.userId, "userId"),
          requireString(req.params.permissionSlug, "permissionSlug"),
        );
        res.status(201).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/users/:userId/block",
    ability("users:block"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = requireString(req.params.userId, "userId");
        if (userId === req.auth!.sub)
          throw new HttpError(403, "cannot block your own account");
        await admin.block(req.authz!, userId, {
          userId: req.auth!.sub,
          ip: req.ip,
        });
        res.status(201).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/users/:userId/unblock",
    ability("users:block"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await admin.unblock(
          req.authz!,
          requireString(req.params.userId, "userId"),
          { userId: req.auth!.sub, ip: req.ip },
        );
        res.status(201).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/users/:userId/deactivate",
    ability("users:block"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = requireString(req.params.userId, "userId");
        if (userId === req.auth!.sub)
          throw new HttpError(403, "cannot deactivate your own account");
        await admin.deactivate(req.authz!, userId, {
          userId: req.auth!.sub,
          ip: req.ip,
        });
        res.status(201).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/users/:userId/activate",
    ability("users:block"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await admin.activate(
          req.authz!,
          requireString(req.params.userId, "userId"),
          { userId: req.auth!.sub, ip: req.ip },
        );
        res.status(201).json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  // The authorization cache — what it holds and a way to empty it. Scoped to this workspace: only its entries are listed or cleared.
  router.route(
    "get",
    "/authz-cache",
    ability("authz-cache:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(200).json(await authzCache.inspect(req.authz!.workspaceId));
      } catch (err) {
        next(err);
      }
    },
  );

  router.route(
    "post",
    "/authz-cache/clear",
    ability("authz-cache:manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(201).json(await authzCache.clear(req.authz!.workspaceId));
      } catch (err) {
        next(err);
      }
    },
  );

  return router.handler;
}
