"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError, type UserSummary } from "@easy-auth/auth-client";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { PermissionRequired } from "@/components/permission-required";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { PERMISSIONS, hasPermission, missingPermissionHint, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useAuthStore } from "@/lib/stores/store-context";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
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

function field(label: string, value: string | null) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

const UserDetailPage = observer(function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const authStore = useAuthStore();
  const canRead = hasPermission(ability, PERMISSIONS.usersRead);
  const canManage = hasPermission(ability, PERMISSIONS.usersManage);
  const canBlock = hasPermission(ability, PERMISSIONS.usersBlock);

  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getUser(id);
      setUser(result);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this user."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.usersRead} what="User details" />;

  const isSelf = authStore.currentUser?.sub === id;

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
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Users", href: "/users" }, { title: user?.email ?? "Details", href: `/users/${id}` }]} />

      {loading && !user && <p className="text-sm text-muted-foreground">Loading…</p>}

      {user && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{user.email}</CardTitle>
                <CardDescription>
                  Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"} · Created:{" "}
                  {new Date(user.createdAt).toLocaleDateString()} · Updated: {new Date(user.updatedAt).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={user.isActive ? "success" : "destructive"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                {user.blocked && <Badge variant="destructive">Blocked</Badge>}
                <Link
                  href={`/users/${id}/edit`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  title={canManage ? undefined : missingPermissionHint(PERMISSIONS.usersManage)}
                  aria-disabled={!canManage}
                  onClick={(e) => !canManage && e.preventDefault()}
                >
                  <PencilIcon />
                  Edit
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Avatar className="size-16">
                {user.photo && <AvatarImage src={user.photo} alt="" className="object-cover" />}
                <AvatarFallback className="text-base">{initialsOf(user)}</AvatarFallback>
              </Avatar>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Roles</span>
                <div className="flex flex-wrap gap-1">
                  {user.roles.length === 0 && <span className="text-sm text-muted-foreground">No roles</span>}
                  {user.roles.map((role) => (
                    <Badge key={role} variant="outline">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("First name", user.firstName)}
                {field("Last name", user.lastName)}
                {field("Display name", user.displayName)}
                {field("Username", user.username)}
                {field("Phone", user.phone)}
                {field("Two-factor authentication", user.twoFactorEnabled ? "Enabled" : "Disabled")}
              </div>
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
