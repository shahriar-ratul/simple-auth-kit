/**
 * A write that collided with a unique column (e.g. another user already has this phone or
 * username). Returns the conflict message to send as a 409, or null when `err` is anything else.
 *
 * node-postgres reports it as SQLSTATE 23505 with the violated constraint's name
 * (e.g. "users_phone_key"); Drizzle wraps that driver error as the `cause` of a DrizzleQueryError.
 */
export function uniqueViolationMessage(err: unknown): string | null {
  const pgError = pgErrorOf(err);
  if (pgError?.code !== '23505') return null;
  const column = columnFromIndex(pgError.constraint, pgError.table);
  return column ? `${column.replaceAll('_', ' ')} is already in use` : 'a record with this value already exists';
}

interface PgError {
  code?: string;
  constraint?: string;
  table?: string;
}

function pgErrorOf(err: unknown): PgError | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  if ((err as PgError).code) return err as PgError;
  const cause = (err as { cause?: unknown }).cause;
  return typeof cause === 'object' && cause !== null ? (cause as PgError) : undefined;
}

/** "users_phone_key" on table "users" -> "phone". */
function columnFromIndex(index: string | undefined, table: string | undefined): string | undefined {
  if (!index || !table || !index.startsWith(`${table}_`) || !index.endsWith('_key')) return undefined;
  return index.slice(table.length + 1, -'_key'.length);
}
