import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ABILITY_SUBJECT } from "../ability.js";
import { CHECK_ABILITY_KEY } from "../route-tiers.js";

/**
 * The authorization boundary for tier-3 routes. This is the *only* thing standing between a
 * caller and an administrative route — there is deliberately no role-based bypass beside it, so a
 * role that carries no permissions confers no authority no matter what it is called.
 *
 * It asks the caller's `Ability` the same question a client asks after `GET /auth/me`, built by
 * the same function from the same slugs, which is what makes server enforcement and client UI
 * incapable of disagreeing.
 *
 * Fail-closed in every direction:
 *   • no `req.ability` (the authorization guard resolved nothing) → 403;
 *   • any one of the declared slugs missing → 403, naming it;
 *   • the guard applied to a route that declares no slugs → an error, not an open route.
 *
 * That last one is the deliberate divergence from the pattern this guard is modelled on, which
 * returns `true` when a route names no permission. Treating "named nothing" as "authenticated is
 * enough" means a new route ships open by omission; here "authenticated is enough" has its own
 * marker (`@Authenticated()`), and a route that says neither does not survive startup — see
 * `assertEveryRouteDeclaresATier`. This check stays as the runtime backstop.
 */
@Injectable()
export class AbilityGuard implements CanActivate {
  // @Inject(Reflector) explicitly, same rationale as key-provider.ts's PrismaClient injection —
  // keeps DI working under esbuild-based toolchains that don't emit design:paramtypes metadata.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      CHECK_ABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) {
      throw new Error(
        `${context.getClass().name}.${context.getHandler().name} is guarded by AbilityGuard but declares no @CheckAbility`,
      );
    }

    const ability = context.switchToHttp().getRequest().ability;
    if (!ability)
      throw new ForbiddenException("no authorization context for this request");

    for (const permission of required) {
      if (!ability.can(permission, ABILITY_SUBJECT))
        throw new ForbiddenException(`missing permission: ${permission}`);
    }
    return true;
  }
}
