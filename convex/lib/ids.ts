import type { Id, TableNames } from "../_generated/dataModel";

/**
 * Casts an arbitrary string into a typed Convex `Id<TableName>` without a
 * runtime existence check. Use only when the string is already known to be
 * a valid id for that table (e.g. round-tripped from a client that received
 * it from an earlier query, or from a trusted external system boundary).
 *
 * Prefer `ctx.db.normalizeId(table, id)` (see `normalizeIdOrNull` below)
 * when the string's origin is untrusted and you need a runtime check.
 */
export function asId<TableName extends TableNames>(
  _table: TableName,
  id: string,
): Id<TableName> {
  return id as Id<TableName>;
}

/** Same as `asId`, but passes through `null`/`undefined` unchanged. */
export function asOptionalId<TableName extends TableNames>(
  table: TableName,
  id: string | null | undefined,
): Id<TableName> | undefined {
  if (id === null || id === undefined) return undefined;
  return asId(table, id);
}

/**
 * Minimal shape of `ctx.db` needed to validate an id's format/table before
 * trusting it. Accepts `QueryCtx["db"]` or `MutationCtx["db"]`.
 */
type NormalizingDb = {
  normalizeId: (table: TableNames, id: string) => Id<TableNames> | null;
};

/**
 * Validates that `id` is a well-formed id belonging to `table` using
 * Convex's own id parser, returning a typed `Id` or `null` when the string
 * is malformed or belongs to a different table.
 *
 * This does NOT guarantee the document still exists — follow up with
 * `ctx.db.get(table, id)` if that matters.
 */
export function normalizeIdOrNull<TableName extends TableNames>(
  db: NormalizingDb,
  table: TableName,
  id: string,
): Id<TableName> | null {
  return db.normalizeId(table, id) as Id<TableName> | null;
}
