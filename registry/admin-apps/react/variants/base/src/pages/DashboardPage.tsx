import { RadioIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthApiError, type AuditLogEntry } from "@easy-auth/auth-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveAuditFeed, type LiveFeedStatus } from "@/hooks/use-live-audit-feed";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";

const liveStatusStyles: Record<LiveFeedStatus, { dot: string; label: string }> = {
  connecting: { dot: "bg-amber-500", label: "Connecting" },
  connected: { dot: "bg-emerald-500", label: "Live" },
  disconnected: { dot: "bg-red-500", label: "Offline" },
};

function LiveStatusBadge({ status }: { status: LiveFeedStatus }) {
  const { dot, label } = liveStatusStyles[status];
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn("size-2 rounded-full", dot, status === "connected" && "animate-pulse")} />
      {label}
    </Badge>
  );
}

/**
 * The console's front door. Cards are individually permission-gated so a low-privilege user sees
 * fewer of them rather than hitting a wall — that's also why this route isn't wrapped in
 * `RequirePermission` in App.tsx.
 */
export function DashboardPage() {
  const ability = useAbility();
  const canReadUsers = ability.can(PERMISSIONS.usersRead, "permission");
  const canManageRoles = ability.can(PERMISSIONS.rolesManage, "permission");
  const canReadPermissions = ability.can(PERMISSIONS.permissionsRead, "permission");
  const canReadAuditLog = ability.can(PERMISSIONS.auditLogRead, "permission");
  const { status: liveStatus, entries: liveEntries } = useLiveAuditFeed(canReadAuditLog);

  const [userCount, setUserCount] = useState<number | null>(null);
  const [roleCount, setRoleCount] = useState<number | null>(null);
  const [permissionCount, setPermissionCount] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        if (!cancelled) {
          setError(
            err instanceof AuthApiError ? err.message : "Couldn't load dashboard data. Check that the backend is running, then try again.",
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [canReadUsers, canManageRoles, canReadPermissions, canReadAuditLog]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">An overview of this deployment.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canReadUsers ? (
          <Card>
            <CardHeader>
              <CardDescription>Users</CardDescription>
              <CardTitle className="text-3xl">{userCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <Link to="/users" className="font-medium text-primary underline underline-offset-2">
                On this deployment →
              </Link>
            </CardContent>
          </Card>
        ) : null}
        {canManageRoles ? (
          <Card>
            <CardHeader>
              <CardDescription>Roles</CardDescription>
              <CardTitle className="text-3xl">{roleCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Defined for this deployment</CardContent>
          </Card>
        ) : null}
        {canReadPermissions ? (
          <Card>
            <CardHeader>
              <CardDescription>Permissions</CardDescription>
              <CardTitle className="text-3xl">{permissionCount ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">In the capability catalog</CardContent>
          </Card>
        ) : null}
      </div>

      {canReadAuditLog ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>The latest entries from the audit log.</CardDescription>
            </div>
            <Link to="/audit-log" className="text-sm font-medium text-primary underline underline-offset-2">
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
      ) : null}

      {canReadAuditLog ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <RadioIcon className="size-4 text-muted-foreground" />
              <div>
                <CardTitle>Live activity</CardTitle>
                <CardDescription>Audit events as they happen, streamed from the backend.</CardDescription>
              </div>
            </div>
            <LiveStatusBadge status={liveStatus} />
          </CardHeader>
          <CardContent>
            {liveEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{liveStatus === "connected" ? "Waiting for activity…" : "No live events."}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {liveEntries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{entry.action}</Badge>
                      <span>{entry.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
