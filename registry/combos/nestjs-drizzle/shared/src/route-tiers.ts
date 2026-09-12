// Every route in this combo belongs to exactly one of three tiers, and says so on itself.
//
//   1. @Public()                — no authentication at all. Signup, login, refresh, password
//                                 reset, the OAuth redirect endpoints.
//   2. @Authenticated()         — any logged-in user, no permission. /auth/me, logout, sessions,
//                                 2FA enrolment, and (in the workspace variant) creating or
//                                 listing your own workspaces and seeing who else is in one you
//                                 belong to.
//   3. @CheckAbility(...slugs)  — the administrative surface. Every named slug must be in the
//                                 caller's ability or the request is refused.
//
// The point of making the tier explicit is `assertEveryRouteDeclaresATier` below: a route that
// declares none of the three **fails at startup, by name**. Forgetting to gate a new admin route
// is therefore not a security bug that ships — it is an app that will not boot.
//
// The check is deliberately two-sided. As well as "declared a tier?", it verifies that the guards
// actually attached to the route match the tier it declared — a route marked @Authenticated()
// with no AuthGuard, or @CheckAbility(...) with no AbilityGuard, is the same class of mistake as
// declaring nothing at all, and would otherwise be an open route that looks closed in the source.
import { RequestMethod, SetMetadata } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";
import type { PermissionSlug } from "./rbac.defaults.js";

export const ROUTE_TIER_KEY = "routeTier";
export const CHECK_ABILITY_KEY = "checkAbility";

/** The three tiers, as stored in route metadata. There is deliberately no fourth value and no default. */
export type RouteTier = "public" | "authenticated" | "ability";

/**
 * Tier 1: reachable with no token at all. Carries no guards, which is exactly why it has to be
 * said out loud — "this route is open" must be a decision someone wrote down, not the absence of
 * one.
 */
export const Public = () =>
  SetMetadata(ROUTE_TIER_KEY, "public" satisfies RouteTier);

/**
 * Tier 2: any authenticated caller, no permission required. Pair with `@UseGuards(AuthGuard)`
 * (plus the variant's authorization guard where the handler reads `req.authz`) — the startup
 * check refuses a route that claims this tier without an authentication guard behind it.
 */
export const Authenticated = () =>
  SetMetadata(ROUTE_TIER_KEY, "authenticated" satisfies RouteTier);

/**
 * Tier 3: `@CheckAbility("users:block")`. Requires `AuthGuard`, then the variant's authorization
 * guard, then `AbilityGuard`, so `req.ability` is populated and checked. Several slugs may be
 * named, and **all** of them must be held — the guard ANDs them.
 *
 * This is the half of authorization that has to be code. **A route declares what it demands; the
 * database decides who is granted it.** The argument is typed as `PermissionSlug`, the catalog in
 * `rbac.defaults.ts`, so a route cannot be gated on a slug nothing will ever grant — "this route
 * requires something that does not exist" stays a compile error rather than a 403 nobody can
 * explain. Which *users* hold the slug is entirely a matter of rows.
 */
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
// constructor signatures, and these types only need to carry a class/method identity through
// reflection — never construct or invoke anything — so `unknown` params would reject every real,
// differently-typed class assigned to them.
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

/**
 * Fail-closed at startup, over the whole route table this library owns.
 *
 * Called from `AuthModule.forRoot` with the very array that populates `controllers:`, so a
 * controller cannot be added to the module and left out of the check — there is only one list.
 * It runs before anything else in `forRoot`, so a build with an ungated route creates no database
 * client, opens no port, and reports every offending route in one message rather than the first.
 *
 * Scope note: this covers the combo's own controllers, not the consuming application's. A library
 * that refused to boot until every route in someone else's app carried one of *its* markers would
 * be indefensible; what it guarantees is that no route shipped by this library is ungated by
 * omission.
 *
 * @param controllers the module's controller classes
 * @param guards      the two guard classes whose presence defines tiers 2 and 3
 */
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
