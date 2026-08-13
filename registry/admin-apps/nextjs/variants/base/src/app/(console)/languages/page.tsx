"use client";

import { useAbility } from "@casl/react";
import { type ColumnDef, type PaginationState, type SortingState, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { format } from "date-fns";
import { ChevronDownIcon, EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { AuthApiError, type LanguageSummary } from "@easy-auth/auth-client";
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

export default function LanguagesPage() {
  const ability = useAbility<AppAbility>();
  const canRead = hasPermission(ability, PERMISSIONS.languagesRead);
  const canManage = hasPermission(ability, PERMISSIONS.languagesManage);
  const canStatus = hasPermission(ability, PERMISSIONS.languagesStatus);

  const [search, setSearch] = useState("");
  const [searchKey] = useDebounce(search, 500);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<LanguageSummary | null>(null);
  const [pendingAction, setPendingAction] = useState<"status" | "delete" | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["languages-list", pagination.pageIndex, pagination.pageSize, searchKey, status],
    queryFn: () =>
      authClient.listLanguages({
        search: searchKey || undefined,
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
        // The backend filter is `activeOnly` — one-directional — so "Active" filters server-side
        // (correct totals) while "Inactive" has to filter the fetched page below.
        activeOnly: status === "active" ? true : undefined,
      }),
    enabled: canRead,
    placeholderData: keepPreviousData,
  });

  const total = data?.meta.total ?? 0;
  const pageCount = data?.meta.pageCount ?? 0;

  const languages = useMemo(() => {
    let items = data?.items ?? [];
    if (status === "inactive") items = items.filter((l) => !l.isActive);
    return items;
  }, [data, status]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function openStatusConfirm(language: LanguageSummary) {
    setPendingLanguage(language);
    setPendingAction("status");
    setConfirmOpen(true);
  }

  function openDeleteConfirm(language: LanguageSummary) {
    setPendingLanguage(language);
    setPendingAction("delete");
    setConfirmOpen(true);
  }

  async function confirmPendingAction() {
    if (!pendingLanguage || !pendingAction) return;
    setPendingBusy(true);
    try {
      if (pendingAction === "status") {
        if (pendingLanguage.isActive) await authClient.deactivateLanguage(pendingLanguage.id);
        else await authClient.activateLanguage(pendingLanguage.id);
        toast.success(pendingLanguage.isActive ? "Language deactivated." : "Language activated.");
      } else {
        await authClient.deleteLanguage(pendingLanguage.id);
        toast.success("Language deleted.");
      }
      setConfirmOpen(false);
      setPendingLanguage(null);
      setPendingAction(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof AuthApiError ? err.message : "That action failed. Try again.");
    } finally {
      setPendingBusy(false);
    }
  }

  const columns = useMemo<ColumnDef<LanguageSummary>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (language) => language.name,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Link href={`/languages/${row.original.id}`} className="font-medium hover:underline">
              {row.original.name}
            </Link>
            {row.original.isDefault && <Badge variant="secondary">Default</Badge>}
          </div>
        ),
      },
      {
        id: "nativeName",
        header: "Native name",
        accessorFn: (language) => language.nativeName,
        cell: ({ row }) => <span className="text-sm">{row.original.nativeName}</span>,
      },
      {
        id: "code",
        header: "Code",
        accessorFn: (language) => language.code,
        cell: ({ row }) => <Badge variant="outline">{row.original.code}</Badge>,
      },
      {
        id: "direction",
        header: "Direction",
        accessorFn: (language) => language.direction,
        cell: ({ row }) => <Badge variant={row.original.direction === "rtl" ? "secondary" : "outline"}>{row.original.direction.toUpperCase()}</Badge>,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (language) => (language.isActive ? "Active" : "Inactive"),
        cell: ({ row }) => {
          const language = row.original;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" disabled={!canStatus} className="disabled:cursor-not-allowed disabled:opacity-60" onClick={() => openStatusConfirm(language)}>
                  <Badge variant={language.isActive ? "success" : "destructive"}>{language.isActive ? "Active" : "Inactive"}</Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {canStatus ? (language.isActive ? "Deactivate this language" : "Activate this language") : missingPermissionHint(PERMISSIONS.languagesStatus)}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "created",
        header: "Created",
        accessorFn: (language) => language.createdAt,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{format(new Date(row.original.createdAt), "dd MMM yyyy")}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const language = row.original;
          return (
            <div className="flex justify-end items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/languages/${language.id}`} className={cn(buttonVariants({ variant: "outline", size: "icon" }))}>
                    <EyeIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>View details</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/languages/${language.id}/edit`}
                    aria-disabled={!canManage}
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }), !canManage && "pointer-events-none opacity-50")}
                  >
                    <PencilIcon />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Edit language" : missingPermissionHint(PERMISSIONS.languagesManage)}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" disabled={!canManage} onClick={() => openDeleteConfirm(language)}>
                    <Trash2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{canManage ? "Delete language" : missingPermissionHint(PERMISSIONS.languagesManage)}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [canManage, canStatus],
  );

  const table = useReactTable({
    data: languages,
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

  if (!canRead) return <PermissionRequired permission={PERMISSIONS.languagesRead} what="Languages" />;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ title: "Languages", href: "/languages" }]} />

      <AlertModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmPendingAction}
        loading={pendingBusy}
        description={
          pendingAction === "status"
            ? pendingLanguage?.isActive
              ? "This deactivates the language — it stops appearing in active listings and pickers until reactivated."
              : "This reactivates the language, immediately."
            : "This soft-deletes the language: it stops appearing in listings, but the row is kept for audit purposes."
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Languages</CardTitle>
          {canManage && (
            <Link href="/languages/new" className={cn(buttonVariants({ size: "sm" }))}>
              <PlusIcon />
              Add language
            </Link>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isError && <p className="text-sm text-destructive">{error instanceof AuthApiError ? error.message : "Couldn't load languages. Try again."}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search languages…"
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
              Showing {languages.length} of {total} results
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
                { header: "Native name", skeletonType: "text", skeletonWidth: "w-32" },
                { header: "Code", skeletonType: "badge", skeletonWidth: "w-16" },
                { header: "Direction", skeletonType: "badge", skeletonWidth: "w-16" },
                { header: "Status", width: "w-[100px]", skeletonType: "button" },
                { header: "Created", skeletonType: "text", skeletonWidth: "w-24" },
                { header: "Actions", width: "w-[160px]", skeletonType: "actions", skeletonCount: 3 },
              ]}
              rows={pagination.pageSize > 10 ? 10 : pagination.pageSize}
            />
          ) : languages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-lg text-muted-foreground">No data found</p>
              <p className="mt-2 text-sm text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          ) : (
            <DataTable columns={columns} data={languages} total={total} table={table} onPaginationChange={setPagination} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
