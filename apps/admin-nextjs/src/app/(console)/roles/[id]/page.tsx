"use client";

import { useAbility } from "@casl/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError, type PermissionSummary, type RoleSummary } from "@simple-auth-kit/auth-client";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { PermissionGroupView } from "@/components/permission-group-view";
import { PermissionRequired } from "@/components/permission-required";
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

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.rolesManage);
  const canReadPermissions = hasPermission(ability, PERMISSIONS.permissionsRead);

  const [role, setRole] = useState<RoleSummary | null>(null);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const roles = await authClient.listRoles();
      const found = roles.find((r) => r.id === id) ?? null;
      setRole(found);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this role."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!canManage) return;
    void load();
  }, [canManage, load]);

  useEffect(() => {
    if (!canReadPermissions) return;
    authClient
      .listPermissions()
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions]);

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.rolesManage} what="Role details" />;

  async function toggleActive() {
    if (!role) return;
    try {
      await authClient.updateRole(role.id, { isActive: !role.isActive });
      setRole((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(role.isActive ? "Role deactivated." : "Role activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this role's status. Try again."));
    }
  }

  async function handleDelete() {
    if (!role) return;
    setDeleting(true);
    try {
      await authClient.deleteRole(role.id);
      toast.success(`Role "${role.name}" deleted.`);
      router.push("/roles");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this role. Try again."));
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Roles", href: "/roles" }, { title: role?.displayName ?? role?.name ?? "Details", href: `/roles/${id}` }]} />

      {loading && !role && <p className="text-sm text-muted-foreground">Loading…</p>}

      {role && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {role.displayName || role.name}
                  {role.isDefault && <Badge variant="outline">Default</Badge>}
                </CardTitle>
                <CardDescription>
                  <span className="font-mono text-xs">{role.slug}</span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={role.isActive ? "success" : "destructive"}>{role.isActive ? "Active" : "Inactive"}</Badge>
                <Link href={`/roles/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <PencilIcon />
                  Edit
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Permissions ({role.permissions.length} attached)</span>
                {canReadPermissions ? (
                  <PermissionGroupView permissions={permissionCatalog} selected={role.permissions} />
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.map((slug) => (
                      <Badge key={slug} variant="outline">
                        {slug}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant={role.isActive ? "destructive" : "outline"} onClick={() => void toggleActive()}>
                {role.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive">Delete role</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete {role.displayName || role.name}?</DialogTitle>
                    <DialogDescription>
                      Soft-delete: existing assignments are left in place rather than cascade-deleted, and the role simply stops being resolved.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
                      {deleting ? "Deleting…" : "Delete role"}
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
}
