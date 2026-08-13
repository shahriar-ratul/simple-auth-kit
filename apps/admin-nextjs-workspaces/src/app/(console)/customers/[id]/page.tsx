"use client";

import { useAbility } from "@casl/react";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthApiError, type CustomerSummary } from "@easy-auth/auth-client";
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

function customerName(customer: CustomerSummary): string {
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ");
}

function initialsOf(customer: CustomerSummary): string {
  const from = customerName(customer) || customer.email;
  return (
    from
      .split(/[@.\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function field(label: string, value: string | null) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  );
}

export default observer(function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const canRead = hasPermission(ability, PERMISSIONS.customersRead);
  const canManage = hasPermission(ability, PERMISSIONS.customersManage);
  const canStatus = hasPermission(ability, PERMISSIONS.customersStatus);

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authClient.getCustomer(id);
      setCustomer(result);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't load this customer."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Membership-scoped data, same reasoning as the customers list's `activeWorkspaceId`
  // dependency: switching workspace has to re-fetch rather than leave the previous workspace's
  // customer on screen.
  useEffect(() => {
    if (!canRead || !activeWorkspaceId) return;
    void load();
  }, [canRead, activeWorkspaceId, load]);

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.customersRead} what="Customer details" />;

  async function toggleActive() {
    if (!customer) return;
    try {
      if (customer.isActive) await authClient.deactivateCustomer(id);
      else await authClient.activateCustomer(id);
      setCustomer((prev) => (prev ? { ...prev, isActive: !prev.isActive } : prev));
      toast.success(customer.isActive ? "Customer deactivated." : "Customer activated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't change this customer's status. Try again."));
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await authClient.deleteCustomer(id);
      toast.success("Customer deleted.");
      router.push("/customers");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete this customer. Try again."));
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Customers", href: "/customers" }, { title: customer?.email ?? "Details", href: `/customers/${id}` }]} />

      {loading && !customer && <p className="text-sm text-muted-foreground">Loading…</p>}

      {customer && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{customerName(customer) || customer.email}</CardTitle>
                <CardDescription>
                  Joined: {new Date(customer.joinedDate).toLocaleDateString()} · Created: {new Date(customer.createdAt).toLocaleDateString()} · Updated:{" "}
                  {new Date(customer.updatedAt).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={customer.isActive ? "success" : "destructive"}>{customer.isActive ? "Active" : "Inactive"}</Badge>
                <Link
                  href={`/customers/${id}/edit`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  title={canManage ? undefined : missingPermissionHint(PERMISSIONS.customersManage)}
                  aria-disabled={!canManage}
                  onClick={(e) => !canManage && e.preventDefault()}
                >
                  <PencilIcon />
                  Edit
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Avatar className="size-16">
                {customer.photo && <AvatarImage src={customer.photo} alt="" className="object-cover" />}
                <AvatarFallback className="text-base">{initialsOf(customer)}</AvatarFallback>
              </Avatar>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("Email", customer.email)}
                {field("Username", customer.username)}
                {field("First name", customer.firstName)}
                {field("Last name", customer.lastName)}
                {field("Phone", customer.phone)}
                {field("Gender", customer.gender && customer.gender.charAt(0).toUpperCase() + customer.gender.slice(1))}
                {field("Date of birth", customer.dob ? new Date(customer.dob).toLocaleDateString() : null)}
                {field("Joined date", new Date(customer.joinedDate).toLocaleDateString())}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant={customer.isEmailVerified ? "success" : "outline"}>{customer.isEmailVerified ? "Email verified" : "Email unverified"}</Badge>
                <Badge variant={customer.isPhoneVerified ? "success" : "outline"}>{customer.isPhoneVerified ? "Phone verified" : "Phone unverified"}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant={customer.isActive ? "destructive" : "outline"}
                disabled={!canStatus}
                title={canStatus ? undefined : missingPermissionHint(PERMISSIONS.customersStatus)}
                onClick={() => void toggleActive()}
              >
                {customer.isActive ? "Deactivate" : "Activate"}
              </Button>

              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" disabled={!canManage} title={canManage ? undefined : missingPermissionHint(PERMISSIONS.customersManage)}>
                    Delete customer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete {customer.email}?</DialogTitle>
                    <DialogDescription>
                      This soft-deletes the customer: they stop appearing in listings, but the row is kept for audit purposes.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
                      {deleting ? "Deleting…" : "Delete customer"}
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
