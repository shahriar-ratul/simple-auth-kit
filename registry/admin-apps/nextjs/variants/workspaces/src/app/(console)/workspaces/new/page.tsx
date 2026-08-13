"use client";

import { observer } from "mobx-react-lite";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/error";
import { useWorkspaceStore } from "@/lib/stores/store-context";

export default observer(function NewWorkspacePage() {
  const workspaces = useWorkspaceStore();
  const router = useRouter();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // The backend makes the creator an administrator of the new workspace in the same
      // transaction that creates it, and the store switches into it — so the console can go
      // straight to a screen only an administrator can open.
      await workspaces.create(name.trim());
      router.push("/users");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Create a workspace</CardTitle>
        <CardDescription>You&apos;ll be its administrator, and the console will switch to it once it exists.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspaceName">Workspace name</Label>
            <Input id="workspaceName" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting || name.trim().length === 0}>
              {submitting ? "Creating workspace…" : "Create workspace"}
            </Button>
            {!workspaces.hasNoWorkspaces && (
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
});
