import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { resolvePermissions } from "@/lib/auth/core/rbac.js";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { PermissionCache } from "./permission-cache.js";
import { toId, toIdOrNull } from "./id.helper.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";

const USER_ROLES_INCLUDE = { roles: { select: { role: { select: { slug: true } } } } } as const;

/** A `User` row as `findUnique`/`findMany` return it with its roles joined in. */
export type UserRow = Prisma.UserGetPayload<{ include: typeof USER_ROLES_INCLUDE }>;

/**
 * Shapes a raw row into the wire DTO — bigint id to string, `Date` to ISO, the roles relation
 * to a flat slug list. Exported so callers that need the collection (paginated `listUsers`) can
 * apply it themselves at the service layer instead of the repository doing it on their behalf.
 */
/** Every column on `User` except the two secrets (`passwordHash`, `twoFactorSecret`) — see the note on `UserSummary`. */
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
    dob: row.dob?.toISOString() ?? null,
    gender: row.gender,
    joinedDate: row.joinedDate.toISOString(),
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

/**
 * Every column the `User` table has, except the two secrets (`passwordHash`, `twoFactorSecret` —
 * never leave the server). Deliberately NOT a hand-picked subset: a shaping function that only
 * forwards "the fields the UI happens to need today" means every future field the UI wants is
 * another round-trip through repository → service → DTO → client type → UI, across every combo.
 * Forwarding the whole safe row once means that trip never has to happen again.
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
  dob: string | null;
  gender: string | null;
  joinedDate: string;
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
  /** Permission slugs currently attached to this role — see attachPermissionToRole/detachPermissionFromRole. */
  permissions: string[];
}

const ROLE_PERMISSIONS_INCLUDE = { permissions: { select: { permission: { select: { slug: true } } } } } as const;

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

