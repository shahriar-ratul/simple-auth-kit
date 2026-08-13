import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { PermissionSummary, RoleSummary, UserSummary } from "@easy-auth/auth-client";
import { AuthApiError, userIdOf } from "@easy-auth/auth-client";
import { observer } from "mobx-react-lite";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useWorkspaceStore } from "@/stores/store-context";
import { PermissionGroupSelect } from "@/components/permission-group-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function sameSlugs(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

/** The keys the backend's seeded `admin` role carries — offered as suggestions so an admin isn't guessing at spelling. */
const CATALOG_HINT = Object.values(PERMISSIONS).join(", ");

export const RolesPage = observer(function RolesPage() {
  const ability = useAbility();
  const workspaceStore = useWorkspaceStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;
  const workspaceName = workspaceStore.activeWorkspace?.name ?? "this workspace";
  const canManageRoles = ability.can(PERMISSIONS.rolesManage, "permission");
  const canAssignRoles = ability.can(PERMISSIONS.rolesAssign, "permission");
  const canGrantPermissions = ability.can(PERMISSIONS.permissionsGrant, "permission");
  const canReadPermissions = ability.can(PERMISSIONS.permissionsRead, "permission");
  const canListUsers = ability.can(PERMISSIONS.usersRead, "permission");

  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [deletingRole, setDeletingRole] = useState<RoleSummary | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);

  const loadRoles = useCallback(async () => {
    if (!canManageRoles) {
      setRoles([]);
      setRolesLoading(false);
      return;
    }
    setRolesLoading(true);
    try {
      setRoles(await authClient.listRoles());
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load roles. Check that the backend is running, then try again."));
    } finally {
      setRolesLoading(false);
    }
  }, [canManageRoles]);

  // Roles are per workspace, same as `MembersPage`'s member list: switching has to re-run this or
  // the picker/table below could show one workspace's roles under another's name.
  useEffect(() => {
    void loadRoles();
  }, [loadRoles, activeWorkspaceId]);

  // The member list is likewise per workspace, and only fetched for the role/permission pickers below.
  useEffect(() => {
    setUsers([]);
    if (!canListUsers) return;
    authClient
      .listUsers({ limit: 100 })
      .then((result) => setUsers(result.items))
      .catch(() => setUsers([]));
  }, [canListUsers, activeWorkspaceId]);

  // The permission catalog backs the Create/Edit Role checkbox grid below, filtered to active
  // permissions — same as the role picker on Add User — so a role can't be built out of a retired
  // capability. Per workspace, same as everything else here.
  useEffect(() => {
    setPermissionCatalog([]);
    if (!canReadPermissions) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions, activeWorkspaceId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Roles & permissions</h1>
        <p className="text-sm text-muted-foreground">
          Create roles, attach permissions to them, and manage direct grants on individual members. Everything here belongs to {workspaceName} and
          means nothing in any other workspace.
        </p>
      </div>

      {canManageRoles ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Roles in {workspaceName}</CardTitle>
          </CardHeader>
          <CardContent>
            {rolesLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles yet. Create one below.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        {role.displayName || role.name}
                        {role.isDefault ? <span className="ml-2 text-xs font-normal text-muted-foreground">default</span> : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{role.slug}</TableCell>
                      <TableCell>
                        <Badge variant={role.isActive ? "success" : "secondary"}>{role.isActive ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditingRole(role)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setDeletingRole(role)}>
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {canManageRoles ? (
          <CreateRoleCard
            permissionCatalog={permissionCatalog}
            canReadPermissions={canReadPermissions}
            onCreated={(role) => setRoles((prev) => [role, ...prev])}
          />
        ) : null}
        {canAssignRoles ? <AssignRoleCard users={users} /> : null}
        {canGrantPermissions ? <DirectPermissionCard users={users} /> : null}
      </div>

      <EditRoleDialog
        role={editingRole}
        permissionCatalog={permissionCatalog}
        canReadPermissions={canReadPermissions}
        onClose={() => setEditingRole(null)}
        onSaved={(updated) => {
          setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          setEditingRole(null);
        }}
      />

      <DeleteRoleDialog
        role={deletingRole}
        onClose={() => setDeletingRole(null)}
        onDeleted={(roleId) => {
          setRoles((prev) => prev.filter((r) => r.id !== roleId));
          setDeletingRole(null);
        }}
      />
    </div>
  );
});

function CreateRoleCard({
  permissionCatalog,
  canReadPermissions,
  onCreated,
}: {
  permissionCatalog: PermissionSummary[];
  canReadPermissions: boolean;
  onCreated: (role: RoleSummary) => void;
}) {
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const role = await authClient.createRole({ slug, displayName: displayName || undefined, description: description || undefined });
      if (permissions.length > 0) {
        await Promise.all(permissions.map((permissionSlug) => authClient.attachPermissionToRole(role.id, permissionSlug)));
      }
      onCreated({ ...role, permissions });
      toast.success(`Role "${role.name}" created.`);
      setSlug("");
      setDisplayName("");
      setDescription("");
      setPermissions([]);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't create the role. Try a different slug."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create role</CardTitle>
        <CardDescription>Scoped to the active workspace. Pick the permissions it grants right here — you can still change them later.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-slug">Role slug</Label>
            <Input id="role-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. auditor" required />
            <p className="text-xs text-muted-foreground">The stable identifier — grants and assignments are keyed on it.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-display-name">Display name</Label>
            <Input id="role-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Auditor" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-description">Description</Label>
            <Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {canReadPermissions ? (
            <div className="flex flex-col gap-2">
              <Label>Permissions</Label>
              <PermissionGroupSelect permissions={permissionCatalog} selected={permissions} onChange={setPermissions} />
            </div>
          ) : null}
          <Button type="submit" disabled={submitting} className="self-start">
            {submitting ? "Creating…" : "Create role"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EditRoleDialog({
  role,
  permissionCatalog,
  canReadPermissions,
  onClose,
  onSaved,
}: {
  role: RoleSummary | null;
  permissionCatalog: PermissionSummary[];
  canReadPermissions: boolean;
  onClose: () => void;
  onSaved: (role: RoleSummary) => void;
}) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Seed the fields from the role the dialog was opened for, once per open — mirrors
  // `SetRolesDialog` in `MembersPage`. `description` isn't part of `RoleSummary`, so it's left
  // out here rather than risk silently clearing one that isn't shown.
  if (role && loadedFor !== role.id) {
    setLoadedFor(role.id);
    setName(role.name);
    setDisplayName(role.displayName);
    setIsActive(role.isActive);
    setEditPermissions(role.permissions);
  }

  function handleClose() {
    setLoadedFor(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!role) return;
    setSubmitting(true);
    try {
      const toAttach = editPermissions.filter((slug) => !role.permissions.includes(slug));
      const toDetach = role.permissions.filter((slug) => !editPermissions.includes(slug));
      const [updated] = await Promise.all([
        authClient.updateRole(role.id, { name, displayName, isActive }),
        ...toAttach.map((slug) => authClient.attachPermissionToRole(role.id, slug)),
        ...toDetach.map((slug) => authClient.detachPermissionFromRole(role.id, slug)),
      ]);
      onSaved({ ...updated, permissions: editPermissions });
      toast.success(`Role "${updated.displayName}" updated.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the role. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  const unchanged =
    role !== null &&
    name === role.name &&
    displayName === role.displayName &&
    isActive === role.isActive &&
    sameSlugs(editPermissions, role.permissions);

  return (
    <Dialog open={role !== null} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit role</DialogTitle>
          <DialogDescription>{role ? `Changes to "${role.slug}" apply everywhere it's assigned in this workspace.` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-role-name">Name</Label>
            <Input id="edit-role-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-role-display-name">Display name</Label>
            <Input id="edit-role-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-input" />
            Active — suspending stops it from granting immediately, without deleting it.
          </label>
          {canReadPermissions ? (
            <div className="flex flex-col gap-2">
              <Label>Permissions</Label>
              <PermissionGroupSelect permissions={permissionCatalog} selected={editPermissions} onChange={setEditPermissions} />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting || unchanged}>
              {submitting ? "Saving…" : "Save changes"}
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

function DeleteRoleDialog({
  role,
  onClose,
  onDeleted,
}: {
  role: RoleSummary | null;
  onClose: () => void;
  onDeleted: (roleId: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    if (!role) return;
    setSubmitting(true);
    try {
      await authClient.deleteRole(role.id);
      toast.success(`Role "${role.displayName}" deleted.`);
      onDeleted(role.id);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete the role. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={role !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete role</DialogTitle>
          <DialogDescription>
            {role
              ? `Existing assignments of "${role.displayName}" are left in place; it simply stops being resolved to any permission. This can't be undone from here.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button variant="destructive" disabled={submitting} onClick={handleDelete}>
              {submitting ? "Deleting…" : "Delete role"}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignRoleCard({ users }: { users: UserSummary[] }) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState<"assign" | "revoke" | null>(null);

  async function handleAssign(event: FormEvent) {
    event.preventDefault();
    setSubmitting("assign");
    try {
      await authClient.assignRole(userId, role);
      toast.success(`Role "${role}" assigned.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't assign the role. Check the user and role name."));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleRevoke() {
    setSubmitting("revoke");
    try {
      await authClient.revokeRole(userId, role);
      toast.success(`Role "${role}" revoked.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't revoke the role. Check the user and role name."));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assign or revoke a role</CardTitle>
        <CardDescription>Roles union additively, and apply only in the active workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAssign} className="flex flex-col gap-3">
          <UserPicker users={users} value={userId} onChange={setUserId} idPrefix="assign" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-role-name">Role name</Label>
            <Input id="assign-role-name" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. auditor" required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting !== null} className="self-start">
              {submitting === "assign" ? "Assigning…" : "Assign role"}
            </Button>
            <Button type="button" variant="outline" disabled={submitting !== null} onClick={handleRevoke} className="self-start">
              {submitting === "revoke" ? "Revoking…" : "Revoke role"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DirectPermissionCard({ users }: { users: UserSummary[] }) {
  const [userId, setUserId] = useState("");
  const [permission, setPermission] = useState("");
  const [submitting, setSubmitting] = useState<"grant" | "revoke" | null>(null);

  async function handleGrant(event: FormEvent) {
    event.preventDefault();
    setSubmitting("grant");
    try {
      await authClient.grantPermission(userId, permission);
      toast.success(`Permission "${permission}" granted.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't grant the permission. Check the user and permission key."));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleRevoke() {
    setSubmitting("revoke");
    try {
      await authClient.revokePermission(userId, permission);
      toast.success(`Permission "${permission}" revoked.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't revoke the permission. Check the user and permission key."));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Grant or revoke a permission directly</CardTitle>
        <CardDescription>Bypasses roles entirely. The grant is attached to their membership, so it can't leak into another workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleGrant} className="flex flex-col gap-3">
          <UserPicker users={users} value={userId} onChange={setUserId} idPrefix="direct" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="direct-permission-key">Permission key</Label>
            <Input
              id="direct-permission-key"
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              placeholder="e.g. users:read"
              required
            />
            <p className="text-xs text-muted-foreground">Catalog: {CATALOG_HINT}</p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting !== null} className="self-start">
              {submitting === "grant" ? "Granting…" : "Grant permission"}
            </Button>
            <Button type="button" variant="outline" disabled={submitting !== null} onClick={handleRevoke} className="self-start">
              {submitting === "revoke" ? "Revoking…" : "Revoke permission"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function UserPicker({
  users,
  value,
  onChange,
  idPrefix,
}: {
  users: UserSummary[];
  value: string;
  onChange: (userId: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${idPrefix}-user-picker`}>User</Label>
      {users.length > 0 ? (
        <select
          id={`${idPrefix}-user-picker`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
        >
          <option value="">Select a user…</option>
          {users.map((user) => (
            <option key={userIdOf(user)} value={userIdOf(user)}>
              {user.email}
            </option>
          ))}
        </select>
      ) : null}
      <Input placeholder="or paste a user ID" value={value} onChange={(e) => onChange(e.target.value)} required />
    </div>
  );
}
