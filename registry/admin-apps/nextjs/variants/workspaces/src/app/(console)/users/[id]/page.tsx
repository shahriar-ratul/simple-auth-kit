"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError, type RoleSummary, type UpdateUserInput, type UserSummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { PermissionRequired } from "@/components/permission-required";
import { PhotoUpload } from "@/components/photo-upload";
import { RoleMultiSelect } from "@/components/role-multi-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PERMISSIONS, hasPermission, missingPermissionHint, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useAuthStore, useWorkspaceStore } from "@/lib/stores/store-context";
import { GENDER_OPTIONS } from "../user-schema";

const inputClassName = "bg-background border-2 focus:border-purple-500 transition-colors";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

type ProfileForm = {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  username: string;
  dob: string;
  gender: string;
  joinedDate: string;
};

function toForm(user: UserSummary): ProfileForm {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
    username: user.username ?? "",
    dob: user.dob ? user.dob.slice(0, 10) : "",
    gender: user.gender ?? "",
    joinedDate: user.joinedDate ? user.joinedDate.slice(0, 10) : "",
  };
}

/**
 * Empty string means "clear the field" (`null`), matching `UpdateUserInput`'s nullable fields.
 * `joinedDate` is not nullable on update, so a cleared picker just leaves it unchanged.
 */
