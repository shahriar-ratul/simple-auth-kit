import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AuthService } from "./auth.service.js";
import { HttpError } from "./http-error.js";
import { ability, createTieredRouter, type TierMiddleware } from "./route-tiers.js";
import "./request-context.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new HttpError(400, `${field} is required`);
  return value;
}

const optionalString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

export interface AdminRouterDeps extends TierMiddleware {
  auth: AuthService;
}

/**
 * Administration of the whole deployment. Authority is a permission, never a role name: the authz
 * middleware resolves the caller's roles and permissions from the database on this request, builds
 * the CASL ability from them, and each route's `ability(...)` tier checks its slugs against it.
 * There is no role-based bypass — holding a role called "admin" that carries no permissions gets
 * exactly the same 403 as holding no role at all, which is why `npm run seed` (which provisions the
 * catalog and the roles that carry it) is a prerequisite for this router doing anything.
 *
 * Each route says what it demands; the rows say who is granted it. The slugs below are checked at
 * compile time against `PERMISSION_CATALOG` in `rbac.defaults.ts`, while who holds them — and
 * whether the permission is active at all — is edited through this very router and takes effect on
 * the next request. `GET /auth/me` returns the caller's slugs, and a console rebuilds the same
 * ability from them with the same function the middleware used.
 *
 * Replaces the reference combo's `AdminController`. Mounted under `/auth/admin` by
 * create-auth-app.ts; `createTieredRouter` stands in for its
 * `@UseGuards(AuthGuard, AuthzGuard, AbilityGuard)` — see route-tiers.ts for why the tier is a
 * required argument rather than a decorator.
 */
