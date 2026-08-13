"use client";

import { useAbility } from "@casl/react";
import { type ColumnDef, type PaginationState, type SortingState, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { ChevronDownIcon, EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { AuthApiError, type CustomerSummary } from "@easy-auth/auth-client";
import { AlertModal } from "@/components/alert-modal";
import { Breadcrumb } from "@/components/breadcrumb";
import { TableSkeletonLoader } from "@/components/loader/table-skeleton-loader";
import { PermissionRequired } from "@/components/permission-required";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PERMISSIONS, hasPermission, missingPermissionHint, type AppAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { useWorkspaceStore } from "@/lib/stores/store-context";
import { toast } from "sonner";

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

export default observer(function CustomersPage() {
  const ability = useAbility<AppAbility>();
  const workspaces = useWorkspaceStore();
  const activeWorkspaceId = workspaces.activeWorkspaceId;
  const canRead = hasPermission(ability, PERMISSIONS.customersRead);
  const canManage = hasPermission(ability, PERMISSIONS.customersManage);
  const canStatus = hasPermission(ability, PERMISSIONS.customersStatus);

  const [search, setSearch] = useState("");
  const [searchKey] = useDebounce(search, 500);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState<CustomerSummary | null>(null);
  const [pendingAction, setPendingAction] = useState<"status" | "delete" | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);

  // `activeWorkspaceId` is part of the query key, same reasoning as the users list: customers are
  // workspace-scoped, so switching workspace has to re-fetch rather than leave the previous
  // workspace's customers on screen.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["customers-list", activeWorkspaceId, pagination.pageIndex, pagination.pageSize, searchKey, status],
    queryFn: () =>
      authClient.listCustomers({
        search: searchKey || undefined,
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
        // The backend filter is `activeOnly` — one-directional — so "Active" filters server-side
        // (correct totals) while "Inactive" has to filter the fetched page below.
        activeOnly: status === "active" ? true : undefined,
      }),
    enabled: canRead && !!activeWorkspaceId,
    placeholderData: keepPreviousData,
  });

  const total = data?.meta.total ?? 0;
  const pageCount = data?.meta.pageCount ?? 0;

  const customers = useMemo(() => {
    let items = data?.items ?? [];
    if (status === "inactive") items = items.filter((c) => !c.isActive);
    return items;
  }, [data, status]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function openStatusConfirm(customer: CustomerSummary) {
    setPendingCustomer(customer);
    setPendingAction("status");
    setConfirmOpen(true);
  }

  function openDeleteConfirm(customer: CustomerSummary) {
    setPendingCustomer(customer);
    setPendingAction("delete");
    setConfirmOpen(true);
  }

  async function confirmPendingAction() {
    if (!pendingCustomer || !pendingAction) return;
    setPendingBusy(true);
    try {
      if (pendingAction === "status") {
        if (pendingCustomer.isActive) await authClient.deactivateCustomer(pendingCustomer.id);
        else await authClient.activateCustomer(pendingCustomer.id);
        toast.success(pendingCustomer.isActive ? "Customer deactivated." : "Customer activated.");
      } else {
        await authClient.deleteCustomer(pendingCustomer.id);
        toast.success("Customer deleted.");
      }
      setConfirmOpen(false);
      setPendingCustomer(null);
      setPendingAction(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof AuthApiError ? err.message : "That action failed. Try again.");
    } finally {
      setPendingBusy(false);
    }
  }

  const columns = useMemo<ColumnDef<CustomerSummary>[]>(
    () => [
      {
        id: "customer",
        header: "Customer",
        accessorFn: (customer) => customerName(customer) || customer.email,
        cell: ({ row }) => {
          const customer = row.original;
          const name = customerName(customer);
          return (
            <Link href={`/customers/${customer.id}`} className="flex items-center gap-2 hover:underline">
              <Avatar className="size-8">
                {customer.photo && <AvatarImage src={customer.photo} alt="" />}
                <AvatarFallback>{initialsOf(customer)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">{name || customer.email}</span>
                {name && <span className="text-xs text-muted-foreground">{customer.email}</span>}
              </div>
            </Link>
          );
        },
      },
      {
        id: "username",
        header: "Username",
        accessorFn: (customer) => customer.username ?? "",
        cell: ({ row }) => <span className="text-sm">{row.original.username || "—"}</span>,
      },
      {
        id: "phone",
        header: "Phone",
        accessorFn: (customer) => customer.phone ?? "",
        cell: ({ row }) => <span className="text-sm">{row.original.phone || "—"}</span>,
      },
      {
        id: "dob",
        header: "Date of birth",
        accessorFn: (customer) => customer.dob ?? "",
        cell: ({ row }) =>
          row.original.dob ? (
            <span className="text-xs text-muted-foreground">{new Date(row.original.dob).toLocaleDateString()}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "gender",
        header: "Gender",
        accessorFn: (customer) => customer.gender ?? "",
        cell: ({ row }) => <span className="text-sm capitalize">{row.original.gender || "—"}</span>,
      },
      {
        id: "joined",
        header: "Joined",
        accessorFn: (customer) => customer.joinedDate,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.joinedDate).toLocaleDateString()}</span>,
      },
      {
        id: "emailVerified",
        header: "Email verified",
        accessorFn: (customer) => (customer.isEmailVerified ? "Yes" : "No"),
        cell: ({ row }) => <Badge variant={row.original.isEmailVerified ? "success" : "outline"}>{row.original.isEmailVerified ? "Verified" : "Unverified"}</Badge>,
      },
      {
        id: "phoneVerified",
        header: "Phone verified",
        accessorFn: (customer) => (customer.isPhoneVerified ? "Yes" : "No"),
        cell: ({ row }) => <Badge variant={row.original.isPhoneVerified ? "success" : "outline"}>{row.original.isPhoneVerified ? "Verified" : "Unverified"}</Badge>,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (customer) => (customer.isActive ? "Active" : "Inactive"),
        cell: ({ row }) => {
          const customer = row.original;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" disabled={!canStatus} className="disabled:cursor-not-allowed disabled:opacity-60" onClick={() => openStatusConfirm(customer)}>
                  <Badge variant={customer.isActive ? "success" : "destructive"}>{customer.isActive ? "Active" : "Inactive"}</Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {canStatus ? (customer.isActive ? "Deactivate this customer" : "Activate this customer") : missingPermissionHint(PERMISSIONS.customersStatus)}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "created",
        header: "Created",
        accessorFn: (customer) => customer.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const customer = row.original;
          return (
            <div className="flex justify-end items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/customers/${customer.id}`} className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
                    <EyeIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>View details</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/customers/${customer.id}/edit`}
                    aria-disabled={!canManage}
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }), !canManage && "pointer-events-none opacity-50")}
                  >
                    <PencilIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Edit customer" : missingPermissionHint(PERMISSIONS.customersManage)}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" disabled={!canManage} onClick={() => openDeleteConfirm(customer)}>
                    <Trash2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Delete customer" : missingPermissionHint(PERMISSIONS.customersManage)}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [canManage, canStatus],
  );

  const table = useReactTable({
    data: customers,
    columns,
    pageCount: pageCount || -1,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualFiltering: true,
  });

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.customersRead} what="Customers" />;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Customers", href: "/customers" }]} />

      <AlertModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmPendingAction}
        loading={pendingBusy}
        description={
          pendingAction === "status"
            ? pendingCustomer?.isActive
              ? "This deactivates the customer — they stop appearing in active listings until reactivated."
              : "This reactivates the customer, immediately."
            : "This soft-deletes the customer: they stop appearing in listings, but the row is kept for audit purposes."
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Customers</CardTitle>
          {canManage && (
            <Link href="/customers/new" className={cn(buttonVariants({ size: "sm" }))}>
              <PlusIcon />
              Add customer
            </Link>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isError && <p className="text-sm text-destructive">{error instanceof AuthApiError ? error.message : "Couldn't load customers. Try again."}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search customers…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
            />
            <Select value={status || "all"} onValueChange={(value) => setStatus(value === "all" ? "" : (value as "active" | "inactive"))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!search && !status} onClick={clearFilters}>
              Clear
            </Button>
          </div>

          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              Showing {customers.length} of {total} results
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Columns <ChevronDownIcon className="ml-1 size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem key={column.id} className="capitalize" checked={column.getIsVisible()} onCheckedChange={(value) => column.toggleVisibility(!!value)}>
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isLoading ? (
            <TableSkeletonLoader
              columns={[
                { header: "Customer", skeletonType: "avatar" },
                { header: "Username", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Phone", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Date of birth", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Gender", skeletonType: "text", skeletonWidth: "w-16" },
                { header: "Joined", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Email verified", skeletonType: "badge" },
                { header: "Phone verified", skeletonType: "badge" },
                { header: "Status", width: "w-[100px]", skeletonType: "button" },
                { header: "Created", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Actions", width: "w-[160px]", skeletonType: "actions", skeletonCount: 3 },
              ]}
              rows={pagination.pageSize > 10 ? 10 : pagination.pageSize}
            />
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-lg text-muted-foreground">No data found</p>
              <p className="mt-2 text-sm text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          ) : (
            <DataTable columns={columns} data={customers} total={total} table={table} onPaginationChange={setPagination} />
          )}
        </CardContent>
      </Card>
    </div>
  );
});
