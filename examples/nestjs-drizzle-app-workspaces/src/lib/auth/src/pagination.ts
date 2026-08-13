export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** `page` is 1-indexed, matching every list endpoint's `?page=` query param. */
export function normalizePage(page: number | undefined): number {
  return page && page > 0 ? Math.floor(page) : 1;
}

export function normalizeLimit(limit: number | undefined): number {
  return Math.min(limit && limit > 0 ? Math.floor(limit) : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

export function buildPageMeta(page: number, limit: number, total: number): PageMeta {
  const pageCount = Math.ceil(total / limit);
  return { page, limit, total, pageCount, hasPreviousPage: page > 1, hasNextPage: page < pageCount };
}
