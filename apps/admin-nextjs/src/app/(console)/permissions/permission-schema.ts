import { z } from "zod";
import type { PermissionSummary } from "@easy-auth/auth-client";
import type { ComboboxOptions } from "@/components/ui/combobox";

export const permissionSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  displayName: z.string().optional(),
  description: z.string().optional(),
  group: z.string().min(1, "Group is required"),
  // Derived from the permission catalog (see the group helpers below) rather than typed — kept
  // editable here only as an advanced override.
  groupOrder: z.number().optional(),
  order: z.number().optional(),
  isActive: z.boolean().optional(),
});
export type PermissionFormValues = z.infer<typeof permissionSchema>;

export const emptyPermissionForm: PermissionFormValues = { slug: "", displayName: "", description: "", group: "", isActive: true };

export function deriveGroupOptions(permissions: PermissionSummary[]): ComboboxOptions[] {
  const seen = new Set<string>();
  const options: ComboboxOptions[] = [];
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
