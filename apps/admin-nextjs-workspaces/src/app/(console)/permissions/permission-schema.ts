import type { PermissionSummary } from "@easy-auth/auth-client";

// This app has no zod dependency, so unlike the plain admin app the form shape lives here as a
// plain type and the pages validate by hand — the semantics (slug and group required) are the same.

export type PermissionFormValues = {
  slug: string;
  displayName: string;
  description: string;
  group: string;
  // Derived from the permission catalog (see the group helpers below) rather than typed — kept
  // editable in the pages only as an advanced override.
  groupOrder?: number;
  order?: number;
  isActive: boolean;
};

export const emptyPermissionForm: PermissionFormValues = { slug: "", displayName: "", description: "", group: "", isActive: true };

export type GroupOption = { value: string; label: string };

export function deriveGroupOptions(permissions: PermissionSummary[]): GroupOption[] {
  const seen = new Set<string>();
  const options: GroupOption[] = [];
  for (const permission of permissions) {
    if (!seen.has(permission.group)) {
      seen.add(permission.group);
      options.push({ value: permission.group, label: permission.group });
    }
  }
  return options;
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
