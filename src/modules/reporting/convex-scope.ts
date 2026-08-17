/**
 * Scope filtering helpers over Convex snapshot rows — replaces the
 * Drizzle/SQL predicate builders in the removed `sql-scope.ts`. Snapshots
 * are fetched once (bounded scans, see `convex/reporting.ts`) and every
 * metrics module filters/aggregates them here in plain JS.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { api, getConvexHttpClient } from "@/server/convex";

import type { DashboardScope } from "./scope";

export type ScopeMatchRow = {
  personId?: string | null;
  ministryId?: string | null;
  networkId?: string | null;
};

/** Self + every authorized descendant of `rootPersonId` in the leadership tree. */
export async function resolveSubtreePersonIds(rootPersonId: string): Promise<Set<string>> {
  const client = getConvexHttpClient();
  const descendantIds = await client.query(api.formation.getDescendantPersonIds, {
    rootPersonId: rootPersonId as Id<"persons">,
  });
  const set = new Set<string>(descendantIds as string[]);
  set.add(rootPersonId);
  return set;
}

/**
 * Builds a row predicate honoring `scope.mode` (subtree via person id,
 * ministry via `ministryId`) plus an always-applied optional `networkId`
 * filter — mirrors the combined conditions the old `applyOrgFilters` +
 * `*ScopeCondition` helpers produced together.
 */
export async function buildScopeMatcher(
  scope: DashboardScope,
): Promise<(row: ScopeMatchRow) => boolean> {
  let subtreeIds: Set<string> | null = null;
  if (scope.mode === "subtree" && scope.rootPersonId) {
    subtreeIds = await resolveSubtreePersonIds(scope.rootPersonId);
  }
  const ministrySet =
    scope.mode === "ministry" && scope.ministryIds.length ? new Set(scope.ministryIds) : null;

  return (row) => {
    if (subtreeIds && !(row.personId && subtreeIds.has(row.personId))) return false;
    if (ministrySet && !(row.ministryId && ministrySet.has(row.ministryId))) return false;
    if (scope.networkId && row.networkId !== scope.networkId) return false;
    return true;
  };
}

/** Cross-ministry rows (transfers) match if source OR destination ministry is in scope. */
export function matchesEitherMinistry(
  scope: DashboardScope,
  row: { sourceMinistryId?: string | null; destinationMinistryId?: string | null },
  subtreeIds: Set<string> | null,
  personId: string,
): boolean {
  if (scope.mode === "subtree" && scope.rootPersonId) {
    return Boolean(subtreeIds?.has(personId));
  }
  if (scope.mode === "ministry" && scope.ministryIds.length) {
    return Boolean(
      (row.sourceMinistryId && scope.ministryIds.includes(row.sourceMinistryId)) ||
        (row.destinationMinistryId && scope.ministryIds.includes(row.destinationMinistryId)),
    );
  }
  return true;
}
