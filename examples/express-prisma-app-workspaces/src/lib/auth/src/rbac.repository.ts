import { resolvePermissions } from "@/lib/auth/core/rbac.js";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { AuthzContext } from "./authz.middleware.js";
import { HttpError } from "./http-error.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";
import { PermissionCache } from "./permission-cache.js";
import { toId, toIdOrNull } from "./id.helper.js";

export interface MemberSummary {
  memberId: string;
  userId: string;
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

export interface MemberListFilter {
  search?: string;
  page?: number;
  limit?: number;
}

export type MemberListResult = Paginated<MemberSummary>;

const MEMBER_INCLUDE = { user: true, roles: { select: { role: { select: { slug: true } } } } } as const;

/** A `WorkspaceMember` row as `findUnique`/`findMany` return it, joined with its user and roles. */
export type MemberRow = Prisma.WorkspaceMemberGetPayload<{ include: typeof MEMBER_INCLUDE }>;

/** Shapes a raw row into the wire DTO. Exported so `listMembers`'s collection can be shaped by the caller. */
export function toMemberSummary(row: MemberRow): MemberSummary {
  return {
    memberId: row.id.toString(),
    userId: row.userId.toString(),
    uuid: row.user.uuid,
    email: row.user.email,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    displayName: row.user.displayName,
    phone: row.user.phone,
    username: row.user.username,
    photo: row.user.photo,
    lastLogin: row.user.lastLogin?.toISOString() ?? null,
    blocked: row.user.blocked,
    isActive: row.user.isActive,
    twoFactorEnabled: row.user.twoFactorEnabled,
    roles: row.roles.map((r) => r.role.slug).sort(),
    createdBy: row.user.createdBy?.toString() ?? null,
    updatedBy: row.user.updatedBy?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.user.updatedAt.toISOString(),
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

/**
 * The cache subject in this variant: authorization belongs to a membership, so the key has to be
 * the pair. The same user in another workspace is a different subject with its own version
 * counter, which is what keeps invalidation in one workspace from flushing the others.
 *
 * It lives here rather than beside `WORKSPACE_HEADER` in authz.guard.ts only to keep the import
 * between the two one-directional — the guard needs this repository at runtime, so the repository
 * must not need the guard.
 */
export const memberCacheKey = (userId: string, workspaceId: string) => `${userId}:${workspaceId}`;

export class RbacRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: PermissionCache,
  ) {}

  // Every write below ends by bumping a version counter, and which counter is the whole design:
  // a change to one membership's roles or grants bumps only that membership
  // (`invalidateSubject`, keyed on the `userId:workspaceId` pair, so the same person's other
  // workspaces are untouched), while a change to what a role carries, or to whether a permission
  // is active, bumps everyone (`invalidatePolicy`) — because those genuinely do affect every
  // holder, and enumerating them is the fan-out this scheme exists to avoid.

  /** Invalidates one membership. Public because `WorkspaceRepository` changes memberships too. */
  async invalidateMember(userId: string, workspaceId: string): Promise<void> {
    await this.cache.invalidateSubject(memberCacheKey(userId, workspaceId));
  }

  // Takes bigint directly: its one caller (setMemberRoles) already has the membership's id in
  // hand from its own Prisma lookup, so there's nothing to parse here.
  private async invalidateMemberById(memberId: bigint): Promise<void> {
    const member = await this.prisma.workspaceMember.findUnique({ where: { id: memberId }, select: { userId: true, workspaceId: true } });
    if (member) await this.invalidateMember(member.userId.toString(), member.workspaceId.toString());
  }

  /**
   * The hot path: every workspace-scoped request runs this once.
   *
   * One call, anchored on the `[userId, workspaceId]` unique index — never a scan over the user's
   * workspaces — walking `member → role_member → roles → permission_role → permissions` and
   * `member → permission_member → permissions`. Cost is constant in the number of users and
   * workspaces.
   *
   * Everything it returns belongs to *this* membership, so the answer is workspace-scoped by
   * construction rather than by a second check: the same login in another workspace resolves a
   * different membership and therefore different roles and permissions.
   *
   * `isActive: false` on a role or a permission takes it out of the answer, which is what makes
   * deactivating either one enforcement-changing without unpicking any grant.
   */
  async resolveAuthzContext(userId: string, workspaceId: string): Promise<AuthzContext | null> {
    // workspaceId arrives straight from the untrusted `X-Workspace-Id` header — a value that
    // isn't a valid bigint is exactly as "not a member" as one that parses but names no
    // membership, so it must not throw and 500 the request.
    let userIdBig: bigint;
    let workspaceIdBig: bigint;
    try {
      userIdBig = toId(userId);
      workspaceIdBig = toId(workspaceId);
    } catch {
      return null;
    }

    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: userIdBig, workspaceId: workspaceIdBig }, user: { isDeleted: false } },
      select: {
        id: true,
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
    if (!member) return null;

    const rolePermissions = member.roles.flatMap((roleMember) => roleMember.role.permissions.map((pr) => pr.permission.slug));
    const directPermissions = member.permissions.map((pm) => pm.permission.slug);

    return {
      workspaceId,
      memberId: member.id.toString(),
      roles: member.roles.map((roleMember) => roleMember.role.slug).sort(),
      permissions: resolvePermissions(rolePermissions, directPermissions),
    };
  }

