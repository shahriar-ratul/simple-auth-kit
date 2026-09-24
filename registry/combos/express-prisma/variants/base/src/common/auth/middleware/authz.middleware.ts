import type { NextFunction, Request, RequestHandler, Response } from "express";
import { defineAbilitiesFor } from "@/common/auth/ability/ability";
import type { AuthzCache } from "@/common/auth/cache/authz-cache";
import type { RbacRepository } from "@/common/repositories/rbac.repository";
import "@/infra/request-context";

/**
 * Roles and permissions are global to this deployment: a user has one set, and it applies
 * everywhere. Both are resolved from the database on the request that uses them — the access
 * token carries identity only.
 */
export interface AuthzContext {
  roles: string[];
  permissions: string[];
}

export interface AuthzMiddlewareDeps {
  rbac: RbacRepository;
  cache: AuthzCache;
}

/**
 * The single seam between authentication and authorization: the auth middleware proves who the
 * caller is, this turns that into "what may this request do". Must run after it.
 *
 * It produces both forms of the same answer, from the same source: `req.authz`, the role and
 * permission slugs themselves, and `req.ability`, the CASL ability the tier-3 routes are checked
 * against. `GET /auth/me` returns the slugs, and a client rebuilds the identical ability from them
 * with the same `defineAbilitiesFor` — so the server's decision and the console's rendering cannot
 * disagree.
 *
 * **Nothing about authorization is in the token.** That is deliberate and it is what makes a grant
 * or a revocation land on the caller's next *request* rather than their next token. The price of
 * the alternative was a revocation that silently did not apply for up to an access-token TTL.
 *
 * The answer is cached (`AuthzCache`). Every app write that changes authorization bumps
 * `authz_version`, so a change made through the admin API applies on the very next request; a
 * direct database edit applies once the entry's TTL (`authzCacheTtlSeconds`) runs out.
 *
 * Replaces the reference combo's `AuthzGuard`.
 */
export function createAuthzMiddleware(
  deps: AuthzMiddlewareDeps,
): RequestHandler {
  const { rbac, cache } = deps;
  return async function authzMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.auth) {
        const userId = req.auth.sub;
        req.authz = (await cache.get(userId, () =>
          rbac.resolveAuthzContext(userId),
        )) ?? {
          roles: [],
          permissions: [],
        };
        req.ability = defineAbilitiesFor(req.authz.permissions);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
