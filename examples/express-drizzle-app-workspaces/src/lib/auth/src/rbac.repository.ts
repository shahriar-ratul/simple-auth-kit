import { and, asc, count, desc, eq, ilike, inArray, type SQL } from "drizzle-orm";
import { resolvePermissions } from "@/lib/auth/core/rbac.js";
import type { AuthzContext } from "./authz.middleware.js";
import type { Database } from "./db.js";
import { buildPageMeta, normalizeLimit, normalizePage, type Paginated } from "./pagination.js";
import { PermissionCache } from "./permission-cache.js";
import { permissionMember, permissionRole, permissions, roleMember, roles, users, workspaceMembers } from "./schema.js";
import { HttpError } from "./http-error.js";
import { toId, toIdOrNull } from "./id.helper.js";

/**
 * Every column the `users` table has (plus the membership's own `memberId`/`createdAt`), except
 * the two secrets (`passwordHash`, `twoFactorSecret` — never leave the server). Deliberately NOT
 * a hand-picked subset — see the identical note on the base variant's `UserSummary`.
 */
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

const MEMBER_SELECT = {
  memberId: workspaceMembers.id,
  userId: workspaceMembers.userId,
  createdAt: workspaceMembers.createdAt,
  uuid: users.uuid,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  displayName: users.displayName,
  phone: users.phone,
  username: users.username,
  photo: users.photo,
  lastLogin: users.lastLogin,
  blocked: users.blocked,
  isActive: users.isActive,
  twoFactorEnabled: users.twoFactorEnabled,
  createdBy: users.createdBy,
  updatedBy: users.updatedBy,
  updatedAt: users.updatedAt,
} as const;

/** A membership row joined with its user, the way `listMembers`/`getMember` assemble it. */
export interface MemberRow {
  memberId: bigint;
  userId: bigint;
  createdAt: Date;
  uuid: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  username: string | null;
  photo: string | null;
  lastLogin: Date | null;
  blocked: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  createdBy: bigint | null;
  updatedBy: bigint | null;
  updatedAt: Date;
  roles: string[];
}

