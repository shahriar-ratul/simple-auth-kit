// Roles and permissions are global to this deployment: a user has one set of roles, and it
// applies everywhere.
//
// Authorization is resolved from the database on every request — user → roles → role permissions,
// unioned with the user's direct grants — and the access token carries no authorization at all.
// That is what makes a grant or a revocation take effect on the caller's *next request* rather
// than their next token. The cost is bounded: three indexed reads on join tables, constant in the
// number of users.
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
 * A named bundle of permissions. `slug` is the identifier everything else references, so renaming
 * `name`/`displayName` never breaks a grant. `isDefault` is what a newly signed-up user is given,
 * so the signup default is a row rather than a string literal in code. `isActive: false` suspends
 * a role without deleting it; `isDeleted` removes it from every listing outright.
 */
export const roles = pgTable(
  "roles",
  {
    id: id(),
    uuid: uuid(),
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
    uniqueIndex("roles_slug_key").on(table.slug),
    index("roles_is_default_idx").on(table.isDefault),
    index("roles_active_order_idx").on(table.isActive, table.order),
    index("roles_is_deleted_idx").on(table.isDeleted),
  ],
);

/**
 * One capability, identified by its `slug` — `users:read`, `roles:assign`. The slug *is* the
 * ability: `@CheckAbility("users:read")` on a route and `ability.can("users:read", "")` in a
 * client are the same string, and the row is the only place it is defined.
 *
 * `group`/`groupOrder`/`order` exist for the admin console's permission matrix, which has to
 * render a checkbox grid in a stable, human order; putting that order in the row keeps the console
 * from hardcoding a second copy of the catalog. `isActive: false` is how a capability is switched
 * off deployment-wide without unpicking every role that grants it.
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
 * Which roles a user holds. A real join table with real foreign keys, so a role cannot be assigned
 * that does not exist and renaming a role cannot orphan an assignment.
 */
export const roleUser = pgTable(
  "role_user",
  {
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: bigint("role_id", { mode: "bigint" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [primaryKey({ name: "role_user_pkey", columns: [table.userId, table.roleId] }), index("role_user_role_id_idx").on(table.roleId)],
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
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ name: "permission_role_pkey", columns: [table.permissionId, table.roleId] }),
    index("permission_role_role_id_idx").on(table.roleId),
  ],
);

/** Direct per-user permission grants, additive to whatever the user's roles already carry. */
export const permissionUser = pgTable(
  "permission_user",
  {
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionId: bigint("permission_id", { mode: "bigint" })
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ name: "permission_user_pkey", columns: [table.userId, table.permissionId] }),
    index("permission_user_permission_id_idx").on(table.permissionId),
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
 * The User/Role/Permission/Session tables also carry their own `createdBy`/`updatedBy`/
 * `deletedBy` — a denormalized copy of the same fact, kept so a row-level "who touched this" read
 * needs no join. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    uuid: uuid(),
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

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(roleUser),
  permissions: many(permissionUser),
  sessions: many(sessions),
  oauthAccounts: many(oauthAccounts),
  passwordResetTokens: many(passwordResetTokens),
  twoFactorBackupCodes: many(twoFactorBackupCodes),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(roleUser),
  permissions: many(permissionRole),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(permissionRole),
  users: many(permissionUser),
}));

export const roleUserRelations = relations(roleUser, ({ one }) => ({
  user: one(users, { fields: [roleUser.userId], references: [users.id] }),
  role: one(roles, { fields: [roleUser.roleId], references: [roles.id] }),
}));

export const permissionRoleRelations = relations(permissionRole, ({ one }) => ({
  permission: one(permissions, { fields: [permissionRole.permissionId], references: [permissions.id] }),
  role: one(roles, { fields: [permissionRole.roleId], references: [roles.id] }),
}));

export const permissionUserRelations = relations(permissionUser, ({ one }) => ({
  user: one(users, { fields: [permissionUser.userId], references: [users.id] }),
  permission: one(permissions, { fields: [permissionUser.permissionId], references: [permissions.id] }),
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
