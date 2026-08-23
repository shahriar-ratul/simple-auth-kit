import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PermissionSummary, RoleSummary } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { PermissionGroupView } from "@/components/permission-group-view";
import { EditRoleDialog, DeleteRoleDialog } from "@/pages/RolesPage";
import { Breadcrumb } from "@/components/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

export function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ability = useAbility();
  const canManageRoles = ability.can(PERMISSIONS.rolesManage, "permission");
  const canReadPermissions = ability.can(PERMISSIONS.permissionsRead, "permission");

  const [role, setRole] = useState<RoleSummary | null>(null);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusPending, setStatusPending] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleSummary | null>(null);
  const [deletingRole, setDeletingRole] = useState<RoleSummary | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const roles = await authClient.listRoles();
      setRole(roles.find((r) => r.id === id) ?? null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this role."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canReadPermissions) return;
    authClient
      .listPermissions({ activeOnly: true })
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions]);

  async function toggleActive() {
    if (!role) return;
    setStatusPending(true);
    try {
      await authClient.updateRole(role.id, { isActive: !role.isActive });
      setRole((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(role.isActive ? "Role deactivated." : "Role activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this role's status. Try again."));
    } finally {
      setStatusPending(false);
    }
  }

  if (!id) return null;

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
                  {role.isDefault && <Badge variant="secondary">Default</Badge>}
                </CardTitle>
                <CardDescription>
                  <span className="font-mono text-xs">{role.slug}</span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={role.isActive ? "success" : "destructive"}>{role.isActive ? "Active" : "Inactive"}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canManageRoles}
                  title={canManageRoles ? undefined : `You need the "${PERMISSIONS.rolesManage}" permission to do this.`}
                  onClick={() => setEditingRole(role)}
                >
                  <PencilIcon />
                  Edit
                </Button>
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
              <Button
                variant={role.isActive ? "destructive" : "outline"}
                disabled={!canManageRoles || statusPending}
                title={canManageRoles ? undefined : `You need the "${PERMISSIONS.rolesManage}" permission to do this.`}
                onClick={() => void toggleActive()}
              >
                {role.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Button
                variant="destructive"
                disabled={!canManageRoles}
                title={canManageRoles ? undefined : `You need the "${PERMISSIONS.rolesManage}" permission to do this.`}
                onClick={() => setDeletingRole(role)}
              >
                Delete role
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <EditRoleDialog
        role={editingRole}
        permissionCatalog={permissionCatalog}
        canReadPermissions={canReadPermissions}
        onClose={() => setEditingRole(null)}
        onSaved={(updated) => {
          setRole(updated);
          setEditingRole(null);
        }}
      />

      <DeleteRoleDialog role={deletingRole} onClose={() => setDeletingRole(null)} onDeleted={() => navigate("/roles")} />
    </div>
  );
}
