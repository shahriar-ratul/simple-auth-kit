import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { defineAbilitiesFor } from '@/common/auth/ability/ability';
import { RbacRepository } from '@/common/repositories/rbac.repository';

// Roles and permissions are global to this deployment — one set per user, resolved from the
// database on the request that uses them. The access token carries identity only.
export interface AuthzContext {
  roles: string[];
  permissions: string[];
}

// The seam between authentication and authorization: `AuthGuard` proves who the caller is, this
// turns that into "what may this request do". Must run after `AuthGuard`. Nothing about
// authorization is in the token — a grant or revocation lands on the caller's next request, not
// their next token. Resolved from the database on every request, with no cache in between, so a
// change written straight to the tables (even outside this app) is enforced on the next request.
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(@Inject(RbacRepository) private readonly rbac: RbacRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.auth) {
      const userId = req.auth.sub as string;
      req.authz = (await this.rbac.resolveAuthzContext(userId)) ?? {
        roles: [],
        permissions: [],
      };
      req.ability = defineAbilitiesFor(req.authz.permissions);
    }
    return true;
  }
}
