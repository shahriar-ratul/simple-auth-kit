// The administration half of the OpenAPI document, merged into the assembled spec by
// openapi-spec.ts. Mirrors the reference combo's `dto/admin.dto.ts`: the identity endpoints are
// documented once, in the shared half, and everything administration adds lives here.
//
// Administration is deployment-wide, so nothing below names a narrower scope: an admin here is
// an admin of everything.
//
// Every path is gated on exactly one key from `rbac.defaults.ts` and there is no role-based
// bypass, which is why the 403s say which permission was missing rather than "admin role
// required": holding a role called "admin" that carries nothing gets the same answer as holding
// no role at all.
import { errorResponse, missingPermission, requiresPermission, type OpenApiFragment } from "./openapi-fragment.js";

export const adminSpec: OpenApiFragment = {
  tags: [],

  scopeParameters: [],

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
    UserSummary: {
      type: "object",
      required: ["id", "uuid", "email", "blocked", "isActive", "twoFactorEnabled", "roles", "createdAt", "updatedAt"],
      properties: {
        id: { type: "string" },
        uuid: { type: "string" },
        email: { type: "string" },
        firstName: { type: "string", nullable: true, description: "Unique across the deployment." },
        lastName: { type: "string", nullable: true, description: "Unique across the deployment." },
        displayName: { type: "string", nullable: true },
        phone: { type: "string", nullable: true, description: "Unique across the deployment." },
        username: { type: "string", nullable: true, description: "Unique across the deployment." },
        photo: { type: "string", nullable: true },
        lastLogin: {
          type: "string",
          format: "date-time",
          nullable: true,
          description: "Set on every successful signup/login/OAuth callback, never on a token refresh.",
        },
        blocked: { type: "boolean", description: "Security/moderation block — distinct from isActive, see the model note." },
        isActive: { type: "boolean", description: "Routine administrative on/off toggle — distinct from blocked, see the model note." },
        twoFactorEnabled: { type: "boolean" },
        roles: { type: "array", items: { type: "string" } },
        createdBy: { type: "string", nullable: true, description: "User id of whoever created this account, if it wasn't a self-signup." },
        updatedBy: { type: "string", nullable: true, description: "User id of whoever last edited this account's profile." },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    CreateUserRequest: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", example: "alice@example.com" },
        password: { type: "string", description: "Set directly — there is no invitation email, the account is usable immediately." },
        firstName: { type: "string", description: "Unique across the deployment." },
        lastName: { type: "string", description: "Unique across the deployment." },
        displayName: { type: "string" },
        phone: { type: "string", description: "Unique across the deployment." },
        username: { type: "string", description: "Unique across the deployment." },
        roles: { type: "array", items: { type: "string" }, description: "Role slugs to assign. Defaults to whichever roles are flagged isDefault, same as a self-signup." },
      },
    },
    UpdateUserRequest: {
      type: "object",
      properties: {
        firstName: { type: "string", nullable: true, description: "Unique across the deployment." },
        lastName: { type: "string", nullable: true, description: "Unique across the deployment." },
        displayName: { type: "string", nullable: true },
        phone: { type: "string", nullable: true, description: "Unique across the deployment." },
        username: { type: "string", nullable: true, description: "Unique across the deployment." },
        photo: { type: "string", nullable: true },
      },
    },
    UpdateRoleRequest: {
      type: "object",
      properties: {
        name: { type: "string" },
        displayName: { type: "string" },
        description: { type: "string", nullable: true },
        isActive: { type: "boolean", description: "false suspends the role without deleting it — it stops granting immediately." },
      },
    },
    DeleteReasonRequest: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Free-text note, for whoever reviews the deletion later." },
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
        items: { type: "array", items: { $ref: "#/components/schemas/UserSummary" } },
        meta: { $ref: "#/components/schemas/PageMeta" },
      },
    },
    AuditLogEntry: {
      type: "object",
      required: ["id", "userId", "name", "action", "info", "remarks", "createdAt", "updatedAt"],
      properties: {
        id: { type: "string" },
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
  },

  paths: {
    "/auth/admin/users": {
      get: {
        tags: ["auth"],
        summary: "[admin] List users",
        description: requiresPermission("users:read"),
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "search", in: "query", required: false, schema: { type: "string" }, description: "Email substring match" },
          { name: "page", in: "query", required: false, schema: { type: "integer" }, description: "1-indexed. Defaults to 1." },
          { name: "limit", in: "query", required: false, schema: { type: "integer" }, description: "Defaults to 25, capped at 100." },
        ],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UserListResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:read"),
        },
      },
      post: {
        tags: ["auth"],
        summary: "[admin] Create a user directly",
        description: requiresPermission("users:manage") + " No invitation email — the account is usable immediately with the password given here.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateUserRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/UserSummary" } } } },
          "400": errorResponse("Missing required field"),
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:manage"),
          "409": errorResponse("Email already registered"),
        },
      },
    },
    "/auth/admin/users/{userId}": {
      get: {
        tags: ["auth"],
        summary: "[admin] Fetch a single user",
        description: requiresPermission("users:read"),
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UserSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:read"),
          "404": errorResponse("User not found"),
        },
      },
      patch: {
        tags: ["auth"],
        summary: "[admin] Edit a user's profile",
        description: requiresPermission("users:manage") + " Profile fields only — email is the login identifier and is not editable here.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateUserRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UserSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:manage"),
          "404": errorResponse("User not found"),
        },
      },
      delete: {
        tags: ["auth"],
        summary: "[admin] Delete a user",
        description:
          requiresPermission("users:manage") +
          " Soft-delete: the row survives for audit purposes, stops appearing in listings, and can no longer authenticate.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DeleteReasonRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:manage", "cannot delete your own account"),
          "404": errorResponse("User not found"),
        },
      },
    },
    "/auth/admin/audit-log": {
      get: {
        tags: ["auth"],
        summary: "[admin] List audit log entries, newest first",
        description: requiresPermission("audit-log:read"),
        security: [{ bearerAuth: [] }],
        parameters: [
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
          "403": missingPermission("audit-log:read"),
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
        summary: "[admin] Create a role",
        description: requiresPermission("roles:manage"),
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateRoleRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/RoleSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:manage"),
        },
      },
    },
    "/auth/admin/roles/{roleId}": {
      patch: {
        tags: ["auth"],
        summary: "[admin] Edit a role",
        description: requiresPermission("roles:manage"),
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "roleId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateRoleRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/RoleSummary" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:manage"),
          "404": errorResponse("Role not found"),
        },
      },
      delete: {
        tags: ["auth"],
        summary: "[admin] Delete a role",
        description:
          requiresPermission("roles:manage") +
          " Soft-delete: existing assignments are left in place rather than cascade-deleted, and the role simply stops being resolved.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "roleId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DeleteReasonRequest" } } },
        },
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:manage"),
          "404": errorResponse("Role not found"),
        },
      },
    },
    "/auth/admin/roles/{roleId}/permissions": {
      post: {
        tags: ["auth"],
        summary: "[admin] Attach a permission to a role",
        description: requiresPermission("roles:manage"),
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "roleId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AttachPermissionRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:manage"),
          "404": errorResponse("Role not found"),
        },
      },
    },
    "/auth/admin/users/{userId}/roles": {
      post: {
        tags: ["auth"],
        summary: "[admin] Assign a role to a user",
        description: requiresPermission("roles:assign"),
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AssignRoleRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:assign"),
          "404": errorResponse("Role not found"),
        },
      },
    },
    "/auth/admin/users/{userId}/roles/{roleSlug}/revoke": {
      post: {
        tags: ["auth"],
        summary: "[admin] Revoke a role from a user",
        description: requiresPermission("roles:assign"),
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
          { name: "roleSlug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("roles:assign", "cannot change your own roles"),
        },
      },
    },
    "/auth/admin/users/{userId}/permissions": {
      post: {
        tags: ["auth"],
        summary: "[admin] Grant a permission directly to a user, bypassing roles",
        description: requiresPermission("permissions:grant"),
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/GrantPermissionRequest" } } },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("permissions:grant"),
        },
      },
    },
    "/auth/admin/users/{userId}/permissions/{permissionSlug}/revoke": {
      post: {
        tags: ["auth"],
        summary: "[admin] Revoke a direct permission grant from a user",
        description: requiresPermission("permissions:grant"),
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string" } },
          { name: "permissionSlug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("permissions:grant"),
        },
      },
    },
    "/auth/admin/users/{userId}/block": {
      post: {
        tags: ["auth"],
        summary: "[admin] Block a user, revoking all their sessions immediately",
        description: requiresPermission("users:block"),
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:block", "cannot block your own account"),
        },
      },
    },
    "/auth/admin/users/{userId}/unblock": {
      post: {
        tags: ["auth"],
        summary: "[admin] Unblock a user",
        description: requiresPermission("users:block"),
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:block"),
        },
      },
    },
    "/auth/admin/users/{userId}/deactivate": {
      post: {
        tags: ["auth"],
        summary: "[admin] Deactivate a user, revoking all their sessions immediately",
        description: requiresPermission("users:block") + " Distinct from block/unblock — a routine administrative toggle, not a security action. Both independently deny login.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:block", "cannot deactivate your own account"),
        },
      },
    },
    "/auth/admin/users/{userId}/activate": {
      post: {
        tags: ["auth"],
        summary: "[admin] Reactivate a user",
        description: requiresPermission("users:block"),
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/OkResponse" } } } },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission("users:block"),
        },
      },
    },
  },
};
