import { resolvePermissions } from "@/lib/auth/core/rbac.js";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { HttpError } from "./http-error.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";
import { PermissionCache } from "./permission-cache.js";
import { toId, toIdOrNull } from "./id.helper.js";

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

const USER_ROLES_INCLUDE = { roles: { select: { role: { select: { slug: true } } } } } as const;

/** A `User` row as `findUnique`/`findMany` return it with its roles joined in. */
export type UserRow = Prisma.UserGetPayload<{ include: typeof USER_ROLES_INCLUDE }>;

/**
 * Shapes a raw row into the wire DTO — bigint id to string, `Date` to ISO, the roles relation
 * to a flat slug list. Exported so callers that need the collection (paginated `listUsers`) can
 * apply it themselves at the service layer instead of the repository doing it on their behalf.
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
    roles: row.roles.map((r) => r.role.slug).sort(),
    createdBy: row.createdBy?.toString() ?? null,
    updatedBy: row.updatedBy?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A `Permission` row as the catalog endpoints return it. */
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

const PERMISSION_SELECT = {
  id: true,
  slug: true,
  name: true,
  displayName: true,
  description: true,
  group: true,
  groupOrder: true,
  order: true,
  isActive: true,
} as const;

const ROLE_SELECT = { id: true, slug: true, name: true, displayName: true, isDefault: true, isActive: true } as const;

