import type { PermissionSummary } from "@easy-auth/auth-client";

/** Distinct group names, in catalog order — feeds the group datalist on the permission forms. */
export function deriveGroupNames(permissions: PermissionSummary[]): string[] {
  const seen = new Set<string>();
  for (const permission of permissions) seen.add(permission.group);
  return Array.from(seen);
}

export function groupOrderFor(permissions: PermissionSummary[], group: string): number {
  return permissions.find((p) => p.group === group)?.groupOrder ?? 0;
}

export function nextOrderInGroup(permissions: PermissionSummary[], group: string): number {
  const maxOrder = permissions.filter((p) => p.group === group).reduce((max, p) => Math.max(max, p.order), -1);
  return maxOrder + 1;
}

export function nextGroupOrder(permissions: PermissionSummary[]): number {
  const maxGroupOrder = permissions.reduce((max, p) => Math.max(max, p.groupOrder), -1);
  return maxGroupOrder + 1;
}
