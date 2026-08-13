import { PrismaClient } from "../generated/prisma/client.js";
import { HttpError } from "./http-error.js";
import { provisionDefaultRoles, WORKSPACE_CREATOR_ROLES } from "./rbac.defaults.js";
import { RbacRepository } from "./rbac.repository.js";
import { toId } from "./id.helper.js";

export interface WorkspaceSummary {
  id: string;
  name: string;
  createdAt: string;
  /** The calling user's role slugs in this workspace. */
  roles: string[];
}

export interface MembershipSummary {
  memberId: string;
  userId: string;
  email: string;
  roles: string[];
  createdAt: string;
}

export class WorkspaceRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rbac: RbacRepository,
  ) {}

  /**
   * Creates a workspace, its creator's admin membership, *and* that workspace's default roles —
   * all in one transaction, so a workspace is never left without an administrator.
   *
   * The role provisioning is not optional garnish. `Role` is unique per `[workspaceId, slug]`, so
   * a new workspace genuinely has no `Role` rows: without them the creator's membership would
   * point at nothing, resolve to zero permissions, and lock them out of the workspace they had
   * just made the instant any route enforced a permission. The seeder only provisions the
   * workspace *it* creates, so this path has to provision its own — from the same definition,
   * which is why both call `provisionDefaultRoles` rather than each keeping a copy of the table.
   */
  async create(userId: string, name: string): Promise<WorkspaceSummary> {
    const userIdBig = toId(userId);
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({ data: { name, createdBy: userIdBig, updatedBy: userIdBig } });
      await provisionDefaultRoles(tx, created.id);
      const roles = await tx.role.findMany({ where: { workspaceId: created.id, slug: { in: WORKSPACE_CREATOR_ROLES } }, select: { id: true } });
      await tx.workspaceMember.create({
        data: { workspaceId: created.id, userId: userIdBig, roles: { create: roles.map((role) => ({ roleId: role.id })) } },
      });
      return created;
    });
    return {
      id: workspace.id.toString(),
      name: workspace.name,
      createdAt: workspace.createdAt.toISOString(),
      roles: [...WORKSPACE_CREATOR_ROLES].sort(),
    };
  }

  async listForUser(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: toId(userId), workspace: { isDeleted: false } },
      include: { workspace: true, roles: { select: { role: { select: { slug: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((m) => ({
      id: m.workspace.id.toString(),
      name: m.workspace.name,
      createdAt: m.workspace.createdAt.toISOString(),
      roles: m.roles.map((r) => r.role.slug).sort(),
    }));
  }

  async listMembers(workspaceId: string): Promise<MembershipSummary[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: toId(workspaceId), user: { isDeleted: false } },
      include: { user: true, roles: { select: { role: { select: { slug: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      memberId: row.id.toString(),
      userId: row.userId.toString(),
      email: row.user.email,
      roles: row.roles.map((r) => r.role.slug).sort(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async resolveMemberRoles(workspaceIdBig: bigint, roleSlugs?: string[]) {
    const roles = await this.prisma.role.findMany({
      where: roleSlugs
        ? { workspaceId: workspaceIdBig, slug: { in: roleSlugs }, isDeleted: false }
        : { workspaceId: workspaceIdBig, isDefault: true, isActive: true, isDeleted: false },
      select: { id: true, slug: true },
    });
    const unknown = (roleSlugs ?? []).filter((slug) => !roles.some((role) => role.slug === slug));
    if (unknown.length) throw new HttpError(404, `role(s) not defined in this workspace: ${unknown.join(", ")}`);
    return roles;
  }

  /**
   * Adds an existing user by email — there is no invite/email flow in this library, that is the
   * consuming app's job. With no roles named, the new membership gets whichever of this
   * workspace's roles are flagged `isDefault`, not a slug spelled in code.
   */
  async addMember(workspaceId: string, email: string, roleSlugs?: string[]): Promise<MembershipSummary> {
    const workspaceIdBig = toId(workspaceId);
    const user = await this.prisma.user.findUnique({ where: { email, isDeleted: false } });
    if (!user) throw new HttpError(404, "no user with that email");

    const existing = await this.prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: workspaceIdBig } } });
    if (existing) throw new HttpError(409, "already a member of this workspace");

    const roles = await this.resolveMemberRoles(workspaceIdBig, roleSlugs);
    const member = await this.prisma.workspaceMember.create({
      data: { workspaceId: workspaceIdBig, userId: user.id, roles: { create: roles.map((role) => ({ roleId: role.id })) } },
    });
    return {
      memberId: member.id.toString(),
      userId: user.id.toString(),
      email: user.email,
      roles: roles.map((role) => role.slug).sort(),
      createdAt: member.createdAt.toISOString(),
    };
  }

  /**
   * An administrator provisioning a brand-new account and adding it to this workspace in one
   * step — as distinct from `addMember`, which only ever attaches an account that already
   * exists. No invite/email flow in this library either way: the password is usable immediately.
   */
  async createMember(
    workspaceId: string,
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
  ): Promise<MembershipSummary> {
    const workspaceIdBig = toId(workspaceId);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new HttpError(409, "email already registered");

    const roles = await this.resolveMemberRoles(workspaceIdBig, input.roles);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        phone: input.phone,
        username: input.username,
        createdBy: actorUserId ? toId(actorUserId) : null,
      },
    });
    const member = await this.prisma.workspaceMember.create({
      data: { workspaceId: workspaceIdBig, userId: user.id, roles: { create: roles.map((role) => ({ roleId: role.id })) } },
    });
    return {
      memberId: member.id.toString(),
      userId: user.id.toString(),
      email: user.email,
      roles: roles.map((role) => role.slug).sort(),
      createdAt: member.createdAt.toISOString(),
    };
  }

  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const memberIdBig = toId(memberId);
    const member = await this.prisma.workspaceMember.findUnique({ where: { id: memberIdBig } });
    if (!member || member.workspaceId !== workspaceIdBig) throw new HttpError(404, "member not found in this workspace");

    // Role assignments and direct grants belong to the membership, so they go with it — that is
    // the point of hanging them off the member row. `onDelete: Cascade` on both join tables is
    // what makes that a database guarantee rather than two deletes someone has to remember.
    await this.prisma.workspaceMember.delete({ where: { id: memberIdBig } });
    // A removed member must lose access on their very next request, so their entry has to become
    // unreachable — the resolution that replaces it returns "not a member", which is never cached.
    await this.rbac.invalidateMember(member.userId.toString(), workspaceId);
  }
}
