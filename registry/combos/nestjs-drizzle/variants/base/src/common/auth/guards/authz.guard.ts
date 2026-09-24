import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { defineAbilitiesFor } from "@/common/auth/ability/ability";
import { AuthzCache } from "@/common/auth/cache/authz-cache";
import { RbacRepository } from "@/common/repositories/rbac.repository";

/**
 * Roles and permissions are global to this deployment: a user has one set, and it applies
 * everywhere. Both are resolved from the database on the request that uses them — the access
 * token carries identity only.
 */
export interface AuthzContext {
  roles: string[];
  permissions: string[];
}

/**
 * The single seam between authentication and authorization: `AuthGuard` proves who the caller
 * is, this turns that into "what may this request do". Must run after `AuthGuard`.
 *
 * It produces both forms of the same answer, from the same source: `req.authz`, the role and
 * permission slugs themselves, and `req.ability`, the CASL ability `@CheckAbility` is checked
 * against. `GET /auth/me` returns the slugs, and a client rebuilds the identical ability from
 * them with the same `defineAbilitiesFor` — so the server's decision and the console's rendering
 * cannot disagree.
 *
 * **Nothing about authorization is in the token.** That is deliberate and it is what makes a
 * grant or a revocation land on the caller's next *request* rather than their next token. The
 * price of the alternative was a revocation that silently did not apply for up to an
 * access-token TTL.
 *
 * The answer is cached per user in `AuthzCache`. Every authorization write the app makes bumps
 * `authz_version`, so such a change applies on the very next request; a direct SQL write applies
 * once the cached answer's TTL (`authzCacheTtlSeconds`) runs out.
 */
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
    @Inject(AuthzCache) private readonly cache: AuthzCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.auth) {
      const userId = req.auth.sub as string;
      req.authz = (await this.cache.get(userId, () =>
        this.rbac.resolveAuthzContext(userId),
      )) ?? {
        roles: [],
        permissions: [],
      };
      req.ability = defineAbilitiesFor(req.authz.permissions);
    }
    return true;
  }
}
