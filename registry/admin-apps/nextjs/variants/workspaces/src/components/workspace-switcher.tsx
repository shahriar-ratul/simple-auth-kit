"use client";

import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspaceStore } from "@/lib/stores/store-context";

/**
 * Names the workspace every request is scoped to, and switches it. Deliberately plain: it sits
 * in the header, says what you are looking at, and changes it — the consequence (your roles,
 * this list of users, this audit log) is visible on the page behind it, not explained here.
 */
export const WorkspaceSwitcher = observer(function WorkspaceSwitcher() {
  const workspaces = useWorkspaceStore();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  if (workspaces.status !== "ready" || workspaces.workspaces.length === 0) return null;

  async function handleChange(workspaceId: string) {
    setSwitching(true);
    try {
      await workspaces.setActive(workspaceId);
      // Every screen reloads off the active workspace, so a refresh is all a switch needs.
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Select value={workspaces.activeWorkspaceId ?? ""} onValueChange={(id) => void handleChange(id)} disabled={switching}>
        <SelectTrigger aria-label="Active workspace" className="h-8 w-52 text-sm">
          <SelectValue placeholder="Select a workspace…" />
        </SelectTrigger>
        <SelectContent>
          {workspaces.workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              {workspace.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button asChild variant="ghost" size="sm" title="Create a workspace">
        <Link href="/workspaces/new">
          <Plus />
          New
        </Link>
      </Button>
    </div>
  );
});
