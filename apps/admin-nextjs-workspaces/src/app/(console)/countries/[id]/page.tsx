"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError, type CountrySummary } from "@easy-auth/auth-client";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/breadcrumb";
import { PermissionRequired } from "@/components/permission-required";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PERMISSIONS, hasPermission, missingPermissionHint, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useWorkspaceStore } from "@/lib/stores/store-context";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

function field(label: string, value: string | null) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

export default observer(function CountryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const canRead = hasPermission(ability, PERMISSIONS.countriesRead);
  const canManage = hasPermission(ability, PERMISSIONS.countriesManage);
  const canStatus = hasPermission(ability, PERMISSIONS.countriesStatus);

  const [country, setCountry] = useState<CountrySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getCountry(id);
      setCountry(result);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this country."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!canRead || !activeWorkspaceId) return;
    void load();
  }, [canRead, activeWorkspaceId, load]);

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.countriesRead} what="Country details" />;

  async function toggleActive() {
    if (!country) return;
    try {
      if (country.isActive) await authClient.deactivateCountry(id);
      else await authClient.activateCountry(id);
      setCountry((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(country.isActive ? "Country deactivated." : "Country activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this country's status. Try again."));
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await authClient.deleteCountry(id);
      toast.success("Country deleted.");
      router.push("/countries");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this country. Try again."));
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Countries", href: "/countries" }, { title: country?.name ?? "Details", href: `/countries/${id}` }]} />

      {loading && !country && <p className="text-sm text-muted-foreground">Loading…</p>}

      {country && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>
                  {country.emoji} {country.name}
                </CardTitle>
                <CardDescription>
                  Created: {new Date(country.createdAt).toLocaleDateString()} · Updated: {new Date(country.updatedAt).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={country.isActive ? "success" : "destructive"}>{country.isActive ? "Active" : "Inactive"}</Badge>
                <Link
                  href={`/countries/${id}/edit`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  title={canManage ? undefined : missingPermissionHint(PERMISSIONS.countriesManage)}
                  aria-disabled={!canManage}
                  onClick={(e) => !canManage && e.preventDefault()}
                >
                  <PencilIcon />
                  Edit
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Avatar className="size-16 rounded-md">
                {country.flag && <AvatarImage src={country.flag} alt="" className="object-cover" />}
                <AvatarFallback className="rounded-md text-2xl">{country.emoji || "?"}</AvatarFallback>
              </Avatar>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("Code", country.code)}
                {field("ISO code", country.isoCode)}
                {field("Phone code", country.phoneCode)}
                {field("Emoji", country.emoji)}
                {field("Currency", country.currency)}
                {field("Currency name", country.currencyName)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant={country.isActive ? "destructive" : "outline"}
                disabled={!canStatus}
                title={canStatus ? undefined : missingPermissionHint(PERMISSIONS.countriesStatus)}
                onClick={() => void toggleActive()}
              >
                {country.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" disabled={!canManage} title={canManage ? undefined : missingPermissionHint(PERMISSIONS.countriesManage)}>
                    Delete country
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete {country.name}?</DialogTitle>
                    <DialogDescription>
                      This soft-deletes the country: it stops appearing in listings and pickers, but the row is kept for audit purposes.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
                      {deleting ? "Deleting…" : "Delete country"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
});
