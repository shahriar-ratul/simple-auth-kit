"use client";

import { useAbility } from "@casl/react";
import { type ColumnDef, type PaginationState, type SortingState, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { ChevronDownIcon, EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { AuthApiError, userIdOf, type RoleSummary, type UserSummary } from "@easy-auth/auth-client";
import { AlertModal } from "@/components/alert-modal";
import { Breadcrumb } from "@/components/breadcrumb";
import { TableSkeletonLoader } from "@/components/loader/table-skeleton-loader";
import { PermissionRequired } from "@/components/permission-required";
import { RoleMultiSelect } from "@/components/role-multi-select";
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
import { toast } from "sonner";

function initialsOf(user: UserSummary): string {
  const from = user.displayName || user.email;
  return (
    from
      .split(/[@.\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export default function UsersPage() {
  const ability = useAbility<AppAbility>();
  const canRead = hasPermission(ability, PERMISSIONS.usersRead);
  const canManage = hasPermission(ability, PERMISSIONS.usersManage);
  // Block and unblock are one capability used in two directions, so the catalog mints one key.
  const canBlock = hasPermission(ability, PERMISSIONS.usersBlock);
  const canReadRoles = hasPermission(ability, PERMISSIONS.rolesManage);

  const [search, setSearch] = useState("");
  const [searchKey] = useDebounce(search, 500);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<RoleSummary[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState<UserSummary | null>(null);
  const [pendingAction, setPendingAction] = useState<"block" | "status" | "delete" | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["users-list", pagination.pageIndex, pagination.pageSize, searchKey],
    queryFn: () => authClient.listUsers({ search: searchKey || undefined, page: pagination.pageIndex + 1, limit: pagination.pageSize }),
    enabled: canRead,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!canReadRoles) return;
    authClient
      .listRoles({ activeOnly: true })
      .then(setRoleCatalog)
      .catch((err) => toast.error(err instanceof AuthApiError ? err.message : "Couldn't load the role catalog."));
  }, [canReadRoles]);

  const total = data?.meta.total ?? 0;
  const pageCount = data?.meta.pageCount ?? 0;

  // The backend has no server-side `isActive` or `roles` filter, so status and role both filter
  // only the already-fetched page — `total`/`pageCount` (and the pager) stay keyed to the
  // unfiltered count.
  const users = useMemo(() => {
    let items = data?.items ?? [];
    if (status === "active") items = items.filter((u) => u.isActive);
    if (status === "inactive") items = items.filter((u) => !u.isActive);
    if (roleFilter.length > 0) items = items.filter((u) => u.roles.some((role) => roleFilter.includes(role)));
    return items;
  }, [data, status, roleFilter]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setRoleFilter([]);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function openBlockConfirm(user: UserSummary) {
    setPendingUser(user);
    setPendingAction("block");
    setConfirmOpen(true);
  }

  function openStatusConfirm(user: UserSummary) {
    setPendingUser(user);
    setPendingAction("status");
    setConfirmOpen(true);
  }

  function openDeleteConfirm(user: UserSummary) {
    setPendingUser(user);
    setPendingAction("delete");
    setConfirmOpen(true);
  }

  async function confirmPendingAction() {
    if (!pendingUser || !pendingAction) return;
    const userId = userIdOf(pendingUser);
    setPendingBusy(true);
    try {
      if (pendingAction === "block") {
        if (pendingUser.blocked) await authClient.unblockUser(userId);
        else await authClient.blockUser(userId);
        toast.success(pendingUser.blocked ? "User unblocked." : "User blocked.");
      } else if (pendingAction === "status") {
        if (pendingUser.isActive) await authClient.deactivateUser(userId);
        else await authClient.activateUser(userId);
        toast.success(pendingUser.isActive ? "User deactivated." : "User activated.");
      } else {
        await authClient.deleteUser(userId);
        toast.success("Account deleted.");
      }
      setConfirmOpen(false);
      setPendingUser(null);
      setPendingAction(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof AuthApiError ? err.message : "That action failed. Try again.");
    } finally {
      setPendingBusy(false);
    }
  }

  const columns = useMemo<ColumnDef<UserSummary>[]>(
    () => [
      {
        id: "user",
        header: "User",
        accessorFn: (user) => user.displayName || user.email,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <Link href={`/users/${userIdOf(user)}`} className="flex items-center gap-2 hover:underline">
              <Avatar className="size-8">
                {user.photo && <AvatarImage src={user.photo} alt="" />}
                <AvatarFallback>{initialsOf(user)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">{user.displayName || user.email}</span>
                {user.displayName && <span className="text-xs text-muted-foreground">{user.email}</span>}
              </div>
            </Link>
          );
        },
      },
      {
        id: "roles",
        header: "Roles",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            {row.original.roles.map((role) => (
              <Badge key={role} variant="outline">
                {role}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        // A routine administrative toggle, distinct from Block in the Actions column — see the
        // `isActive` vs `blocked` note on `UserSummary`. The badge itself is the click target.
        accessorFn: (user) => (user.isActive ? "Active" : "Inactive"),
        cell: ({ row }) => {
          const user = row.original;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" disabled={!canBlock} className="disabled:cursor-not-allowed disabled:opacity-60" onClick={() => openStatusConfirm(user)}>
                  <Badge variant={user.isActive ? "success" : "destructive"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>{canBlock ? (user.isActive ? "Deactivate this user" : "Activate this user") : missingPermissionHint(PERMISSIONS.usersBlock)}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "lastLogin",
        header: "Last login",
        accessorFn: (user) => user.lastLogin ?? "",
        cell: ({ row }) =>
          row.original.lastLogin ? (
            <span className="text-xs text-muted-foreground">{new Date(row.original.lastLogin).toLocaleString()}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Never</span>
          ),
      },
      {
        id: "created",
        header: "Created",
        accessorFn: (user) => user.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
      },
      {
        id: "updated",
        header: "Updated",
        accessorFn: (user) => user.updatedAt,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.updatedAt).toLocaleDateString()}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const user = row.original;
          const userId = userIdOf(user);
          return (
            <div className="flex justify-end items-center gap-1.5">
              {user.blocked && <Badge variant="destructive">Blocked</Badge>}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/users/${userId}`} className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
                    <EyeIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>View details</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/users/${userId}/edit`}
                    aria-disabled={!canManage}
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }), !canManage && "pointer-events-none opacity-50")}
                  >
                    <PencilIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Edit user" : missingPermissionHint(PERMISSIONS.usersManage)}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" disabled={!canManage} onClick={() => openDeleteConfirm(user)}>
                    <Trash2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Delete user" : missingPermissionHint(PERMISSIONS.usersManage)}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant={user.blocked ? "outline" : "destructive"} disabled={!canBlock} onClick={() => openBlockConfirm(user)}>
                    {user.blocked ? "Unblock" : "Block"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{canBlock ? (user.blocked ? "Unblock this user" : "Block this user") : missingPermissionHint(PERMISSIONS.usersBlock)}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [canBlock, canManage],
  );

  const table = useReactTable({
    data: users,
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

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.usersRead} what="Users" />;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Users", href: "/users" }]} />

      <AlertModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmPendingAction}
        loading={pendingBusy}
        description={
          pendingAction === "block"
            ? pendingUser?.blocked
              ? "This unblocks the account — they can sign in again immediately."
              : "This blocks the account everywhere, immediately."
            : pendingAction === "status"
              ? pendingUser?.isActive
                ? "This deactivates the account — they can sign in again once reactivated."
                : "This reactivates the account, immediately."
              : "This soft-deletes the account: it stops appearing in listings and can no longer sign in, but the row is kept for audit purposes."
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users</CardTitle>
          {canManage && (
            <Link href="/users/new" className={cn(buttonVariants({ size: "sm" }))}>
              <PlusIcon />
              Add user
            </Link>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isError && <p className="text-sm text-destructive">{error instanceof AuthApiError ? error.message : "Couldn't load users. Try again."}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search by email…"
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
            {canReadRoles && <RoleMultiSelect roles={roleCatalog} selected={roleFilter} onChange={setRoleFilter} placeholder="Filter by role…" />}
            <Button variant="outline" disabled={!search && !status && roleFilter.length === 0} onClick={clearFilters}>
              Clear
            </Button>
          </div>

          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">
              Showing {users.length} of {total} results
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
                { header: "User", skeletonType: "avatar" },
                { header: "Roles", skeletonType: "badge", skeletonCount: 2 },
                { header: "Status", width: "w-[100px]", skeletonType: "button" },
                { header: "Last login", skeletonType: "text", skeletonWidth: "w-32" },
                { header: "Created", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Updated", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Actions", width: "w-[220px]", skeletonType: "actions", skeletonCount: 4 },
              ]}
              rows={pagination.pageSize > 10 ? 10 : pagination.pageSize}
            />
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-lg text-muted-foreground">No data found</p>
              <p className="mt-2 text-sm text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          ) : (
            <DataTable columns={columns} data={users} total={total} table={table} onPaginationChange={setPagination} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
