/**
 * Derived person / Ganar metrics — no stored counters.
 *
 * CURRENT STATE: active persons with current organization history in scope.
 * HISTORICAL NEW: persons.registered_at in period ∩ currently in scope
 *   (leader/subtree) or registered while scoped — documented in metrics defs.
 */
import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  cellMemberships,
  personOrganizationHistory,
  persons,
} from "@/db/schema";

import { formatPctChange, type PeriodRange } from "./period";
import type { DashboardScope } from "./scope";
import {
  activePersonCondition,
  applyOrgFilters,
  currentOrgJoinCondition,
  personScopeCondition,
} from "./sql-scope";

export type PersonMetrics = {
  methodology: "current_state" | "historical_activity";
  totalActive: number;
  withCell: number;
  withoutCell: number;
  newInPeriod: number;
  newPreviousPeriod: number;
  newChangeLabel: string;
  bySource: { public_form: number; internal_form: number };
  prayerPendingCount: number;
  byNetwork: Array<{ networkId: string | null; count: number }>;
  byMinistry: Array<{ ministryId: string | null; count: number }>;
};

export async function getPersonMetrics(
  scope: DashboardScope,
  period: PeriodRange,
): Promise<PersonMetrics> {
  const db = getDb();
  const scopeCond = personScopeCondition(scope);

  const base = [activePersonCondition()!];
  if (scopeCond) base.push(scopeCond);

  // CURRENT STATE totals via current org
  const orgConds = applyOrgFilters(scope, [
    isNull(personOrganizationHistory.effectiveTo),
    activePersonCondition()!,
  ]);
  if (scopeCond) orgConds.push(scopeCond);

  const [totalRow] = await db
    .select({ c: count() })
    .from(persons)
    .innerJoin(personOrganizationHistory, currentOrgJoinCondition())
    .where(and(...orgConds));

  const withCellSql = sql`${persons.id} IN (
    SELECT person_id FROM cell_memberships WHERE status = 'active'
  )`;

  const [withCellRow] = await db
    .select({ c: count() })
    .from(persons)
    .innerJoin(personOrganizationHistory, currentOrgJoinCondition())
    .where(and(...orgConds, withCellSql));

  const totalActive = Number(totalRow?.c ?? 0);
  const withCell = Number(withCellRow?.c ?? 0);

  const newConds = [
    ...orgConds,
    gte(persons.registeredAt, period.from),
    lte(persons.registeredAt, period.to),
  ];
  const prevConds = [
    ...orgConds,
    gte(persons.registeredAt, period.prevFrom),
    lte(persons.registeredAt, period.prevTo),
  ];

  const [newRow] = await db
    .select({ c: count() })
    .from(persons)
    .innerJoin(personOrganizationHistory, currentOrgJoinCondition())
    .where(and(...newConds));
  const [prevRow] = await db
    .select({ c: count() })
    .from(persons)
    .innerJoin(personOrganizationHistory, currentOrgJoinCondition())
    .where(and(...prevConds));

  const newInPeriod = Number(newRow?.c ?? 0);
  const newPreviousPeriod = Number(prevRow?.c ?? 0);

  const sourceRows = await db
    .select({ source: persons.source, c: count() })
    .from(persons)
    .innerJoin(personOrganizationHistory, currentOrgJoinCondition())
    .where(and(...orgConds))
    .groupBy(persons.source);

  const bySource = { public_form: 0, internal_form: 0 };
  for (const r of sourceRows) {
    if (r.source === "public_form") bySource.public_form = Number(r.c);
    if (r.source === "internal_form") bySource.internal_form = Number(r.c);
  }

  // Aggregated prayer pending — count only, never text
  const [prayerRow] = await db
    .select({ c: count() })
    .from(persons)
    .innerJoin(personOrganizationHistory, currentOrgJoinCondition())
    .where(
      and(
        ...orgConds,
        sql`${persons.prayerRequest} IS NOT NULL AND length(trim(${persons.prayerRequest})) > 0`,
      ),
    );

  const byNetwork = await db
    .select({
      networkId: personOrganizationHistory.networkId,
      c: count(),
    })
    .from(persons)
    .innerJoin(personOrganizationHistory, currentOrgJoinCondition())
    .where(and(...orgConds))
    .groupBy(personOrganizationHistory.networkId);

  const byMinistry = await db
    .select({
      ministryId: personOrganizationHistory.ministryId,
      c: count(),
    })
    .from(persons)
    .innerJoin(personOrganizationHistory, currentOrgJoinCondition())
    .where(and(...orgConds))
    .groupBy(personOrganizationHistory.ministryId);

  void cellMemberships;
  void eq;

  return {
    methodology: "current_state",
    totalActive,
    withCell,
    withoutCell: Math.max(0, totalActive - withCell),
    newInPeriod,
    newPreviousPeriod,
    newChangeLabel: formatPctChange(newInPeriod, newPreviousPeriod),
    bySource,
    prayerPendingCount: Number(prayerRow?.c ?? 0),
    byNetwork: byNetwork.map((r) => ({
      networkId: r.networkId,
      count: Number(r.c),
    })),
    byMinistry: byMinistry.map((r) => ({
      ministryId: r.ministryId,
      count: Number(r.c),
    })),
  };
}

/** Weekly new-person series for charts (last N weeks) */
export async function getNewPersonsWeeklySeries(
  scope: DashboardScope,
  weeks = 8,
): Promise<Array<{ weekStart: string; count: number }>> {
  const db = getDb();
  const scopeCond = personScopeCondition(scope);
  const orgConds = applyOrgFilters(scope, [
    isNull(personOrganizationHistory.effectiveTo),
    activePersonCondition()!,
  ]);
  if (scopeCond) orgConds.push(scopeCond);

  const rows = await db.execute<{ week_start: string; c: string }>(sql`
    SELECT to_char(date_trunc('week', ${persons.registeredAt} AT TIME ZONE 'America/Lima'), 'YYYY-MM-DD') AS week_start,
           count(*)::text AS c
    FROM persons
    INNER JOIN person_organization_history poh
      ON poh.person_id = persons.id AND poh.effective_to IS NULL
    WHERE persons.is_active = true
      AND persons.deleted_at IS NULL
      AND ${persons.registeredAt} >= (now() - (${weeks}::int || ' weeks')::interval)
      ${scope.ministryIds.length === 1 ? sql`AND poh.ministry_id = ${scope.ministryIds[0]}::uuid` : sql``}
      ${scope.ministryIds.length > 1 ? sql`AND poh.ministry_id IN (${sql.join(scope.ministryIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``}
      ${scope.networkId ? sql`AND poh.network_id = ${scope.networkId}::uuid` : sql``}
      ${scope.mode === "subtree" && scope.rootPersonId ? sql`AND persons.id IN (SELECT descendant_person_id FROM leadership_closure WHERE ancestor_person_id = ${scope.rootPersonId}::uuid)` : sql``}
    GROUP BY 1
    ORDER BY 1
  `);

  const list = Array.isArray(rows) ? rows : (rows as { rows?: typeof rows }).rows ?? [];
  return (list as Array<{ week_start: string; c: string }>).map((r) => ({
    weekStart: r.week_start,
    count: Number(r.c),
  }));
}
