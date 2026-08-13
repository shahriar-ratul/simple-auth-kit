"use client";

import { useAbility } from "@casl/react";
import { KeySquareIcon, RadioIcon, ScrollTextIcon, ShieldCheckIcon, UserPlusIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuditLogEntry } from "@easy-auth/auth-client";
import { Breadcrumb } from "@/components/breadcrumb";
import { Skeleton } from "@/components/loader/skeleton";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveAuditFeed, type LiveFeedStatus } from "@/hooks/use-live-audit-feed";
import { ROLES_SCREEN_PERMISSIONS, PERMISSIONS, hasAnyPermission, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error";

const statColors = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
} as const;

function StatIcon({ icon: Icon, color }: { icon: LucideIcon; color: keyof typeof statColors }) {
  return (
    <div className={cn("rounded-lg p-2", statColors[color])}>
      <Icon className="size-4" />
    </div>
  );
}

type QuickAction = { href: string; label: string; icon: LucideIcon };

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

export default observer(function DashboardPage() {
  const ability = useAbility<AppAbility>();
  const canReadUsers = hasPermission(ability, PERMISSIONS.usersRead);
  const canManageUsers = hasPermission(ability, PERMISSIONS.usersManage);
  const canManageRoles = hasPermission(ability, PERMISSIONS.rolesManage);
  const canOpenRoles = hasAnyPermission(ability, ROLES_SCREEN_PERMISSIONS);
  const canReadPermissions = hasPermission(ability, PERMISSIONS.permissionsRead);
  const canReadAuditLog = hasPermission(ability, PERMISSIONS.auditLogRead);
  const { status: liveStatus, entries: liveEntries } = useLiveAuditFeed(canReadAuditLog);

  const [userCount, setUserCount] = useState<number | null>(null);
  const [roleCount, setRoleCount] = useState<number | null>(null);
  const [permissionCount, setPermissionCount] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [canReadUsers, canManageRoles, canReadPermissions, canReadAuditLog]);

  const quickActions: QuickAction[] = [
    ...(canManageUsers ? [{ href: "/users/new", label: "Add user", icon: UserPlusIcon }] : []),
    ...(canOpenRoles ? [{ href: "/roles", label: "Manage roles", icon: ShieldCheckIcon }] : []),
    ...(canReadPermissions ? [{ href: "/permissions", label: "Manage permissions", icon: KeySquareIcon }] : []),
    ...(canReadAuditLog ? [{ href: "/audit-log", label: "View audit log", icon: ScrollTextIcon }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[]} />

      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">An overview of this deployment.</p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canReadUsers && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardDescription>Users</CardDescription>
              <StatIcon icon={UsersIcon} color="blue" />
            </CardHeader>
            <CardContent>
              {loading && userCount === null ? <Skeleton className="h-9 w-16" /> : <div className="text-3xl font-semibold">{userCount}</div>}
              <Link href="/users" className="text-sm font-medium text-primary underline underline-offset-2">
                On this deployment →
              </Link>
            </CardContent>
          </Card>
        )}
        {canManageRoles && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardDescription>Roles</CardDescription>
              <StatIcon icon={ShieldCheckIcon} color="green" />
            </CardHeader>
            <CardContent>
              {loading && roleCount === null ? <Skeleton className="h-9 w-16" /> : <div className="text-3xl font-semibold">{roleCount}</div>}
              <p className="text-sm text-muted-foreground">Defined for this deployment</p>
            </CardContent>
          </Card>
        )}
        {canReadPermissions && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardDescription>Permissions</CardDescription>
              <StatIcon icon={KeySquareIcon} color="purple" />
            </CardHeader>
            <CardContent>
              {loading && permissionCount === null ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <div className="text-3xl font-semibold">{permissionCount}</div>
              )}
              <p className="text-sm text-muted-foreground">In the capability catalog</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {canReadAuditLog && (
          <Card className="lg:col-span-2">
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
              {loading && recentActivity.length === 0 ? (
                <ul className="flex flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-24" />
                    </li>
                  ))}
                </ul>
              ) : recentActivity.length === 0 ? (
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

        {quickActions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {quickActions.map((action) => (
                <Button key={action.href} variant="outline" className="justify-start" asChild>
                  <Link href={action.href}>
                    <action.icon className="size-4" />
                    {action.label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {canReadAuditLog && (
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
              <p className="text-sm text-muted-foreground">
                {liveStatus === "connected" ? "Waiting for activity…" : "No live events."}
              </p>
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
      )}
    </div>
  );
});
