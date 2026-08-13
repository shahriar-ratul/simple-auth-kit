import { and, asc, count, desc, eq, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import { resolvePermissions } from "@/lib/auth/core/rbac.js";
import type { Database } from "./db.js";
import { PermissionCache } from "./permission-cache.js";
import { permissionRole, permissionUser, permissions, roleUser, roles, users } from "./schema.js";
import { HttpError } from "./http-error.js";
import { toId, toIdOrNull } from "./id.helper.js";

export interface UserSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  username: string | null;
  photo: string | null;
  dob: string | null;
  gender: string | null;
  joinedDate: string;
  lastLogin: string | null;
  blocked: boolean;
  roles: string[];
  createdAt: string;
}

export interface UserListFilter {
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface UserListResult {
  users: UserSummary[];
  nextCursor: string | null;
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

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

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

  /** Newest-first, cursor-paginated (cursor = the last-seen row's `id`); `search` matches an email substring. */
  async listUsers(filter: UserListFilter = {}): Promise<UserListResult> {
    const limit = Math.min(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const conditions: SQL[] = [eq(users.isDeleted, false)];
    if (filter.search) conditions.push(ilike(users.email, `%${filter.search}%`));

    // `(createdAt, id) < (cursor.createdAt, cursor.id)`, spelled out so both halves of the
    // ordering key are compared — the same rows Prisma's `cursor`/`skip: 1` would skip.
    if (filter.cursor) {
      const cursorId = toId(filter.cursor);
      const [anchor] = await this.db.select({ id: users.id, createdAt: users.createdAt }).from(users).where(eq(users.id, cursorId)).limit(1);
      if (!anchor) return { users: [], nextCursor: null };
      conditions.push(or(lt(users.createdAt, anchor.createdAt), and(eq(users.createdAt, anchor.createdAt), lt(users.id, anchor.id)))!);
    }

    const rows = await this.db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // One read for the page's role assignments rather than one per user.
    const assignments = page.length
      ? await this.db
          .select({ userId: roleUser.userId, slug: roles.slug })
          .from(roleUser)
          .innerJoin(roles, eq(roles.id, roleUser.roleId))
          .where(
            inArray(
              roleUser.userId,
              page.map((row) => row.id),
            ),
          )
      : [];
    const rolesByUser = new Map<string, string[]>();
    for (const row of assignments) {
      const key = row.userId.toString();
      rolesByUser.set(key, [...(rolesByUser.get(key) ?? []), row.slug]);
    }

    return {
      users: page.map((row) => ({
        id: row.id.toString(),
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        displayName: row.displayName,
        phone: row.phone,
        username: row.username,
        photo: row.photo,
        dob: row.dob,
        gender: row.gender,
        joinedDate: row.joinedDate,
        lastLogin: row.lastLogin?.toISOString() ?? null,
        blocked: row.blocked,
        roles: (rolesByUser.get(row.id.toString()) ?? []).sort(),
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1].id.toString() : null,
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
    return this.mapUserSummary(row, roleRows.map((r) => r.slug));
  }

  /**
   * Profile fields only — email is the login identifier and stays out of this endpoint to avoid
   * uniqueness/re-verification concerns a general "edit profile" screen shouldn't have to handle.
   */
  async updateUser(
    userId: string,
    input: {
      firstName?: string | null;
      lastName?: string | null;
      displayName?: string | null;
      phone?: string | null;
      username?: string | null;
      photo?: string | null;
      dob?: string | null;
      gender?: string | null;
      joinedDate?: string;
    },
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
    input: { name?: string; displayName?: string; description?: string | null; isDefault?: boolean; isActive?: boolean },
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

  async createRole(
    input: { slug: string; name?: string; displayName?: string; description?: string | null; isDefault?: boolean; isActive?: boolean },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    const actorId = toIdOrNull(actorUserId);
    const [role] = await this.db
      .insert(roles)
      .values({
        slug: input.slug,
        name: input.name ?? input.displayName ?? input.slug,
        displayName: input.displayName ?? input.slug,
        description: input.description ?? null,
        isDefault: input.isDefault,
        isActive: input.isActive,
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

  /** Shared by `getUser`/`updateUser` (and inlined in `listUsers`, which fetches roles for a whole page at once instead). */
  private mapUserSummary(row: typeof users.$inferSelect, roleSlugs: string[]): UserSummary {
    return {
      id: row.id.toString(),
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: row.displayName,
      phone: row.phone,
      username: row.username,
      photo: row.photo,
      dob: row.dob,
      gender: row.gender,
      joinedDate: row.joinedDate,
      lastLogin: row.lastLogin?.toISOString() ?? null,
      blocked: row.blocked,
      roles: roleSlugs.sort(),
      createdAt: row.createdAt.toISOString(),
    };
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
