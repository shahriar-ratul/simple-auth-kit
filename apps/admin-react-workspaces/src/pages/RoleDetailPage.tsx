import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate, useParams } from "react-router-dom";
import { AuthApiError, type PermissionSummary, type RoleSummary } from "@simple-auth-kit/auth-client";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useWorkspaceStore } from "@/stores/store-context";
import { Breadcrumb } from "@/components/breadcrumb";
import { PermissionGroupView } from "@/components/permission-group-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

export const RoleDetailPage = observer(function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ability = useAbility();
  const workspaceStore = useWorkspaceStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;
  const canManage = ability.can(PERMISSIONS.rolesManage, "permission");
  const canReadPermissions = ability.can(PERMISSIONS.permissionsRead, "permission");

  const [role, setRole] = useState<RoleSummary | null>(null);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusPending, setStatusPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  // Keyed on the active workspace, same as `RolesPage`: the record below is whatever this
  // workspace says about the role, so switching has to re-fetch rather than show stale data.
  useEffect(() => {
    void load();
  }, [load, activeWorkspaceId]);

  // The permission catalog backs the read-only checkbox grid below, same picker `RolesPage`
  // uses for Create/Edit Role — kept per workspace, same as everything else here.
  useEffect(() => {
    setPermissionCatalog([]);
    if (!canReadPermissions) return;
    authClient
      .listPermissions()
      .then(setPermissionCatalog)
      .catch((err) => toast.error(apiErrorMessage(err, "Couldn't load the permission catalog.")));
  }, [canReadPermissions, activeWorkspaceId]);

  async function toggleActive() {
    if (!id || !role) return;
    setStatusPending(true);
    try {
      const updated = await authClient.updateRole(id, { isActive: !role.isActive });
      setRole({ ...updated, permissions: role.permissions });
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
                  {role.isDefault && <Badge variant="outline">Default</Badge>}
                </CardTitle>
                <CardDescription>
                  <span className="font-mono text-xs">{role.slug}</span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={role.isActive ? "success" : "destructive"}>{role.isActive ? "Active" : "Inactive"}</Badge>
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
                disabled={!canManage || statusPending}
                title={canManage ? undefined : `You need the "${PERMISSIONS.rolesManage}" permission to do this.`}
                onClick={() => void toggleActive()}
              >
                {role.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Button
                variant="destructive"
                disabled={!canManage}
                title={canManage ? undefined : `You need the "${PERMISSIONS.rolesManage}" permission to do this.`}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete role
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <DeleteRoleDialog
        open={confirmingDelete}
        name={role?.displayName ?? role?.name ?? ""}
        roleId={id}
        onClose={() => setConfirmingDelete(false)}
        onDeleted={() => navigate("/roles")}
      />
    </div>
  );
});

function DeleteRoleDialog({
  open,
  name,
  roleId,
  onClose,
  onDeleted,
}: {
  open: boolean;
  name: string;
  roleId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    try {
      await authClient.deleteRole(roleId);
      toast.success("Role deleted.");
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this role. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Delete ${name || "this role"}?`}
      description="Soft-delete: existing assignments are left in place rather than cascade-deleted, and the role simply stops being resolved."
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
