import type { PermissionSummary } from "@easy-auth/auth-client";
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

/** A checkbox grid grouped by `permission.group` — how the reference app lets you build a role's permission set. */
export function PermissionGroupSelect({
  permissions,
  selected,
  onChange,
  disabled,
}: {
  permissions: PermissionSummary[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(slug: string) {
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  }

  const groups = groupPermissions(permissions);

  if (groups.length === 0) return <p className="text-sm text-muted-foreground">No permissions defined yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <Card key={group.name} className="p-4">
          <h4 className="mb-2 text-sm font-semibold capitalize">{group.name}</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.permissions.map((permission) => (
              <label key={permission.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected.includes(permission.slug)}
                  onChange={() => toggle(permission.slug)}
                  className="size-4 rounded border-input"
                />
                <span className={!permission.isActive ? "text-muted-foreground" : undefined}>
                  {permission.displayName}
                  {!permission.isActive && " (inactive)"}
                </span>
              </label>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
