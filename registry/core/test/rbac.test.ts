import { describe, expect, it } from "vitest";
import { resolvePermissions } from "../rbac";

describe("rbac: resolvePermissions", () => {
  it("unions role-derived and direct permissions", () => {
    expect(
      resolvePermissions(["users:read", "users:block"], ["billing:manage"]),
    ).toEqual(["billing:manage", "users:block", "users:read"]);
  });

  it("dedupes a permission granted both by role and directly", () => {
    expect(resolvePermissions(["users:read"], ["users:read"])).toEqual([
      "users:read",
    ]);
  });

  it("returns an empty array when the user has no permissions at all", () => {
    expect(resolvePermissions([], [])).toEqual([]);
  });
});
