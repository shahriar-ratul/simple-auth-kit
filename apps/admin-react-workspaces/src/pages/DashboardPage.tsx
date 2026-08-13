import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { RadioIcon } from "lucide-react";
import { AuthApiError } from "@easy-auth/auth-client";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useWorkspaceStore } from "@/stores/store-context";
import { useLiveAuditFeed, type LiveFeedStatus } from "@/hooks/use-live-audit-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceDialog } from "@/components/layout/CreateWorkspaceDialog";

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
 * The console's front door (see the `*` route in `App.tsx`). Unlike every other screen behind
 * `RequireWorkspace`, Dashboard has to work with no active workspace — a brand-new account lands
 * here before it has one — so it renders its own empty state instead of being gated out, reusing
 * the exact copy/markup `RequireWorkspace` uses elsewhere in the app.
 *
 * Role/permission counts are per workspace, same as everywhere else, so they're only fetched once
 * there is one, and re-fetched on every switch. There's no fabricated user count: the backend has
 * no total-count endpoint, only cursor pagination.
 */
export const DashboardPage = observer(function DashboardPage() {
  const ability = useAbility();
  const workspaces = useWorkspaceStore();
  const [creating, setCreating] = useState(false);

  const canReadUsers = ability.can(PERMISSIONS.usersRead, "permission");
  const canManageRoles = ability.can(PERMISSIONS.rolesManage, "permission");
  const canReadPermissions = ability.can(PERMISSIONS.permissionsRead, "permission");
  const canReadAuditLog = ability.can(PERMISSIONS.auditLogRead, "permission");

  const hasWorkspace = workspaces.hasWorkspace;
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";

  const { status: liveStatus, entries: liveEntries } = useLiveAuditFeed(hasWorkspace && canReadAuditLog);

  const [roleCount, setRoleCount] = useState<number | null>(null);
  const [permissionCount, setPermissionCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasWorkspace) {
      setRoleCount(null);
      setPermissionCount(null);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setError(null);
      try {
        if (canManageRoles) {
          const roles = await authClient.listRoles();
          if (!cancelled) setRoleCount(roles.length);
        }
        if (canReadPermissions) {
          const permissions = await authClient.listPermissions();
          if (!cancelled) setPermissionCount(permissions.length);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof AuthApiError ? err.message : "Couldn't load the dashboard. Check that the backend is running, then try again.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // Keyed on the active workspace, same as every other scoped screen: switching has to re-run
    // this or the cards could show one workspace's counts under another's name.
  }, [hasWorkspace, canManageRoles, canReadPermissions, activeWorkspaceId]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">An overview of {hasWorkspace ? workspaceName : "this deployment"}.</p>
      </div>

      {!hasWorkspace ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm font-medium">You're not in a workspace yet</p>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Users, roles and the audit log all belong to a workspace. Create one to get started — you'll be its administrator — or ask an
            administrator of an existing workspace to add you by email.
          </p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            Create workspace
          </Button>
          <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
        </div>
      ) : (
        <>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {canManageRoles ? (
              <Card>
                <CardHeader>
                  <CardDescription>Roles</CardDescription>
                  <CardTitle className="text-3xl">{roleCount ?? "—"}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">Defined in {workspaceName}</CardContent>
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
            {canReadUsers ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Users</CardTitle>
                  <CardDescription>Search, block, edit, or delete accounts in {workspaceName}.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link to="/users" className="text-sm font-medium text-primary underline underline-offset-2">
                    Go to Users →
                  </Link>
                </CardContent>
              </Card>
            ) : null}
          </div>

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
          ) : null}
        </>
      )}
    </div>
  );
});
