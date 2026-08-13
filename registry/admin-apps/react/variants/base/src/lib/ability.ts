import { AbilityBuilder, PureAbility } from "@casl/ability";
import { createContextualCan } from "@casl/react";
import type { CurrentUser } from "@easy-auth/auth-client";
import { createContext, useContext } from "react";

/**
 * The one place an `Ability` is constructed. Everything else in the app asks
 * `ability.can(permission, "permission")` and never looks at `currentUser.permissions` itself,
 * so the day the backend starts serving CASL rules directly this file is the only one that
 * changes — see `abilityFor` below.
 */
export type AppAbility = PureAbility<[string, "permission"]>;

/**
 * The backend's permission catalog (`rbac.defaults.ts` in every combo), named here so a typo is
 * a missing import rather than a silently-ungated button. Each key gates a real route: hiding
 * an action the caller can't perform and getting a 403 if they call it anyway are the same
 * rule, read from the same list.
 */
export const PERMISSIONS = {
  usersRead: "users:read",
  usersBlock: "users:block",
  usersManage: "users:manage",
  rolesManage: "roles:manage",
  rolesAssign: "roles:assign",
  permissionsGrant: "permissions:grant",
  permissionsRead: "permissions:read",
  permissionsDefine: "permissions:define",
  auditLogRead: "audit-log:read",
  customersRead: "customers:read",
  customersManage: "customers:manage",
  customersStatus: "customers:status",
  countriesRead: "countries:read",
  countriesManage: "countries:manage",
  countriesStatus: "countries:status",
  languagesRead: "languages:read",
  languagesManage: "languages:manage",
  languagesStatus: "languages:status",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * `GET /auth/me` answers with a flat `permissions` array — one opaque `noun:verb` key per
 * capability, not an action/subject pair — so each key becomes an allowed "action" on a single
 * "permission" subject and `can(key, "permission")` is the only question this ability answers.
 *
 * **When `/auth/me` grows its `rules` field** (CASL rules serialized with `packRules` from
 * `@casl/ability/extra`), replace the body of this function with
 * `new PureAbility(unpackRules(user.rules))` and delete the builder loop. Nothing else in the
 * app moves: call sites already ask this ability rather than reading `permissions`, and the
 * `PERMISSIONS` keys above stay valid as the actions those rules carry. Until the field exists,
 * `permissions` is the input.
 */
export function abilityFor(user: CurrentUser | null): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(PureAbility);
  for (const permission of user?.permissions ?? []) can(permission, "permission");
  return build();
}

export const AbilityContext = createContext<AppAbility>(abilityFor(null));

export const Can = createContextualCan(AbilityContext.Consumer);

export function useAbility(): AppAbility {
  return useContext(AbilityContext);
}

/** True when the ability carries at least one of `permissions` — the "can they open this page at all" question. */
export function canAny(ability: AppAbility, permissions: readonly string[]): boolean {
  return permissions.some((permission) => ability.can(permission, "permission"));
}
