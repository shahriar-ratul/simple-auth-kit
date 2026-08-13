import { type FormEvent, useState } from "react";
import { AuthApiError } from "@easy-auth/auth-client";
import { useWorkspaceStore } from "@/stores/store-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Creating a workspace is not workspace-scoped — you can't already be in the one you're making —
 * so this is the one admin action that works with no active workspace, which is what makes it
 * the way out of the empty state. The backend provisions the new workspace's roles and the
 * creator's admin membership in the same transaction, so it is usable the moment it exists.
 */
export function CreateWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useWorkspaceStore();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setName("");
    setError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await store.create(name);
      close();
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't create the workspace. Check your connection, then try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>You become its administrator straight away, and it becomes the active workspace.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme" autoFocus required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create workspace"}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
