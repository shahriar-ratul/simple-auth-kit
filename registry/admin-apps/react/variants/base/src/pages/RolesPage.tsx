import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { PermissionSummary, RoleSummary, UserSummary } from "@easy-auth/auth-client";
import { AuthApiError, userIdOf } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { PermissionGroupSelect } from "@/components/permission-group-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function sameSlugs(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

/** The keys the backend's seeded `admin` role carries — offered as suggestions so an admin isn't guessing at spelling. */
const CATALOG_HINT = Object.values(PERMISSIONS).join(", ");

export function RolesPage() {
  const ability = useAbility();
  const canManageRoles = ability.can(PERMISSIONS.rolesManage, "permission");
  const canAssignRoles = ability.can(PERMISSIONS.rolesAssign, "permission");
  const canGrantPermissions = ability.can(PERMISSIONS.permissionsGrant, "permission");
  const canListUsers = ability.can(PERMISSIONS.usersRead, "permission");
  const canReadPermissions = ability.can(PERMISSIONS.permissionsRead, "permission");

  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [deletingRole, setDeletingRole] = useState<RoleSummary | null>(null);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      setRoles(await authClient.listRoles());
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load roles."));
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManageRoles) return;
    void loadRoles();
  }, [canManageRoles, loadRoles]);

  useEffect(() => {
    if (!canListUsers) return;
    authClient
      .listUsers({ limit: 100 })
      .then((result) => setUsers(result.items))
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load users.")));
  }, [canListUsers]);

  useEffect(() => {
    if (!canReadPermissions) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Roles & permissions</h1>
        <p className="text-sm text-muted-foreground">Create roles, attach permissions to them, and manage direct grants on individual users.</p>
      </div>

      {canManageRoles ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Roles</CardTitle>
            <CardDescription>Every role defined on this deployment.</CardDescription>
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
                    <TableHead>Slug</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Display name</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-mono text-xs">{role.slug}</TableCell>
                      <TableCell className="font-medium">{role.name}</TableCell>
                      <TableCell>{role.displayName}</TableCell>
                      <TableCell>
                        {role.isDefault ? <Badge variant="secondary">Default</Badge> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={role.isActive ? "success" : "destructive"}>{role.isActive ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
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
        onSaved={(role) => {
          setRoles((prev) => prev.map((r) => (r.id === role.id ? role : r)));
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
}

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
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const role = await authClient.createRole({ slug, displayName: displayName || undefined, description: description || undefined });
      if (selectedPermissions.length > 0) {
        await Promise.all(selectedPermissions.map((permSlug) => authClient.attachPermissionToRole(role.id, permSlug)));
      }
      onCreated({ ...role, permissions: selectedPermissions });
      toast.success(`Role "${role.name}" created.`);
      setSlug("");
      setDisplayName("");
      setDescription("");
      setSelectedPermissions([]);
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
        <CardDescription>Pick the permissions this role grants right here — you can still change them later.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-slug">Role slug</Label>
            <Input id="role-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. auditor" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-displayName">Display name</Label>
            <Input id="role-displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Auditor" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-description">Description</Label>
            <Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {canReadPermissions ? (
            <div className="flex flex-col gap-2">
              <Label>Permissions</Label>
              <PermissionGroupSelect permissions={permissionCatalog} selected={selectedPermissions} onChange={setSelectedPermissions} />
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
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Seed from the role the dialog was opened for, once per open. RoleSummary doesn't carry a
  // description (there's no "get one role" endpoint), so that field always starts blank —
  // leaving it blank on submit leaves the role's current description untouched.
  if (role && loadedFor !== role.id) {
    setLoadedFor(role.id);
    setDisplayName(role.displayName);
    setDescription("");
    setIsActive(role.isActive);
    setSelectedPermissions(role.permissions);
  }

  const unchanged =
    role !== null &&
    displayName === role.displayName &&
    description === "" &&
    isActive === role.isActive &&
    sameSlugs(selectedPermissions, role.permissions);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!role) return;
    setSubmitting(true);
    try {
      const toAttach = selectedPermissions.filter((slug) => !role.permissions.includes(slug));
      const toDetach = role.permissions.filter((slug) => !selectedPermissions.includes(slug));
      const [updated] = await Promise.all([
        authClient.updateRole(role.id, {
          displayName: displayName.trim() === "" ? undefined : displayName,
          description: description.trim() === "" ? undefined : description,
          isActive,
        }),
        ...toAttach.map((slug) => authClient.attachPermissionToRole(role.id, slug)),
        ...toDetach.map((slug) => authClient.detachPermissionFromRole(role.id, slug)),
      ]);
      toast.success(`Role "${updated.name}" updated.`);
      onSaved({ ...updated, permissions: selectedPermissions });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the role. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setLoadedFor(null);
    onClose();
  }

  return (
    <Modal isOpen={role !== null} onClose={handleClose} title="Edit role" description={role ? `Updates the "${role.slug}" role.` : ""}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-role-displayName">Display name</Label>
          <Input id="edit-role-displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-role-description">Description</Label>
          <Input
            id="edit-role-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Leave blank to leave the current description unchanged"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="edit-role-isActive"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="edit-role-isActive">Active</Label>
        </div>
        {canReadPermissions ? (
          <div className="flex flex-col gap-2">
            <Label>Permissions</Label>
            <PermissionGroupSelect permissions={permissionCatalog} selected={selectedPermissions} onChange={setSelectedPermissions} />
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting || unchanged}>
            {submitting ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
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
      toast.success(`Role "${role.name}" deleted.`);
      onDeleted(role.id);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete the role. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={role !== null}
      onClose={onClose}
      title="Delete role"
      description={role ? `"${role.slug}" stops being resolved for anyone who holds it. Existing assignments are left in place.` : ""}
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button variant="destructive" disabled={submitting} onClick={() => void handleDelete()}>
            {submitting ? "Deleting…" : "Delete role"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
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
        <CardDescription>Roles union additively; a new role takes effect the next time that user signs in.</CardDescription>
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
            <Button type="button" variant="outline" disabled={submitting !== null} onClick={() => void handleRevoke()} className="self-start">
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
        <CardDescription>Bypasses roles entirely — additive to whatever their roles already grant.</CardDescription>
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
            <Button type="button" variant="outline" disabled={submitting !== null} onClick={() => void handleRevoke()} className="self-start">
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
