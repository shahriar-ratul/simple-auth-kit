"use client";

import { useAbility } from "@casl/react";
import {
  type Column,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { AuthApiError, type PermissionSummary } from "@easy-auth/auth-client";
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
import { PencilIcon } from "lucide-react";

function SortableHeader({ column, children }: { column: Column<PermissionSummary, unknown>; children: React.ReactNode }) {
  const sorted = column.getIsSorted();
  return (
    <button type="button" className="flex items-center gap-1 font-medium" onClick={column.getToggleSortingHandler()}>
      {children}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

export default function PermissionsPage() {
  const ability = useAbility<AppAbility>();
  const canRead = hasPermission(ability, PERMISSIONS.permissionsRead);
  const canDefine = hasPermission(ability, PERMISSIONS.permissionsDefine);

  const [search, setSearch] = useState("");
  const [searchKey] = useDebounce(search, 500);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["permissions-list"],
    queryFn: () => authClient.listPermissions(),
    enabled: canRead,
    placeholderData: keepPreviousData,
  });

  // `listPermissions` answers with the full flat catalog (no server pagination), so search,
  // status, and paging all run client-side over it.
  const permissions = useMemo(() => {
    let items = data ?? [];
    if (searchKey) {
      const q = searchKey.toLowerCase();
      items = items.filter(
        (p) => p.slug.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q) || p.group.toLowerCase().includes(q),
      );
    }
    if (status === "active") items = items.filter((p) => p.isActive);
    if (status === "inactive") items = items.filter((p) => !p.isActive);
    return items;
  }, [data, searchKey, status]);

  const total = permissions.length;

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const columns = useMemo<ColumnDef<PermissionSummary>[]>(
    () => [
      {
        id: "slug",
        accessorKey: "slug",
        header: ({ column }) => <SortableHeader column={column}>Slug</SortableHeader>,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.slug}</span>,
      },
      {
        id: "displayName",
        accessorKey: "displayName",
        header: ({ column }) => <SortableHeader column={column}>Display name</SortableHeader>,
      },
      {
        id: "group",
        accessorKey: "group",
        header: ({ column }) => <SortableHeader column={column}>Group</SortableHeader>,
        cell: ({ row }) => <Badge variant="outline">{row.original.group}</Badge>,
      },
      {
        id: "order",
        accessorKey: "order",
        header: ({ column }) => <SortableHeader column={column}>Order</SortableHeader>,
      },
      {
        id: "status",
        header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
        accessorFn: (permission) => (permission.isActive ? "Active" : "Inactive"),
        cell: ({ row }) => <Badge variant={row.original.isActive ? "success" : "destructive"}>{row.original.isActive ? "Active" : "Inactive"}</Badge>,
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/permissions/${row.original.id}/edit`}
                  aria-disabled={!canDefine}
                  className={cn(buttonVariants({ variant: "outline", size: "icon" }), !canDefine && "pointer-events-none opacity-50")}
                >
                  <PencilIcon />
                </Link>
              </TooltipTrigger>
              <TooltipContent>{canDefine ? "Edit permission" : missingPermissionHint(PERMISSIONS.permissionsDefine)}</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    [canDefine],
  );

  const table = useReactTable({
    data: permissions,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.permissionsRead} what="Permissions" />;

  const pageRows = table.getRowModel().rows.map((r) => r.original);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Permissions", href: "/permissions" }]} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Permissions</CardTitle>
          {canDefine && (
            <Link href="/permissions/new" className={cn(buttonVariants({ size: "sm" }))}>
              <PlusIcon />
              Add permission
            </Link>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isError && <p className="text-sm text-destructive">{error instanceof AuthApiError ? error.message : "Couldn't load permissions. Try again."}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search permissions…"
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
                { header: "Slug", skeletonType: "text", skeletonWidth: "w-40" },
                { header: "Display name", skeletonType: "text", skeletonWidth: "w-32" },
                { header: "Group", skeletonType: "badge", skeletonWidth: "w-24" },
                { header: "Order", skeletonType: "text", skeletonWidth: "w-8" },
                { header: "Status", width: "w-[100px]", skeletonType: "badge" },
                { header: "Actions", width: "w-[100px]", skeletonType: "actions", skeletonCount: 1 },
              ]}
            />
          ) : permissions.length === 0 ? (
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