export function createAdminRouter(deps: AdminRouterDeps): RequestHandler {
  const { auth, authentication, authorization } = deps;
  const admin = createTieredRouter({ authentication, authorization });

  admin.route("get", "/users", ability("users:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, page, limit } = req.query as Record<string, string | undefined>;
      res.status(200).json(await auth.listUsers({ search, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined }));
    } catch (err) {
      next(err);
    }
  });

  // No invitation email — the account is usable immediately with the password given here.
  admin.route("post", "/users", ability("users:manage"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      res.status(201).json(
        await auth.createUser(
          {
            email: requireString(body.email, "email"),
            password: requireString(body.password, "password"),
            firstName: optionalString(body.firstName),
            lastName: optionalString(body.lastName),
            displayName: optionalString(body.displayName),
            phone: optionalString(body.phone),
            username: optionalString(body.username),
            roles: Array.isArray(body.roles) ? body.roles.filter((role): role is string => typeof role === "string") : undefined,
          },
          req.auth!.sub,
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  admin.route("get", "/users/:userId", ability("users:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await auth.getUser(requireString(req.params.userId, "userId")));
    } catch (err) {
      next(err);
    }
  });

  // Profile fields only — email is the login identifier and is not editable here.
  admin.route("patch", "/users/:userId", ability("users:manage"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireString(req.params.userId, "userId");
      const body = req.body as Record<string, unknown>;
      res.status(200).json(
        await auth.updateUser(
          userId,
          {
            firstName: body.firstName === null ? null : optionalString(body.firstName),
            lastName: body.lastName === null ? null : optionalString(body.lastName),
            displayName: body.displayName === null ? null : optionalString(body.displayName),
            phone: body.phone === null ? null : optionalString(body.phone),
            username: body.username === null ? null : optionalString(body.username),
            photo: body.photo === null ? null : optionalString(body.photo),
          },
          req.auth!.sub,
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  // Soft-delete: the row survives for audit purposes, stops appearing in listings, and can no
  // longer authenticate.
  admin.route("delete", "/users/:userId", ability("users:manage"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireString(req.params.userId, "userId");
      if (userId === req.auth!.sub) throw new HttpError(403, "cannot delete your own account");
      await auth.deleteUser(userId, req.auth!.sub, optionalString((req.body as Record<string, unknown> | undefined)?.reason));
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("get", "/audit-log", ability("audit-log:read"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, action, since, until, page, limit } = req.query as Record<string, string | undefined>;
      res.status(200).json(
        await auth.listAuditLog({ userId, action, since, until, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined }),
      );
    } catch (err) {
      next(err);
    }
  });

  admin.route("get", "/permissions", ability("permissions:read"), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await auth.listPermissions());
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/permissions", ability("permissions:define"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      res.status(201).json(
        await auth.definePermission(
          {
            slug: requireString(body.slug, "slug"),
            name: optionalString(body.name),
            displayName: optionalString(body.displayName),
            description: body.description === null ? null : optionalString(body.description),
            group: optionalString(body.group),
            groupOrder: typeof body.groupOrder === "number" ? body.groupOrder : undefined,
            order: typeof body.order === "number" ? body.order : undefined,
            isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
          },
          req.auth!.sub,
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  admin.route("get", "/roles", ability("roles:manage"), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await auth.listRoles());
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/roles", ability("roles:manage"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      res.status(201).json(
        await auth.createRole(
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
  });

  admin.route("patch", "/roles/:roleId", ability("roles:manage"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roleId = requireString(req.params.roleId, "roleId");
      const body = req.body as Record<string, unknown>;
      res.status(200).json(
        await auth.updateRole(
          roleId,
          {
            name: optionalString(body.name),
            displayName: optionalString(body.displayName),
            description: body.description === null ? null : optionalString(body.description),
            isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
          },
          req.auth!.sub,
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  // Soft-delete: existing assignments are left in place rather than cascade-deleted, and the role
  // simply stops being resolved.
  admin.route("delete", "/roles/:roleId", ability("roles:manage"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roleId = requireString(req.params.roleId, "roleId");
      await auth.deleteRole(roleId, req.auth!.sub, optionalString((req.body as Record<string, unknown> | undefined)?.reason));
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/roles/:roleId/permissions", ability("roles:manage"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      await auth.attachPermissionToRole(requireString(req.params.roleId, "roleId"), requireString(body.permission, "permission"), req.auth!.sub);
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/users/:userId/roles", ability("roles:assign"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      await auth.assignRole(requireString(req.params.userId, "userId"), requireString(body.role, "role"));
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/users/:userId/roles/:roleSlug/revoke", ability("roles:assign"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireString(req.params.userId, "userId");
      // Revoking your own `admin` would strip the very permission that let you call this,
      // with no route back in. Assigning to yourself is fine — it can't lock anyone out.
      if (userId === req.auth!.sub) throw new HttpError(403, "cannot change your own roles");
      await auth.revokeRole(userId, requireString(req.params.roleSlug, "roleSlug"));
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/users/:userId/permissions", ability("permissions:grant"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      await auth.grantPermission(requireString(req.params.userId, "userId"), requireString(body.permission, "permission"), req.auth!.sub);
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/users/:userId/permissions/:permissionSlug/revoke", ability("permissions:grant"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await auth.revokePermission(requireString(req.params.userId, "userId"), requireString(req.params.permissionSlug, "permissionSlug"));
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/users/:userId/block", ability("users:block"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireString(req.params.userId, "userId");
      if (userId === req.auth!.sub) throw new HttpError(403, "cannot block your own account");
      await auth.block(userId, { userId: req.auth!.sub, ip: req.ip });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/users/:userId/unblock", ability("users:block"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await auth.unblock(requireString(req.params.userId, "userId"), { userId: req.auth!.sub, ip: req.ip });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/users/:userId/deactivate", ability("users:block"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = requireString(req.params.userId, "userId");
      if (userId === req.auth!.sub) throw new HttpError(403, "cannot deactivate your own account");
      await auth.deactivate(userId, { userId: req.auth!.sub, ip: req.ip });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  admin.route("post", "/users/:userId/activate", ability("users:block"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await auth.activate(requireString(req.params.userId, "userId"), { userId: req.auth!.sub, ip: req.ip });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return admin.handler;
}
