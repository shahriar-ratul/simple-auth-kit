import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuthApiError, type CountrySummary } from "@easy-auth/auth-client";
import { format } from "date-fns";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useWorkspaceStore } from "@/stores/store-context";
import { Breadcrumb } from "@/components/breadcrumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";

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

export const CountryDetailPage = observer(function CountryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ability = useAbility();
  const workspaceStore = useWorkspaceStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;
  const canManage = ability.can(PERMISSIONS.countriesManage, "permission");
  const canStatus = ability.can(PERMISSIONS.countriesStatus, "permission");

  const [country, setCountry] = useState<CountrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusPending, setStatusPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setCountry(await authClient.getCountry(id));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this country."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Keyed on the active workspace, same as `CountriesPage`: the record below is whatever this
  // workspace says about the country, so switching has to re-fetch rather than show stale data.
  useEffect(() => {
    void load();
  }, [load, activeWorkspaceId]);

  async function toggleActive() {
    if (!id || !country) return;
    setStatusPending(true);
    try {
      if (country.isActive) await authClient.deactivateCountry(id);
      else await authClient.activateCountry(id);
      setCountry((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(country.isActive ? "Country deactivated." : "Country activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this country's status. Try again."));
    } finally {
      setStatusPending(false);
    }
  }

  if (!id) return null;

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
                  Created: {format(new Date(country.createdAt), "dd MMM yyyy")} · Updated: {format(new Date(country.updatedAt), "dd MMM yyyy")}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={country.isActive ? "success" : "destructive"}>{country.isActive ? "Active" : "Inactive"}</Badge>
                <Link
                  to={`/countries/${id}/edit`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  title={canManage ? undefined : `You need the "${PERMISSIONS.countriesManage}" permission to do this.`}
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
                disabled={!canStatus || statusPending}
                title={canStatus ? undefined : `You need the "${PERMISSIONS.countriesStatus}" permission to do this.`}
                onClick={() => void toggleActive()}
              >
                {country.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Button
                variant="destructive"
                disabled={!canManage}
                title={canManage ? undefined : `You need the "${PERMISSIONS.countriesManage}" permission to do this.`}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete country
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <DeleteCountryDialog
        open={confirmingDelete}
        name={country?.name ?? ""}
        countryId={id}
        onClose={() => setConfirmingDelete(false)}
        onDeleted={() => navigate("/countries")}
      />
    </div>
  );
});

function DeleteCountryDialog({
  open,
  name,
  countryId,
  onClose,
  onDeleted,
}: {
  open: boolean;
  name: string;
  countryId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    try {
      await authClient.deleteCountry(countryId);
      toast.success("Country deleted.");
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this country. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Delete ${name || "this country"}?`}
      description="This soft-deletes the country: it stops appearing in listings and pickers, but the row is kept for audit purposes."
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button variant="destructive" disabled={submitting} onClick={() => void handleDelete()}>
            {submitting ? "Deleting…" : "Delete country"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
