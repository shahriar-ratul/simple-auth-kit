import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { type ColumnDef, type PaginationState, type SortingState, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { useDebounce } from "use-debounce";
import { format } from "date-fns";
import { ChevronDownIcon, EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { AuthApiError, type CountrySummary } from "@easy-auth/auth-client";
import { toast } from "sonner";
import { PERMISSIONS, useAbility } from "@/lib/ability";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useWorkspaceStore } from "@/stores/store-context";
import { AlertModal } from "@/components/alert-modal";
import { Breadcrumb } from "@/components/breadcrumb";
import { TableSkeletonLoader } from "@/components/loader/table-skeleton-loader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof AuthApiError ? err.message : fallback;
}

export const CountriesPage = observer(function CountriesPage() {
  const ability = useAbility();
  const workspaceStore = useWorkspaceStore();
  const activeWorkspaceId = workspaceStore.activeWorkspaceId;
  const canManage = ability.can(PERMISSIONS.countriesManage, "permission");
  const canStatus = ability.can(PERMISSIONS.countriesStatus, "permission");

  const [search, setSearch] = useState("");
  const [searchKey] = useDebounce(search, 500);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCountry, setPendingCountry] = useState<CountrySummary | null>(null);
  const [pendingAction, setPendingAction] = useState<"status" | "delete" | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);

  // Keyed on the active workspace, same as `UsersPage`: `listCountries` is scoped to it
  // automatically via `bindActiveWorkspace`, so switching workspaces has to refetch or the table
  // would keep showing one workspace's countries under another's name.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["countries-list", activeWorkspaceId, pagination.pageIndex, pagination.pageSize, searchKey, status],
    queryFn: () =>
      authClient.listCountries({
        search: searchKey || undefined,
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
        // The backend filter is `activeOnly` — one-directional — so "Active" filters server-side
        // (correct totals) while "Inactive" has to filter the fetched page below.
        activeOnly: status === "active" ? true : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const total = data?.meta.total ?? 0;
  const pageCount = data?.meta.pageCount ?? 0;

  const countries = useMemo(() => {
    let items = data?.items ?? [];
    if (status === "inactive") items = items.filter((c) => !c.isActive);
    return items;
  }, [data, status]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function openStatusConfirm(country: CountrySummary) {
    setPendingCountry(country);
    setPendingAction("status");
    setConfirmOpen(true);
  }

  function openDeleteConfirm(country: CountrySummary) {
    setPendingCountry(country);
    setPendingAction("delete");
    setConfirmOpen(true);
  }

  async function confirmPendingAction() {
    if (!pendingCountry || !pendingAction) return;
    setPendingBusy(true);
    try {
      if (pendingAction === "status") {
        if (pendingCountry.isActive) await authClient.deactivateCountry(pendingCountry.id);
        else await authClient.activateCountry(pendingCountry.id);
        toast.success(pendingCountry.isActive ? "Country deactivated." : "Country activated.");
      } else {
        await authClient.deleteCountry(pendingCountry.id);
        toast.success("Country deleted.");
      }
      setConfirmOpen(false);
      setPendingCountry(null);
      setPendingAction(null);
      await refetch();
    } catch (err) {
      toast.error(apiErrorMessage(err, "That action failed. Try again."));
    } finally {
      setPendingBusy(false);
    }
  }

  const columns = useMemo<ColumnDef<CountrySummary>[]>(
    () => [
      {
        id: "flag",
        header: "Flag",
        enableSorting: false,
        cell: ({ row }) => {
          const country = row.original;
          return (
            <Avatar className="size-8 rounded-sm">
              {country.flag && <AvatarImage src={country.flag} alt="" className="object-cover" />}
              <AvatarFallback className="rounded-sm text-base">{country.emoji || "?"}</AvatarFallback>
            </Avatar>
          );
        },
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (country) => country.name,
        cell: ({ row }) => (
          <Link to={`/countries/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "code",
        header: "Code",
        accessorFn: (country) => country.code,
        cell: ({ row }) => <Badge variant="outline">{row.original.code}</Badge>,
      },
      {
        id: "phoneCode",
        header: "Phone code",
        accessorFn: (country) => country.phoneCode,
        cell: ({ row }) => <span className="text-sm">{row.original.phoneCode}</span>,
      },
      {
        id: "currency",
        header: "Currency",
        accessorFn: (country) => country.currency,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.currency}
            <span className="text-xs text-muted-foreground"> · {row.original.currencyName}</span>
          </span>
        ),
      },
      {
        id: "isoCode",
        header: "ISO code",
        accessorFn: (country) => country.isoCode,
        cell: ({ row }) => <span className="text-sm">{row.original.isoCode}</span>,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (country) => (country.isActive ? "Active" : "Inactive"),
        cell: ({ row }) => {
          const country = row.original;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" disabled={!canStatus} className="disabled:cursor-not-allowed disabled:opacity-60" onClick={() => openStatusConfirm(country)}>
                  <Badge variant={country.isActive ? "success" : "destructive"}>{country.isActive ? "Active" : "Inactive"}</Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {canStatus
                  ? country.isActive
                    ? "Deactivate this country"
                    : "Activate this country"
                  : `You need the "${PERMISSIONS.countriesStatus}" permission to do this.`}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "created",
        header: "Created",
        accessorFn: (country) => country.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{format(new Date(row.original.createdAt), "dd MMM yyyy")}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const country = row.original;
          return (
            <div className="flex justify-end items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to={`/countries/${country.id}`} className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
                    <EyeIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>View details</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={`/countries/${country.id}/edit`}
                    aria-disabled={!canManage}
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }), !canManage && "pointer-events-none opacity-50")}
                  >
                    <PencilIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Edit country" : `You need the "${PERMISSIONS.countriesManage}" permission to do this.`}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" disabled={!canManage} onClick={() => openDeleteConfirm(country)}>
                    <Trash2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Delete country" : `You need the "${PERMISSIONS.countriesManage}" permission to do this.`}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [canManage, canStatus],
  );

  const table = useReactTable({
    data: countries,
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

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Countries", href: "/countries" }]} />

      <AlertModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmPendingAction}
        loading={pendingBusy}
        description={
          pendingAction === "status"
            ? pendingCountry?.isActive
              ? "This deactivates the country — it stops appearing in active listings and pickers until reactivated."
              : "This reactivates the country, immediately."
            : "This soft-deletes the country: it stops appearing in listings, but the row is kept for audit purposes."
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Countries</CardTitle>
          {canManage ? (
            <Link to="/countries/new" className={cn(buttonVariants({ size: "sm" }))}>
              <PlusIcon />
              Add country
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isError ? <p className="text-sm text-destructive">{apiErrorMessage(error, "Couldn't load countries. Try again.")}</p> : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search countries…"
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
              Showing {countries.length} of {total} results
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
                { header: "Flag", width: "w-[80px]", skeletonType: "avatar" },
                { header: "Name", skeletonType: "text", skeletonWidth: "w-32" },
                { header: "Code", skeletonType: "badge", skeletonWidth: "w-16" },
                { header: "Phone code", skeletonType: "text", skeletonWidth: "w-16" },
                { header: "Currency", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "ISO code", skeletonType: "text", skeletonWidth: "w-16" },
                { header: "Status", width: "w-[100px]", skeletonType: "button" },
                { header: "Created", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Actions", width: "w-[160px]", skeletonType: "actions", skeletonCount: 3 },
              ]}
              rows={pagination.pageSize > 10 ? 10 : pagination.pageSize}
            />
          ) : countries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-lg text-muted-foreground">No data found</p>
              <p className="mt-2 text-sm text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          ) : (
            <DataTable columns={columns} data={countries} total={total} table={table} onPaginationChange={setPagination} />
          )}
        </CardContent>
      </Card>
    </div>
  );
});
