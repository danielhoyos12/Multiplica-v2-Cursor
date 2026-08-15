/**
 * Unified executive / pastoral dashboard assembler.
 */
import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { pastoralTransferRequests } from "@/db/schema";
import { getBreadcrumbs } from "@/modules/leadership/service";

import { computePastoralAlerts, type PastoralAlert } from "./alerts";
import { getCellMetrics, type CellMetrics } from "./metrics-cells";
import { getLadderMetrics, type LadderMetrics } from "./metrics-ladder";
import {
  getLeadershipMetrics,
  listDirectNodeCards,
  type LeadershipMetrics,
  type TreeNodeCard,
} from "./metrics-leadership";
import {
  getNewPersonsWeeklySeries,
  getPersonMetrics,
  type PersonMetrics,
} from "./metrics-persons";
import {
  resolvePeriod,
  type PeriodKey,
  type PeriodRange,
} from "./period";
import {
  resolveDashboardScope,
  type DashboardScope,
  type ScopeFilters,
} from "./scope";

export type TransferMetrics = {
  pending: number;
  approved: number;
  executedInPeriod: number;
  rejectedInPeriod: number;
  crossMinistryPending: number;
};

export type ExecutiveDashboard = {
  scope: {
    mode: DashboardScope["mode"];
    roleView: DashboardScope["roleView"];
    ministryIds: string[];
    networkId: string | null;
    rootPersonId: string | null;
  };
  period: PeriodRange;
  persons: PersonMetrics;
  ladder: LadderMetrics;
  leadership: LeadershipMetrics;
  cells: CellMetrics;
  transfers: TransferMetrics;
  alerts: PastoralAlert[];
  attention: PastoralAlert[];
  tree: TreeNodeCard[];
  breadcrumbs: Array<{
    personId: string;
    fullName: string;
    humanLeaderCode: string | null;
  }>;
  trends: {
    newPersonsWeekly: Array<{ weekStart: string; count: number }>;
  };
  timings: Record<string, number>;
};

async function getTransferMetrics(
  scope: DashboardScope,
  period: PeriodRange,
): Promise<TransferMetrics> {
  const db = getDb();
  const scopeSql =
    scope.mode === "subtree" && scope.rootPersonId
      ? sql`${pastoralTransferRequests.personId} IN (
          SELECT descendant_person_id FROM leadership_closure
          WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
        )`
      : scope.mode === "ministry" && scope.ministryIds.length
        ? sql`(
            ${pastoralTransferRequests.sourceMinistryId} IN (${sql.join(
              scope.ministryIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})
            OR ${pastoralTransferRequests.destinationMinistryId} IN (${sql.join(
              scope.ministryIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})
          )`
        : undefined;

  const statusRows = await db
    .select({ status: pastoralTransferRequests.status, c: count() })
    .from(pastoralTransferRequests)
    .where(scopeSql)
    .groupBy(pastoralTransferRequests.status);

  let pending = 0;
  let approved = 0;
  for (const r of statusRows) {
    if (r.status === "pending") pending = Number(r.c);
    if (r.status === "approved") approved = Number(r.c);
  }

  const [exec] = await db
    .select({ c: count() })
    .from(pastoralTransferRequests)
    .where(
      and(
        scopeSql,
        eq(pastoralTransferRequests.status, "executed"),
        gte(pastoralTransferRequests.executedAt, period.from),
        lte(pastoralTransferRequests.executedAt, period.to),
      ),
    );
  const [rej] = await db
    .select({ c: count() })
    .from(pastoralTransferRequests)
    .where(
      and(
        scopeSql,
        eq(pastoralTransferRequests.status, "rejected"),
        gte(pastoralTransferRequests.rejectedAt, period.from),
        lte(pastoralTransferRequests.rejectedAt, period.to),
      ),
    );

  const [cross] = await db
    .select({ c: count() })
    .from(pastoralTransferRequests)
    .where(
      and(
        scopeSql,
        inArray(pastoralTransferRequests.status, ["pending", "approved"]),
        sql`${pastoralTransferRequests.sourceMinistryId} IS DISTINCT FROM ${pastoralTransferRequests.destinationMinistryId}`,
      ),
    );

  return {
    pending,
    approved,
    executedInPeriod: Number(exec?.c ?? 0),
    rejectedInPeriod: Number(rej?.c ?? 0),
    crossMinistryPending: Number(cross?.c ?? 0),
  };
}

function timed<T>(timings: Record<string, number>, name: string, fn: () => Promise<T>) {
  return (async () => {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      timings[name] = Date.now() - t0;
    }
  })();
}

export async function getExecutiveDashboard(
  actorUserId: string,
  opts: ScopeFilters & {
    period?: PeriodKey;
    from?: string;
    to?: string;
  } = {},
): Promise<ExecutiveDashboard> {
  const timings: Record<string, number> = {};
  const scope = await timed(timings, "scope", () =>
    resolveDashboardScope(actorUserId, opts),
  );
  const period = resolvePeriod(opts.period ?? "this_month", {
    from: opts.from,
    to: opts.to,
  });

  const [persons, ladder, leadership, cells, transfers, alerts, weekly] =
    await Promise.all([
      timed(timings, "persons", () => getPersonMetrics(scope, period)),
      timed(timings, "ladder", () => getLadderMetrics(scope)),
      timed(timings, "leadership", () =>
        getLeadershipMetrics(scope, period.from, period.to),
      ),
      timed(timings, "cells", () => getCellMetrics(scope, period.from, period.to)),
      timed(timings, "transfers", () => getTransferMetrics(scope, period)),
      timed(timings, "alerts", () => computePastoralAlerts(scope)),
      timed(timings, "trends", () => getNewPersonsWeeklySeries(scope, 8)),
    ]);

  ladder.funnel[0]!.count = persons.totalActive;
  ladder.ganarCompleted = persons.totalActive;

  const root = scope.rootPersonId;
  const tree = root
    ? await timed(timings, "tree", () => listDirectNodeCards(scope, root))
    : [];
  const breadcrumbs = root
    ? await timed(timings, "breadcrumbs", () => getBreadcrumbs(actorUserId, root))
    : [];

  const attention = alerts
    .filter((a) => a.severity === "critical" || a.severity === "warning")
    .slice(0, 12);

  return {
    scope: {
      mode: scope.mode,
      roleView: scope.roleView,
      ministryIds: scope.ministryIds,
      networkId: scope.networkId,
      rootPersonId: scope.rootPersonId,
    },
    period,
    persons,
    ladder,
    leadership,
    cells,
    transfers,
    alerts,
    attention,
    tree,
    breadcrumbs,
    trends: { newPersonsWeekly: weekly },
    timings,
  };
}
