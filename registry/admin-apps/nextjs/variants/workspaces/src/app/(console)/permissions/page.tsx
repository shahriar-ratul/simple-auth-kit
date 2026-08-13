"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useState } from "react";
import type { DefinePermissionInput, PermissionSummary } from "@easy-auth/auth-client";
import { PermissionRequired } from "@/components/permission-required";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS, hasPermission, missingPermissionHint, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/error";
import { useWorkspaceStore } from "@/lib/stores/store-context";

const emptyForm: DefinePermissionInput = { slug: "", displayName: "", description: "", group: "Custom" };

export default observer(function PermissionsPage() {
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";
  const canRead = hasPermission(ability, PERMISSIONS.permissionsRead);
  const canDefine = hasPermission(ability, PERMISSIONS.permissionsDefine);

  const [permissions, setPermissions] = useState<PermissionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState<PermissionSummary | null>(null);
  const [form, setForm] = useState<DefinePermissionInput>(emptyForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPermissions(await authClient.listPermissions());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Permissions are per-workspace, same as roles — switching workspace has to re-fetch rather
  // than leave the previous workspace's catalog on screen.
  useEffect(() => {
    if (!canRead || !activeWorkspaceId) return;
    void load();
  }, [canRead, activeWorkspaceId, load]);

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.permissionsRead} what="Permissions" />;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setCreateOpen(true);
  }

  function openEdit(permission: PermissionSummary) {
    setEditing(permission);
    setForm({
      slug: permission.slug,
      displayName: permission.displayName,
      description: permission.description ?? "",
      group: permission.group,
      order: permission.order,
      isActive: permission.isActive,
    });
    setCreateOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await authClient.definePermission(form);
      setPermissions((prev) => {
        const exists = prev.some((p) => p.id === saved.id);
        return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
      });
      setNotice(`Permission "${saved.slug}" saved.`);
      setCreateOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const grouped = groupByGroup(permissions);

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>
              The capability catalog for {workspaceName} — attach these to roles or grant them to a member directly.
            </CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canDefine} title={canDefine ? undefined : missingPermissionHint(PERMISSIONS.permissionsDefine)} onClick={openCreate}>
                New permission
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? `Edit ${editing.slug}` : "New permission"}</DialogTitle>
                <DialogDescription>
                  {editing ? "Editing is an upsert keyed on slug — the slug itself can't change here." : "Slug is the key routes check, e.g. billing:manage."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="permSlug">Slug</Label>
                  <Input
                    id="permSlug"
                    required
                    disabled={!!editing}
                    value={form.slug}
                    onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="billing:manage"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="permDisplayName">Display name</Label>
                  <Input
                    id="permDisplayName"
                    value={form.displayName ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="permDescription">Description</Label>
                  <Input
                    id="permDescription"
                    value={form.description ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="permGroup">Group</Label>
                  <Input id="permGroup" value={form.group ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, group: e.target.value }))} />
                </div>
                {editing && (
                  <div className="flex items-center gap-2">
                    <input
                      id="permIsActive"
                      type="checkbox"
                      checked={form.isActive ?? true}
                      onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                    />
                    <Label htmlFor="permIsActive">Active</Label>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={() => void handleSave()} disabled={saving || !form.slug}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {loading && permissions.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}

          {grouped.map(([group, items]) => (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slug</TableHead>
                    <TableHead>Display name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((permission) => (
                    <TableRow key={permission.id}>
                      <TableCell className="font-mono text-xs">{permission.slug}</TableCell>
                      <TableCell>{permission.displayName}</TableCell>
                      <TableCell>
                        <Badge variant={permission.isActive ? "success" : "destructive"}>{permission.isActive ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canDefine}
                          title={canDefine ? undefined : missingPermissionHint(PERMISSIONS.permissionsDefine)}
                          onClick={() => openEdit(permission)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}

          {!loading && permissions.length === 0 && <p className="text-sm text-muted-foreground">No permissions defined yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
});

function groupByGroup(permissions: PermissionSummary[]): Array<[string, PermissionSummary[]]> {
  const byGroup = new Map<string, PermissionSummary[]>();
  for (const permission of [...permissions].sort((a, b) => a.order - b.order)) {
    const list = byGroup.get(permission.group) ?? [];
    list.push(permission);
    byGroup.set(permission.group, list);
  }
  return [...byGroup.entries()].sort((a, b) => (a[1][0]?.groupOrder ?? 0) - (b[1][0]?.groupOrder ?? 0));
}
