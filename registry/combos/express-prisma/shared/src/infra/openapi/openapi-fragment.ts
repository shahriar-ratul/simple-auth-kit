// Building blocks shared by the pieces of the hand-authored OpenAPI document.
//
// A leaf module on purpose: `openapi-spec.ts` assembles the document from its own identity
// routes plus the fragment `openapi-admin.ts` contributes, and both of those import from here,
// so nothing imports in a circle. (`rbac.defaults.ts` below is a leaf too — it imports only a
// Prisma type — so naming the permission catalog here keeps that property.)
import type { PermissionSlug } from "../../modules/auth/rbac.defaults";

/** One module's contribution to the assembled OpenAPI document — see openapi-spec.ts. */
export interface OpenApiFragment {
  tags: Array<Record<string, unknown>>;
  schemas: Record<string, unknown>;
  paths: Record<string, unknown>;
  /**
   * Parameters an identity route accepts for naming the scope it is acting in, if this
   * deployment has one narrower than itself. `GET /auth/me` answers differently per scope,
   * so it documents them; every other identity route is scope-free.
   */
  scopeParameters: Array<Record<string, unknown>>;
}

/** An error response body, as produced by auth-core-error.middleware.ts. */
export function errorResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  };
}

// The two helpers below are what keep this hand-authored document honest about authorization.
// The nestjs-* combos derive their spec from the very decorators that enforce the check, so it
// cannot disagree with the code; this one is written by hand and would happily go on describing
// a rule that no longer exists. Typing both arguments as `PermissionSlug` recovers the half that
// matters most: the document can only name permissions the catalog defines, so renaming a slug in
// `rbac.defaults.ts` breaks the build here too rather than leaving the docs quietly wrong.

/** The operation-level note naming the permission a route is gated on. See route-tiers.ts. */
export function requiresPermission(permission: PermissionSlug): string {
  return `Requires the \`${permission}\` permission.`;
}

/**
 * The 403 an admin route answers with. `alsoWhen` lists the route's own extra refusals — its
 * self-checks, and anything about the scope the request named, where this deployment has one
 * narrower than itself.
 */
export function missingPermission(
  permission: PermissionSlug,
  ...alsoWhen: string[]
): Record<string, unknown> {
  return errorResponse(
    [`Missing the \`${permission}\` permission`, ...alsoWhen].join(", or "),
  );
}