export class RbacRepository {
  constructor(
    private readonly prisma: PrismaClient,
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
   * One call, walking `user → role_user → roles → permission_role → permissions` and
   * `user → permission_user → permissions`. The access token carries no authorization at all, so
   * this is the only place a caller's authority is decided, and a grant or a revocation therefore
   * takes effect on their **next request** rather than their next token.
   *
   * Cost is constant in the number of users: every hop is an indexed read on a primary key or a
   * composite join-table key, and the row counts involved are "roles this user holds" and
   * "permissions those roles carry" — a handful, whatever the size of the deployment.
   *
   * `isActive: false` on a role or a permission takes it out of the answer here, which is what
   * makes deactivating either one enforcement-changing without unpicking any grant.
   */
  async resolveAuthzContext(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: toId(userId), isDeleted: false },
      select: {
        roles: {
          where: { role: { isActive: true, isDeleted: false } },
          select: {
            role: {
              select: {
                slug: true,
                permissions: { where: { permission: { isActive: true, isDeleted: false } }, select: { permission: { select: { slug: true } } } },
              },
            },
          },
        },
        permissions: { where: { permission: { isActive: true, isDeleted: false } }, select: { permission: { select: { slug: true } } } },
      },
    });
    if (!user) return { roles: [], permissions: [] };

    const rolePermissions = user.roles.flatMap((roleUser) => roleUser.role.permissions.map((pr) => pr.permission.slug));
    const directPermissions = user.permissions.map((pu) => pu.permission.slug);

    return {
      roles: user.roles.map((roleUser) => roleUser.role.slug).sort(),
      permissions: resolvePermissions(rolePermissions, directPermissions),
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
    const where = {
      isDeleted: false,
      email: filter.search ? { contains: filter.search, mode: "insensitive" as const } : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: USER_ROLES_INCLUDE,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: rows, meta: buildPageMeta(page, limit, total) };
  }

  async getUser(userId: string): Promise<UserSummary> {
    const row = await this.prisma.user.findUnique({
      where: { id: toId(userId), isDeleted: false },
      include: USER_ROLES_INCLUDE,
    });
    if (!row) throw new HttpError(404, `user "${userId}" not found`);
    return toUserSummary(row);
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
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new HttpError(409, "email already registered");

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        phone: input.phone,
        username: input.username,
        createdBy: toIdOrNull(actorUserId),
      },
    });

    if (input.roles && input.roles.length > 0) {
      const roles = await this.prisma.role.findMany({ where: { slug: { in: input.roles }, isActive: true, isDeleted: false }, select: { id: true } });
      if (roles.length > 0) {
        await this.prisma.roleUser.createMany({ data: roles.map((role) => ({ userId: user.id, roleId: role.id })), skipDuplicates: true });
        await this.cache.invalidateSubject(user.id.toString());
      }
    } else {
      await this.assignDefaultRoles(user.id);
    }

    return this.getUser(user.id.toString());
  }

  // Profile fields only — email is the login identifier and stays out of this endpoint to avoid
  // uniqueness/re-verification concerns a general "edit profile" screen shouldn't have to handle.
  async updateUser(
    userId: string,
    input: { firstName?: string | null; lastName?: string | null; displayName?: string | null; phone?: string | null; username?: string | null; photo?: string | null },
    actorUserId: string | null,
  ): Promise<UserSummary> {
    const userIdBig = toId(userId);
    const existing = await this.prisma.user.findUnique({ where: { id: userIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new HttpError(404, `user "${userId}" not found`);
    await this.prisma.user.update({ where: { id: userIdBig }, data: { ...input, updatedBy: toIdOrNull(actorUserId) } });
    return this.getUser(userId);
  }

  // Soft-delete, matching every other table's `isDeleted`/`deletedAt`/`deletedBy`/`deletedReason`
  // pattern — the row survives for audit purposes, it just stops appearing in listings and can
  // no longer authenticate (mirrors how `block` already disables login without removing the row).
  async deleteUser(userId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const userIdBig = toId(userId);
    const existing = await this.prisma.user.findUnique({ where: { id: userIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new HttpError(404, `user "${userId}" not found`);
    await this.prisma.user.update({
      where: { id: userIdBig },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
    await this.cache.invalidateSubject(userId);
  }

  async updateRole(
    roleId: string,
    input: { name?: string; displayName?: string; description?: string | null; isActive?: boolean },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    const roleIdBig = toId(roleId);
    const existing = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new HttpError(404, "role not found");
    const role = await this.prisma.role.update({
      where: { id: roleIdBig },
      data: { ...input, updatedBy: toIdOrNull(actorUserId) },
      select: ROLE_SELECT,
    });
    // Renaming/deactivating changes what every holder resolves to.
    await this.cache.invalidatePolicy();
    return { ...role, id: role.id.toString() };
  }

  // Soft-delete. The `role_user`/`permission_role` rows pointing at it are left in place — a
  // deleted role simply stops being returned by `listRoles`/`resolveAuthzContext`, rather than
  // cascading a delete that would silently strip a user's other roles' foreign keys.
  async deleteRole(roleId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const roleIdBig = toId(roleId);
    const existing = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new HttpError(404, "role not found");
    await this.prisma.role.update({
      where: { id: roleIdBig },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
    await this.cache.invalidatePolicy();
  }

  // ---- the catalog itself ----

  /** Every permission this deployment defines, in the order an admin console should render them. */
  async listPermissions(): Promise<PermissionSummary[]> {
    const rows = await this.prisma.permission.findMany({
      where: { isDeleted: false },
      select: PERMISSION_SELECT,
      orderBy: [{ groupOrder: "asc" }, { group: "asc" }, { order: "asc" }, { slug: "asc" }],
    });
    return rows.map((row) => ({ ...row, id: row.id.toString() }));
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
    const shared = {
      name: input.name,
      displayName: input.displayName,
      description: input.description,
      group: input.group,
      groupOrder: input.groupOrder,
      order: input.order,
      isActive: input.isActive,
      updatedBy: toIdOrNull(actorUserId),
    };
    const permission = await this.prisma.permission.upsert({
      where: { slug: input.slug },
      create: {
        slug: input.slug,
        ...shared,
        name: input.name ?? input.displayName ?? input.slug,
        displayName: input.displayName ?? input.slug,
        group: input.group ?? "Custom",
        createdBy: toIdOrNull(actorUserId),
      },
      // Only the fields the caller sent are written; `undefined` leaves a column alone, so a
      // partial edit cannot blank out metadata it did not mention.
      update: shared,
      select: PERMISSION_SELECT,
    });
    // `isActive` can change here, and it changes what every holder resolves to.
    await this.cache.invalidatePolicy();
    return { ...permission, id: permission.id.toString() };
  }

  async listRoles(): Promise<RoleSummary[]> {
    const rows = await this.prisma.role.findMany({ where: { isDeleted: false }, select: ROLE_SELECT, orderBy: [{ order: "asc" }, { slug: "asc" }] });
    return rows.map((row) => ({ ...row, id: row.id.toString() }));
  }

  async createRole(
    input: { slug: string; name?: string; displayName?: string; description?: string | null },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    const role = await this.prisma.role.create({
      data: {
        slug: input.slug,
        name: input.name ?? input.displayName ?? input.slug,
        displayName: input.displayName ?? input.slug,
        description: input.description ?? null,
        createdBy: toIdOrNull(actorUserId),
        updatedBy: toIdOrNull(actorUserId),
      },
      select: ROLE_SELECT,
    });
    return { ...role, id: role.id.toString() };
  }

  /**
   * A permission slug this deployment never defined is created on the spot, inactive-safe: it
   * exists, it can be granted, and it opens nothing until a route names it. That is the same
   * closed-catalog property the routes always had — `@CheckAbility` only accepts slugs from
   * `rbac.defaults.ts`, so an invented slug cannot gate anything shipped by this library.
   */
  async attachPermissionToRole(roleId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    const roleIdBig = toId(roleId);
    const role = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true } });
    if (!role) throw new HttpError(404, "role not found");

    const permission = await this.ensurePermission(permissionSlug, actorUserId);
    await this.prisma.permissionRole.upsert({
      where: { permissionId_roleId: { permissionId: permission.id, roleId: roleIdBig } },
      create: { permissionId: permission.id, roleId: roleIdBig },
      update: {},
    });
    await this.cache.invalidatePolicy(); // everyone holding this role is affected
  }

  async assignRoleToUser(userId: string, roleSlug: string): Promise<void> {
    const userIdBig = toId(userId);
    const role = await this.prisma.role.findUnique({ where: { slug: roleSlug }, select: { id: true } });
    if (!role) throw new HttpError(404, `role "${roleSlug}" not found`);

    await this.prisma.user.findUniqueOrThrow({ where: { id: userIdBig }, select: { id: true } });
    await this.prisma.roleUser.upsert({
      where: { userId_roleId: { userId: userIdBig, roleId: role.id } },
      create: { userId: userIdBig, roleId: role.id },
      update: {},
    });
    await this.cache.invalidateSubject(userId);
  }

  async revokeRoleFromUser(userId: string, roleSlug: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { slug: roleSlug }, select: { id: true } });
    if (!role) return;
    await this.prisma.roleUser.deleteMany({ where: { userId: toId(userId), roleId: role.id } });
    await this.cache.invalidateSubject(userId);
  }

  /**
   * The roles a brand-new user starts with — the rows flagged `isDefault`, not a string literal.
   * Called at signup and for a user created by an OAuth login who holds no roles at all, so it
   * can never re-add a role an administrator has revoked from an existing user.
   *
   * Takes bigint directly: every caller already has the user row's id in hand from its own
   * Prisma lookup, so there's no string to convert from.
   */
  async assignDefaultRoles(userId: bigint): Promise<void> {
    const defaults = await this.prisma.role.findMany({ where: { isDefault: true, isActive: true, isDeleted: false }, select: { id: true } });
    if (!defaults.length) return;
    await this.prisma.roleUser.createMany({ data: defaults.map((role) => ({ userId, roleId: role.id })), skipDuplicates: true });
    await this.cache.invalidateSubject(userId.toString());
  }

  async hasAnyRole(userId: bigint): Promise<boolean> {
    return (await this.prisma.roleUser.count({ where: { userId } })) > 0;
  }

  async grantPermissionToUser(userId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    const userIdBig = toId(userId);
    const permission = await this.ensurePermission(permissionSlug, actorUserId);
    await this.prisma.permissionUser.upsert({
      where: { userId_permissionId: { userId: userIdBig, permissionId: permission.id } },
      create: { userId: userIdBig, permissionId: permission.id },
      update: {},
    });
    await this.cache.invalidateSubject(userId);
  }

  async revokePermissionFromUser(userId: string, permissionSlug: string): Promise<void> {
    const permission = await this.prisma.permission.findUnique({ where: { slug: permissionSlug }, select: { id: true } });
    if (!permission) return;
    await this.prisma.permissionUser.deleteMany({ where: { userId: toId(userId), permissionId: permission.id } });
    await this.cache.invalidateSubject(userId);
  }

  /** Bumped by `AuthService.block`: a blocked account should not keep serving a warm entry either, even though the block itself is enforced on the authentication path. */
  async invalidateUser(userId: string): Promise<void> {
    await this.cache.invalidateSubject(userId);
  }

  /** Creates the row for a slug granted before anyone defined it; leaves an existing definition alone. */
  private async ensurePermission(slug: string, actorUserId: string | null): Promise<{ id: bigint }> {
    const existing = await this.prisma.permission.findUnique({ where: { slug }, select: { id: true } });
    return (
      existing ??
      (await this.prisma.permission.create({
        data: { slug, name: slug, displayName: slug, group: "Custom", createdBy: toIdOrNull(actorUserId), updatedBy: toIdOrNull(actorUserId) },
        select: { id: true },
      }))
    );
  }
}
