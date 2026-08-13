import { ChevronDownIcon, XIcon } from "lucide-react";
import type { RoleSummary } from "@easy-auth/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** A checkbox-dropdown + removable-badges multi-select, fed from the real role catalog — not a free-text field. */
export function RoleMultiSelect({
  roles,
  selected,
  onChange,
  placeholder = "Select roles…",
  disabled,
}: {
  roles: RoleSummary[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  function toggle(slug: string) {
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  }

  return (
    <div className="flex flex-col gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" disabled={disabled} className="w-full justify-between font-normal">
            {selected.length === 0 ? placeholder : `${selected.length} role${selected.length === 1 ? "" : "s"} selected`}
            <ChevronDownIcon className="ml-2 size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {roles.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No roles defined yet.</div>}
          {roles.map((role) => (
            <DropdownMenuCheckboxItem
              key={role.id}
              checked={selected.includes(role.slug)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(role.slug)}
            >
              {role.displayName}
              {!role.isActive && <span className="ml-1.5 text-xs text-muted-foreground">(inactive)</span>}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((slug) => {
            const role = roles.find((r) => r.slug === slug);
            return (
              <Badge key={slug} variant="outline" className="gap-1 pr-1">
                {role?.displayName ?? slug}
                {!disabled && (
                  <button type="button" onClick={() => toggle(slug)} className="rounded-full hover:bg-muted">
                    <XIcon className="size-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
