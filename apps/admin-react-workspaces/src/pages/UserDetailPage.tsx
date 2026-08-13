import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { RoleSummary, UserSummary } from "@easy-auth/auth-client";
import { AuthApiError, userIdOf } from "@easy-auth/auth-client";
import { observer } from "mobx-react-lite";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useAuthStore, useWorkspaceStore } from "@/stores/store-context";
import { PhotoUpload } from "@/components/photo-upload";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

/** `UpdateUserInput`'s string fields are all nullable — an empty form field means "clear it" on the wire. */
function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function initialsOf(user: UserSummary): string {
  const from = user.displayName || user.email;
  return (
    from
      .split(/[@.\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export const UserDetailPage = observer(function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ability = useAbility();
  const workspaceStore = useWorkspaceStore();
  const authStore = useAuthStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;
  const canBlock = ability.can(PERMISSIONS.usersBlock, "permission");
  const canManage = ability.can(PERMISSIONS.usersManage, "permission");
  const canReadRoles = ability.can(PERMISSIONS.rolesManage, "permission");
  const canAssignRoles = ability.can(PERMISSIONS.rolesAssign, "permission");
  const isSelf = id !== undefined && id === authStore.currentUser?.sub;

  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingBlock, setPendingBlock] = useState(false);
  const [pendingActive, setPendingActive] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [roleCatalog, setRoleCatalog] = useState<RoleSummary[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      toast.error("No user id in the URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.getUser(id);
      setUser(result);
      setSelectedRoles(result.roles);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this user. Check that the backend is running, then try again."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Keyed on the active workspace, same as `UsersPage`: the profile and roles below are whatever
  // this workspace says about the user, so switching has to re-fetch rather than show stale data.
  useEffect(() => {
    void load();
  }, [load, activeWorkspaceId]);

  // Roles are per workspace, same as `RolesPage`: switching has to re-fetch the catalog this
  // picker offers, or it could show one workspace's roles against another's membership.
  useEffect(() => {
    setRoleCatalog([]);
    if (!canReadRoles) return;
    authClient
      .listRoles()
      .then(setRoleCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the role catalog.")));
  }, [canReadRoles, activeWorkspaceId]);

  async function handlePhotoChange(photo: string | null) {
    if (!user) return;
    try {
      const updated = await authClient.updateUser(userIdOf(user), { photo });
      setUser(updated);
      toast.success(photo ? "Photo updated." : "Photo removed.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the photo. Try again."));
    }
  }

  /** No bulk "set roles" endpoint — diffs against the loaded roles and assigns/revokes only the delta. */
  async function handleSaveRoles() {
    if (!user) return;
    const userId = userIdOf(user);
    const toAssign = selectedRoles.filter((slug) => !user.roles.includes(slug));
    const toRevoke = user.roles.filter((slug) => !selectedRoles.includes(slug));
    if (toAssign.length === 0 && toRevoke.length === 0) return;
    setSavingRoles(true);
    try {
      await Promise.all([
        ...toAssign.map((slug) => authClient.assignRole(userId, slug)),
        ...toRevoke.map((slug) => authClient.revokeRole(userId, slug)),
      ]);
      setUser((prev) => (prev ? { ...prev, roles: selectedRoles } : prev));
      toast.success("Roles updated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update roles. Try again."));
      setSelectedRoles(user.roles);
    } finally {
      setSavingRoles(false);
    }
  }

  async function toggleBlocked() {
    if (!user) return;
    const userId = userIdOf(user);
    setPendingBlock(true);
    try {
      if (user.blocked) await authClient.unblockUser(userId);
      else await authClient.blockUser(userId);
      toast.success(user.blocked ? "User unblocked." : "User blocked.");
      setUser((prev) => (prev ? { ...prev, blocked: !prev.blocked } : prev));
    } catch (err) {
      toast.error(apiErrorMessage(err, `Couldn't ${user.blocked ? "unblock" : "block"} this user. Try again.`));
    } finally {
      setPendingBlock(false);
    }
  }

  async function toggleActive() {
    if (!user) return;
    const userId = userIdOf(user);
    setPendingActive(true);
    try {
      if (user.isActive) await authClient.deactivateUser(userId);
      else await authClient.activateUser(userId);
      toast.success(user.isActive ? "User deactivated." : "User activated.");
      setUser((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
    } catch (err) {
      toast.error(apiErrorMessage(err, `Couldn't ${user.isActive ? "deactivate" : "activate"} this user. Try again.`));
    } finally {
      setPendingActive(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/users" className="text-sm text-muted-foreground underline underline-offset-4">
          ← Back to users
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{user?.email ?? "User"}</h1>
        {user ? (
          <p className="text-sm text-muted-foreground">
            Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"} · Created:{" "}
            {new Date(user.createdAt).toLocaleDateString()}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !user ? (
        <p className="text-sm text-muted-foreground">User not found.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>Email is the login identifier and can't be changed here.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PhotoUpload photo={user.photo} fallback={initialsOf(user)} disabled={!canManage} onChange={handlePhotoChange} />

              <div className="flex gap-1.5">
                <Badge variant={user.isActive ? "success" : "destructive"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                {user.blocked && <Badge variant="destructive">Blocked</Badge>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Roles</Label>
                {canReadRoles ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="max-w-xs flex-1">
                      <RoleMultiSelect roles={roleCatalog} selected={selectedRoles} onChange={setSelectedRoles} disabled={!canAssignRoles} />
                    </div>
                    {canAssignRoles && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingRoles || JSON.stringify([...selectedRoles].sort()) === JSON.stringify([...user.roles].sort())}
                        onClick={() => void handleSaveRoles()}
                      >
                        {savingRoles ? "Saving…" : "Save roles"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {user.roles.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No roles</span>
                    ) : (
                      user.roles.map((role) => (
                        <Badge key={role} variant="secondary">
                          {role}
                        </Badge>
                      ))
                    )}
                  </div>
                )}
              </div>
              {canManage ? (
                <EditProfileForm key={id} user={user} onSaved={(updated) => setUser(updated)} />
              ) : (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <ProfileField label="First name" value={user.firstName} />
                  <ProfileField label="Last name" value={user.lastName} />
                  <ProfileField label="Display name" value={user.displayName} />
                  <ProfileField label="Username" value={user.username} />
                  <ProfileField label="Phone" value={user.phone} />
                </dl>
              )}
            </CardContent>
          </Card>

          {canBlock ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Access</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant={user.blocked ? "outline" : "destructive"} disabled={pendingBlock} onClick={toggleBlocked}>
                  {pendingBlock ? "Working…" : user.blocked ? "Unblock user" : "Block user"}
                </Button>
                <Button variant={user.isActive ? "destructive" : "outline"} disabled={pendingActive} onClick={toggleActive}>
                  {pendingActive ? "Working…" : user.isActive ? "Deactivate user" : "Activate user"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {canManage ? (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-base">Delete account</CardTitle>
                <CardDescription>
                  Soft-deletes the account: it disappears from every listing and can no longer sign in — across every workspace it belongs to, not
                  just this one.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" disabled={isSelf} onClick={() => setConfirmingDelete(true)}>
                  Delete account
                </Button>
                {isSelf ? <p className="mt-2 text-xs text-muted-foreground">You can't delete your own account.</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <DeleteUserDialog
        user={confirmingDelete ? user : null}
        onClose={() => setConfirmingDelete(false)}
        onDeleted={() => navigate("/users", { replace: true })}
      />
    </div>
  );
});

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function EditProfileForm({ user, onSaved }: { user: UserSummary; onSaved: (user: UserSummary) => void }) {
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const updated = await authClient.updateUser(userIdOf(user), {
        firstName: emptyToNull(firstName),
        lastName: emptyToNull(lastName),
        displayName: emptyToNull(displayName),
        username: emptyToNull(username),
        phone: emptyToNull(phone),
      });
      onSaved(updated);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update this user. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-first-name">First name</Label>
          <Input id="user-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-last-name">Last name</Label>
          <Input id="user-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-display-name">Display name</Label>
          <Input id="user-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-username">Username</Label>
          <Input id="user-username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-phone">Phone</Label>
          <Input id="user-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function DeleteUserDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: UserSummary | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    if (!user) return;
    setSubmitting(true);
    try {
      await authClient.deleteUser(userIdOf(user));
      toast.success("Account deleted.");
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this account. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            {user
              ? `${user.email} is soft-deleted: the account disappears from every listing and can no longer sign in, across every workspace it belongs to — not just this one. This can't be undone from here.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button variant="destructive" disabled={submitting} onClick={handleDelete}>
            {submitting ? "Deleting…" : "Delete account"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