  /**
   * Resolves the membership an admin request is acting on. Never crosses a workspace boundary: a
   * caller can only name a target inside their own scope. Returns bigint directly: every internal
   * caller feeds the id straight into another Prisma call, and the one external caller
   * (AuthService) discards the result.
   */
  async requireMember(workspaceId: string, userId: string): Promise<{ id: bigint }> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: toId(userId), workspaceId: toId(workspaceId) } },
      select: { id: true },
    });
    if (!member) throw new HttpError(404, "user is not a member of this workspace");
    return member;
  }

  /**
   * Newest-first, page-paginated; `search` matches an email substring. Returns raw rows —
   * shaping the collection is the caller's job, see `toMemberSummary`.
   */
  async listMembers(workspaceId: string, filter: MemberListFilter = {}): Promise<Paginated<MemberRow>> {
    const page = normalizePage(filter.page);
    const limit = normalizeLimit(filter.limit);
    const workspaceIdBig = toId(workspaceId);
    const where = {
      workspaceId: workspaceIdBig,
      user: { isDeleted: false, email: filter.search ? { contains: filter.search, mode: "insensitive" as const } : undefined },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.workspaceMember.findMany({
        where,
        include: MEMBER_INCLUDE,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.workspaceMember.count({ where }),
    ]);

    return { items: rows, meta: buildPageMeta(page, limit, total) };
  }

  // Scoped by workspace via `requireMember` — an admin can only fetch a profile belonging to a
  // member of their own workspace. `requireMember` only checks the membership row exists, not
  // the user's own `isDeleted` — checked here too, so a soft-deleted account 404s like any other
  // deleted row rather than surfacing through a membership that technically still exists.
  async getMember(workspaceId: string, userId: string): Promise<MemberSummary> {
    const member = await this.requireMember(workspaceId, userId);
    const row = await this.prisma.workspaceMember.findFirst({
      where: { id: member.id, user: { isDeleted: false } },
      include: MEMBER_INCLUDE,
    });
    if (!row) throw new HttpError(404, `user "${userId}" not found`);
    return toMemberSummary(row);
  }

  // Profile fields only — email is the login identifier and stays out of this endpoint.
  async updateMember(
    workspaceId: string,
    userId: string,
    input: { firstName?: string | null; lastName?: string | null; displayName?: string | null; phone?: string | null; username?: string | null; photo?: string | null },
    actorUserId: string | null,
  ): Promise<MemberSummary> {
    await this.requireMember(workspaceId, userId);
    await this.prisma.user.update({ where: { id: toId(userId) }, data: { ...input, updatedBy: toIdOrNull(actorUserId) } });
    return this.getMember(workspaceId, userId);
  }

  // Soft-delete, matching every other table's `isDeleted`/`deletedAt`/`deletedBy`/`deletedReason`
  // pattern, and `block`'s existing precedent of a workspace admin taking a global action on a
  // member's account — this disables the account across every workspace it belongs to, not just
  // this one, which is why it's gated the same way `block` is.
  async deleteMember(workspaceId: string, userId: string, actorUserId: string | null, reason?: string): Promise<void> {
    await this.requireMember(workspaceId, userId);
    await this.prisma.user.update({
      where: { id: toId(userId) },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
    await this.invalidateMember(userId, workspaceId);
  }

  async updateRole(
    workspaceId: string,
    roleId: string,
    input: { name?: string; displayName?: string; description?: string | null; isActive?: boolean },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    const workspaceIdBig = toId(workspaceId);
    const roleIdBig = toId(roleId);
    const existing = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true, workspaceId: true } });
    if (!existing || existing.workspaceId !== workspaceIdBig) throw new HttpError(404, "role not found in this workspace");
    const role = await this.prisma.role.update({
      where: { id: roleIdBig },
      data: { ...input, updatedBy: toIdOrNull(actorUserId) },
      select: ROLE_SELECT,
    });
    await this.cache.invalidatePolicy();
    return { ...role, id: role.id.toString() };
  }

  // Soft-delete. `role_member`/`permission_role` rows pointing at it are left in place — the
  // role simply stops being resolved by `resolveAuthzContext`/`listRoles`.
  async deleteRole(workspaceId: string, roleId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const roleIdBig = toId(roleId);
    const existing = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true, workspaceId: true } });
    if (!existing || existing.workspaceId !== workspaceIdBig) throw new HttpError(404, "role not found in this workspace");
    await this.prisma.role.update({
      where: { id: roleIdBig },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null },
    });
    await this.cache.invalidatePolicy();
  }

  // ---- the catalog itself ----

  /**
   * Every permission this deployment defines, in the order an admin console should render them.
   * The catalog is global, like the `Permission` table: what is scoped to a workspace is which of
   * its roles and memberships point at each row.
   */
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
   * deploy, and all visible on the very next request, in every workspace.
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
    // `isActive` can change here, and it changes what every holder resolves to, in every workspace.
    await this.cache.invalidatePolicy();
    return { ...permission, id: permission.id.toString() };
  }

  async listRoles(workspaceId: string): Promise<RoleSummary[]> {
    const rows = await this.prisma.role.findMany({
      where: { workspaceId: toId(workspaceId), isDeleted: false },
      select: ROLE_SELECT,
      orderBy: [{ order: "asc" }, { slug: "asc" }],
    });
    return rows.map((row) => ({ ...row, id: row.id.toString() }));
  }

  async createRole(
    workspaceId: string,
    input: { slug: string; name?: string; displayName?: string; description?: string | null },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    const role = await this.prisma.role.create({
      data: {
        workspaceId: toId(workspaceId),
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
   * Scoped by workspace, so an admin cannot reach a role id belonging to a workspace they are not
   * in. A permission slug this deployment never defined is created on the spot: it exists, it can
   * be granted, and it opens nothing until a route names it — and no route shipped by this
   * library can name it, because `@CheckAbility` only accepts slugs from `rbac.defaults.ts`.
   */
  async attachPermissionToRole(workspaceId: string, roleId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const roleIdBig = toId(roleId);
    const role = await this.prisma.role.findUnique({ where: { id: roleIdBig, isDeleted: false }, select: { id: true, workspaceId: true } });
    if (!role || role.workspaceId !== workspaceIdBig) throw new HttpError(404, "role not found in this workspace");

    const permission = await this.ensurePermission(permissionSlug, actorUserId);
    await this.prisma.permissionRole.upsert({
      where: { permissionId_roleId: { permissionId: permission.id, roleId: roleIdBig } },
      create: { permissionId: permission.id, roleId: roleIdBig },
      update: {},
    });
    await this.cache.invalidatePolicy(); // every membership holding this role is affected
  }

  async assignRoleToMember(workspaceId: string, userId: string, roleSlug: string): Promise<void> {
    const role = await this.requireRole(workspaceId, roleSlug);
    const member = await this.requireMember(workspaceId, userId);
    await this.prisma.roleMember.upsert({
      where: { memberId_roleId: { memberId: member.id, roleId: role.id } },
      create: { memberId: member.id, roleId: role.id },
      update: {},
    });
    await this.invalidateMember(userId, workspaceId);
  }

  async revokeRoleFromMember(workspaceId: string, userId: string, roleSlug: string): Promise<void> {
    const member = await this.requireMember(workspaceId, userId);
    const role = await this.prisma.role.findUnique({ where: { workspaceId_slug: { workspaceId: toId(workspaceId), slug: roleSlug } }, select: { id: true } });
    if (!role) return;
    await this.prisma.roleMember.deleteMany({ where: { memberId: member.id, roleId: role.id } });
    await this.invalidateMember(userId, workspaceId);
  }

  /** Replaces the whole set — the "set a member's roles" operation, as opposed to assign/revoke one at a time. */
  async setMemberRoles(workspaceId: string, memberId: string, roleSlugs: string[]): Promise<{ memberId: string; roles: string[] }> {
    const workspaceIdBig = toId(workspaceId);
    const memberIdBig = toId(memberId);
    const member = await this.prisma.workspaceMember.findUnique({ where: { id: memberIdBig }, select: { id: true, workspaceId: true } });
    if (!member || member.workspaceId !== workspaceIdBig) throw new HttpError(404, "member not found in this workspace");

    const roles = await this.prisma.role.findMany({
      where: { workspaceId: workspaceIdBig, slug: { in: roleSlugs }, isDeleted: false },
      select: { id: true, slug: true },
    });
    const unknown = roleSlugs.filter((slug) => !roles.some((role) => role.slug === slug));
    if (unknown.length) throw new HttpError(404, `role(s) not defined in this workspace: ${unknown.join(", ")}`);

    // Replace, in one transaction: a member must never be briefly role-less to a concurrent request.
    await this.prisma.$transaction([
      this.prisma.roleMember.deleteMany({ where: { memberId: memberIdBig } }),
      this.prisma.roleMember.createMany({ data: roles.map((role) => ({ memberId: memberIdBig, roleId: role.id })), skipDuplicates: true }),
    ]);
    await this.invalidateMemberById(memberIdBig);
    return { memberId, roles: roles.map((role) => role.slug).sort() };
  }

  /**
   * The roles a brand-new membership starts with — the rows flagged `isDefault` *in this
   * workspace*, not a string literal. Unused by any caller today; kept bigint-native rather than
   * round-tripped through string.
   */
  async defaultRoleIdsFor(workspaceId: string): Promise<bigint[]> {
    const roles = await this.prisma.role.findMany({
      where: { workspaceId: toId(workspaceId), isDefault: true, isActive: true, isDeleted: false },
      select: { id: true },
    });
    return roles.map((role) => role.id);
  }

  async grantPermissionToMember(workspaceId: string, userId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    const member = await this.requireMember(workspaceId, userId);
    const permission = await this.ensurePermission(permissionSlug, actorUserId);
    await this.prisma.permissionMember.upsert({
      where: { memberId_permissionId: { memberId: member.id, permissionId: permission.id } },
      create: { memberId: member.id, permissionId: permission.id },
      update: {},
    });
    await this.invalidateMember(userId, workspaceId);
  }

  async revokePermissionFromMember(workspaceId: string, userId: string, permissionSlug: string): Promise<void> {
    const member = await this.requireMember(workspaceId, userId);
    const permission = await this.prisma.permission.findUnique({ where: { slug: permissionSlug }, select: { id: true } });
    if (!permission) return;
    await this.prisma.permissionMember.deleteMany({ where: { memberId: member.id, permissionId: permission.id } });
    await this.invalidateMember(userId, workspaceId);
  }

  // Returns bigint directly: its one caller (assignRoleToMember) feeds the id straight into
  // another Prisma call.
  private async requireRole(workspaceId: string, slug: string): Promise<{ id: bigint }> {
    const role = await this.prisma.role.findUnique({ where: { workspaceId_slug: { workspaceId: toId(workspaceId), slug }, isDeleted: false }, select: { id: true } });
    if (!role) throw new HttpError(404, `role "${slug}" not found in this workspace`);
    return role;
  }

  /**
   * Creates the row for a slug granted before anyone defined it; leaves an existing definition
   * alone. Returns bigint directly: both callers feed the id straight into another Prisma call.
   */
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
