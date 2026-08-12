import Link from "next/link";
import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type BreadcrumbTrailItem = { title: string; href: string };

/**
 * Fixed "Dashboard" root plus a per-page trail, last item non-clickable — used at the top of every
 * console page, mirroring the reference's `BreadCrumb` component but built on this app's shadcn
 * breadcrumb primitives instead of plain divs.
 */
export function Breadcrumb({ items = [] }: { items?: BreadcrumbTrailItem[] }) {
  return (
    <BreadcrumbRoot className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          {items.length === 0 ? (
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {items.map((item, index) => (
          <span key={item.href} className="contents">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {index === items.length - 1 ? (
                <BreadcrumbPage>{item.title}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={item.href}>{item.title}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </BreadcrumbRoot>
  );
}
