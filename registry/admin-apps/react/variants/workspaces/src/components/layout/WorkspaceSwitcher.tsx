import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useWorkspaceStore } from "@/stores/store-context";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";

/**
 * Names the workspace everything on screen belongs to, and switches it. Every scoped call in the
 * app reads the same value (`WorkspaceStore.activeWorkspaceId` -> `X-Workspace-Id`), so this
 * control is the whole answer to "what am I looking at".
 */
export const WorkspaceSwitcher = observer(function WorkspaceSwitcher() {
  const store = useWorkspaceStore();
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);

  const hasWorkspaces = store.workspaces.length > 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Workspace</span>
      {hasWorkspaces ? (
        <select
          aria-label="Active workspace"
          value={store.activeWorkspaceId ?? ""}
          disabled={switching}
          onChange={async (event) => {
            setSwitching(true);
            try {
              await store.setActive(event.target.value);
            } finally {
              setSwitching(false);
            }
          }}
          className="h-9 max-w-[14rem] rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs"
        >
          {store.workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-muted-foreground">None yet</span>
      )}
      <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
        New workspace
      </Button>
      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
});
