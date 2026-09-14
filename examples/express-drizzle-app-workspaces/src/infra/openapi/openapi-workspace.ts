// The workspace-membership half of the OpenAPI document. Mirrors the reference combo's
// `dto/workspace.dto.ts`; merged into the administration fragment by openapi-admin.ts, which is
// what openapi-spec.ts assembles into the document.
import {
  errorResponse,
  missingPermission,
  requiresPermission,
  type OpenApiFragment,
} from "./openapi-fragment.js";
import { WORKSPACE_HEADER } from "../../common/auth/middleware/authz.middleware.js";

/** Every route that acts *inside* a workspace names it with this header, never a path segment. */
export const workspaceHeaderParameter = {
  name: WORKSPACE_HEADER,
  in: "header",
  required: true,
  schema: { type: "string" },
  description:
    "The workspace this request acts in. The caller must be a member of it.",
};

export const workspaceSpec: OpenApiFragment = {
  tags: [{ name: "workspaces" }],

  // `GET /auth/me` works with or without it: named, it answers with that workspace's roles;
  // omitted, with none.
  scopeParameters: [
    {
      ...workspaceHeaderParameter,
      required: false,
      description:
        "Answer for this workspace. Omitted, `roles` and `permissions` come back empty.",
    },
  ],

  schemas: {
    CreateWorkspaceRequest: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", example: "Acme" },
      },
    },
    AddMemberRequest: {
      type: "object",
      required: ["email"],
      properties: {
        email: {
          type: "string",
          description:
            "Must already be a registered user — this library has no invite flow",
        },
        roles: {
          type: "array",
          items: { type: "string" },
          description: 'Defaults to ["member"]',
        },
      },
    },
    SetMemberRolesRequest: {
      type: "object",
      required: ["roles"],
      properties: {
        roles: {
          type: "array",
          items: { type: "string" },
          description: "Replaces the member's whole role set",
        },
      },
    },
    WorkspaceSummary: {
      type: "object",
      required: ["id", "name", "createdAt", "roles"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        roles: {
          type: "array",
          items: { type: "string" },
          description: "The calling user's roles in this workspace",
        },
      },
    },
    MembershipSummary: {
      type: "object",
      required: ["memberId", "userId", "email", "roles", "createdAt"],
      properties: {
        memberId: { type: "string" },
        userId: { type: "string" },
        email: { type: "string" },
        roles: { type: "array", items: { type: "string" } },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    MemberRolesResponse: {
      type: "object",
      required: ["memberId", "roles"],
      properties: {
        memberId: { type: "string" },
        roles: { type: "array", items: { type: "string" } },
      },
    },
  },

  paths: {
    "/workspaces": {
      post: {
        tags: ["workspaces"],
        summary: "Create a workspace",
        description:
          "The creator becomes its first member, with the admin role, and the workspace's default roles are provisioned in the same transaction. Deliberately not permission-gated: this acts outside every workspace, and gating it on a permission granted inside some other one would mean your first workspace could only be created by someone who already had one.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWorkspaceRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkspaceSummary" },
              },
            },
          },
          "400": errorResponse("Missing required field"),
          "401": errorResponse("Missing or invalid access token"),
        },
      },
      get: {
        tags: ["workspaces"],
        summary:
          "List the workspaces the current user belongs to, with their roles in each",
        description:
          "Deliberately not permission-gated: it acts outside every workspace and only ever answers with the caller's own memberships.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/WorkspaceSummary" },
                },
              },
            },
          },
          "401": errorResponse("Missing or invalid access token"),
        },
      },
    },
    "/workspaces/members": {
      get: {
        tags: ["workspaces"],
        summary: "List the members of the named workspace",
        description:
          "Gated on membership of the named workspace rather than on a permission — seeing who else is in a room you are in is not an administrative capability.",
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeaderParameter],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/MembershipSummary" },
                },
              },
            },
          },
          "401": errorResponse("Missing or invalid access token"),
          "403": errorResponse(
            "Not a member of this workspace, or no workspace named",
          ),
        },
      },
      post: {
        tags: ["workspaces"],
        summary: "[admin] Add an existing user to the named workspace",
        description: requiresPermission("members:manage"),
        security: [{ bearerAuth: [] }],
        parameters: [workspaceHeaderParameter],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AddMemberRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MembershipSummary" },
              },
            },
          },
          "400": errorResponse("Missing required field"),
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission(
            "members:manage",
            "the request named no workspace you belong to",
          ),
          "404": errorResponse("No user with that email"),
          "409": errorResponse("Already a member of this workspace"),
        },
      },
    },
    "/workspaces/members/{memberId}/roles": {
      put: {
        tags: ["workspaces"],
        summary: "[admin] Replace a member's roles within the named workspace",
        description:
          requiresPermission("roles:assign") +
          " It deliberately shares that key with `POST /admin/users/{userId}/roles` rather than minting one of its own: it is the same capability reached by a different path.",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeaderParameter,
          {
            name: "memberId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SetMemberRolesRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MemberRolesResponse" },
              },
            },
          },
          "400": errorResponse("Missing required field"),
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission(
            "roles:assign",
            "cannot change your own roles",
            "the request named no workspace you belong to",
          ),
          "404": errorResponse(
            "Member not found in this workspace, or a role is not defined in it",
          ),
        },
      },
    },
    "/workspaces/members/{memberId}": {
      delete: {
        tags: ["workspaces"],
        summary: "[admin] Remove a member from the named workspace",
        description:
          requiresPermission("members:manage") +
          " Their direct permission grants go with the membership.",
        security: [{ bearerAuth: [] }],
        parameters: [
          workspaceHeaderParameter,
          {
            name: "memberId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OkResponse" },
              },
            },
          },
          "401": errorResponse("Missing or invalid access token"),
          "403": missingPermission(
            "members:manage",
            "cannot remove yourself from a workspace you administer",
            "the request named no workspace you belong to",
          ),
          "404": errorResponse("Member not found in this workspace"),
        },
      },
    },
  },
};
