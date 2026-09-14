// Primary keys are BigInt for join/index performance; registry/core's types (SessionRecord,
// Revoker, etc.) deliberately stay opaque `string` identifiers so core has zero DB awareness.
// This is the one conversion point between the two, at each repository's Prisma boundary —
// never call BigInt(...)/.toString() ad hoc, since a malformed value should 400, not throw an
// uncaught SyntaxError.
export function toId(value: string | number | bigint): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid id: ${value}`);
  }
}

export function toIdOrUndefined(value: string | number | bigint | null | undefined): bigint | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return toId(value);
}

export function toIdOrNull(value: string | number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  return toId(value);
}