/** Shapes a raw row into the wire DTO. Exported so `listMembers`'s collection can be shaped by the caller. */
export function toMemberSummary(row: MemberRow): MemberSummary {
  return {
    memberId: row.memberId.toString(),
    userId: row.userId.toString(),
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
    private readonly db: Database,
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
  // hand from its own database lookup, so there's nothing to parse here.
  private async invalidateMemberById(memberId: bigint): Promise<void> {
    const [member] = await this.db
      .select({ userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.id, memberId))
      .limit(1);
    if (member) await this.invalidateMember(member.userId.toString(), member.workspaceId.toString());
  }

  /**
   * The hot path: every workspace-scoped request runs this once.
   *
   * Anchored on the `[userId, workspaceId]` unique index — never a scan over the user's
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

    const [member] = await this.db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .innerJoin(users, and(eq(users.id, workspaceMembers.userId), eq(users.isDeleted, false)))
      .where(and(eq(workspaceMembers.userId, userIdBig), eq(workspaceMembers.workspaceId, workspaceIdBig)))
      .limit(1);
    if (!member) return null;

    const [roleRows, directRows] = await Promise.all([
      // Left-joined through to the permission so a role that carries nothing still appears in
      // `roles` — the two halves of the answer come from one read rather than two.
      this.db
        .select({ roleSlug: roles.slug, permissionSlug: permissions.slug })
        .from(roleMember)
        .innerJoin(roles, and(eq(roles.id, roleMember.roleId), eq(roles.isActive, true), eq(roles.isDeleted, false)))
        .leftJoin(permissionRole, eq(permissionRole.roleId, roles.id))
        .leftJoin(permissions, and(eq(permissions.id, permissionRole.permissionId), eq(permissions.isActive, true), eq(permissions.isDeleted, false)))
        .where(eq(roleMember.memberId, member.id)),
      this.db
        .select({ slug: permissions.slug })
        .from(permissionMember)
        .innerJoin(permissions, and(eq(permissions.id, permissionMember.permissionId), eq(permissions.isActive, true), eq(permissions.isDeleted, false)))
        .where(eq(permissionMember.memberId, member.id)),
    ]);

    return {
      workspaceId,
      memberId: member.id.toString(),
      roles: [...new Set(roleRows.map((row) => row.roleSlug))].sort(),
      permissions: resolvePermissions(
        roleRows.map((row) => row.permissionSlug).filter((slug): slug is string => slug !== null),
        directRows.map((row) => row.slug),
      ),
    };
  }

  /**
   * Resolves the membership an admin request is acting on. Never crosses a workspace boundary: a
   * caller can only name a target inside their own scope. Returns bigint directly: every internal
   * caller feeds the id straight into another database call, and the one external caller
   * (AuthService) discards the result.
   */
  async requireMember(workspaceId: string, userId: string): Promise<{ id: bigint }> {
    const [member] = await this.db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, toId(userId)), eq(workspaceMembers.workspaceId, toId(workspaceId))))
      .limit(1);
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
    const conditions: SQL[] = [eq(workspaceMembers.workspaceId, workspaceIdBig), eq(users.isDeleted, false)];
    if (filter.search) conditions.push(ilike(users.email, `%${filter.search}%`));
    const where = and(...conditions)!;

    const rows = await this.db
      .select(MEMBER_SELECT)
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(where)
      .orderBy(desc(workspaceMembers.createdAt), desc(workspaceMembers.id))
      .limit(limit)
      .offset((page - 1) * limit);
    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(where);

    // One read for the page's role assignments rather than one per member.
    const assignments = rows.length
      ? await this.db
          .select({ memberId: roleMember.memberId, slug: roles.slug })
          .from(roleMember)
          .innerJoin(roles, eq(roles.id, roleMember.roleId))
          .where(
            inArray(
              roleMember.memberId,
              rows.map((row) => row.memberId),
            ),
          )
      : [];
    const rolesByMember = new Map<string, string[]>();
    for (const row of assignments) {
      const key = row.memberId.toString();
      rolesByMember.set(key, [...(rolesByMember.get(key) ?? []), row.slug]);
    }

    return {
      items: rows.map((row) => ({ ...row, roles: (rolesByMember.get(row.memberId.toString()) ?? []).sort() })),
      meta: buildPageMeta(page, limit, total),
    };
  }

  /**
   * Scoped by workspace via `requireMember` — an admin can only fetch a profile belonging to a
   * member of their own workspace. `requireMember` only checks the membership row exists, not the
   * underlying user's own `isDeleted` — checked here too (via the join condition), so a
   * soft-deleted account 404s like any other deleted row rather than surfacing through a
   * membership that technically still exists.
   */
  async getMember(workspaceId: string, userId: string): Promise<MemberSummary> {
    const member = await this.requireMember(workspaceId, userId);
    const [row] = await this.db
      .select(MEMBER_SELECT)
      .from(workspaceMembers)
      .innerJoin(users, and(eq(users.id, workspaceMembers.userId), eq(users.isDeleted, false)))
      .where(eq(workspaceMembers.id, member.id))
      .limit(1);
    if (!row) throw new HttpError(404, `user "${userId}" not found`);

    const roleRows = await this.db
      .select({ slug: roles.slug })
      .from(roleMember)
      .innerJoin(roles, eq(roles.id, roleMember.roleId))
      .where(eq(roleMember.memberId, member.id));

    return toMemberSummary({ ...row, roles: roleRows.map((r) => r.slug).sort() });
  }

  /** Profile fields only — email is the login identifier and stays out of this endpoint. */
  async updateMember(
    workspaceId: string,
    userId: string,
    input: { firstName?: string | null; lastName?: string | null; displayName?: string | null; phone?: string | null; username?: string | null; photo?: string | null },
    actorUserId: string | null,
  ): Promise<MemberSummary> {
    await this.requireMember(workspaceId, userId);
    await this.db
      .update(users)
      .set({ ...input, updatedBy: toIdOrNull(actorUserId) })
      .where(eq(users.id, toId(userId)));
    return this.getMember(workspaceId, userId);
  }

  /**
   * Soft-delete, matching every other table's `isDeleted`/`deletedAt`/`deletedBy`/`deletedReason`
   * pattern, and `block`'s existing precedent of a workspace admin taking a global action on a
   * member's account — this disables the account across every workspace it belongs to, not just
   * this one, which is why it's gated the same way `block` is.
   */
  async deleteMember(workspaceId: string, userId: string, actorUserId: string | null, reason?: string): Promise<void> {
    await this.requireMember(workspaceId, userId);
    await this.db
      .update(users)
      .set({ isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null })
      .where(eq(users.id, toId(userId)));
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
    const [existing] = await this.db
      .select({ id: roles.id, workspaceId: roles.workspaceId })
      .from(roles)
      .where(and(eq(roles.id, roleIdBig), eq(roles.isDeleted, false)))
      .limit(1);
    if (!existing || existing.workspaceId !== workspaceIdBig) throw new HttpError(404, "role not found in this workspace");

    const [role] = await this.db
      .update(roles)
      .set({ ...input, updatedBy: toIdOrNull(actorUserId) })
      .where(eq(roles.id, roleIdBig))
      .returning(ROLE_COLUMNS);
    await this.cache.invalidatePolicy();
    return asRoleSummary(role);
  }

  /**
   * Soft-delete. `role_member`/`permission_role` rows pointing at it are left in place — the role
   * simply stops being resolved by `resolveAuthzContext`/`listRoles`.
   */
  async deleteRole(workspaceId: string, roleId: string, actorUserId: string | null, reason?: string): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const roleIdBig = toId(roleId);
    const [existing] = await this.db
      .select({ id: roles.id, workspaceId: roles.workspaceId })
      .from(roles)
      .where(and(eq(roles.id, roleIdBig), eq(roles.isDeleted, false)))
      .limit(1);
    if (!existing || existing.workspaceId !== workspaceIdBig) throw new HttpError(404, "role not found in this workspace");

    await this.db
      .update(roles)
      .set({ isDeleted: true, deletedAt: new Date(), deletedBy: toIdOrNull(actorUserId), deletedReason: reason ?? null })
      .where(eq(roles.id, roleIdBig));
    await this.cache.invalidatePolicy();
  }

  // ---- the catalog itself ----

  /**
   * Every permission this deployment defines, in the order an admin console should render them.
   * The catalog is global, like the `permissions` table: what is scoped to a workspace is which of
   * its roles and memberships point at each row.
   */
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
   * deploy, and all visible on the very next request, in every workspace.
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

    // `isActive` can change here, and it changes what every holder resolves to, in every workspace.
    await this.cache.invalidatePolicy();
    return asPermissionSummary(permission);
  }

  async listRoles(workspaceId: string): Promise<RoleSummary[]> {
    const rows = await this.db
      .select(ROLE_COLUMNS)
      .from(roles)
      .where(and(eq(roles.workspaceId, toId(workspaceId)), eq(roles.isDeleted, false)))
      .orderBy(asc(roles.order), asc(roles.slug));
    return rows.map(asRoleSummary);
  }

  async createRole(
    workspaceId: string,
    input: { slug: string; name?: string; displayName?: string; description?: string | null },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    const actorId = toIdOrNull(actorUserId);
    const [role] = await this.db
      .insert(roles)
      .values({
        workspaceId: toId(workspaceId),
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
   * Scoped by workspace, so an admin cannot reach a role id belonging to a workspace they are not
   * in. A permission slug this deployment never defined is created on the spot: it exists, it can
   * be granted, and it opens nothing until a route names it — and no route shipped by this
   * library can name it, because `@CheckAbility` only accepts slugs from `rbac.defaults.ts`.
   */
  async attachPermissionToRole(workspaceId: string, roleId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const roleIdBig = toId(roleId);
    const [role] = await this.db
      .select({ id: roles.id, workspaceId: roles.workspaceId })
      .from(roles)
      .where(and(eq(roles.id, roleIdBig), eq(roles.isDeleted, false)))
      .limit(1);
    if (!role || role.workspaceId !== workspaceIdBig) throw new HttpError(404, "role not found in this workspace");

    const permission = await this.ensurePermission(permissionSlug, actorUserId);
    await this.db
      .insert(permissionRole)
      .values({ permissionId: permission.id, roleId: roleIdBig })
      .onConflictDoNothing({ target: [permissionRole.permissionId, permissionRole.roleId] });
    await this.cache.invalidatePolicy(); // every membership holding this role is affected
  }

  async assignRoleToMember(workspaceId: string, userId: string, roleSlug: string): Promise<void> {
    const role = await this.requireRole(workspaceId, roleSlug);
    const member = await this.requireMember(workspaceId, userId);
    await this.db
      .insert(roleMember)
      .values({ memberId: member.id, roleId: role.id })
      .onConflictDoNothing({ target: [roleMember.memberId, roleMember.roleId] });
    await this.invalidateMember(userId, workspaceId);
  }

  async revokeRoleFromMember(workspaceId: string, userId: string, roleSlug: string): Promise<void> {
    const member = await this.requireMember(workspaceId, userId);
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.workspaceId, toId(workspaceId)), eq(roles.slug, roleSlug)))
      .limit(1);
    if (!role) return;
    await this.db.delete(roleMember).where(and(eq(roleMember.memberId, member.id), eq(roleMember.roleId, role.id)));
    await this.invalidateMember(userId, workspaceId);
  }

  /** Replaces the whole set — the "set a member's roles" operation, as opposed to assign/revoke one at a time. */
  async setMemberRoles(workspaceId: string, memberId: string, roleSlugs: string[]): Promise<{ memberId: string; roles: string[] }> {
    const workspaceIdBig = toId(workspaceId);
    const memberIdBig = toId(memberId);
    const [member] = await this.db
      .select({ id: workspaceMembers.id, workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.id, memberIdBig))
      .limit(1);
    if (!member || member.workspaceId !== workspaceIdBig) throw new HttpError(404, "member not found in this workspace");

    const found = roleSlugs.length
      ? await this.db
          .select({ id: roles.id, slug: roles.slug })
          .from(roles)
          .where(and(eq(roles.workspaceId, workspaceIdBig), inArray(roles.slug, roleSlugs)))
      : [];
    const unknown = roleSlugs.filter((slug) => !found.some((role) => role.slug === slug));
    if (unknown.length) throw new HttpError(404, `role(s) not defined in this workspace: ${unknown.join(", ")}`);

    // Replace, in one transaction: a member must never be briefly role-less to a concurrent request.
    await this.db.transaction(async (tx) => {
      await tx.delete(roleMember).where(eq(roleMember.memberId, memberIdBig));
      if (found.length) {
        await tx
          .insert(roleMember)
          .values(found.map((role) => ({ memberId: memberIdBig, roleId: role.id })))
          .onConflictDoNothing({ target: [roleMember.memberId, roleMember.roleId] });
      }
    });
    await this.invalidateMemberById(memberIdBig);
    return { memberId, roles: found.map((role) => role.slug).sort() };
  }

  /**
   * The roles a brand-new membership starts with — the rows flagged `isDefault` *in this
   * workspace*, not a string literal. Unused by any caller today; kept bigint-native rather than
   * round-tripped through string.
   */
  async defaultRoleIdsFor(workspaceId: string): Promise<bigint[]> {
    const rows = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.workspaceId, toId(workspaceId)), eq(roles.isDefault, true), eq(roles.isActive, true), eq(roles.isDeleted, false)));
    return rows.map((role) => role.id);
  }

  async grantPermissionToMember(workspaceId: string, userId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    const member = await this.requireMember(workspaceId, userId);
    const permission = await this.ensurePermission(permissionSlug, actorUserId);
    await this.db
      .insert(permissionMember)
      .values({ memberId: member.id, permissionId: permission.id })
      .onConflictDoNothing({ target: [permissionMember.memberId, permissionMember.permissionId] });
    await this.invalidateMember(userId, workspaceId);
  }

  async revokePermissionFromMember(workspaceId: string, userId: string, permissionSlug: string): Promise<void> {
    const member = await this.requireMember(workspaceId, userId);
    const [permission] = await this.db.select({ id: permissions.id }).from(permissions).where(eq(permissions.slug, permissionSlug)).limit(1);
    if (!permission) return;
    await this.db.delete(permissionMember).where(and(eq(permissionMember.memberId, member.id), eq(permissionMember.permissionId, permission.id)));
    await this.invalidateMember(userId, workspaceId);
  }

  // Returns bigint directly: its one caller (assignRoleToMember) feeds the id straight into
  // another database call.
  private async requireRole(workspaceId: string, slug: string): Promise<{ id: bigint }> {
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.workspaceId, toId(workspaceId)), eq(roles.slug, slug), eq(roles.isDeleted, false)))
      .limit(1);
    if (!role) throw new HttpError(404, `role "${slug}" not found in this workspace`);
    return role;
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
