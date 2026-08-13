"use client";

import { type ColumnDef, type PaginationState, type Table as ReactTable, flexRender } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "./button";

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  total: number;
  table: ReactTable<TData>;
  onPaginationChange: (updater: PaginationState | ((old: PaginationState) => PaginationState)) => void;
}

export function DataTable<TData>({ columns, data, total, table, onPaginationChange }: DataTableProps<TData>) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-col gap-4 px-2 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          <span className="hidden sm:inline">
            Showing {data.length === 0 ? 0 : table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{" "}
            {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, total)} of {total} rows.
          </span>
          <span className="sm:hidden">
            {data.length === 0 ? 0 : table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
            {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, total)} of {total}
          </span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:space-x-6 lg:space-x-8">
          <div className="flex items-center justify-between space-x-2 sm:justify-start">
            <p className="text-sm font-medium">Rows per page</p>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => onPaginationChange({ pageIndex: 0, pageSize: Number(e.target.value) })}
              className="h-8 w-[70px] rounded-md border border-input bg-transparent px-3 py-1 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between text-sm font-medium sm:w-[100px] sm:justify-center">
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </div>
          <div className="flex items-center justify-center space-x-2">
            <Button
              className="rounded-md border border-input p-1"
              variant="ghost"
              onClick={() => onPaginationChange({ pageIndex: 0, pageSize: table.getState().pagination.pageSize })}
              disabled={!table.getCanPreviousPage()}
            >
              {"<<"}
            </Button>
            <Button
              className="rounded-md border border-input p-1"
              variant="ghost"
              onClick={() => onPaginationChange((old) => ({ pageIndex: old.pageIndex - 1, pageSize: old.pageSize }))}
              disabled={!table.getCanPreviousPage()}
            >
              {"<"}
            </Button>
            <Button
              className="rounded-md border border-input p-1"
              variant="ghost"
              onClick={() => onPaginationChange((old) => ({ pageIndex: old.pageIndex + 1, pageSize: old.pageSize }))}
              disabled={!table.getCanNextPage()}
            >
              {">"}
            </Button>
            <Button
              className="rounded-md border border-input p-1"
              variant="ghost"
              onClick={() => onPaginationChange({ pageIndex: table.getPageCount() - 1, pageSize: table.getState().pagination.pageSize })}
              disabled={!table.getCanNextPage()}
            >
              {">>"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
