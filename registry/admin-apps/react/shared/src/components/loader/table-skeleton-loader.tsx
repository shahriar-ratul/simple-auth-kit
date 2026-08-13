import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton, SkeletonActions, SkeletonAvatar, SkeletonBadge, SkeletonButton } from "./skeleton";

export interface TableSkeletonColumn {
  header: string;
  width?: string;
  skeletonType?: "text" | "avatar" | "badge" | "button" | "actions";
  skeletonWidth?: string;
  skeletonCount?: number;
}

function SkeletonCell({ type = "text", width = "w-32", count = 1 }: { type?: TableSkeletonColumn["skeletonType"]; width?: string; count?: number }) {
  switch (type) {
    case "avatar":
      return <SkeletonAvatar />;
    case "badge":
      return <SkeletonBadge count={count} />;
    case "button":
      return <SkeletonButton />;
    case "actions":
      return <SkeletonActions count={count} />;
    case "text":
    default:
      return <Skeleton className={`h-4 ${width}`} />;
  }
}

export function TableSkeletonLoader({ columns, rows = 10, className = "" }: { columns: TableSkeletonColumn[]; rows?: number; className?: string }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead key={index} className={column.width}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column, colIndex) => (
                  <TableCell key={colIndex}>
                    <SkeletonCell type={column.skeletonType} width={column.skeletonWidth} count={column.skeletonCount} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
