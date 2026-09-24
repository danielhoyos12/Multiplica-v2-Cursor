/**
 * Convex documents expose `_id` / `_creationTime`. Legacy Drizzle-era
 * callers (server actions, RSC pages, tests) expect a plain `id: string`
 * field instead — this adapter bridges the two shapes without forcing
 * every call site to learn about Convex's document envelope.
 */
export function withId<T extends Record<string, unknown> & { _id: unknown; _creationTime?: unknown }>(
  doc: T,
): Omit<T, "_id" | "_creationTime"> & { id: string } {
  const { _id, _creationTime: _creationTimeUnused, ...rest } = doc as Record<
    string,
    unknown
  >;
  void _creationTimeUnused;
  return { id: _id as string, ...rest } as Omit<T, "_id" | "_creationTime"> & { id: string };
}

export function withIdOrNull<T extends Record<string, unknown> & { _id: unknown; _creationTime?: unknown }>(
  doc: T | null | undefined,
): (Omit<T, "_id" | "_creationTime"> & { id: string }) | null {
  return doc ? withId(doc) : null;
}
