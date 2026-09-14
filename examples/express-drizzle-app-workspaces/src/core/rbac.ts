// Additive only, no deny/override semantics: role-derived permissions union with direct grants.
export function resolvePermissions(rolePermissionKeys: string[], directPermissionKeys: string[]): string[] {
  return [...new Set([...rolePermissionKeys, ...directPermissionKeys])].sort();
}
