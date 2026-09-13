import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { defineAbilitiesFor } from "../ability/ability.js";
import { PermissionCache } from "../cache/permission-cache.js";
import { RbacRepository } from "../repositories/rbac.repository.js";

// Roles and permissions are global to this deployment — one set per user, resolved from the
// database on the request that uses them. The access token carries identity only.
export interface AuthzContext {
  roles: string[];
  permissions: string[];
}

// The seam between authentication and authorization: `AuthGuard` proves who the caller is, this
// turns that into "what may this request do". Must run after `AuthGuard`. Nothing about
// authorization is in the token — a grant or revocation lands on the caller's next request, not
// their next token. Resolution goes through `PermissionCache`, so the steady-state cost is a
// cache read, while the semantics stay "read from the database".
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
    @Inject(PermissionCache) private readonly cache: PermissionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.auth) {
      const userId = req.auth.sub as string;
      req.authz = (await this.cache.resolve<AuthzContext>(userId, () =>
        this.rbac.resolveAuthzContext(userId),
      )) ?? { roles: [], permissions: [] };
      req.ability = defineAbilitiesFor(req.authz.permissions);
    }
    return true;
  }
}
