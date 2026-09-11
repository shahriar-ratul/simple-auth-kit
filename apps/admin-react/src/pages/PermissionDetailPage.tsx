import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { PermissionSummary } from "@simple-auth-kit/auth-client";
import { AuthApiError } from "@simple-auth-kit/auth-client";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { DefinePermissionDialog } from "@/pages/PermissionsPage";
import { Breadcrumb } from "@/components/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function field(label: string, value: string | number | null) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

export function PermissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ability = useAbility();
  const canDefine = ability.can(PERMISSIONS.permissionsDefine, "permission");

  const [permission, setPermission] = useState<PermissionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusPending, setStatusPending] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const permissions = await authClient.listPermissions();
      setPermission(permissions.find((p) => p.id === id) ?? null);
    } catch (err) {
      toast.error(err instanceof AuthApiError ? err.message : "Couldn't load this permission.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive() {
    if (!permission) return;
    setStatusPending(true);
    try {
      await authClient.definePermission({ slug: permission.slug, isActive: !permission.isActive });
      setPermission((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(permission.isActive ? "Permission deactivated." : "Permission activated.");
    } catch (err) {
      toast.error(err instanceof AuthApiError ? err.message : "Couldn't change this permission's status. Try again.");
    } finally {
      setStatusPending(false);
    }
  }

  if (!id) return null;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Permissions", href: "/permissions" }, { title: permission?.displayName ?? "Details", href: `/permissions/${id}` }]} />

      {loading && !permission && <p className="text-sm text-muted-foreground">Loading…</p>}

      {permission && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{permission.displayName}</CardTitle>
                <CardDescription>
                  <span className="font-mono text-xs">{permission.slug}</span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={permission.isActive ? "success" : "destructive"}>{permission.isActive ? "Active" : "Inactive"}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canDefine}
                  title={canDefine ? undefined : `You need the "${PERMISSIONS.permissionsDefine}" permission to do this.`}
                  onClick={() => setEditing(true)}
                >
                  <PencilIcon />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("Group", permission.group)}
                {field("Order", permission.order)}
                {field("Group order", permission.groupOrder)}
              </div>
              {field("Description", permission.description)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant={permission.isActive ? "destructive" : "outline"}
                disabled={!canDefine || statusPending}
                title={canDefine ? undefined : `You need the "${PERMISSIONS.permissionsDefine}" permission to do this.`}
                onClick={() => void toggleActive()}
              >
                {permission.isActive ? "Deactivate" : "Activate"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <DefinePermissionDialog
        state={editing && permission ? { mode: "edit", permission } : null}
        onClose={() => setEditing(false)}
        onSaved={(updated) => {
          setPermission(updated);
          setEditing(false);
        }}
      />
    </div>
  );
}
