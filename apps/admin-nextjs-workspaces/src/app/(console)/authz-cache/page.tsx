"use client";

import { useAbility } from "@casl/react";
import { RefreshCwIcon, Trash2Icon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { AuthzCacheStatus } from "@simple-auth-kit/auth-client";
import { AlertModal } from "@/components/alert-modal";
import { TableSkeletonLoader } from "@/components/loader/table-skeleton-loader";
import { PermissionRequired } from "@/components/permission-required";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/error";
import { useWorkspaceStore } from "@/lib/stores/store-context";

/** Why the cache isn't serving answers, in the terms an operator can act on. */
function offReason(status: AuthzCacheStatus): string {
  if (!status.enabled)
    return "Caching is disabled (authzCache.enabled = false) — every request reads permissions from the database.";
  return "No cache store configured (e.g. Redis) — caching is off, every request reads permissions from the database.";
}

/** `stats.profileHits` is newer than the client's type — read it only if the server sends it. */
function profileHits(status: AuthzCacheStatus): number | null {
  const value = (status.stats as { profileHits?: unknown }).profileHits;
  return typeof value === "number" ? value : null;
}

export default observer(function AuthzCachePage() {
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";
  const canManage = hasPermission(ability, PERMISSIONS.authzCacheManage);

  const [status, setStatus] = useState<AuthzCacheStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await authClient.getAuthzCache());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Entries are the active workspace's own, so switching workspace has to re-fetch.
  useEffect(() => {
    if (!canManage || !activeWorkspaceId) return;
    void load();
  }, [canManage, activeWorkspaceId, load]);

  const clear = async () => {
    setClearing(true);
    try {
      const result = await authClient.clearAuthzCache();
      toast.success(
        result.removed === null
          ? `Cache cleared — version now ${result.version}.`
          : `Cache cleared — ${result.removed} entries removed, version now ${result.version}.`,
      );
      setConfirmOpen(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setClearing(false);
    }
  };

  if (!canManage)
    return (
      <PermissionRequired
        permission={PERMISSIONS.authzCacheManage}
        what="The authorization cache"
      />
    );

  return (
    <div className="flex flex-col">
      <AlertModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void clear()}
        loading={clearing}
        description="Every server re-reads permissions from the database on its next request, and the stored entries and cached profiles are deleted."
      />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <CardTitle>Authorization cache</CardTitle>
              <CardDescription>
                Cached roles and permissions for members of {workspaceName}.
                Every permission change made through the API applies on the next
                request; clear the cache after editing permissions directly in
                the database.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => void load()}
              >
                <RefreshCwIcon /> Refresh
              </Button>
              <Button
                variant="destructive"
                disabled={loading || clearing || !status}
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2Icon /> Clear cache
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && <Alert variant="destructive">{error}</Alert>}
            {status && (
              <>
                {!status.active && <Alert>{offReason(status)}</Alert>}
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <Badge variant={status.active ? "success" : "outline"}>
                        {status.active ? "Active" : "Off"}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Revalidate</dt>
                    <dd>{status.revalidate ? "Every request" : "TTL only"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">TTL</dt>
                    <dd>{status.ttlSeconds}s</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Version</dt>
                    <dd className="font-mono">{status.version}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Hits</dt>
                    <dd>{status.stats.hits}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Resolutions</dt>
                    <dd>{status.stats.resolutions}</dd>
                  </div>
                  {profileHits(status) !== null && (
                    <div>
                      <dt className="text-muted-foreground">Profile hits</dt>
                      <dd>{profileHits(status)}</dd>
                    </div>
                  )}
                </dl>
                <p className="text-xs text-muted-foreground">
                  Hits and resolutions are counted by the server that answered
                  this request, since it started.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !status ? (
              <TableSkeletonLoader
                rows={5}
                columns={[
                  { header: "User" },
                  { header: "Workspace", width: "w-12" },
                  { header: "Roles", skeletonType: "badge", skeletonCount: 2 },
                  { header: "Permissions", width: "w-12" },
                  { header: "Version", width: "w-12" },
                  { header: "TTL", width: "w-12" },
                ]}
              />
            ) : status?.entries == null ? (
              <p className="text-sm text-muted-foreground">
                {status && !status.hasStore
                  ? "There is no cache store, so there are no entries to show."
                  : "The configured store can't list its entries — inspect it directly (e.g. redis-cli --scan --pattern 'simpleauthkit:authz:*')."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>TTL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status.entries.map((entry) => (
                    <TableRow key={entry.key}>
                      <TableCell>
                        <div className="text-sm">
                          {entry.name ?? entry.email ?? (
                            <span className="font-mono text-xs">
                              {entry.userId}
                            </span>
                          )}
                        </div>
                        {entry.name && entry.email && (
                          <div className="text-xs text-muted-foreground">
                            {entry.email}
                          </div>
                        )}
                        {entry.profileCached && (
                          <Badge variant="outline" className="mt-1">
                            profile cached
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.workspaceId ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {entry.roles.map((role) => (
                            <Badge key={role} variant="outline">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <details>
                          <summary className="cursor-pointer text-sm">
                            {entry.permissions.length}
                          </summary>
                          <ul className="mt-1 font-mono text-xs text-muted-foreground">
                            {entry.permissions.map((permission) => (
                              <li key={permission}>{permission}</li>
                            ))}
                          </ul>
                        </details>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.version ?? "—"}{" "}
                        {entry.stale && (
                          <Badge variant="destructive">stale</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.ttlSeconds === null
                          ? "—"
                          : `${entry.ttlSeconds}s`}
                      </TableCell>
                    </TableRow>
                  ))}
                  {status.entries.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-sm text-muted-foreground"
                      >
                        Nothing cached right now.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
