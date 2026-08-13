"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";
import { AuthApiError, userIdOf, type RoleSummary, type UserSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { AlertModal } from "@/components/alert-modal";
import { PermissionRequired } from "@/components/permission-required";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PERMISSIONS,
  ROLES_SCREEN_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  missingPermissionHint,
  type AppAbility,
} from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/lib/stores/store-context";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

export default observer(function RolesPage() {
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";
  const canOpen = hasAnyPermission(ability, ROLES_SCREEN_PERMISSIONS);
  const canManageRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canAssignRoles = hasPermission(ability, PERMISSIONS.rolesAssign);
  const canGrantPermissions = hasPermission(ability, PERMISSIONS.permissionsGrant);
  const canReadPermissions = hasPermission(ability, PERMISSIONS.permissionsRead);
  // The user pickers below are a convenience over `users:read`; without it you type an id.
  const canReadUsers = hasPermission(ability, PERMISSIONS.usersRead);

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);

  const [assignUserId, setAssignUserId] = useState("");
  const [assignRoleName, setAssignRoleName] = useState("");

  const [grantUserId, setGrantUserId] = useState("");
  const [grantPermissionKey, setGrantPermissionKey] = useState("");

  const [createSlug, setCreateSlug] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPermissions, setCreatePermissions] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingRole, setDeletingRole] = useState<RoleSummary | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const result = await authClient.listRoles();
      setRoles(result);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load roles."));
    } finally {
      setRolesLoading(false);
    }
  }, []);

  // Roles are per-workspace — `Role` is unique per [workspace, name] — so switching the active
  // workspace has to re-fetch rather than leave the previous one's roles on screen, same as the
  // users page's `activeWorkspaceId` dependency.
  useEffect(() => {
    if (!canManageRoles || !activeWorkspaceId) return;
    void loadRoles();
  }, [canManageRoles, activeWorkspaceId, loadRoles]);

  useEffect(() => {
    if (!canReadUsers || !activeWorkspaceId) return;
    authClient
      .listUsers({ limit: 100 })
      .then((result) => setUsers(result.items))
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load users.")));
  }, [canReadUsers, activeWorkspaceId]);

  useEffect(() => {
    if (!canReadPermissions || !activeWorkspaceId) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions, activeWorkspaceId]);

  if (!canOpen) return <PermissionRequired permission={ROLES_SCREEN_PERMISSIONS} what="Roles & permissions" />;

  function report(fn: () => Promise<void>) {
    return async () => {
      try {
        await fn();
      } catch (err) {
        toast.error(apiErrorMessage(err, "That action failed. Try again."));
      }
    };
  }

  async function handleCreateRole(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const role = await authClient.createRole({ slug: createSlug, displayName: createDisplayName || undefined, description: createDescription || undefined });
      if (createPermissions.length > 0) {
        await Promise.all(createPermissions.map((slug) => authClient.attachPermissionToRole(role.id, slug)));
      }
      setRoles((prev) => [...prev, { ...role, permissions: createPermissions }]);
      setCreateSlug("");
      setCreateDisplayName("");
      setCreateDescription("");
      setCreatePermissions([]);
      toast.success(`Role "${role.name}" created.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't create this role. Try again."));
    } finally {
      setCreating(false);
    }
  }

  function openEditRole(role: RoleSummary) {
    setEditingRole(role);
    setEditDisplayName(role.displayName);
    setEditDescription("");
    setEditIsActive(role.isActive);
    setEditPermissions(role.permissions);
  }

  async function handleUpdateRole() {
    if (!editingRole) return;
    setEditSaving(true);
    try {
      const toAttach = editPermissions.filter((slug) => !editingRole.permissions.includes(slug));
      const toDetach = editingRole.permissions.filter((slug) => !editPermissions.includes(slug));
      const [updated] = await Promise.all([
        authClient.updateRole(editingRole.id, { displayName: editDisplayName, description: editDescription || null, isActive: editIsActive }),
        ...toAttach.map((slug) => authClient.attachPermissionToRole(editingRole.id, slug)),
        ...toDetach.map((slug) => authClient.detachPermissionFromRole(editingRole.id, slug)),
      ]);
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? { ...updated, permissions: editPermissions } : r)));
      setEditingRole(null);
      toast.success(`Role "${updated.name}" updated.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update this role. Try again."));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteRole() {
    if (!deletingRole) return;
    setDeleteSaving(true);
    try {
      await authClient.deleteRole(deletingRole.id);
      setRoles((prev) => prev.filter((r) => r.id !== deletingRole.id));
      toast.success(`Role "${deletingRole.name}" deleted.`);
      setDeletingRole(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this role. Try again."));
    } finally {
      setDeleteSaving(false);
    }
  }

  const handleAssignRole = report(async () => {
    await authClient.assignRole(assignUserId, assignRoleName);
    toast.success(`Role "${assignRoleName}" assigned.`);
  });

  const handleRevokeRole = report(async () => {
    await authClient.revokeRole(assignUserId, assignRoleName);
    toast.success(`Role "${assignRoleName}" revoked.`);
  });

  const handleGrantPermission = report(async () => {
    await authClient.grantPermission(grantUserId, grantPermissionKey);
    toast.success(`Permission "${grantPermissionKey}" granted.`);
  });

  const handleRevokePermission = report(async () => {
    await authClient.revokePermission(grantUserId, grantPermissionKey);
    toast.success(`Permission "${grantPermissionKey}" revoked.`);
  });

  function userField(id: string, value: string, onChange: (next: string) => void) {
    if (!canReadUsers) {
      return <Input id={id} required className="w-56" value={value} onChange={(e) => onChange(e.target.value)} placeholder="User ID" />;
    }
    return (
      <Select name={id} required value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-56">
          <SelectValue placeholder="Select a user…" />
        </SelectTrigger>
        <SelectContent>
          {users.map((user) => (
            <SelectItem key={userIdOf(user)} value={userIdOf(user)}>
              {user.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canManageRoles && (
        <Card>
          <CardHeader>
            <CardTitle>Create role</CardTitle>
            <CardDescription>
              Roles belong to {workspaceName}. Pick the permissions this role grants right here — you can still change them later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleCreateRole}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="createSlug">Slug</Label>
                  <Input id="createSlug" required value={createSlug} onChange={(e) => setCreateSlug(e.target.value)} placeholder="billing-manager" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="createDisplayName">Display name</Label>
                  <Input id="createDisplayName" value={createDisplayName} onChange={(e) => setCreateDisplayName(e.target.value)} placeholder="Billing manager" />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="createDescription">Description</Label>
                  <Input id="createDescription" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
                </div>
              </div>

              {canReadPermissions && (
                <div className="flex flex-col gap-2">
                  <Label>Permissions</Label>
                  <PermissionGroupSelect permissions={permissionCatalog} selected={createPermissions} onChange={setCreatePermissions} />
                </div>
              )}

              <Button type="submit" disabled={creating} className="w-fit">
                {creating ? "Creating…" : "Create role"}
              </Button>
            </form>

            {rolesLoading && roles.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Loading roles…</p>}

            {roles.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {roles.map((role) => (
                  <li key={role.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{role.displayName}</span>
                      <Badge variant="outline">{role.name}</Badge>
                      {role.isDefault && <Badge variant="secondary">Default</Badge>}
                      {!role.isActive && <Badge variant="destructive">Inactive</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => openEditRole(role)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeletingRole(role)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assign or revoke a role</CardTitle>
          <CardDescription>Revoking a role leaves the user&apos;s direct permission grants alone.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assignUserId">User</Label>
              {userField("assignUserId", assignUserId, setAssignUserId)}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assignRoleName">Role name</Label>
              <Input id="assignRoleName" required value={assignRoleName} onChange={(e) => setAssignRoleName(e.target.value)} placeholder="billing-manager" />
            </div>
            <Button
              type="button"
              disabled={!canAssignRoles || !assignUserId || !assignRoleName}
              title={canAssignRoles ? undefined : missingPermissionHint(PERMISSIONS.rolesAssign)}
              onClick={() => void handleAssignRole()}
            >
              Assign role
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canAssignRoles || !assignUserId || !assignRoleName}
              title={canAssignRoles ? undefined : missingPermissionHint(PERMISSIONS.rolesAssign)}
              onClick={() => void handleRevokeRole()}
            >
              Revoke role
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grant or revoke a permission directly</CardTitle>
          <CardDescription>Applied straight to the member, bypassing roles entirely. Scoped to {workspaceName}.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grantUserId">User</Label>
              {userField("grantUserId", grantUserId, setGrantUserId)}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grantPermissionKey">Permission key</Label>
              <Input
                id="grantPermissionKey"
                required
                value={grantPermissionKey}
                onChange={(e) => setGrantPermissionKey(e.target.value)}
                placeholder="users:read"
              />
            </div>
            <Button
              type="button"
              disabled={!canGrantPermissions || !grantUserId || !grantPermissionKey}
              title={canGrantPermissions ? undefined : missingPermissionHint(PERMISSIONS.permissionsGrant)}
              onClick={() => void handleGrantPermission()}
            >
              Grant permission
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canGrantPermissions || !grantUserId || !grantPermissionKey}
              title={canGrantPermissions ? undefined : missingPermissionHint(PERMISSIONS.permissionsGrant)}
              onClick={() => void handleRevokePermission()}
            >
              Revoke permission
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editingRole !== null} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
            <DialogDescription>{editingRole?.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editDisplayName">Display name</Label>
              <Input id="editDisplayName" value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editDescription">Description</Label>
              <Input id="editDescription" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input id="editIsActive" type="checkbox" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} className="size-4 rounded border-input" />
              <Label htmlFor="editIsActive">Active</Label>
            </div>
            {canReadPermissions && (
              <div className="flex flex-col gap-2">
                <Label>Permissions</Label>
                <PermissionGroupSelect permissions={permissionCatalog} selected={editPermissions} onChange={setEditPermissions} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRole(null)} disabled={editSaving}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleUpdateRole()}
              disabled={
                editSaving ||
                (editingRole !== null &&
                  editDisplayName === editingRole.displayName &&
                  editIsActive === editingRole.isActive &&
                  sameSlugs(editPermissions, editingRole.permissions))
              }
            >
              {editSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingRole !== null} onOpenChange={(open) => !open && setDeletingRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role {deletingRole?.name}?</DialogTitle>
            <DialogDescription>
              Existing assignments are left in place; the role simply stops being resolved or granting anything.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingRole(null)} disabled={deleteSaving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteRole()} disabled={deleteSaving}>
              {deleteSaving ? "Deleting…" : "Delete role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
