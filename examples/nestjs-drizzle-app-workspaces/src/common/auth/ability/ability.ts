// The whole ability model, in one function. Deliberately tiny, and deliberately not a Nest
// provider: it has no dependencies, does no I/O, and is imported by the server *and* by whatever
// renders the admin UI, so it must be usable outside a DI container and outside Node.
//
//   server:  const ability = defineAbilitiesFor(await permissions.forUser(userId))
//            ability.can("users:read", ABILITY_SUBJECT)     ← AbilityGuard
//   client:  const ability = defineAbilitiesFor(me.permissions)   ← from GET /auth/me
//            ability.can("users:read", ABILITY_SUBJECT)     ← show/hide a button
//
// Both sides build the ability from the same input (a flat list of permission slugs) with the
// same function, so the console cannot offer an action the API will refuse. `GET /auth/me` ships
// the slugs, not a serialised ability: the wire format is the permission list a human can read in
// a log, and the ability is a local derivation on either side.
//
// A permission slug is used as CASL's *action* and the subject is a constant empty string.
// That is what makes the model flat: there is no subject taxonomy to keep in sync with the
// database, no `(action, subject)` pairing to get wrong, and no conditions — which in turn means
// there is no such thing as a rule the route guard can only *partially* evaluate. What a slug
// means is decided entirely by which routes name it.
import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';

/**
 * The subject every rule is written against. CASL needs one; this model does not use subjects, so
 * there is exactly one, and it is a constant rather than a string literal repeated at each call
 * site — `can("users:read", "")` in one place and `can("users:read", "all")` in another would
 * silently never match.
 */
export const ABILITY_SUBJECT = '';

/** Actions are permission slugs; the subject is always `ABILITY_SUBJECT`. */
export type AppAbility = MongoAbility<[string, typeof ABILITY_SUBJECT]>;

/**
 * Builds the ability for a set of permission slugs.
 *
 * An empty list builds an ability with no rules at all, which denies everything — the fail-closed
 * answer for "we could not resolve any permissions", and the same answer as "this user genuinely
 * has none". There is no default-allow branch anywhere in this file.
 */
export function defineAbilitiesFor(permissions: readonly string[] = []): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const permission of permissions) can(permission, ABILITY_SUBJECT);
  return build();
}
