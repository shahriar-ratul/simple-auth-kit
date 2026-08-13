import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { PermissionSummary } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";
import { observer } from "mobx-react-lite";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useWorkspaceStore } from "@/stores/store-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PermissionGroup {
  group: string;
  groupOrder: number;
  items: PermissionSummary[];
}

export const PermissionsPage = observer(function PermissionsPage() {
  const ability = useAbility();
  const workspaceStore = useWorkspaceStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;
  const canDefine = ability.can(PERMISSIONS.permissionsDefine, "permission");

  const [permissions, setPermissions] = useState<PermissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<PermissionSummary | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPermissions(await authClient.listPermissions());
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't load permissions. Check that the backend is running, then try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // The catalog itself is global, but on this backend variant every `/auth/admin/*` route — this
  // one included — sits behind the workspace guard, so a switch has to re-send the header.
  useEffect(() => {
    void load();
  }, [load, activeWorkspaceId]);

  // Grouped by `group` and ordered by `groupOrder`/`order` client-side, the same layout a
  // permission matrix uses server-side.
  const groups = useMemo<PermissionGroup[]>(() => {
    const byGroup = new Map<string, PermissionSummary[]>();
    for (const permission of permissions) {
      const list = byGroup.get(permission.group) ?? [];
      list.push(permission);
      byGroup.set(permission.group, list);
    }
    return Array.from(byGroup.entries())
      .map(([group, items]) => ({
        group,
        groupOrder: items[0]?.groupOrder ?? 0,
        items: [...items].sort((a, b) => a.order - b.order),
      }))
      .sort((a, b) => a.groupOrder - b.groupOrder);
  }, [permissions]);

  function handleUpserted(permission: PermissionSummary, message: string) {
    setPermissions((prev) => {
      const exists = prev.some((p) => p.id === permission.id);
      return exists ? prev.map((p) => (p.id === permission.id ? permission : p)) : [...prev, permission];
    });
    setNotice(message);
    setEditing(null);
    setCreating(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Permissions</h1>
          <p className="text-sm text-muted-foreground">The catalog of capabilities roles and direct grants can carry.</p>
        </div>
        {canDefine ? <Button onClick={() => setCreating(true)}>New permission</Button> : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="mb-4 text-sm text-emerald-600">{notice}</p> : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No permissions defined yet.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((group) => (
                <div key={group.group}>
                  <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{group.group}</h2>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Status</TableHead>
                        {canDefine ? <TableHead className="text-right">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((permission) => (
                        <TableRow key={permission.id}>
                          <TableCell className="font-medium">
                            {permission.displayName}
                            {permission.description ? (
                              <p className="text-xs font-normal text-muted-foreground">{permission.description}</p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{permission.slug}</TableCell>
                          <TableCell>
                            <Badge variant={permission.isActive ? "success" : "secondary"}>{permission.isActive ? "Active" : "Inactive"}</Badge>
                          </TableCell>
                          {canDefine ? (
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => setEditing(permission)}>
                                Edit
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DefinePermissionDialog
        open={creating || editing !== null}
        permission={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={handleUpserted}
      />
    </div>
  );
});

function DefinePermissionDialog({
  open,
  permission,
  onClose,
  onSaved,
}: {
  open: boolean;
  permission: PermissionSummary | null;
  onClose: () => void;
  onSaved: (permission: PermissionSummary, message: string) => void;
}) {
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [group, setGroup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Seed once per open — the edit identity is the permission's id, and "create" (no permission)
  // is its own identity so reopening for a new one doesn't carry over the last row's values.
  // Mirrors the `loadedFor` guard `SetRolesDialog` uses in `MembersPage`.
  const openKey = open ? (permission ? permission.id : "create") : null;
  if (openKey !== null && loadedFor !== openKey) {
    setLoadedFor(openKey);
    setSlug(permission?.slug ?? "");
    setDisplayName(permission?.displayName ?? "");
    setDescription(permission?.description ?? "");
    setGroup(permission?.group ?? "");
    setError(null);
  }

  function handleClose() {
    setLoadedFor(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const saved = await authClient.definePermission({
        slug,
        displayName: displayName.trim() === "" ? undefined : displayName,
        description: description.trim() === "" ? null : description,
        group: group.trim() === "" ? undefined : group,
      });
      onSaved(saved, `Permission "${saved.slug}" ${permission ? "updated" : "created"}.`);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Couldn't save this permission. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{permission ? "Edit permission" : "New permission"}</DialogTitle>
          <DialogDescription>
            {permission
              ? "Slug is the stable identifier grants and roles are keyed on — it can't change."
              : "Upserted on slug: reusing an existing one edits it instead of creating a duplicate."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permission-slug">Slug</Label>
            <Input
              id="permission-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. reports:export"
              disabled={permission !== null}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permission-display-name">Display name</Label>
            <Input
              id="permission-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Defaults to the slug"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permission-group">Group</Label>
            <Input id="permission-group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder='Defaults to "Custom"' />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permission-description">Description</Label>
            <Input id="permission-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : permission ? "Save changes" : "Create permission"}
            </Button>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
