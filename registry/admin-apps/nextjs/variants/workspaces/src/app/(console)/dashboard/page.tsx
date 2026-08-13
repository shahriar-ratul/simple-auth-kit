"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuditLogEntry } from "@easy-auth/auth-client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/error";
import { useWorkspaceStore } from "@/lib/stores/store-context";

/**
 * The overview for the active workspace. Every card is individually permission-gated, same as
 * the sidebar links it points to — and when there's no active workspace at all, the console
 * layout's own empty state (`(console)/layout.tsx`) takes over before this page ever renders, the
 * same way it already does for `/users`, `/roles`, and every other workspace-scoped screen.
 */
export default observer(function DashboardPage() {
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";
  const canReadUsers = hasPermission(ability, PERMISSIONS.usersRead);
  const canManageRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canReadPermissions = hasPermission(ability, PERMISSIONS.permissionsRead);
  const canReadAuditLog = hasPermission(ability, PERMISSIONS.auditLogRead);

  const [userCount, setUserCount] = useState<number | null>(null);
  const [roleCount, setRoleCount] = useState<number | null>(null);
  const [permissionCount, setPermissionCount] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;

    async function load() {
      try {
        if (canReadUsers) {
          const users = await authClient.listUsers({ limit: 1 });
          if (!cancelled) setUserCount(users.meta.total);
        }
        if (canManageRoles) {
          const roles = await authClient.listRoles();
          if (!cancelled) setRoleCount(roles.length);
        }
        if (canReadPermissions) {
          const permissions = await authClient.listPermissions();
          if (!cancelled) setPermissionCount(permissions.length);
        }
        if (canReadAuditLog) {
          const audit = await authClient.listAuditLog({ limit: 5 });
          if (!cancelled) setRecentActivity(audit.items);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, canReadUsers, canManageRoles, canReadPermissions, canReadAuditLog]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">An overview of {workspaceName}.</p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canManageRoles && (
          <Card>
            <CardHeader>
              <CardDescription>Roles</CardDescription>
              <CardTitle className="text-3xl">{roleCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Defined for this workspace</CardContent>
          </Card>
        )}
        {canReadPermissions && (
          <Card>
            <CardHeader>
              <CardDescription>Permissions</CardDescription>
              <CardTitle className="text-3xl">{permissionCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">In the capability catalog</CardContent>
          </Card>
        )}
        {canReadUsers && (
          <Card>
            <CardHeader>
              <CardDescription>Users</CardDescription>
              <CardTitle className="text-3xl">{userCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <Link href="/users" className="font-medium text-primary underline underline-offset-2">
                Go to Users →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {canReadAuditLog && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>The latest entries from the audit log.</CardDescription>
            </div>
            <Link href="/audit-log" className="text-sm font-medium text-primary underline underline-offset-2">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{entry.action}</Badge>
                      <span>{entry.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
});
