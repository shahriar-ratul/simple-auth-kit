import { Ability, AbilityBuilder } from "@casl/ability";
import type { CurrentUser } from "@easy-auth/auth-client";

/**
 * The one place the console decides what the signed-in user may do. Every screen asks this
 * module and nothing else — no page reads `currentUser.permissions` (or `roles`) directly — so
 * there is a single seam to move when the backend changes how it reports authority.
 *
 * ── When `/auth/me` grows `rules` ──────────────────────────────────────────────────────────
 * The backend is about to serialize the caller's real CASL rules with `packRules` from
 * `@casl/ability/extra` and return them as `CurrentUser.rules`. When that lands, the switch is
 * this file alone:
 *
 *   import { unpackRules } from "@casl/ability/extra";
 *   export function buildAbility(user: CurrentUser | null): AppAbility {
 *     return new Ability(user ? unpackRules(user.rules) : []);
 *   }
 *
 * `hasPermission` and every call site below it keep working unchanged, because they already
 * phrase the question as "can I do this", not "is this string in that array". Until the field
 * exists we build the same shape of ability out of `permissions`, which is what the server's
 * PermissionGuard checks today — so the two cannot disagree.
 */

/** Permission keys are atomic capability flags, not action/subject pairs — see `PERMISSIONS`. */
export type AppAbility = Ability<string>;

/**
 * The backend's permission catalog (`rbac.defaults.ts`), mirrored here so a screen names a
 * capability rather than spelling a string. These are exactly the keys the server's
 * `@RequirePermission` decorators demand: hiding a control on one of them and getting a 403
 * from the matching route are the same fact, reported twice.
 */
export const PERMISSIONS = {
  usersRead: "users:read",
  usersManage: "users:manage",
  usersBlock: "users:block",
  rolesManage: "roles:manage",
  rolesAssign: "roles:assign",
  permissionsRead: "permissions:read",
  permissionsDefine: "permissions:define",
  permissionsGrant: "permissions:grant",
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

/** The roles screen carries three independent capabilities; any one of them is worth opening it for. */
export const ROLES_SCREEN_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.rolesManage,
  PERMISSIONS.rolesAssign,
  PERMISSIONS.permissionsGrant,
];

/**
 * Permission keys ("users:block") aren't real action:subject pairs, so we don't model CASL
 * subjects at all — `Ability<string>` treats each key as its own atomic "can I do this" flag.
 *
 * There is deliberately no role-name shortcut here. The server grants authority from permissions
 * only — a role called "admin" that carries nothing gets the same 403 as no role at all — so a
 * wildcard for `roles.includes("admin")` would make the console promise what the server refuses.
 */
export function buildAbility(user: CurrentUser | null): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(Ability);
  for (const permission of user?.permissions ?? []) can(permission);
  return build();
}

export function hasPermission(ability: AppAbility, permissionKey: PermissionKey): boolean {
  return ability.can(permissionKey);
}

/** For a screen that several capabilities can each open on their own — see the roles screen. */
export function hasAnyPermission(ability: AppAbility, permissionKeys: readonly PermissionKey[]): boolean {
  return permissionKeys.some((key) => ability.can(key));
}

/** The tooltip a disabled control carries, so "why is this greyed out" is answerable in place. */
export function missingPermissionHint(permissionKey: PermissionKey): string {
  return `You need the "${permissionKey}" permission to do this.`;
}
