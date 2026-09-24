/**
 * A write that collided with a unique column (e.g. another user already has this phone or
 * username). Returns the conflict message to send as a 409, or null when `err` is anything else.
 *
 * Prisma reports it as `P2002`. Behind the pg driver adapter the violated constraint arrives in
 * `meta.driverAdapterError.cause.constraint` (index name, e.g. "users_phone_key") rather than the
 * classic `meta.target` column list, so both are read.
 */
export function uniqueViolationMessage(err: unknown): string | null {
  if (
    typeof err !== "object" ||
    err === null ||
    (err as { code?: unknown }).code !== "P2002"
  )
    return null;
  const meta = (err as { meta?: PrismaUniqueMeta }).meta;
  const cause = meta?.driverAdapterError?.cause;
  const column =
    cause?.constraint?.fields?.[0] ??
    columnFromIndex(cause?.constraint?.index, cause?.table) ??
    (Array.isArray(meta?.target) ? meta.target[0] : undefined);
  return column
    ? `${column.replaceAll("_", " ")} is already in use`
    : "a record with this value already exists";
}

interface PrismaUniqueMeta {
  target?: string[] | string;
  driverAdapterError?: {
    cause?: {
      table?: string;
      constraint?: { index?: string; fields?: string[] };
    };
  };
}

/** "users_phone_key" on table "users" -> "phone". */
function columnFromIndex(
  index: string | undefined,
  table: string | undefined,
): string | undefined {
  if (
    !index ||
    !table ||
    !index.startsWith(`${table}_`) ||
    !index.endsWith("_key")
  )
    return undefined;
  return index.slice(table.length + 1, -"_key".length);
}
