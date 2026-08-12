import { Link } from "react-router-dom";
import { ChevronRightIcon } from "lucide-react";

export type BreadcrumbTrailItem = { title: string; href: string };

/**
 * Fixed "Dashboard" root plus a per-page trail, last item non-clickable — the same treatment as
 * admin-nextjs's Breadcrumb, built on plain react-router links since this app carries no shadcn
 * breadcrumb primitives.
 */
export function Breadcrumb({ items = [] }: { items?: BreadcrumbTrailItem[] }) {
  return (
    <nav aria-label="breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <li>
          {items.length === 0 ? (
            <span className="font-normal text-foreground">Dashboard</span>
          ) : (
            <Link to="/dashboard" className="transition-colors hover:text-foreground">
              Dashboard
            </Link>
          )}
        </li>
        {items.map((item, index) => (
          <li key={item.href} className="flex items-center gap-1.5">
            <ChevronRightIcon className="size-3.5" />
            {index === items.length - 1 ? (
              <span className="font-normal text-foreground">{item.title}</span>
            ) : (
              <Link to={item.href} className="transition-colors hover:text-foreground">
                {item.title}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