@Injectable()
export class RbacRepository {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(PermissionCache) private readonly cache: PermissionCache,
  ) {}

  // Every write below ends by bumping a version counter: a change to one user's roles/grants
  // bumps only that user (`invalidateSubject`); a change to what a role carries, or whether a
  // permission is active, bumps everyone (`invalidatePolicy`).

  // The hot path: every authenticated request runs this once. Walks user → role_user → roles →
  // permission_role → permissions, and user → permission_user → permissions — constant cost in
  // the number of users, since every hop is an indexed read.
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
    if (!row) throw new NotFoundException(`user "${userId}" not found`);
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
      photo?: string;
      dob?: string;
      gender?: string;
      joinedDate?: string;
      isActive?: boolean;
      roles?: string[];
    },
    actorUserId: string | null,
  ): Promise<UserSummary> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("email already registered");

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        phone: input.phone,
        username: input.username,
        photo: input.photo,
        dob: input.dob ? new Date(input.dob) : undefined,
        gender: input.gender,
        joinedDate: input.joinedDate ? new Date(input.joinedDate) : undefined,
        isActive: input.isActive,
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
    const existing = await this.prisma.user.findUnique({ where: { id: userIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`user "${userId}" not found`);
    await this.prisma.user.update({
      where: { id: userIdBig },
      data: {
        ...input,
        // Date columns need Date values; `undefined` leaves them alone, like every other field here.
        dob: input.dob === undefined ? undefined : input.dob === null ? null : new Date(input.dob),
        joinedDate: input.joinedDate === undefined ? undefined : new Date(input.joinedDate),
        updatedBy: toIdOrNull(actorUserId),
      },
    });
    return this.getUser(userId);
  }

  // Soft-delete, matching every other table's `isDeleted`/`deletedAt`/`deletedBy`/`deletedReason`
  // pattern — the row survives for audit purposes, it just stops appearing in listings and can
  // no longer authenticate (mirrors how `block` already disables login without removing the row).
  async deleteUser(userId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const userIdBig = toId(userId);
    const existing = await this.prisma.user.findUnique({ where: { id: userIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException(`user "${userId}" not found`);
    await this.prisma.user.update({
      where: { id: userIdBig },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
    await this.cache.invalidateSubject(userId);
  }

  async updateRole(
    roleId: string,
    input: { name?: string; displayName?: string; description?: string | null; isDefault?: boolean; isActive?: boolean },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    const roleIdBig = toId(roleId);
    const existing = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException("role not found");
    const role = await this.prisma.role.update({
      where: { id: roleIdBig },
      data: { ...input, updatedBy: toIdOrNull(actorUserId) },
      select: { ...ROLE_SELECT, ...ROLE_PERMISSIONS_INCLUDE },
    });
    // Renaming/deactivating changes what every holder resolves to.
    await this.cache.invalidatePolicy();
    return { ...role, id: role.id.toString(), permissions: role.permissions.map((p) => p.permission.slug).sort() };
  }

  // Soft-delete. The `role_user`/`permission_role` rows pointing at it are left in place — a
  // deleted role simply stops being returned by `listRoles`/`resolveAuthzContext`, rather than
  // cascading a delete that would silently strip a user's other roles' foreign keys.
  async deleteRole(roleId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const roleIdBig = toId(roleId);
    const existing = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true } });
    if (!existing) throw new NotFoundException("role not found");
    await this.prisma.role.update({
      where: { id: roleIdBig },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
    await this.cache.invalidatePolicy();
  }

  /** `activeOnly` is what a permission picker (Create/Edit Role) passes — the admin management list itself wants everything, active or not. */
  async listPermissions(activeOnly?: boolean): Promise<PermissionSummary[]> {
    const rows = await this.prisma.permission.findMany({
      where: { isDeleted: false, isActive: activeOnly ? true : undefined },
      select: PERMISSION_SELECT,
      orderBy: [{ groupOrder: "asc" }, { group: "asc" }, { order: "asc" }, { slug: "asc" }],
    });
    return rows.map((row) => ({ ...row, id: row.id.toString() }));
  }

  // Upserted on `slug`, the stable identifier grants/revocations use, so renaming the display
  // name never breaks a grant.
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
      // `undefined` leaves a column alone, so a partial edit can't blank out unmentioned metadata.
      update: shared,
      select: PERMISSION_SELECT,
    });
    await this.cache.invalidatePolicy();
    return { ...permission, id: permission.id.toString() };
  }

  /** `activeOnly` is what a role/permission picker (Add User, Create/Edit Role) passes — the admin management list itself wants everything, active or not. */
  async listRoles(activeOnly?: boolean): Promise<RoleSummary[]> {
    const rows = await this.prisma.role.findMany({
      where: { isDeleted: false, isActive: activeOnly ? true : undefined },
      select: { ...ROLE_SELECT, ...ROLE_PERMISSIONS_INCLUDE },
      orderBy: [{ order: "asc" }, { slug: "asc" }],
    });
    return rows.map((row) => ({ ...row, id: row.id.toString(), permissions: row.permissions.map((p) => p.permission.slug).sort() }));
  }

  async createRole(
    input: { slug: string; name?: string; displayName?: string; description?: string | null; isDefault?: boolean; isActive?: boolean },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    const role = await this.prisma.role.create({
      data: {
        slug: input.slug,
        name: input.name ?? input.displayName ?? input.slug,
        displayName: input.displayName ?? input.slug,
        description: input.description ?? null,
        isDefault: input.isDefault,
        isActive: input.isActive,
        createdBy: toIdOrNull(actorUserId),
        updatedBy: toIdOrNull(actorUserId),
      },
      select: ROLE_SELECT,
    });
    return { ...role, id: role.id.toString(), permissions: [] };
  }

  async attachPermissionToRole(roleId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    const roleIdBig = toId(roleId);
    const role = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true } });
    if (!role) throw new NotFoundException("role not found");

    const permission = await this.ensurePermission(permissionSlug, actorUserId);
    await this.prisma.permissionRole.upsert({
      where: { permissionId_roleId: { permissionId: permission.id, roleId: roleIdBig } },
      create: { permissionId: permission.id, roleId: roleIdBig },
      update: {},
    });
    await this.cache.invalidatePolicy(); // everyone holding this role is affected
  }

  async detachPermissionFromRole(roleId: string, permissionSlug: string): Promise<void> {
    const roleIdBig = toId(roleId);
    const role = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true } });
    if (!role) throw new NotFoundException("role not found");

    const permission = await this.prisma.permission.findUnique({ where: { slug: permissionSlug }, select: { id: true } });
    if (!permission) throw new NotFoundException("permission not found");

    await this.prisma.permissionRole.deleteMany({ where: { roleId: roleIdBig, permissionId: permission.id } });
    await this.cache.invalidatePolicy(); // everyone holding this role is affected
  }

  async assignRoleToUser(userId: string, roleSlug: string): Promise<void> {
    const userIdBig = toId(userId);
    const role = await this.prisma.role.findUnique({ where: { slug: roleSlug, isDeleted: false }, select: { id: true } });
    if (!role) throw new NotFoundException(`role "${roleSlug}" not found`);

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

  // The roles a brand-new user starts with — the rows flagged `isDefault`, not a string literal.
  // Takes the bigint directly: every caller already has the user row in hand (just created or
  // just fetched), so there's no string to convert from.
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

  async invalidateUser(userId: string): Promise<void> {
    await this.cache.invalidateSubject(userId);
  }

  // Creates the row for a slug granted before anyone defined it; leaves an existing definition alone.
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
