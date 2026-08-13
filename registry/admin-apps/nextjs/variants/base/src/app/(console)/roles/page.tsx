"use client";

import { useAbility } from "@casl/react";
import { type ColumnDef, type PaginationState, type SortingState, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { ChevronDownIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { AuthApiError, type RoleSummary } from "@easy-auth/auth-client";
import { AlertModal } from "@/components/alert-modal";
import { Breadcrumb } from "@/components/breadcrumb";
import { TableSkeletonLoader } from "@/components/loader/table-skeleton-loader";
import { PermissionRequired } from "@/components/permission-required";
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
import { toast } from "sonner";

export default function RolesPage() {
  const ability = useAbility<AppAbility>();
  const canManage = hasPermission(ability, PERMISSIONS.rolesManage);

  const [search, setSearch] = useState("");
  const [searchKey] = useDebounce(search, 500);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<RoleSummary | null>(null);
  const [pendingAction, setPendingAction] = useState<"status" | "delete" | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["roles-list"],
    queryFn: () => authClient.listRoles(),
    enabled: canManage,
    placeholderData: keepPreviousData,
  });

  // `listRoles` answers with the full flat catalog (no server pagination), so search, status,
  // and paging all run client-side over it.
  const roles = useMemo(() => {
    let items = data ?? [];
    if (searchKey) {
      const q = searchKey.toLowerCase();
      items = items.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q));
    }
    if (status === "active") items = items.filter((r) => r.isActive);
    if (status === "inactive") items = items.filter((r) => !r.isActive);
    return items;
  }, [data, searchKey, status]);

  const total = roles.length;

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function openStatusConfirm(role: RoleSummary) {
    setPendingRole(role);
    setPendingAction("status");
    setConfirmOpen(true);
  }

  function openDeleteConfirm(role: RoleSummary) {
    setPendingRole(role);
    setPendingAction("delete");
    setConfirmOpen(true);
  }

  async function confirmPendingAction() {
    if (!pendingRole || !pendingAction) return;
    setPendingBusy(true);
    try {
      if (pendingAction === "status") {
        await authClient.updateRole(pendingRole.id, { isActive: !pendingRole.isActive });
        toast.success(pendingRole.isActive ? "Role deactivated." : "Role activated.");
      } else {
        await authClient.deleteRole(pendingRole.id);
        toast.success(`Role "${pendingRole.name}" deleted.`);
      }
      setConfirmOpen(false);
      setPendingRole(null);
      setPendingAction(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof AuthApiError ? err.message : "That action failed. Try again.");
    } finally {
      setPendingBusy(false);
    }
  }

  const columns = useMemo<ColumnDef<RoleSummary>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (role) => role.displayName || role.name,
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            {row.original.displayName || row.original.name}
            {row.original.isDefault && <Badge variant="outline">Default</Badge>}
          </span>
        ),
      },
      {
        id: "slug",
        header: "Slug",
        accessorFn: (role) => role.slug,
        cell: ({ row }) => <Badge variant="outline">{row.original.slug}</Badge>,
      },
      {
        id: "permissions",
        header: "Permissions",
        accessorFn: (role) => role.permissions.length,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.permissions.length}
            <span className="text-xs text-muted-foreground"> attached</span>
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (role) => (role.isActive ? "Active" : "Inactive"),
        cell: ({ row }) => {
          const role = row.original;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" disabled={!canManage} className="disabled:cursor-not-allowed disabled:opacity-60" onClick={() => openStatusConfirm(role)}>
                  <Badge variant={role.isActive ? "success" : "destructive"}>{role.isActive ? "Active" : "Inactive"}</Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {canManage ? (role.isActive ? "Deactivate this role" : "Activate this role") : missingPermissionHint(PERMISSIONS.rolesManage)}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const role = row.original;
          return (
            <div className="flex justify-end items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/roles/${role.id}/edit`}
                    aria-disabled={!canManage}
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }), !canManage && "pointer-events-none opacity-50")}
                  >
                    <PencilIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Edit role" : missingPermissionHint(PERMISSIONS.rolesManage)}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" disabled={!canManage} onClick={() => openDeleteConfirm(role)}>
                    <Trash2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Delete role" : missingPermissionHint(PERMISSIONS.rolesManage)}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [canManage],
  );

  const table = useReactTable({
    data: roles,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!canManage) return <PermissionRequired permission={PERMISSIONS.rolesManage} what="Roles" />;

  const pageRows = table.getRowModel().rows.map((r) => r.original);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Roles", href: "/roles" }]} />

      <AlertModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmPendingAction}
        loading={pendingBusy}
        description={
          pendingAction === "status"
            ? pendingRole?.isActive
              ? "This deactivates the role — it stops being resolved for the users who hold it until reactivated."
              : "This reactivates the role, immediately."
            : "This soft-deletes the role: existing assignments are left in place, and the role simply stops being resolved."
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Roles</CardTitle>
          {canManage && (
            <Link href="/roles/new" className={cn(buttonVariants({ size: "sm" }))}>
              <PlusIcon />
              Add role
            </Link>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isError && <p className="text-sm text-destructive">{error instanceof AuthApiError ? error.message : "Couldn't load roles. Try again."}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search roles…"
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
              Showing {pageRows.length} of {total} results
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
                { header: "Name", skeletonType: "text", skeletonWidth: "w-32" },
                { header: "Slug", skeletonType: "badge", skeletonWidth: "w-20" },
                { header: "Permissions", skeletonType: "text", skeletonWidth: "w-16" },
                { header: "Status", width: "w-[100px]", skeletonType: "button" },
                { header: "Actions", width: "w-[120px]", skeletonType: "actions", skeletonCount: 2 },
              ]}
              rows={5}
            />
          ) : roles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-lg text-muted-foreground">No data found</p>
              <p className="mt-2 text-sm text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          ) : (
            <DataTable columns={columns} data={pageRows} total={total} table={table} onPaginationChange={setPagination} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
