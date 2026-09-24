// Seed data: the roles a fresh database starts with, and which of them the seeded accounts
// get. Only `database/seed.ts` (and the proof harness) read this; the app never does.
import {
  PERMISSION_SLUGS,
  type PermissionSlug,
} from "../../src/modules/auth/permission-slugs.js";

export interface RoleSeed {
  slug: string;
  displayName: string;
  description: string;
  /** Given to every newly signed-up user. Exactly one role should carry it. */
  isDefault: boolean;
  order: number;
  permissions: readonly PermissionSlug[];
}

// The roles the seeded workspace is provisioned with. `admin` carries the whole
// catalog; `member` is the new-membership default and carries nothing. No guard checks for the
// literal string "admin" — authority comes only from the permissions a role carries.
export const DEFAULT_ROLES: readonly RoleSeed[] = [
  {
    slug: "admin",
    displayName: "Administrator",
    description: "Carries every permission in the catalog.",
    isDefault: false,
    order: 0,
    permissions: PERMISSION_SLUGS,
  },
  {
    slug: "superadmin",
    displayName: "Super Admin",
    description:
      "Carries every permission in the catalog — same authority as admin, held by the seeded super_admin account's membership (see SEED_SUPERADMIN_* in seed.ts).",
    isDefault: false,
    order: 1,
    permissions: PERMISSION_SLUGS,
  },
  {
    slug: "member",
    displayName: "Member",
    description:
      "The default for a new membership. Carries no administrative permission.",
    isDefault: true,
    order: 2,
    permissions: [],
  },
];

/** Role slugs given to the seeded admin's membership. `member` is included so they're also an ordinary member. */
export const SEED_ADMIN_ROLES: string[] = ["admin", "member"];

/** Role slugs given to the seeded super_admin's membership. `member` is included so they're also an ordinary member. */
export const SEED_SUPERADMIN_ROLES: string[] = ["superadmin", "member"];
