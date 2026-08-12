// A user belongs to any number of workspaces and carries a different set of roles in each, so
// every authorization-bearing row hangs off the *membership*, never off the user. That is the
// whole shape of this schema: `workspaceMembers` is the principal for authorization, `users` is
// the principal for authentication.
//
// Sessions and the access token stay user-level and workspace-agnostic on purpose — a request
// names the workspace it is acting in (X-Workspace-Id), the guard resolves the membership on the
// `[userId, workspaceId]` unique index, and the permissions that membership carries *there* are
// read from the database on that request. The token carries no authorization at all.
//
// Table and column names are the snake_case/plural ones the Prisma combos emit, so the two
// reference combos produce interchangeable databases and the dev portal's schema-drift table has
// nothing to flag. Ids are `bigint` (identity), which is what Prisma's `BigInt @id
// @default(autoincrement())` does — every table also carries a separate `uuid` column for
// external/URL use, since a sequential integer id should never appear in a URL.
import { randomUUID } from "node:crypto";
import { relations } from "drizzle-orm";
import { type AnyPgColumn, bigint, bigserial, boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/** Prisma's `@db.Timestamptz(6)`. Spelled once so no table can disagree with another about it. */
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, precision: 6 });

/** Every table's primary key: bigint identity for join/index performance. */
const id = () => bigserial("id", { mode: "bigint" }).primaryKey();

/** Every table's external/URL-facing identifier — never the sequential `id`. */
const uuid = () =>
  text("uuid")
    .notNull()
    .$defaultFn(() => randomUUID());

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    uuid: uuid(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: bigint("created_by", { mode: "bigint" }),
    updatedBy: bigint("updated_by", { mode: "bigint" }),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamptz("deleted_at"),
    deletedBy: bigint("deleted_by", { mode: "bigint" }),
    deletedReason: varchar("deleted_reason", { length: 255 }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("workspaces_uuid_key").on(table.uuid), index("workspaces_is_deleted_idx").on(table.isDeleted)],
);

/**
 * The authorization principal. `[userId, workspaceId]` is unique, which is what makes the
 * per-request membership lookup a single indexed read on the hot path.
 */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: id(),
    uuid: uuid(),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    workspaceId: bigint("workspace_id", { mode: "bigint" })
      .notNull()
      .references(() => workspaces.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_members_uuid_key").on(table.uuid),
    uniqueIndex("workspace_members_user_id_workspace_id_key").on(table.userId, table.workspaceId),
    index("workspace_members_workspace_id_idx").on(table.workspaceId),
  ],
);

/**
 * Authentication only. Deliberately has no roles — a user who is an admin in one workspace and a
 * plain member in another has no single global role, so there is no honest column for it.
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    uuid: uuid(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    displayName: text("display_name"),
    phone: text("phone"),
    username: text("username"),
    photo: text("photo"),
    dob: date("dob"),
    gender: varchar("gender", { length: 10 }),
    joinedDate: date("joined_date").defaultNow().notNull(),
    lastLogin: timestamptz("last_login"),
    passwordHash: text("password_hash"), // nullable: users created via OAuth-only signup have no password
    // Two independent reasons an account can't authenticate, tracked separately so an admin can see
    // *why*: `blocked` is a security/moderation action (see `block()`/`unblock()`); `isActive` is a
    // routine administrative on/off toggle (see `activate()`/`deactivate()`) — e.g. paused while an
    // employee is on leave, with no implication of wrongdoing. Both deny login on their own; neither
    // implies the other, and unblocking a blocked-but-inactive account still leaves it inactive.
    blocked: boolean("blocked").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    twoFactorSecret: text("two_factor_secret"), // base32 TOTP secret; plaintext-at-rest, same accepted tradeoff already made for AUTH_JWT_SECRET (see key-provider.ts)
    createdBy: bigint("created_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    updatedBy: bigint("updated_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamptz("deleted_at"),
    deletedBy: bigint("deleted_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    deletedReason: varchar("deleted_reason", { length: 255 }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_uuid_key").on(table.uuid),
    uniqueIndex("users_email_key").on(table.email),
    uniqueIndex("users_first_name_key").on(table.firstName),
    uniqueIndex("users_last_name_key").on(table.lastName),
    uniqueIndex("users_phone_key").on(table.phone),
    uniqueIndex("users_username_key").on(table.username),
    index("users_is_deleted_idx").on(table.isDeleted),
  ],
);

/**
 * A named bundle of permissions, scoped per workspace — two workspaces may each define
 * `billing-manager` with entirely different permissions. `slug` is the identifier everything else
 * references, unique *within* a workspace.
 *
 * `isDefault` is what a new member is given, so the membership default is a row rather than a
 * string literal in code. `isActive: false` suspends a role without deleting it; `isDeleted`
 * removes it from every listing outright.
 */
