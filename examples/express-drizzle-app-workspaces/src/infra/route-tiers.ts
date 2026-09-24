// Every route in this combo belongs to exactly one of three tiers, and says so at the point it is
// registered.
//
//   1. public(...)              — no authentication at all. Signup, login, refresh, password
//                                 reset, the OAuth redirect endpoints.
//   2. authenticated(...)       — any logged-in user, no permission. /auth/me, logout, sessions,
//                                 2FA enrolment, and (in the workspace variant) creating or
//                                 listing your own workspaces and seeing who else is in one you
//                                 belong to.
//   3. ability(...slugs)        — the administrative surface. Every named slug must be in the
//                                 caller's ability or the request is refused.
//
// The reference combo says this with decorators and then walks the route table at startup: a
// handler carrying none of the three markers fails the boot, by name. Plain Express has no
// metadata-reflection layer, so "what did this handler declare?" cannot be recovered by
// inspection after the fact. The property is enforced at the point of registration instead, which
// gets to the same place by a different road:
//
//   • `route()` is the only way to put a handler on a tiered router, and its tier argument is
//     required — a route with no tier is not an ungated route, it is a compile error;
//   • the finished router is handed back typed as `RequestHandler`, so `.get`/`.post` are not
//     reachable to sneak a route past `route()`;
//   • the middleware each tier needs is attached *by* `route()`, from the tier itself, so a route
//     cannot claim a tier and then not be behind it — the equivalent of the reference's
//     two-sided "declared tier matches attached guards" check;
//   • and every slug is checked against `PERMISSION_SLUGS` at registration, i.e. at startup, so
//     even an untyped (plain-JS) caller fails loudly at boot rather than serving a route gated on
//     a permission nothing can ever grant.
import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ABILITY_SUBJECT } from '@/common/auth/ability/ability';
import { PERMISSION_SLUGS, type PermissionSlug } from '@/modules/auth/permission-slugs';
import '@/infra/request-context';

/** The subset of Express's routing verbs this library's routes use. */
export type TieredMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * What a route declares about itself. There is deliberately no fourth shape and no default: the
 * union is closed, so adding a route means picking one of these three.
 */
export type RouteTier =
  { kind: 'public' } | { kind: 'authenticated' } | { kind: 'ability'; abilities: PermissionSlug[] };

/** Tier 1: reachable with no token at all. Carries no middleware, which is exactly why it has to be said out loud. */
export const publicRoute = (): RouteTier => ({ kind: 'public' });

/** Tier 2: any authenticated caller, no permission required. */
export const authenticated = (): RouteTier => ({ kind: 'authenticated' });

/**
 * Tier 3: `ability("users:block")`. Several slugs may be named, and **all** of them must be held —
 * the check ANDs them.
 *
 * This is the half of authorization that has to be code. **A route declares what it demands; the
 * database decides who is granted it.** The argument is typed as `PermissionSlug`, the catalog in
 * `permission-slugs.ts`, so a route cannot be gated on a slug nothing will ever grant. Which *users*
 * hold the slug is entirely a matter of rows.
 */
export const ability = (...abilities: PermissionSlug[]): RouteTier => {
  if (!abilities.length)
    throw new Error('ability() names no permission — use authenticated() if any logged-in caller may call the route');
  for (const slug of abilities) assertInCatalog(slug);
  return { kind: 'ability', abilities };
};

/**
 * The authorization boundary for tier-3 routes. This is the *only* thing standing between a caller
 * and an administrative route — there is deliberately no role-based bypass beside it, so a role
 * that carries no permissions confers no authority no matter what it is called.
 *
 * It asks the caller's `Ability` the same question a client asks after `GET /auth/me`, built by
 * the same function from the same slugs, which is what makes server enforcement and client UI
 * incapable of disagreeing.
 */
export function requireAbility(abilities: PermissionSlug[]): RequestHandler {
  return function abilityMiddleware(req: Request, res: Response, next: NextFunction): void {
    // No ability at all means the authz middleware resolved nothing — fail closed.
    if (!req.ability) {
      res.status(403).json({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'no authorization context for this request',
      });
      return;
    }
    for (const slug of abilities) {
      if (!req.ability.can(slug, ABILITY_SUBJECT)) {
        res.status(403).json({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: `missing permission: ${slug}`,
        });
        return;
      }
    }
    next();
  };
}

/** A router on which naming a tier is not optional. See `createTieredRouter`. */
export interface TieredRouter {
  /**
   * Registers one route. `tier` is a required positional argument, so there is no call shape that
   * adds a route without one, and the middleware the tier implies is always inserted immediately
   * before `handler` — the two cannot come apart.
   */
  route(method: TieredMethod, path: string, tier: RouteTier, ...handlers: RequestHandler[]): void;
  /**
   * The composed middleware, for `app.use(...)`. Deliberately typed as `RequestHandler` and not
   * as `Router`, even though that is what it is at runtime: the `.get`/`.post`/… methods are
   * hidden from the type, so `route()` above is the only way to put a handler on this router.
   */
  readonly handler: RequestHandler;
}

export interface TierMiddleware {
  /** Verifies the access token and populates `req.auth`. Attached for tiers 2 and 3. */
  authentication: RequestHandler;
  /** Resolves `req.authz` and `req.ability` from the database. Attached for tiers 2 and 3. */
  authorization: RequestHandler;
}

/**
 * Builds a router whose every route names its tier.
 *
 * `middleware.authentication` and `middleware.authorization` are attached per route rather than
 * with a blanket `router.use`, because that is what makes the public tier genuinely public on a
 * router that also carries protected routes — and what makes "declares public but sits behind the
 * auth middleware" unrepresentable rather than merely unlikely.
 */
export function createTieredRouter(middleware: TierMiddleware): TieredRouter {
  const router = Router();

  return {
    route(method: TieredMethod, path: string, tier: RouteTier, ...handlers: RequestHandler[]): void {
      router[method](path, ...tierMiddleware(tier, middleware), ...handlers);
    },
    handler: router,
  };
}

function tierMiddleware(tier: RouteTier, middleware: TierMiddleware): RequestHandler[] {
  switch (tier.kind) {
    case 'public':
      return [];
    case 'authenticated':
      return [middleware.authentication, middleware.authorization];
    case 'ability':
      return [middleware.authentication, middleware.authorization, requireAbility(tier.abilities)];
  }
}

function assertInCatalog(slug: string): void {
  if (!(PERMISSION_SLUGS as string[]).includes(slug)) {
    throw new Error(
      `"${slug}" is not in PERMISSION_SLUGS — add it to permission-slugs.ts (and give it a row in database/seedData/permissions.ts)`,
    );
  }
}
