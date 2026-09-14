import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ABILITY_SUBJECT } from "@/common/auth/ability/ability";
import { CHECK_ABILITY_KEY } from "@/infra/route-tiers";

// The authorization boundary for tier-3 routes — no role-based bypass beside it, so a role
// carrying no permissions confers no authority. Fail-closed: no ability, a missing slug, or a
// route that declares none of them all reject rather than pass.
@Injectable()
export class AbilityGuard implements CanActivate {
  // Explicit @Inject: keeps DI working under esbuild-based toolchains that don't emit
  // design:paramtypes metadata.
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