function toInput(form: ProfileForm): UpdateUserInput {
  return {
    firstName: form.firstName || null,
    lastName: form.lastName || null,
    displayName: form.displayName || null,
    phone: form.phone || null,
    username: form.username || null,
    dob: form.dob || null,
    gender: form.gender || null,
    joinedDate: form.joinedDate || undefined,
  };
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

const UserDetailPage = observer(function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const authStore = useAuthStore();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const canRead = hasPermission(ability, PERMISSIONS.usersRead);
  const canManage = hasPermission(ability, PERMISSIONS.usersManage);
  const canBlock = hasPermission(ability, PERMISSIONS.usersBlock);
  const canReadRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canAssignRoles = hasPermission(ability, PERMISSIONS.rolesAssign);

  const [user, setUser] = useState<UserSummary | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [roleCatalog, setRoleCatalog] = useState<RoleSummary[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getUser(id);
      setUser(result);
      setForm(toForm(result));
      setSelectedRoles(result.roles);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this user."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Membership is workspace-scoped, same reasoning as the users list's `activeWorkspaceId`
  // dependency: switching workspace has to re-fetch rather than leave the previous workspace's
  // user on screen.
  useEffect(() => {
    if (!canRead || !activeWorkspaceId) return;
    void load();
  }, [canRead, activeWorkspaceId, load]);

  useEffect(() => {
    if (!canReadRoles || !activeWorkspaceId) return;
    authClient
      .listRoles()
      .then(setRoleCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the role catalog.")));
  }, [canReadRoles, activeWorkspaceId]);

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.usersRead} what="User details" />;

  const isSelf = authStore.currentUser?.sub === id;

  function set<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const updated = await authClient.updateUser(id, toInput(form));
      setUser(updated);
      setForm(toForm(updated));
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save this profile. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(photo: string | null) {
    try {
      const updated = await authClient.updateUser(id, { photo });
      setUser(updated);
      toast.success(photo ? "Photo updated." : "Photo removed.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update the photo. Try again."));
    }
  }

  /** No bulk "set roles" endpoint — diffs against the loaded roles and assigns/revokes only the delta. */
  async function handleSaveRoles() {
    if (!user) return;
    const toAssign = selectedRoles.filter((slug) => !user.roles.includes(slug));
    const toRevoke = user.roles.filter((slug) => !selectedRoles.includes(slug));
    if (toAssign.length === 0 && toRevoke.length === 0) return;
    setSavingRoles(true);
    try {
      await Promise.all([...toAssign.map((slug) => authClient.assignRole(id, slug)), ...toRevoke.map((slug) => authClient.revokeRole(id, slug))]);
      setUser((prev) => (prev ? { ...prev, roles: selectedRoles } : prev));
      toast.success("Roles updated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update roles. Try again."));
      setSelectedRoles(user.roles);
    } finally {
      setSavingRoles(false);
    }
  }

  async function toggleBlock() {
    if (!user) return;
    try {
      if (user.blocked) await authClient.unblockUser(id);
      else await authClient.blockUser(id);
      setUser((prev) => (prev ? { ...prev, blocked: !prev.blocked } : prev));
      toast.success(user.blocked ? "User unblocked." : "User blocked.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this user's status. Try again."));
    }
  }

  async function toggleActive() {
    if (!user) return;
    try {
      if (user.isActive) await authClient.deactivateUser(id);
      else await authClient.activateUser(id);
      setUser((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(user.isActive ? "User deactivated." : "User activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this user's status. Try again."));
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await authClient.deleteUser(id);
      toast.success("Account deleted.");
      router.push("/users");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this account. Try again."));
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex-1 space-y-4">
      <Breadcrumb items={[{ title: "Users", href: "/users" }, { title: user?.email ?? "Details", href: `/users/${id}` }]} />
      <div className="flex items-start justify-between">
        <Heading title="Edit User" description="Update user details" />
      </div>
      <Separator />

      {loading && !user && <p className="text-sm text-muted-foreground">Loading…</p>}

      {user && form && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{user.email}</CardTitle>
                <CardDescription>
                  Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"} · Created:{" "}
                  {new Date(user.createdAt).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex gap-1.5">
                <Badge variant={user.isActive ? "success" : "destructive"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                {user.blocked && <Badge variant="destructive">Blocked</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-8 w-full">
                <Card className="w-full">
                  <CardHeader className="border-b bg-muted/50">
                    <CardTitle className="text-2xl">User Information</CardTitle>
                    <CardDescription className="text-base">Update user&apos;s basic information</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                              id="firstName"
                              disabled={!canManage || saving}
                              placeholder="First Name"
                              value={form.firstName}
                              onChange={(e) => set("firstName", e.target.value)}
                              type="text"
                              className={inputClassName}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                              id="lastName"
                              disabled={!canManage || saving}
                              placeholder="Last Name"
                              value={form.lastName}
                              onChange={(e) => set("lastName", e.target.value)}
                              type="text"
                              className={inputClassName}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="displayName">Display Name</Label>
                            <Input
                              id="displayName"
                              disabled={!canManage || saving}
                              placeholder="Display Name"
                              value={form.displayName}
                              onChange={(e) => set("displayName", e.target.value)}
                              type="text"
                              className={inputClassName}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="username">
                              Username &nbsp;
                              <span className="text-xs text-destructive dark:text-destructive-foreground">(Must be unique)</span>
                            </Label>
                            <Input
                              id="username"
                              disabled={!canManage || saving}
                              placeholder="Username"
                              value={form.username}
                              onChange={(e) => set("username", e.target.value)}
                              className={inputClassName}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="phone">
                              Phone &nbsp;
                              <span className="text-xs text-muted-foreground">(With country code)</span>
                            </Label>
                            <Input
                              id="phone"
                              type="text"
                              disabled={!canManage || saving}
                              value={form.phone}
                              onChange={(e) => set("phone", e.target.value)}
                              placeholder="+1234567890"
                              className={inputClassName}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Additional Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="flex flex-col gap-1.5 p-2">
                            <Label htmlFor="joinedDate">Joined Date</Label>
                            <Input
                              id="joinedDate"
                              type="date"
                              disabled={!canManage || saving}
                              value={form.joinedDate}
                              onChange={(e) => set("joinedDate", e.target.value)}
                              className={inputClassName}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5 p-2">
                            <Label htmlFor="dob">Date of birth</Label>
                            <Input
                              id="dob"
                              type="date"
                              disabled={!canManage || saving}
                              value={form.dob}
                              onChange={(e) => set("dob", e.target.value)}
                              className={inputClassName}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="gender">Gender</Label>
                            <Select
                              value={form.gender || undefined}
                              onValueChange={(value) => set("gender", value)}
                              disabled={!canManage || saving}
                            >
                              <SelectTrigger id="gender" className="w-full min-w-[200px]">
                                <SelectValue placeholder="Select Gender" />
                              </SelectTrigger>
                              <SelectContent>
                                {GENDER_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Roles</h3>
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
                            {user.roles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                            {user.roles.map((role) => (
                              <Badge key={role} variant="outline">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>

                  <CardHeader className="border-b bg-muted/50 mt-6">
                    <CardTitle className="text-2xl">Profile Photo</CardTitle>
                    <CardDescription className="text-base">Upload user&apos;s profile picture (Max size: 2MB, Formats: JPG, PNG)</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <PhotoUpload photo={user.photo} fallback={initialsOf(user)} disabled={!canManage} onChange={handlePhotoChange} />
                  </CardContent>

                  <CardFooter className="flex justify-center gap-4 mt-8 pb-8">
                    <Button type="button" variant="outline" onClick={() => router.push("/users")} disabled={saving}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!canManage || saving}
                      title={canManage ? undefined : missingPermissionHint(PERMISSIONS.usersManage)}
                      className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 min-w-32"
                    >
                      {saving ? "Updating..." : "Update User"}
                    </Button>
                  </CardFooter>
                </Card>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant={user.blocked ? "outline" : "destructive"}
                disabled={!canBlock}
                title={canBlock ? undefined : missingPermissionHint(PERMISSIONS.usersBlock)}
                onClick={() => void toggleBlock()}
              >
                {user.blocked ? "Unblock" : "Block"}
              </Button>

              <Button
                variant={user.isActive ? "destructive" : "outline"}
                disabled={!canBlock}
                title={canBlock ? undefined : missingPermissionHint(PERMISSIONS.usersBlock)}
                onClick={() => void toggleActive()}
              >
                {user.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={!canManage || isSelf}
                    title={
                      isSelf
                        ? "You cannot delete your own account."
                        : canManage
                          ? undefined
                          : missingPermissionHint(PERMISSIONS.usersManage)
                    }
                  >
                    Delete account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete {user.email}?</DialogTitle>
                    <DialogDescription>
                      This soft-deletes the account: it stops appearing in listings and can no longer sign in, but the row is kept for
                      audit purposes.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
                      {deleting ? "Deleting…" : "Delete account"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
});

export default UserDetailPage;
