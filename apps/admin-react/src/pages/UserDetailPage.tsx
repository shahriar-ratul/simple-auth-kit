import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { UserSummary } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/store-context";
import { Breadcrumb } from "@/components/breadcrumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";

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

export const UserDetailPage = observer(function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ability = useAbility();
  const authStore = useAuthStore();
  const canManage = ability.can(PERMISSIONS.usersManage, "permission");
  const canBlock = ability.can(PERMISSIONS.usersBlock, "permission");
  const isSelf = id !== undefined && id === authStore.currentUser?.sub;

  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockPending, setBlockPending] = useState(false);
  const [activePending, setActivePending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setUser(await authClient.getUser(id));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this user."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleBlocked() {
    if (!id || !user) return;
    setBlockPending(true);
    try {
      if (user.blocked) await authClient.unblockUser(id);
      else await authClient.blockUser(id);
      setUser((prev) => (prev ? { ...prev, blocked: !prev.blocked } : prev));
      toast.success(user.blocked ? "User unblocked." : "User blocked.");
    } catch (err) {
      toast.error(apiErrorMessage(err, `Couldn't ${user.blocked ? "unblock" : "block"} this user. Try again.`));
    } finally {
      setBlockPending(false);
    }
  }

  async function toggleActive() {
    if (!id || !user) return;
    setActivePending(true);
    try {
      if (user.isActive) await authClient.deactivateUser(id);
      else await authClient.activateUser(id);
      setUser((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(user.isActive ? "User deactivated." : "User activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, `Couldn't ${user.isActive ? "deactivate" : "activate"} this user. Try again.`));
    } finally {
      setActivePending(false);
    }
  }

  if (!id) return null;

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
                  to={`/users/${id}/edit`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  title={canManage ? undefined : `You need the "${PERMISSIONS.usersManage}" permission to do this.`}
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
                disabled={!canBlock || blockPending}
                title={canBlock ? undefined : `You need the "${PERMISSIONS.usersBlock}" permission to do this.`}
                onClick={() => void toggleBlocked()}
              >
                {user.blocked ? "Unblock" : "Block"}
              </Button>

              <Button
                variant={user.isActive ? "destructive" : "outline"}
                disabled={!canBlock || activePending}
                title={canBlock ? undefined : `You need the "${PERMISSIONS.usersBlock}" permission to do this.`}
                onClick={() => void toggleActive()}
              >
                {user.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Button
                variant="destructive"
                disabled={!canManage || isSelf}
                title={
                  isSelf
                    ? "You can't delete your own account."
                    : canManage
                      ? undefined
                      : `You need the "${PERMISSIONS.usersManage}" permission to do this.`
                }
                onClick={() => setConfirmingDelete(true)}
              >
                Delete account
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <DeleteAccountDialog
        open={confirmingDelete}
        email={user?.email ?? ""}
        userId={id}
        onClose={() => setConfirmingDelete(false)}
        onDeleted={() => navigate("/users")}
      />
    </div>
  );
});

function DeleteAccountDialog({
  open,
  email,
  userId,
  onClose,
  onDeleted,
}: {
  open: boolean;
  email: string;
  userId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    try {
      await authClient.deleteUser(userId);
      toast.success("Account deleted.");
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this account. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Delete account"
      description={`${email || "This user"} is soft-deleted: they stop appearing in listings and can no longer sign in.`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button variant="destructive" disabled={submitting} onClick={() => void handleDelete()}>
            {submitting ? "Deleting…" : "Delete account"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
