"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError, type PermissionSummary } from "@simple-auth-kit/auth-client";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { PermissionRequired } from "@/components/permission-required";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useWorkspaceStore } from "@/lib/stores/store-context";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function field(label: string, value: string | number | null) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

export default observer(function PermissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ability = useAbility<AppAbility>();
  const canRead = hasPermission(ability, PERMISSIONS.permissionsRead);
  const canDefine = hasPermission(ability, PERMISSIONS.permissionsDefine);
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;

  const [permission, setPermission] = useState<PermissionSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // No single-permission endpoint on the client — the catalog is small, so find by id.
      const permissions = await authClient.listPermissions();
      const found = permissions.find((p) => p.id === id) ?? null;
      setPermission(found);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this permission."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Permissions are per-workspace, so switching workspace has to re-fetch rather than leave the
  // previous workspace's permission on screen.
  useEffect(() => {
    if (!canRead || !activeWorkspaceId) return;
    void load();
  }, [canRead, activeWorkspaceId, load]);

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.permissionsRead} what="Permission details" />;

  async function toggleActive() {
    if (!permission) return;
    try {
      await authClient.definePermission({ slug: permission.slug, isActive: !permission.isActive });
      setPermission((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(permission.isActive ? "Permission deactivated." : "Permission activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this permission's status. Try again."));
    }
  }

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
                <Link href={`/permissions/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <PencilIcon />
                  Edit
                </Link>
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
              <Button variant={permission.isActive ? "destructive" : "outline"} disabled={!canDefine} onClick={() => void toggleActive()}>
                {permission.isActive ? "Deactivate" : "Activate"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
});
