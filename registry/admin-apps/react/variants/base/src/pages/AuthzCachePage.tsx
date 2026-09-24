import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AuthzCacheStatus } from "@simple-auth-kit/auth-client";
import { AuthApiError } from "@simple-auth-kit/auth-client";
import { authClient } from "@/lib/auth-client";
import { AlertModal } from "@/components/alert-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

/** Why the cache is off, in words an operator can act on. */
function offReason(status: AuthzCacheStatus): string {
  if (!status.enabled)
    return "Caching is disabled in the auth config (authzCache.enabled: false) — every request reads permissions from the database.";
  return "No cache store configured (e.g. Redis) — caching is off, every request reads permissions from the database.";
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function AuthzCachePage() {
  const {
    data: status,
    isLoading: loading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["authz-cache"],
    queryFn: () => authClient.getAuthzCache(),
    staleTime: 0,
  });
  const error = queryError
    ? errorMessage(
        queryError,
        "Couldn't load the authorization cache. Check that the backend is running, then try again.",
      )
    : null;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function clearCache() {
    setClearing(true);
    try {
      const result = await authClient.clearAuthzCache();
      const removed =
        result.removed === null
          ? ""
          : ` — ${result.removed} ${result.removed === 1 ? "entry" : "entries"} removed`;
      toast.success(`Cache cleared${removed}, version now ${result.version}.`);
      setConfirmOpen(false);
      await refetch();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't clear the cache."));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AlertModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void clearCache()}
        loading={clearing}
        description="Every server re-reads permissions from the database on its next request, and all cached entries (permissions and user profiles) are deleted. Safe at any time — it only costs one database read per user."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Authorization cache</h1>
          <p className="text-sm text-muted-foreground">
            Each user's resolved roles and permissions, cached so a request
            doesn't re-read them from the database.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Loading…" : "Refresh"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={loading || !status}
          >
            Clear cache
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load the cache</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Status
            {status ? (
              <Badge variant={status.active ? "default" : "secondary"}>
                {status.active ? "Active" : "Off"}
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!status && loading ? (
            <Skeleton className="h-16 w-full" />
          ) : status ? (
            <>
              {!status.active ? (
                <p className="text-sm text-muted-foreground">
                  {offReason(status)}
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-7">
                <Stat
                  label="Store"
                  value={status.hasStore ? "Configured" : "None"}
                />
                <Stat
                  label="Revalidate"
                  value={status.revalidate ? "Every request" : "TTL only"}
                />
                <Stat label="TTL" value={`${status.ttlSeconds}s`} />
                <Stat
                  label="Version"
                  value={<span className="font-mono">{status.version}</span>}
                />
                <Stat label="Cache hits" value={status.stats.hits} />
                <Stat
                  label="Database resolutions"
                  value={status.stats.resolutions}
                />
                <Stat
                  label="Profile cache hits"
                  value={status.stats.profileHits}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Hits and resolutions are counted by the server that answered,
                since it started.
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cached entries</CardTitle>
        </CardHeader>
        <CardContent>
          {!status && loading ? (
            <Skeleton className="h-24 w-full" />
          ) : !status ? null : status.entries === null ? (
            <p className="text-sm text-muted-foreground">
              {status.hasStore
                ? "This cache store can't list its entries. Inspect it directly (for Redis: redis-cli --scan --pattern 'simpleauthkit:authz:*')."
                : "Nothing is cached — no cache store is configured."}
            </p>
          ) : status.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The cache is empty. Entries appear as users make authorized
              requests.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Cached at version</TableHead>
                  <TableHead>Expires in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.entries.map((entry) => (
                  <TableRow key={entry.key}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {entry.name ?? entry.email ?? entry.userId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.name && entry.email ? `${entry.email} · ` : ""}
                          <span className="font-mono">#{entry.userId}</span>
                        </span>
                        {entry.profileCached ? (
                          <Badge
                            variant="outline"
                            className="w-fit font-normal"
                          >
                            profile cached
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {entry.roles.length ? (
                          entry.roles.map((role) => (
                            <Badge key={role} variant="outline">
                              {role}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            className="underline decoration-dotted underline-offset-4"
                          >
                            {entry.permissions.length}
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80">
                          {entry.permissions.length ? (
                            <div className="flex flex-wrap gap-1">
                              {entry.permissions.map((permission) => (
                                <Badge
                                  key={permission}
                                  variant="secondary"
                                  className="font-mono font-normal"
                                >
                                  {permission}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              No permissions.
                            </span>
                          )}
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">
                          {entry.version ?? "—"}
                        </span>
                        {entry.stale ? (
                          <Badge variant="destructive">stale</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.ttlSeconds === null ? "—" : `${entry.ttlSeconds}s`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
