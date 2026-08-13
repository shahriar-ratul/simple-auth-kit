import { type FormEvent, useCallback, useState } from "react";
import type { AuditLogEntry, PageMeta } from "@easy-auth/auth-client";
import { AuthApiError } from "@easy-auth/auth-client";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Filters {
  userId: string;
  action: string;
  since: string;
  until: string;
}

const emptyFilters: Filters = { userId: "", action: "", since: "", until: "" };

export function AuditLogPage() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runQuery = useCallback(
    async (page: number, filterValues: Filters) => {
      setLoading(true);
      setError(null);
      try {
        const result = await authClient.listAuditLog({
          userId: filterValues.userId || undefined,
          action: filterValues.action || undefined,
          since: filterValues.since ? new Date(filterValues.since).toISOString() : undefined,
          until: filterValues.until ? new Date(filterValues.until).toISOString() : undefined,
          page,
        });
        setEntries(result.items);
        setMeta(result.meta);
        setLoadedOnce(true);
      } catch (err) {
        setError(err instanceof AuthApiError ? err.message : "Couldn't load the audit log. Check that the backend is running, then try again.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  async function handleFilterSubmit(event: FormEvent) {
    event.preventDefault();
    await runQuery(1, filters);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every security-relevant event: logins, blocks, role and permission changes, 2FA enrollment.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFilterSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-userId">User ID</Label>
              <Input id="filter-userId" value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-action">Action</Label>
              <Input
                id="filter-action"
                value={filters.action}
                onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
                placeholder="e.g. role_assigned"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-since">Since</Label>
              <Input id="filter-since" type="datetime-local" value={filters.since} onChange={(e) => setFilters((f) => ({ ...f, since: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-until">Until</Label>
              <Input id="filter-until" type="datetime-local" value={filters.until} onChange={(e) => setFilters((f) => ({ ...f, until: e.target.value }))} />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Loading…" : "Apply filters"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFilters(emptyFilters);
                }}
              >
                Clear filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {!loadedOnce && !loading ? (
            <p className="text-sm text-muted-foreground">Apply filters (or leave them empty) to load recent events.</p>
          ) : entries.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">No events match these filters.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{entry.name}</span>
                          <Badge variant="outline" className="w-fit font-mono font-normal">
                            {entry.action}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{entry.userId ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(entry.info)}>
                        {JSON.stringify(entry.info)}
                      </TableCell>
                      <TableCell className="max-w-[12rem] truncate text-muted-foreground" title={entry.remarks ?? undefined}>
                        {entry.remarks ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {meta && meta.total > 0 ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={!meta.hasPreviousPage || loading} onClick={() => runQuery(meta.page - 1, filters)}>
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {meta.page} of {meta.pageCount}
                    </span>
                    <Button variant="outline" size="sm" disabled={!meta.hasNextPage || loading} onClick={() => runQuery(meta.page + 1, filters)}>
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
