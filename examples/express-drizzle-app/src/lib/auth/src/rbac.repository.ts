import { and, asc, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm";
import { resolvePermissions } from "@/lib/auth/core/rbac.js";
import type { Database } from "./db.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";
import { PermissionCache } from "./permission-cache.js";
import { permissionRole, permissionUser, permissions, roleUser, roles, users } from "./schema.js";
import { HttpError } from "./http-error.js";
import { toId, toIdOrNull } from "./id.helper.js";

/**
 * Every column the `users` table has, except the two secrets (`passwordHash`, `twoFactorSecret`
 * — never leave the server). Deliberately NOT a hand-picked subset: a shaping function that only
 * forwards "the fields the UI happens to need today" means every future field the UI wants is
 * another round-trip through repository → service → response shape → client type → UI, across
 * every combo. Forwarding the whole safe row once means that trip never has to happen again.
 */
export interface UserSummary {
  id: string;
  uuid: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  username: string | null;
  photo: string | null;
  lastLogin: string | null;
  blocked: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  roles: string[];
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserListFilter {
  search?: string;
  page?: number;
  limit?: number;
}

export type UserListResult = Paginated<UserSummary>;

/** A `users` row the way `listUsers`/`getUser` assemble it — the base columns plus the roles join, resolved separately since Drizzle has no nested-include shorthand for a many-to-many. */
export type UserRow = typeof users.$inferSelect & { roles: string[] };

/**
 * Shapes a raw row into the wire DTO — bigint id to string, `Date` to ISO. Exported so callers
 * that need the collection (paginated `listUsers`) can apply it themselves at the service layer
 * instead of the repository doing it on their behalf.
 */
export function toUserSummary(row: UserRow): UserSummary {
  return {
    id: row.id.toString(),
    uuid: row.uuid,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    phone: row.phone,
    username: row.username,
    photo: row.photo,
    lastLogin: row.lastLogin?.toISOString() ?? null,
    blocked: row.blocked,
    isActive: row.isActive,
    twoFactorEnabled: row.twoFactorEnabled,
    roles: row.roles,
    createdBy: row.createdBy?.toString() ?? null,
    updatedBy: row.updatedBy?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A `permissions` row as the catalog endpoints return it. */
export interface PermissionSummary {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  description: string | null;
  group: string;
  groupOrder: number;
  order: number;
  isActive: boolean;
}

export interface PermissionInput {
  slug: string;
  name?: string;
  displayName?: string;
  description?: string | null;
  group?: string;
  groupOrder?: number;
  order?: number;
  isActive?: boolean;
}

export interface RoleSummary {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
}

const PERMISSION_COLUMNS = {
  id: permissions.id,
  slug: permissions.slug,
  name: permissions.name,
  displayName: permissions.displayName,
  description: permissions.description,
  group: permissions.group,
  groupOrder: permissions.groupOrder,
  order: permissions.order,
  isActive: permissions.isActive,
} as const;

const ROLE_COLUMNS = {
  id: roles.id,
  slug: roles.slug,
  name: roles.name,
  displayName: roles.displayName,
  isDefault: roles.isDefault,
  isActive: roles.isActive,
} as const;

interface PermissionRow {
  id: bigint;
  slug: string;
  name: string;
  displayName: string;
  description: string | null;
  group: string;
  groupOrder: number;
  order: number;
  isActive: boolean;
}

interface RoleRow {
  id: bigint;
  slug: string;
  name: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
}

const asPermissionSummary = (row: PermissionRow): PermissionSummary => ({ ...row, id: row.id.toString() });

const asRoleSummary = (row: RoleRow): RoleSummary => ({ ...row, id: row.id.toString() });

export class RbacRepository {
  constructor(
    private readonly db: Database,
    private readonly cache: PermissionCache,
  ) {}

  // Every write below ends by bumping a version counter, and which counter is the whole design:
  // a change to one user's roles or grants bumps only that user (`invalidateSubject`), while a
  // change to what a role carries, or to whether a permission is active, bumps everyone
  // (`invalidatePolicy`) — because those genuinely do affect everyone who holds the role, and
  // enumerating them is the fan-out this scheme exists to avoid.

  /**
   * The hot path: every authenticated request runs this once.
   *
   * Three reads, walking `user → role_user → roles → permission_role → permissions` and
   * `user → permission_user → permissions`. The access token carries no authorization at all, so
   * this is the only place a caller's authority is decided, and a grant or a revocation therefore
   * takes effect on their **next request** rather than their next token.
   *
   * `isActive: false` on a role or a permission takes it out of the answer here, which is what
   * makes deactivating either one enforcement-changing without unpicking any grant; `isDeleted`
   * on the user themselves takes the whole answer to empty.
   */
  async resolveAuthzContext(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const userIdBig = toId(userId);
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userIdBig), eq(users.isDeleted, false)))
      .limit(1);
    if (!user) return { roles: [], permissions: [] };

    const [roleRows, directRows] = await Promise.all([
      // Left-joined through to the permission so a role that carries nothing still appears in
      // `roles` — the two halves of the answer come from one read rather than two.
      this.db
        .select({ roleSlug: roles.slug, permissionSlug: permissions.slug })
        .from(roleUser)
        .innerJoin(roles, and(eq(roles.id, roleUser.roleId), eq(roles.isActive, true), eq(roles.isDeleted, false)))
        .leftJoin(permissionRole, eq(permissionRole.roleId, roles.id))
        .leftJoin(permissions, and(eq(permissions.id, permissionRole.permissionId), eq(permissions.isActive, true), eq(permissions.isDeleted, false)))
        .where(eq(roleUser.userId, userIdBig)),
      this.db
        .select({ slug: permissions.slug })
        .from(permissionUser)
        .innerJoin(permissions, and(eq(permissions.id, permissionUser.permissionId), eq(permissions.isActive, true), eq(permissions.isDeleted, false)))
        .where(eq(permissionUser.userId, userIdBig)),
    ]);

    return {
      roles: [...new Set(roleRows.map((row) => row.roleSlug))].sort(),
      permissions: resolvePermissions(
        roleRows.map((row) => row.permissionSlug).filter((slug): slug is string => slug !== null),
        directRows.map((row) => row.slug),
      ),
    };
  }

  /**
   * Newest-first, page-paginated; `search` matches an email substring. Returns raw rows, not
   * `UserSummary` — shaping each row is the caller's job (`AuthService.listUsers` does it via
   * `toUserSummary`), so this method's only responsibility is the query and the page envelope.
   */
  async listUsers(filter: UserListFilter = {}): Promise<Paginated<UserRow>> {
    const page = normalizePage(filter.page);
    const limit = normalizeLimit(filter.limit);

    const conditions: SQL[] = [eq(users.isDeleted, false)];
    if (filter.search) conditions.push(ilike(users.email, `%${filter.search}%`));
    const where = and(...conditions)!;

    const rows = await this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(limit)
      .offset((page - 1) * limit);
    const [{ value: total }] = await this.db.select({ value: count() }).from(users).where(where);

    // One read for the page's role assignments rather than one per user.
    const assignments = rows.length
      ? await this.db
          .select({ userId: roleUser.userId, slug: roles.slug })
          .from(roleUser)
          .innerJoin(roles, eq(roles.id, roleUser.roleId))
          .where(
            inArray(
              roleUser.userId,
              rows.map((row) => row.id),
            ),
          )
      : [];
    const rolesByUser = new Map<string, string[]>();
    for (const row of assignments) {
      const key = row.userId.toString();
      rolesByUser.set(key, [...(rolesByUser.get(key) ?? []), row.slug]);
    }

    return {
      items: rows.map((row) => ({ ...row, roles: (rolesByUser.get(row.id.toString()) ?? []).sort() })),
      meta: buildPageMeta(page, limit, total),
    };
  }

  /** Fetches one user by id. Same `isDeleted: false` filter as `listUsers` — a soft-deleted account 404s like any other deleted row. */
  async getUser(userId: string): Promise<UserSummary> {
    const userIdBig = toId(userId);
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userIdBig), eq(users.isDeleted, false)))
      .limit(1);
    if (!row) throw new HttpError(404, `user "${userId}" not found`);

    const roleRows = await this.db.select({ slug: roles.slug }).from(roleUser).innerJoin(roles, eq(roles.id, roleUser.roleId)).where(eq(roleUser.userId, userIdBig));
    return toUserSummary({ ...row, roles: roleRows.map((r) => r.slug).sort() });
  }

  /**
   * An administrator provisioning an account directly, as distinct from `/auth/signup` — the row
   * is otherwise identical, right down to which roles a bare account gets by default.
   */
  async createUser(
    input: {
      email: string;
      passwordHash: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
      phone?: string;
      username?: string;
      roles?: string[];
    },
    actorUserId: string | null,
  ): Promise<UserSummary> {
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) throw new HttpError(409, "email already registered");

    const [user] = await this.db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        phone: input.phone,
        username: input.username,
        createdBy: toIdOrNull(actorUserId),
      })
      .returning();

    if (input.roles && input.roles.length > 0) {
      const granted = await this.db
        .select({ id: roles.id })
        .from(roles)
        .where(and(inArray(roles.slug, input.roles), eq(roles.isActive, true), eq(roles.isDeleted, false)));
      if (granted.length) {
        await this.db
          .insert(roleUser)
          .values(granted.map((role) => ({ userId: user.id, roleId: role.id })))
          .onConflictDoNothing({ target: [roleUser.userId, roleUser.roleId] });
        await this.cache.invalidateSubject(user.id.toString());
      }
    } else {
      await this.assignDefaultRoles(user.id);
    }

    return this.getUser(user.id.toString());
  }

  /**
   * Profile fields only — email is the login identifier and stays out of this endpoint to avoid
   * uniqueness/re-verification concerns a general "edit profile" screen shouldn't have to handle.
   */
  async updateUser(
    userId: string,
    input: { firstName?: string | null; lastName?: string | null; displayName?: string | null; phone?: string | null; username?: string | null; photo?: string | null },
    actorUserId: string | null,
  ): Promise<UserSummary> {
    const userIdBig = toId(userId);
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userIdBig), eq(users.isDeleted, false)))
      .limit(1);
    if (!existing) throw new HttpError(404, `user "${userId}" not found`);

    await this.db
      .update(users)
      .set({ ...input, updatedBy: toIdOrNull(actorUserId) })
      .where(eq(users.id, userIdBig));
    return this.getUser(userId);
  }

  /**
   * Soft-delete, matching every other table's `isDeleted`/`deletedAt`/`deletedBy`/`deletedReason`
   * pattern — the row survives for audit purposes, it just stops appearing in listings and can no
   * longer authenticate (mirrors how `block` already disables login without removing the row).
   */
  async deleteUser(userId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const userIdBig = toId(userId);
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userIdBig), eq(users.isDeleted, false)))
      .limit(1);
    if (!existing) throw new HttpError(404, `user "${userId}" not found`);

    await this.db
      .update(users)
      .set({ isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null })
      .where(eq(users.id, userIdBig));
    await this.cache.invalidateSubject(userId);
  }

  async updateRole(
    roleId: string,
    input: { name?: string; displayName?: string; description?: string | null; isActive?: boolean },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    const roleIdBig = toId(roleId);
    const [existing] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.id, roleIdBig), eq(roles.isDeleted, false)))
      .limit(1);
    if (!existing) throw new HttpError(404, "role not found");

    const [role] = await this.db
      .update(roles)
      .set({ ...input, updatedBy: toIdOrNull(actorUserId) })
      .where(eq(roles.id, roleIdBig))
      .returning(ROLE_COLUMNS);
    // Renaming/deactivating changes what every holder resolves to.
    await this.cache.invalidatePolicy();
    return asRoleSummary(role);
  }

  /**
   * Soft-delete. The `role_user`/`permission_role` rows pointing at it are left in place — a
   * deleted role simply stops being returned by `listRoles`/`resolveAuthzContext`, rather than
   * cascading a delete that would silently strip a user's other roles' foreign keys.
   */
  async deleteRole(roleId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const roleIdBig = toId(roleId);
    const [existing] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.id, roleIdBig), eq(roles.isDeleted, false)))
      .limit(1);
    if (!existing) throw new HttpError(404, "role not found");

    await this.db
      .update(roles)
      .set({ isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null })
      .where(eq(roles.id, roleIdBig));
    await this.cache.invalidatePolicy();
  }

  // ---- the catalog itself ----

  /** Every permission this deployment defines, in the order an admin console should render them. */
  async listPermissions(): Promise<PermissionSummary[]> {
    const rows = await this.db
      .select(PERMISSION_COLUMNS)
      .from(permissions)
      .where(eq(permissions.isDeleted, false))
      .orderBy(asc(permissions.groupOrder), asc(permissions.group), asc(permissions.order), asc(permissions.slug));
    return rows.map(asPermissionSummary);
  }

  /**
   * Defines a permission, or edits one. The write path for "the catalog is editable in the
   * database": a deployment can add a capability of its own, rename one for the console, or set
   * `isActive: false` to take an existing one out of every ability it appears in — all without a
   * deploy, and all visible on the very next request.
   *
   * Upserted on `slug`, which stays the stable identifier grants and revocations use, so renaming
   * `name`/`displayName` never breaks a grant.
   */
  async upsertPermission(input: PermissionInput, actorUserId: string | null): Promise<PermissionSummary> {
    const actorId = toIdOrNull(actorUserId);
    // Only the fields the caller sent are written; an absent one leaves its column alone, so a
    // partial edit cannot blank out metadata it did not mention.
    const changed = Object.fromEntries(
      Object.entries({
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        group: input.group,
        groupOrder: input.groupOrder,
        order: input.order,
        isActive: input.isActive,
      }).filter(([, value]) => value !== undefined),
    );

    const [permission] = await this.db
      .insert(permissions)
      .values({
        slug: input.slug,
        ...changed,
        name: input.name ?? input.displayName ?? input.slug,
        displayName: input.displayName ?? input.slug,
        group: input.group ?? "Custom",
        createdBy: actorId,
        updatedBy: actorId,
      })
      // An upsert with nothing to change still has to return the existing row, and `DO NOTHING`
      // returns none — so the no-op case rewrites the slug with itself.
      .onConflictDoUpdate({
        target: permissions.slug,
        set: Object.keys(changed).length ? { ...changed, updatedBy: actorId } : { slug: input.slug, updatedBy: actorId },
      })
      .returning(PERMISSION_COLUMNS);

    // `isActive` can change here, and it changes what every holder resolves to.
    await this.cache.invalidatePolicy();
    return asPermissionSummary(permission);
  }

  async listRoles(): Promise<RoleSummary[]> {
    const rows = await this.db.select(ROLE_COLUMNS).from(roles).where(eq(roles.isDeleted, false)).orderBy(asc(roles.order), asc(roles.slug));
    return rows.map(asRoleSummary);
  }

  async createRole(input: { slug: string; name?: string; displayName?: string; description?: string | null }, actorUserId: string | null): Promise<RoleSummary> {
    const actorId = toIdOrNull(actorUserId);
    const [role] = await this.db
      .insert(roles)
      .values({
        slug: input.slug,
        name: input.name ?? input.displayName ?? input.slug,
        displayName: input.displayName ?? input.slug,
        description: input.description ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning(ROLE_COLUMNS);
    return asRoleSummary(role);
  }

  /**
   * A permission slug this deployment never defined is created on the spot, inactive-safe: it
   * exists, it can be granted, and it opens nothing until a route names it. That is the same
   * closed-catalog property the routes always had — `@CheckAbility` only accepts slugs from
   * `rbac.defaults.ts`, so an invented slug cannot gate anything shipped by this library.
   */
  async attachPermissionToRole(roleId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    const roleIdBig = toId(roleId);
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.id, roleIdBig), eq(roles.isDeleted, false)))
      .limit(1);
    if (!role) throw new HttpError(404, "role not found");

    const permission = await this.ensurePermission(permissionSlug, actorUserId);
    await this.db
      .insert(permissionRole)
      .values({ permissionId: permission.id, roleId: roleIdBig })
      .onConflictDoNothing({ target: [permissionRole.permissionId, permissionRole.roleId] });
    await this.cache.invalidatePolicy(); // everyone holding this role is affected
  }

  async assignRoleToUser(userId: string, roleSlug: string): Promise<void> {
    const userIdBig = toId(userId);
    const [role] = await this.db.select({ id: roles.id }).from(roles).where(eq(roles.slug, roleSlug)).limit(1);
    if (!role) throw new HttpError(404, `role "${roleSlug}" not found`);

    const [user] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, userIdBig)).limit(1);
    if (!user) throw new HttpError(404, `user "${userId}" not found`);

    await this.db.insert(roleUser).values({ userId: userIdBig, roleId: role.id }).onConflictDoNothing({ target: [roleUser.userId, roleUser.roleId] });
    await this.cache.invalidateSubject(userId);
  }

  async revokeRoleFromUser(userId: string, roleSlug: string): Promise<void> {
    const userIdBig = toId(userId);
    const [role] = await this.db.select({ id: roles.id }).from(roles).where(eq(roles.slug, roleSlug)).limit(1);
    if (!role) return;
    await this.db.delete(roleUser).where(and(eq(roleUser.userId, userIdBig), eq(roleUser.roleId, role.id)));
    await this.cache.invalidateSubject(userId);
  }

  /**
   * The roles a brand-new user starts with — the rows flagged `isDefault`, not a string literal.
   * Called at signup and for a user created by an OAuth login who holds no roles at all, so it
   * can never re-add a role an administrator has revoked from an existing user.
   *
   * Takes bigint directly: every caller already has the user row's id in hand from its own
   * database lookup, so there's nothing to parse here.
   */
  async assignDefaultRoles(userId: bigint): Promise<void> {
    const defaults = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.isDefault, true), eq(roles.isActive, true), eq(roles.isDeleted, false)));
    if (!defaults.length) return;
    await this.db
      .insert(roleUser)
      .values(defaults.map((role) => ({ userId, roleId: role.id })))
      .onConflictDoNothing({ target: [roleUser.userId, roleUser.roleId] });
    await this.cache.invalidateSubject(userId.toString());
  }

  async hasAnyRole(userId: bigint): Promise<boolean> {
    const [row] = await this.db.select({ value: count() }).from(roleUser).where(eq(roleUser.userId, userId));
    return (row?.value ?? 0) > 0;
  }

  async grantPermissionToUser(userId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    const userIdBig = toId(userId);
    const permission = await this.ensurePermission(permissionSlug, actorUserId);
    await this.db
      .insert(permissionUser)
      .values({ userId: userIdBig, permissionId: permission.id })
      .onConflictDoNothing({ target: [permissionUser.userId, permissionUser.permissionId] });
    await this.cache.invalidateSubject(userId);
  }

  async revokePermissionFromUser(userId: string, permissionSlug: string): Promise<void> {
    const userIdBig = toId(userId);
    const [permission] = await this.db.select({ id: permissions.id }).from(permissions).where(eq(permissions.slug, permissionSlug)).limit(1);
    if (!permission) return;
    await this.db.delete(permissionUser).where(and(eq(permissionUser.userId, userIdBig), eq(permissionUser.permissionId, permission.id)));
    await this.cache.invalidateSubject(userId);
  }

  /** Bumped by `AuthService.block`: a blocked account should not keep serving a warm entry either, even though the block itself is enforced on the authentication path. */
  async invalidateUser(userId: string): Promise<void> {
    await this.cache.invalidateSubject(userId);
  }

  /**
   * Creates the row for a slug granted before anyone defined it; leaves an existing definition
   * alone. Returns bigint directly: both callers feed the id straight into another database call.
   */
  private async ensurePermission(slug: string, actorUserId: string | null): Promise<{ id: bigint }> {
    const [existing] = await this.db.select({ id: permissions.id }).from(permissions).where(eq(permissions.slug, slug)).limit(1);
    if (existing) return existing;
    const actorId = toIdOrNull(actorUserId);
    const [created] = await this.db
      .insert(permissions)
      .values({ slug, name: slug, displayName: slug, group: "Custom", createdBy: actorId, updatedBy: actorId })
      .returning({ id: permissions.id });
    return created;
  }
}
