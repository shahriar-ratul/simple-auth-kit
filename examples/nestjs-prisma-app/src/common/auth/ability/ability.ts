// Deliberately not a Nest provider: no dependencies, no I/O, imported by both the server and
// whatever renders the admin UI, so it must work outside a DI container and outside Node. Both
// sides build the ability from the same flat permission-slug list with this same function, so
// the console can never offer an action the API would refuse.
//
// A permission slug is CASL's *action*; the subject is always a constant empty string. That
// keeps the model flat — no subject taxonomy, no (action, subject) pairing to get wrong, no
// conditions.
import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';

// Constant rather than a repeated string literal — `can("users:read", "")` in one place and
// `can("users:read", "all")` in another would silently never match.
export const ABILITY_SUBJECT = '';

export type AppAbility = MongoAbility<[string, typeof ABILITY_SUBJECT]>;

// An empty list builds an ability with no rules, which denies everything — the fail-closed
// answer whether permissions failed to resolve or the user genuinely has none.
export function defineAbilitiesFor(permissions: readonly string[] = []): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const permission of permissions) can(permission, ABILITY_SUBJECT);
  return build();
}
