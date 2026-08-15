/**
 * Shared SQL scope predicates for derived metrics.
 * CURRENT STATE uses person_organization_history.effective_to IS NULL.
 */
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import {
  cellMemberships,
  leadershipClosure,
  personLeadership,
  personOrganizationHistory,
  persons,
} from "@/db/schema";

import type { DashboardScope } from "./scope";

export function currentOrgJoinCondition() {
  return and(
    eq(personOrganizationHistory.personId, persons.id),
    isNull(personOrganizationHistory.effectiveTo),
  );
}

export function applyOrgFilters(
  scope: DashboardScope,
  conditions: SQL[],
): SQL[] {
  const next = [...conditions];
  if (scope.ministryIds.length === 1) {
    next.push(eq(personOrganizationHistory.ministryId, scope.ministryIds[0]!));
  } else if (scope.ministryIds.length > 1) {
    next.push(inArray(personOrganizationHistory.ministryId, scope.ministryIds));
  }
  if (scope.networkId) {
    next.push(eq(personOrganizationHistory.networkId, scope.networkId));
  }
  return next;
}

/** Persons in scope: current org + optional subtree */
export function personScopeCondition(scope: DashboardScope): SQL | undefined {
  if (scope.mode === "subtree" && scope.rootPersonId) {
    return sql`${persons.id} IN (
      SELECT descendant_person_id FROM leadership_closure
      WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
    )`;
  }
  if (scope.mode === "ministry" && scope.ministryIds.length) {
    return sql`${persons.id} IN (
      SELECT person_id FROM person_organization_history
      WHERE effective_to IS NULL
        AND ministry_id IN (${sql.join(
          scope.ministryIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
    )`;
  }
  // global — no person filter
  return undefined;
}

export function leadershipScopeCondition(scope: DashboardScope): SQL | undefined {
  if (scope.mode === "subtree" && scope.rootPersonId) {
    return sql`${personLeadership.personId} IN (
      SELECT descendant_person_id FROM leadership_closure
      WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
    )`;
  }
  if (scope.mode === "ministry" && scope.ministryIds.length) {
    return inArray(personLeadership.ministryId, scope.ministryIds);
  }
  return undefined;
}

export function activePersonCondition() {
  return and(eq(persons.isActive, true), isNull(persons.deletedAt));
}

export { cellMemberships, leadershipClosure, personLeadership, personOrganizationHistory, persons };
