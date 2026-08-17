/**
 * Unified executive / pastoral dashboard assembler.
 */
import { api, getConvexHttpClient } from "@/server/convex";

import { getBreadcrumbs } from "@/modules/leadership/service";

import { computePastoralAlerts, type PastoralAlert } from "./alerts";
import { resolveSubtreePersonIds } from "./convex-scope";
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

function transferInScope(
  scope: DashboardScope,
  t: { personId: string; sourceMinistryId?: string; destinationMinistryId?: string },
  subtreeIds: Set<string> | null,
): boolean {
  if (scope.mode === "subtree" && scope.rootPersonId) {
    return Boolean(subtreeIds?.has(t.personId));
  }
  if (scope.mode === "ministry" && scope.ministryIds.length) {
    return Boolean(
      (t.sourceMinistryId && scope.ministryIds.includes(t.sourceMinistryId)) ||
        (t.destinationMinistryId && scope.ministryIds.includes(t.destinationMinistryId)),
    );
  }
  return true;
}

async function getTransferMetrics(
  scope: DashboardScope,
  period: PeriodRange,
): Promise<TransferMetrics> {
  const client = getConvexHttpClient();
  const [snapshot, subtreeIds] = await Promise.all([
    client.query(api.reporting.transferRequestsSnapshot, {}),
    scope.mode === "subtree" && scope.rootPersonId
      ? resolveSubtreePersonIds(scope.rootPersonId)
      : Promise.resolve<Set<string> | null>(null),
  ]);

  const scoped = snapshot.filter((t) => transferInScope(scope, t, subtreeIds));

  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();

  let pending = 0;
  let approved = 0;
  let executedInPeriod = 0;
  let rejectedInPeriod = 0;
  let crossMinistryPending = 0;
  for (const t of scoped) {
    if (t.status === "pending") pending += 1;
    if (t.status === "approved") approved += 1;
    if (t.status === "executed" && t.executedAt !== undefined && t.executedAt >= fromMs && t.executedAt <= toMs) {
      executedInPeriod += 1;
    }
    if (t.status === "rejected" && t.rejectedAt !== undefined && t.rejectedAt >= fromMs && t.rejectedAt <= toMs) {
      rejectedInPeriod += 1;
    }
    if (
      (t.status === "pending" || t.status === "approved") &&
      t.sourceMinistryId !== t.destinationMinistryId
    ) {
      crossMinistryPending += 1;
    }
  }

  return { pending, approved, executedInPeriod, rejectedInPeriod, crossMinistryPending };
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
