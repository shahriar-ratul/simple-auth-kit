// Every route in this combo belongs to exactly one of three tiers, and says so on itself:
// @Public() (no auth), @Authenticated() (any logged-in user), @CheckAbility(...slugs) (every
// named slug required). `assertEveryRouteDeclaresATier` below fails startup, by name, for any
// route declaring none of the three — so an ungated admin route can't ship silently. The check
// also verifies the guards actually attached match the declared tier, so a route marked
// @Authenticated() with no AuthGuard can't masquerade as gated.
import { RequestMethod, SetMetadata } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import type { PermissionSlug } from "../modules/auth/rbac.defaults";

export const ROUTE_TIER_KEY = "routeTier";
export const CHECK_ABILITY_KEY = "checkAbility";

export type RouteTier = "public" | "authenticated" | "ability";

export const Public = () =>
  SetMetadata(ROUTE_TIER_KEY, "public" satisfies RouteTier);

// Pair with @UseGuards(AuthGuard) — the startup check refuses a route that claims this tier
// without an authentication guard behind it.
export const Authenticated = () =>
  SetMetadata(ROUTE_TIER_KEY, "authenticated" satisfies RouteTier);

// Requires AuthGuard, then the variant's authorization guard, then AbilityGuard. All named
// slugs must be held — the guard ANDs them. The argument is typed as `PermissionSlug` (the
// catalog in rbac.defaults.ts) so a route can't be gated on a slug nothing will ever grant.
export const CheckAbility = (...abilities: PermissionSlug[]) =>
  applyBoth(
    SetMetadata(ROUTE_TIER_KEY, "ability" satisfies RouteTier),
    SetMetadata(CHECK_ABILITY_KEY, abilities as string[]),
  );

/** `applyDecorators` from @nestjs/common, minus its class-decorator branch — these two are method decorators. */
function applyBoth(...decorators: MethodDecorator[]): MethodDecorator {
  return (target, key, descriptor) => {
    for (const decorate of decorators) decorate(target, key, descriptor);
    return descriptor;
  };
}

// `any` here is real type erasure, not laziness: controllers/guards have heterogeneous
// constructor signatures (AdminController takes an AuthService, AuthGuard takes different deps,
// etc.), and these types only need to carry a class/method identity through reflection — never
// construct or invoke anything — so `unknown` params would reject every real, differently-typed
// class assigned to them.
/* eslint-disable @typescript-eslint/no-explicit-any -- see comment above */
/** A NestJS controller/guard class reference — reflected on via metadata, never constructed here. */
type Ctor = abstract new (...args: any[]) => object;

/** A route-handler method — reflected on and invoked by Nest's own pipeline, never called directly here. */
type HandlerFn = (...args: any[]) => unknown;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** A guard entry in `@UseGuards` may be a class or an already-constructed instance; both reduce to a class. */
type GuardEntry = Ctor | { constructor: Ctor };

const guardClassesOn = (target: object): Ctor[] =>
  (
    (Reflect.getMetadata(GUARDS_METADATA, target) as
      GuardEntry[] | undefined) ?? []
  ).map((g) => (typeof g === "function" ? g : g.constructor));

const joinPath = (...parts: unknown[]) =>
  "/" +
  parts
    .filter((p): p is string => typeof p === "string")
    .flatMap((p) => p.split("/"))
    .filter((segment) => segment.length > 0)
    .join("/");

/** Own methods carrying Nest's route metadata. Controllers here are flat classes; inherited routes are not a shape this combo uses. */
function routeHandlersOf(
  controller: Ctor,
): Array<{ name: string; handler: HandlerFn }> {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== "constructor")
    .map((name) => ({ name, handler: prototype[name] }))
    .filter(
      (entry): entry is { name: string; handler: HandlerFn } =>
        typeof entry.handler === "function",
    )
    .filter(
      (entry) =>
        Reflect.getMetadata(PATH_METADATA, entry.handler) !== undefined,
    );
}

// Fail-closed at startup over the whole route table this library owns. Called from
// `AuthModule.forRoot` with the same array that populates `controllers:`, so nothing can be
// added to the module and left out of the check. Covers only this combo's own controllers, not
// the consuming application's.
export function assertEveryRouteDeclaresATier(
  controllers: readonly Ctor[],
  guards: { authentication: Ctor; ability: Ctor },
): void {
  const offenders: string[] = [];

  for (const controller of controllers) {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, controller);
    const controllerGuards = guardClassesOn(controller);

    for (const { name, handler } of routeHandlersOf(controller)) {
      const method =
        RequestMethod[
          Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod
        ] ?? "?";
      const route = `${method} ${joinPath(controllerPath, Reflect.getMetadata(PATH_METADATA, handler))} (${controller.name}.${name})`;

      const tier: RouteTier | undefined =
        Reflect.getMetadata(ROUTE_TIER_KEY, handler) ??
        Reflect.getMetadata(ROUTE_TIER_KEY, controller);
      if (!tier) {
        offenders.push(
          `${route} — declares no tier: add @Public(), @Authenticated(), or @CheckAbility(slug)`,
        );
        continue;
      }

      // A tier is a claim about what protects the route. Check the claim against the guards that
      // are actually attached, so "marked but not wired" cannot masquerade as "gated".
      const attached = [...controllerGuards, ...guardClassesOn(handler)];
      const authenticated = attached.includes(guards.authentication);
      const ability = attached.includes(guards.ability);

      if (tier === "public" && (authenticated || ability))
        offenders.push(
          `${route} — declares @Public() but is behind ${attached.map((g) => g.name).join(", ")}`,
        );
      if (tier === "authenticated" && !authenticated)
        offenders.push(
          `${route} — declares @Authenticated() but has no ${guards.authentication.name}`,
        );
      if (tier === "authenticated" && ability)
        offenders.push(
          `${route} — declares @Authenticated() but is behind ${guards.ability.name}; use @CheckAbility instead`,
        );
      if (tier === "ability" && !(authenticated && ability))
        offenders.push(
          `${route} — declares @CheckAbility but is not behind ${guards.authentication.name} + ${guards.ability.name}`,
        );
    }
  }

  if (offenders.length) {
    throw new Error(
      `${offenders.length} route(s) are not correctly tiered — refusing to start:\n  ` +
        offenders.join("\n  ") +
        `\n\nEvery route must be exactly one of: @Public() (no auth), @Authenticated() (any logged-in user), @CheckAbility(slug) (a permission).`,
    );
  }
}
