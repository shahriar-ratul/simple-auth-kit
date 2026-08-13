// The administration half of the OpenAPI document, merged into the assembled spec by
// openapi-spec.ts. Mirrors the reference combo's `dto/admin.dto.ts`: the identity endpoints are
// documented once, in the shared half, and everything administration adds lives here — plus the
// workspace-membership routes from ./openapi-workspace.js, which exist only alongside it.
//
// Administration is scoped to one workspace, so every path below takes the `X-Workspace-Id`
// header: an admin here is an admin of the workspace they name and of nothing else.
//
// Every path is gated on exactly one key from `rbac.defaults.ts` and there is no role-based
// bypass, which is why the 403s say which permission was missing rather than "admin role
// required". A 403 is also the answer when the header names a workspace the caller does not
// belong to, or none at all — deliberately the same answer, so the status cannot be used to
// probe which workspaces exist.
import { errorResponse, missingPermission, requiresPermission, type OpenApiFragment } from "./openapi-fragment.js";
import { workspaceHeaderParameter, workspaceSpec } from "./openapi-workspace.js";

const adminHeaderParameter = {
  ...workspaceHeaderParameter,
  description: "The workspace this request administers. The caller must be a member of it holding the permission the route names.",
};

export const adminSpec: OpenApiFragment = {
  tags: workspaceSpec.tags,

  scopeParameters: workspaceSpec.scopeParameters,

  schemas: {
    PermissionSummary: {
      type: "object",
      properties: {
        id: { type: "string" },
        slug: {
          type: "string",
          description: "The ability itself: `ability(slug)` on the server, `ability.can(slug, ABILITY_SUBJECT)` in a client.",
          example: "users:read",
        },
        displayName: { type: "string", example: "List users" },
        description: { type: "string", nullable: true },
        group: { type: "string", description: "Console grouping — a permission matrix renders one section per group.", example: "Users" },
        groupOrder: { type: "integer" },
        order: { type: "integer" },
        isActive: {
          type: "boolean",
          description: "false takes the permission out of every ability that would otherwise carry it, without unpicking a single grant.",
        },
      },
    },
    PermissionListResponse: {
      type: "object",
      properties: { permissions: { type: "array", items: { $ref: "#/components/schemas/PermissionSummary" } } },
    },
    DefinePermissionRequest: {
      type: "object",
      required: ["slug"],
      properties: {
        slug: { type: "string", example: "billing:manage" },
        displayName: { type: "string", description: "Defaults to the slug when creating." },
        description: { type: "string", nullable: true },
        group: { type: "string", description: 'Defaults to "Custom" when creating.' },
        groupOrder: { type: "integer" },
        order: { type: "integer" },
        isActive: { type: "boolean" },
      },
    },
    RoleListResponse: {
      type: "object",
      properties: { roles: { type: "array", items: { $ref: "#/components/schemas/RoleSummary" } } },
    },
    CreateRoleRequest: {
      type: "object",
      required: ["slug"],
      properties: {
        slug: { type: "string", description: "Stable identifier. Grants and assignments are keyed on it.", example: "billing-manager" },
        displayName: { type: "string", description: "Human label for the console. Defaults to the slug.", example: "Billing manager" },
        description: { type: "string", nullable: true },
      },
    },
    AttachPermissionRequest: {
      type: "object",
      required: ["permission"],
      properties: {
        permission: { type: "string", example: "billing:manage" },
      },
    },
    AssignRoleRequest: {
      type: "object",
      required: ["role"],
      properties: {
        role: { type: "string", description: "Role slug", example: "billing-manager" },
      },
    },
    GrantPermissionRequest: {
      type: "object",
      required: ["permission"],
      properties: {
        permission: { type: "string", example: "billing:manage" },
      },
    },
    CreateUserRequest: {
      type: "object",
      required: ["email", "password"],
      description: "No invitation email — the account is usable immediately with the password given here, and it is added to this workspace in the same step.",
      properties: {
        email: { type: "string", example: "alice@example.com" },
        password: { type: "string", description: "Set directly — there is no invitation email, the account is usable immediately." },
        firstName: { type: "string" },
        lastName: { type: "string" },
        displayName: { type: "string" },
        phone: { type: "string" },
        username: { type: "string" },
        roles: { type: "array", items: { type: "string" }, description: "Role slugs to assign in this workspace. Defaults to whichever roles are flagged isDefault, same as addMember." },
      },
    },
    UpdateUserRequest: {
      type: "object",
      description: "Profile fields only — email is the login identifier and is not editable here. Any field may be sent as `null` to clear it.",
      properties: {
        firstName: { type: "string", nullable: true },
        lastName: { type: "string", nullable: true },
        displayName: { type: "string", nullable: true },
        phone: { type: "string", nullable: true },
        username: { type: "string", nullable: true },
        photo: { type: "string", nullable: true },
      },
    },
    UpdateRoleRequest: {
      type: "object",
      properties: {
        name: { type: "string" },
        displayName: { type: "string" },
        description: { type: "string", nullable: true },
        isActive: { type: "boolean", description: "false suspends the role without deleting it; every assignment pointing at it survives." },
      },
    },
    DeleteReasonRequest: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Free-text note recorded alongside the soft-delete, for whoever reads the row later." },
      },
    },
    RoleSummary: {
      type: "object",
      required: ["id", "slug", "displayName", "isDefault", "isActive"],
      properties: {
        id: { type: "string" },
        slug: { type: "string", example: "billing-manager" },
        displayName: { type: "string", example: "Billing manager" },
        isDefault: { type: "boolean", description: "Given to every new principal. The signup/membership default is this row, not a name spelled in code." },
        isActive: { type: "boolean", description: "false suspends the role without deleting it; every assignment pointing at it survives." },
      },
    },
    MemberSummary: {
      type: "object",
      required: ["memberId", "userId", "uuid", "email", "blocked", "isActive", "twoFactorEnabled", "roles", "createdBy", "updatedBy", "createdAt", "updatedAt"],
      properties: {
        memberId: { type: "string" },
        userId: { type: "string" },
        uuid: { type: "string" },
        email: { type: "string" },
        firstName: { type: "string", nullable: true },
        lastName: { type: "string", nullable: true },
        displayName: { type: "string", nullable: true },
        phone: { type: "string", nullable: true },
        username: { type: "string", nullable: true },
        photo: { type: "string", nullable: true },
        lastLogin: { type: "string", format: "date-time", nullable: true },
        blocked: { type: "boolean", description: "Security/moderation block — distinct from isActive, see the model note." },
        isActive: { type: "boolean", description: "Routine administrative on/off toggle — distinct from blocked, see the model note." },
        twoFactorEnabled: { type: "boolean" },
        roles: { type: "array", items: { type: "string" }, description: "This member's roles in this workspace" },
        createdBy: { type: "string", nullable: true, description: "User id of whoever created this account, if it wasn't a self-signup." },
        updatedBy: { type: "string", nullable: true, description: "User id of whoever last edited this account's profile." },
        createdAt: { type: "string", format: "date-time", description: "When this membership was created" },
        updatedAt: { type: "string", format: "date-time", description: "When the underlying user account was last updated" },
      },
    },
    PageMeta: {
      type: "object",
      required: ["page", "limit", "total", "pageCount", "hasPreviousPage", "hasNextPage"],
      properties: {
        page: { type: "integer", description: "1-indexed" },
        limit: { type: "integer" },
        total: { type: "integer" },
        pageCount: { type: "integer" },
        hasPreviousPage: { type: "boolean" },
        hasNextPage: { type: "boolean" },
      },
    },
    UserListResponse: {
      type: "object",
      required: ["items", "meta"],
      properties: {
        items: { type: "array", items: { $ref: "#/components/schemas/MemberSummary" } },
        meta: { $ref: "#/components/schemas/PageMeta" },
      },
    },
    AuditLogEntry: {
      type: "object",
      required: ["id", "workspaceId", "userId", "name", "action", "info", "remarks", "createdAt", "updatedAt"],
      properties: {
        id: { type: "string" },
        workspaceId: { type: "string", nullable: true, description: "Null for events that happen outside any workspace (login, password reset, ...)" },
        userId: { type: "string", nullable: true, description: "Who the event is about; null when it is not attributable to one user" },
        name: { type: "string", description: "Human-readable label for `action`", example: "Role assigned" },
        action: { type: "string", description: "AuditEvent discriminant", example: "role_assigned" },
        info: { type: "object", description: "The rest of the event's fields" },
        remarks: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    AuditLogListResponse: {
      type: "object",
      required: ["items", "meta"],
      properties: {
        items: { type: "array", items: { $ref: "#/components/schemas/AuditLogEntry" } },
        meta: { $ref: "#/components/schemas/PageMeta" },
      },
    },

    ...workspaceSpec.schemas,
  },

  paths: {
    "/auth/admin/users": {
      get: {
        tags: ["auth"],
        summary: "[admin] List the members of this workspace",
        description: requiresPermission("users:read"),
        security: [{ bearerAuth: [] }],
        parameters: [
          adminHeaderParameter,
          { name: "search", in: "query", required: false, schema: { type: "string" }, description: "Email substring match" },
          { name: "page", in: "query", required: false, schema: { type: "integer" }, description: "1-indexed. Defaults to 1." },
          { name: "limit", in: "query", required: false, schema: { type: "integer" }, description: "Defaults to 25, capped at 100." },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UserListResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:read", "the request named no workspace you belong to"),
        },
      },
      post: {
        tags: ["auth"],
        summary: "[admin] Create a user and add them to this workspace",
        description: requiresPermission("users:manage") + " No invitation email — the account is usable immediately with the password given here.",
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateUserRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/MemberSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:manage", "the request named no workspace you belong to"),
          "409": errorResponse("Email already registered"),
        },
      },
    },
    "/auth/admin/users/{userId}": {
      get: {
        tags: ["auth"],
        summary: "[admin] Fetch a single member's profile",
        description: requiresPermission("users:read"),
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/MemberSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:read", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
      patch: {
        tags: ["auth"],
        summary: "[admin] Edit a member's profile",
        description: requiresPermission("users:manage") + " Profile fields only — email is the login identifier and is not editable here.",
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateUserRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/MemberSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:manage", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
      delete: {
        tags: ["auth"],
        summary: "[admin] Delete a member's account",
        description:
          requiresPermission("users:manage") +
          " Soft-delete: the row survives for audit purposes, stops appearing in listings, and can no longer authenticate. " +
          "This disables the account across every workspace it belongs to, not just this one — the same reach `block` already has.",
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DeleteReasonRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:manage", "cannot delete your own account", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
    },
    "/auth/admin/audit-log": {
      get: {
        tags: ["auth"],
        summary: "[admin] List this workspace's audit log entries, newest first",
        description: requiresPermission("audit-log:read"),
        security: [{ bearerAuth: [] }],
        parameters: [
          adminHeaderParameter,
          { name: "userId", in: "query", required: false, schema: { type: "string" } },
          { name: "action", in: "query", required: false, schema: { type: "string" }, description: "AuditEvent discriminant, e.g. 'role_assigned'" },
          { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "until", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", required: false, schema: { type: "integer" }, description: "1-indexed. Defaults to 1." },
          { name: "limit", in: "query", required: false, schema: { type: "integer" }, description: "Defaults to 25, capped at 100." },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/AuditLogListResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("audit-log:read", "the request named no workspace you belong to"),
        },
      },
    },
    "/auth/admin/permissions": {
      get: {
        tags: ["auth"],
        summary: "[admin] List the permission catalog",
        description:
          requiresPermission("permissions:read") +
          " Grouped and ordered for a permission matrix. This is the whole vocabulary of the deployment — there is nothing about authorization outside these rows.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/PermissionListResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("permissions:read"),
        },
      },
      post: {
        tags: ["auth"],
        summary: "[admin] Define or edit a permission",
        description:
          requiresPermission("permissions:define") +
          " Upserted on `slug`, which is the stable identifier grants and revocations use — renaming the display name never breaks a grant." +
          " `isActive: false` takes the permission out of every ability that carries it, in one write, effective on the next request.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DefinePermissionRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/PermissionSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("permissions:define"),
        },
      },
    },
    "/auth/admin/roles": {
      get: {
        tags: ["auth"],
        summary: "[admin] List the roles this deployment defines",
        description: requiresPermission("roles:manage"),
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/RoleListResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:manage"),
        },
      },
      post: {
        tags: ["auth"],
        summary: "[admin] Create a role in this workspace",
        description: requiresPermission("roles:manage"),
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateRoleRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/RoleSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:manage", "the request named no workspace you belong to"),
        },
      },
    },
    "/auth/admin/roles/{roleId}": {
      patch: {
        tags: ["auth"],
        summary: "[admin] Edit one of this workspace's roles",
        description: requiresPermission("roles:manage"),
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "roleId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateRoleRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/RoleSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:manage", "the request named no workspace you belong to"),
          "404": errorResponse("Role not found in this workspace"),
        },
      },
      delete: {
        tags: ["auth"],
        summary: "[admin] Delete one of this workspace's roles",
        description:
          requiresPermission("roles:manage") + " Soft-delete: existing assignments are left in place rather than cascade-deleted, and the role simply stops being resolved.",
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "roleId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DeleteReasonRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:manage", "the request named no workspace you belong to"),
          "404": errorResponse("Role not found in this workspace"),
        },
      },
    },
    "/auth/admin/roles/{roleId}/permissions": {
      post: {
        tags: ["auth"],
        summary: "[admin] Attach a permission to one of this workspace's roles",
        description: requiresPermission("roles:manage"),
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "roleId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AttachPermissionRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:manage", "the request named no workspace you belong to"),
          "404": errorResponse("Role not found in this workspace"),
        },
      },
    },
    "/auth/admin/users/{userId}/roles": {
      post: {
        tags: ["auth"],
        summary: "[admin] Assign a role to a member of this workspace",
        description: requiresPermission("roles:assign"),
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AssignRoleRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:assign", "the request named no workspace you belong to"),
          "404": errorResponse("Role not defined in this workspace, or the user is not a member of it"),
        },
      },
    },
    "/auth/admin/users/{userId}/roles/{roleSlug}/revoke": {
      post: {
        tags: ["auth"],
        summary: "[admin] Revoke a role from a member of this workspace",
        description: requiresPermission("roles:assign"),
        security: [{ bearerAuth: [] }],
        parameters: [
          adminHeaderParameter,
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
          { name: "roleSlug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:assign", "cannot change your own roles", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
    },
    "/auth/admin/users/{userId}/permissions": {
      post: {
        tags: ["auth"],
        summary: "[admin] Grant a permission directly to a member, bypassing roles",
        description: requiresPermission("permissions:grant") + " The grant is scoped to this workspace.",
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/GrantPermissionRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("permissions:grant", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
    },
    "/auth/admin/users/{userId}/permissions/{permissionSlug}/revoke": {
      post: {
        tags: ["auth"],
        summary: "[admin] Revoke a direct permission grant from a member",
        description: requiresPermission("permissions:grant"),
        security: [{ bearerAuth: [] }],
        parameters: [
          adminHeaderParameter,
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
          { name: "permissionSlug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("permissions:grant", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
    },
    "/auth/admin/users/{userId}/block": {
      post: {
        tags: ["auth"],
        summary: "[admin] Block a member, revoking all their sessions immediately",
        description:
          requiresPermission("users:block") +
          " Blocking disables the whole account, so it is only allowed against a member of the workspace you administer.",
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:block", "cannot block your own account", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
    },
    "/auth/admin/users/{userId}/unblock": {
      post: {
        tags: ["auth"],
        summary: "[admin] Unblock a member",
        description: requiresPermission("users:block"),
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:block", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
    },
    "/auth/admin/users/{userId}/deactivate": {
      post: {
        tags: ["auth"],
        summary: "[admin] Deactivate a member, revoking all their sessions immediately",
        description:
          requiresPermission("users:block") +
          " Distinct from block/unblock — a routine administrative toggle, not a security action. Both independently deny login.",
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:block", "cannot deactivate your own account", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
    },
    "/auth/admin/users/{userId}/activate": {
      post: {
        tags: ["auth"],
        summary: "[admin] Reactivate a member",
        description: requiresPermission("users:block"),
        security: [{ bearerAuth: [] }],
        parameters: [adminHeaderParameter, { name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:block", "the request named no workspace you belong to"),
          "404": errorResponse("The user is not a member of this workspace"),
        },
      },
    },

    ...workspaceSpec.paths,
  },
};
