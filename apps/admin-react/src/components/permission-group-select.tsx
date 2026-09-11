import type { PermissionSummary } from "@simple-auth-kit/auth-client";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

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

// Indeterminate isn't in the base checkbox's own stylesheet (only `data-[state=checked]` is), so
// the tri-state coloring is layered on here rather than touching the shared primitive for what
// is otherwise a generic shadcn component used unmodified everywhere else.
const INDETERMINATE_STYLE = "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:border-primary";

/** A checkbox grid grouped by `permission.group`, with a tri-state select-all and one per group — how the reference app lets you build a role's permission set. */
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
  const allSlugs = permissions.map((p) => p.slug);
  const selectedCount = allSlugs.filter((slug) => selected.includes(slug)).length;
  const allSelected = allSlugs.length > 0 && selectedCount === allSlugs.length;
  const allState: boolean | "indeterminate" = allSelected ? true : selectedCount > 0 ? "indeterminate" : false;

  function toggleAll() {
    onChange(allSelected ? [] : allSlugs);
  }

  function toggleGroup(group: PermissionGroup) {
    const groupSlugs = group.permissions.map((p) => p.slug);
    const groupAllSelected = groupSlugs.every((slug) => selected.includes(slug));
    onChange(groupAllSelected ? selected.filter((slug) => !groupSlugs.includes(slug)) : [...new Set([...selected, ...groupSlugs])]);
  }

  if (groups.length === 0) return <p className="text-sm text-muted-foreground">No permissions defined yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={allState} onCheckedChange={toggleAll} disabled={disabled || allSlugs.length === 0} className={INDETERMINATE_STYLE} />
          Select all
        </label>
        <span className="text-xs text-muted-foreground">
          {selectedCount} of {allSlugs.length} selected
        </span>
      </div>
      {groups.map((group) => {
        const groupSlugs = group.permissions.map((p) => p.slug);
        const groupSelectedCount = groupSlugs.filter((slug) => selected.includes(slug)).length;
        const groupAllSelected = groupSlugs.length > 0 && groupSelectedCount === groupSlugs.length;
        const groupState: boolean | "indeterminate" = groupAllSelected ? true : groupSelectedCount > 0 ? "indeterminate" : false;
        return (
          <Card key={group.name} className="p-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold capitalize">
              <Checkbox checked={groupState} onCheckedChange={() => toggleGroup(group)} disabled={disabled} className={INDETERMINATE_STYLE} />
              {group.name}
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.permissions.map((permission) => (
                <label key={permission.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selected.includes(permission.slug)} onCheckedChange={() => toggle(permission.slug)} disabled={disabled} />
                  <span className={!permission.isActive ? "text-muted-foreground" : undefined}>
                    {permission.displayName}
                    {!permission.isActive && " (inactive)"}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