export const roles = pgTable(
  "roles",
  {
    id: id(),
    uuid: uuid(),
    workspaceId: bigint("workspace_id", { mode: "bigint" })
      .notNull()
      .references(() => workspaces.id),
    slug: varchar("slug", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    order: integer("order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: bigint("created_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    updatedBy: bigint("updated_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamptz("deleted_at"),
    deletedBy: bigint("deleted_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    deletedReason: varchar("deleted_reason", { length: 255 }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("roles_uuid_key").on(table.uuid),
    uniqueIndex("roles_workspace_id_slug_key").on(table.workspaceId, table.slug),
    index("roles_workspace_default_idx").on(table.workspaceId, table.isDefault),
    index("roles_active_order_idx").on(table.isActive, table.order),
    index("roles_is_deleted_idx").on(table.isDeleted),
  ],
);

/**
 * One capability, identified by its `slug` — `users:read`, `members:manage`. The slug *is* the
 * ability: `@CheckAbility("users:read")` on a route and `ability.can("users:read", "")` in a
 * client are the same string, and the row is the only place it is defined.
 *
 * Not workspace-scoped, exactly as the catalog never was: the same capabilities are reused across
 * workspaces' role definitions, and what differs per workspace is which roles carry them.
 */
export const permissions = pgTable(
  "permissions",
  {
    id: id(),
    uuid: uuid(),
    slug: varchar("slug", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    group: varchar("group", { length: 255 }).notNull().default("General"),
    groupOrder: integer("group_order").notNull().default(0),
    order: integer("order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: bigint("created_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    updatedBy: bigint("updated_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamptz("deleted_at"),
    deletedBy: bigint("deleted_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    deletedReason: varchar("deleted_reason", { length: 255 }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("permissions_uuid_key").on(table.uuid),
    uniqueIndex("permissions_slug_key").on(table.slug),
    index("permissions_is_active_idx").on(table.isActive),
    index("permissions_group_order_idx").on(table.group, table.groupOrder, table.order),
    index("permissions_is_deleted_idx").on(table.isDeleted),
  ],
);

/**
 * Which roles a membership holds. A real join table with real foreign keys, so a role cannot be
 * assigned that does not exist — and, because `roles` carries `workspaceId`, cannot be one
 * belonging to another workspace.
 */
export const roleMember = pgTable(
  "role_member",
  {
    memberId: bigint("member_id", { mode: "bigint" })
      .notNull()
      .references(() => workspaceMembers.id, { onDelete: "cascade" }),
    roleId: bigint("role_id", { mode: "bigint" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ name: "role_member_pkey", columns: [table.memberId, table.roleId] }), index("role_member_role_id_idx").on(table.roleId)],
);

/** What each role carries. */
export const permissionRole = pgTable(
  "permission_role",
  {
    permissionId: bigint("permission_id", { mode: "bigint" })
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    roleId: bigint("role_id", { mode: "bigint" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "permission_role_pkey", columns: [table.permissionId, table.roleId] }),
    index("permission_role_role_id_idx").on(table.roleId),
  ],
);

/**
 * Direct permission grants, additive to whatever the membership's roles already carry. Attached to
 * the *membership*, not the user: a grant made inside one workspace must not follow the person
 * into another.
 */
export const permissionMember = pgTable(
  "permission_member",
  {
    memberId: bigint("member_id", { mode: "bigint" })
      .notNull()
      .references(() => workspaceMembers.id, { onDelete: "cascade" }),
    permissionId: bigint("permission_id", { mode: "bigint" })
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "permission_member_pkey", columns: [table.memberId, table.permissionId] }),
    index("permission_member_permission_id_idx").on(table.permissionId),
  ],
);

/** Links a social-login identity to a user. `[provider, providerAccountId]` is the natural
 * key an OIDC issuer gives you (its `sub` claim); one user can have several, one per provider. */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: id(),
    uuid: uuid(),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    provider: varchar("provider", { length: 100 }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("oauth_accounts_uuid_key").on(table.uuid),
    uniqueIndex("oauth_accounts_provider_provider_account_id_key").on(table.provider, table.providerAccountId),
    index("oauth_accounts_user_id_idx").on(table.userId),
  ],
);

/** Single-use forgot-password tokens. Only `tokenHash` is stored (sha256 of the raw token
 * emailed to the user) — mirrors denylistedAccessTokens never holding a bearer secret in the clear. */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    uuid: uuid(),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    consumedAt: timestamptz("consumed_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("password_reset_tokens_uuid_key").on(table.uuid), uniqueIndex("password_reset_tokens_token_hash_key").on(table.tokenHash)],
);

/** One-time 2FA recovery codes, issued when the user confirms TOTP enrollment. */
export const twoFactorBackupCodes = pgTable(
  "two_factor_backup_codes",
  {
    id: id(),
    uuid: uuid(),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamptz("used_at"),
  },
  (table) => [uniqueIndex("two_factor_backup_codes_uuid_key").on(table.uuid), index("two_factor_backup_codes_user_id_idx").on(table.userId)],
);

/** Persisted sink for `SessionStoreDeps.appendAuditEvent` (registry/core/session-policy.ts)
 * plus the RBAC/2FA/OAuth/password-reset flows. `action` is the AuditEvent's discriminant and
 * `info` the rest of its fields, so this table needs no schema change when new event variants
 * are added in core.
 *
 * `workspaceId` is nullable because some events are about the `users` row itself and belong to no
 * workspace — see the note in the brief about block/unblock not appearing in a workspace-scoped
 * audit view. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    uuid: uuid(),
    workspaceId: bigint("workspace_id", { mode: "bigint" }).references(() => workspaces.id),
    userId: bigint("user_id", { mode: "bigint" }), // who the event is about; null for events not attributable to one user
    name: text("name").notNull(), // human-readable label for `action`, e.g. "Role assigned"
    action: text("action").notNull(), // AuditEvent discriminant, e.g. "role_assigned"
    info: jsonb("info").notNull(), // the rest of the AuditEvent's fields
    remarks: text("remarks"), // free-text note, for whoever is reading the log later
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("audit_logs_uuid_key").on(table.uuid),
    index("audit_logs_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_logs_user_created_idx").on(table.userId, table.createdAt),
    index("audit_logs_created_idx").on(table.createdAt),
  ],
);

/**
 * Sessions are user-level: one row per logged-in device, independent of any grouping above it.
 *
 * Deliberately stores no usable credential: `currentRefreshJti` is the id of the refresh token
 * that is currently valid, not the token, and access-token revocation is the denylist below. A
 * read of this table hands an attacker nothing they can present. That is the one place this table
 * diverges from the reference implementation it is otherwise column-for-column copied from, which
 * keeps `token` and `refresh_token` columns holding the live tokens themselves.
 *
 * `expiresAt` is an absolute cap set once at creation and never extended, so a continuously
 * refreshing client still has to log in again eventually; `rotateRefreshToken` in core enforces
 * it. `isRevoked` is derived from `revokedAt` by the repository rather than set independently —
 * two columns for one fact can only ever disagree — and `revokedBy`/`revokedByIp` are what let a
 * row say *who* ended the session, which is how an administrator's block is told apart from the
 * user's own logout afterwards.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    uuid: uuid(),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionVersion: integer("session_version").notNull().default(0),
    currentRefreshJti: text("current_refresh_jti").notNull(),
    provider: varchar("provider", { length: 100 }), // the OAuth provider this login came through; null for a password login
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 100 }),
    expiresAt: timestamptz("expires_at").notNull(),
    isRevoked: boolean("is_revoked").notNull().default(false),
    revokedAt: timestamptz("revoked_at"),
    revokedBy: bigint("revoked_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    revokedByIp: varchar("revoked_ip", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: bigint("created_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    updatedBy: bigint("updated_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: timestamptz("deleted_at"),
    deletedBy: bigint("deleted_by", { mode: "bigint" }).references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    deletedReason: varchar("deleted_reason", { length: 255 }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("sessions_uuid_key").on(table.uuid),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_is_revoked_idx").on(table.isRevoked),
    index("sessions_expires_at_idx").on(table.expiresAt),
    index("sessions_user_active_idx").on(table.userId, table.isRevoked, table.expiresAt),
    index("sessions_revoked_by_idx").on(table.revokedBy),
  ],
);

/** Instant access-token revocation. Rows are only ever as old as the access-token
 * TTL (~15 min) — safe to move to Redis with a matching TTL without changing callers. */
export const denylistedAccessTokens = pgTable("denylisted_access_tokens", {
  jti: text("jti").primaryKey(),
  expiresAt: timestamptz("expires_at").notNull(),
});

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  roles: many(roles),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one, many }) => ({
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  roles: many(roleMember),
  permissions: many(permissionMember),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMembers),
  sessions: many(sessions),
  oauthAccounts: many(oauthAccounts),
  passwordResetTokens: many(passwordResetTokens),
  twoFactorBackupCodes: many(twoFactorBackupCodes),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [roles.workspaceId], references: [workspaces.id] }),
  members: many(roleMember),
  permissions: many(permissionRole),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(permissionRole),
  members: many(permissionMember),
}));

export const roleMemberRelations = relations(roleMember, ({ one }) => ({
  member: one(workspaceMembers, { fields: [roleMember.memberId], references: [workspaceMembers.id] }),
  role: one(roles, { fields: [roleMember.roleId], references: [roles.id] }),
}));

export const permissionRoleRelations = relations(permissionRole, ({ one }) => ({
  permission: one(permissions, { fields: [permissionRole.permissionId], references: [permissions.id] }),
  role: one(roles, { fields: [permissionRole.roleId], references: [roles.id] }),
}));

export const permissionMemberRelations = relations(permissionMember, ({ one }) => ({
  member: one(workspaceMembers, { fields: [permissionMember.memberId], references: [workspaceMembers.id] }),
  permission: one(permissions, { fields: [permissionMember.permissionId], references: [permissions.id] }),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const twoFactorBackupCodesRelations = relations(twoFactorBackupCodes, ({ one }) => ({
  user: one(users, { fields: [twoFactorBackupCodes.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
