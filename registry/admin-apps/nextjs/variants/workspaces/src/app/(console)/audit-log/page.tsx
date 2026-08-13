"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useState } from "react";
import type { AuditLogEntry, PageMeta } from "@easy-auth/auth-client";
import { PermissionRequired } from "@/components/permission-required";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS, hasPermission, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/error";
import { useWorkspaceStore } from "@/lib/stores/store-context";

export default observer(function AuditLogPage() {
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const canRead = hasPermission(ability, PERMISSIONS.auditLogRead);

  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const workspaceName = workspaces.activeWorkspace?.name ?? "this workspace";

  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (page: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await authClient.listAuditLog({
          userId: userId || undefined,
          action: action || undefined,
          since: since ? new Date(since).toISOString() : undefined,
          until: until ? new Date(until).toISOString() : undefined,
          page,
        });
        setEntries(result.items);
        setMeta(result.meta);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [userId, action, since, until],
  );

  // `activeWorkspaceId` is a dependency, not decoration: the log is the workspace's own, so
  // switching workspace has to re-fetch rather than leave the previous one's entries on screen.
  useEffect(() => {
    if (!canRead || !activeWorkspaceId) return;
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, activeWorkspaceId]);

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.auditLogRead} what="The audit log" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>What has happened in {workspaceName}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <form
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void load(1);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterUserId">User ID</Label>
            <Input id="filterUserId" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterAction">Action</Label>
            <Input id="filterAction" value={action} onChange={(e) => setAction(e.target.value)} placeholder="role_assigned" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterSince">Since</Label>
            <Input id="filterSince" type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterUntil">Until</Label>
            <Input id="filterUntil" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
            <Button type="submit" disabled={loading}>
              Apply filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => {
                setUserId("");
                setAction("");
                setSince("");
                setUntil("");
                void load(1);
              }}
            >
              Clear filters
            </Button>
          </div>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell
                  className="whitespace-nowrap text-xs text-muted-foreground"
                  title={`Recorded ${new Date(entry.createdAt).toLocaleString()} · Last updated ${new Date(entry.updatedAt).toLocaleString()}`}
                >
                  {new Date(entry.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{entry.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{entry.action}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{entry.userId ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(entry.info)}>
                  {JSON.stringify(entry.info)}
                </TableCell>
                <TableCell className="max-w-3xs truncate text-xs text-muted-foreground">{entry.remarks ?? "—"}</TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No entries match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {meta && meta.total > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!meta.hasPreviousPage || loading} onClick={() => load(meta.page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {meta.page} of {meta.pageCount}
              </span>
              <Button variant="outline" size="sm" disabled={!meta.hasNextPage || loading} onClick={() => load(meta.page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
