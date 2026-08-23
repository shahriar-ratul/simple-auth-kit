import type { PermissionSummary } from "@easy-auth/auth-client";
import { CheckIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface PermissionGroup {
  name: string;
  permissions: PermissionSummary[];
}

function groupPermissions(permissions: PermissionSummary[]): PermissionGroup[] {
  const byGroup = new Map<string, PermissionSummary[]>();
  for (const permission of permissions) {
    const list = byGroup.get(permission.group) ?? [];
    list.push(permission);
    byGroup.set(permission.group, list);
  }
  return Array.from(byGroup.entries())
    .map(([name, perms]) => ({ name, permissions: perms.sort((a, b) => a.order - b.order) }))
    .sort((a, b) => (a.permissions[0]?.groupOrder ?? 0) - (b.permissions[0]?.groupOrder ?? 0));
}

/**
 * Read-only grouped display of the permissions a role holds — a detail page, not a form, so
 * there is nothing to select and no "Select all" affordance; only what's already attached is
 * shown, grouped the same way `PermissionGroupSelect` groups a role form's checkbox grid.
 */
export function PermissionGroupView({ permissions, selected }: { permissions: PermissionSummary[]; selected: string[] }) {
  const attached = permissions.filter((permission) => selected.includes(permission.slug));
  const groups = groupPermissions(attached);

  if (groups.length === 0) return <p className="text-sm text-muted-foreground">No permissions attached.</p>;

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <Card key={group.name} className="p-4">
          <h4 className="mb-2 text-sm font-semibold capitalize">{group.name}</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.permissions.map((permission) => (
              <div key={permission.id} className="flex items-center gap-2 text-sm">
                <CheckIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className={!permission.isActive ? "text-muted-foreground" : undefined}>
                  {permission.displayName}
                  {!permission.isActive && " (inactive)"}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
