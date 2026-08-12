import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronRightIcon } from "lucide-react";

export type BreadcrumbTrailItem = { title: string; href: string };

/**
 * Fixed "Dashboard" root plus a per-page trail, last item non-clickable — used at the top of every
 * console page, mirroring admin-nextjs's `Breadcrumb` but built on react-router links.
 */
export function Breadcrumb({ items = [] }: { items?: BreadcrumbTrailItem[] }) {
  return (
    <nav aria-label="breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground sm:gap-2.5">
        <li>
          {items.length === 0 ? (
            <span aria-current="page" className="font-normal text-foreground">
              Dashboard
            </span>
          ) : (
            <Link to="/dashboard" className="transition-colors hover:text-foreground">
              Dashboard
            </Link>
          )}
        </li>
        {items.map((item, index) => (
          <Fragment key={item.href}>
            <li role="presentation" aria-hidden="true">
              <ChevronRightIcon className="size-3.5" />
            </li>
            <li>
              {index === items.length - 1 ? (
                <span aria-current="page" className="font-normal text-foreground">
                  {item.title}
                </span>
              ) : (
                <Link to={item.href} className="transition-colors hover:text-foreground">
                  {item.title}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
