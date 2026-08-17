/**
 * Derived person / Ganar metrics — no stored counters.
 *
 * CURRENT STATE: active persons with current organization history in scope.
 * HISTORICAL NEW: persons.registered_at in period ∩ currently in scope
 *   (leader/subtree) or registered while scoped — documented in metrics defs.
 */
import { api, getAuthenticatedConvexClient } from "@/server/convex";

import { buildScopeMatcher } from "./convex-scope";
import { formatPctChange, type PeriodRange } from "./period";
import type { DashboardScope } from "./scope";

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
  const client = await getAuthenticatedConvexClient();
  const [snapshot, matches] = await Promise.all([
    client.query(api.reporting.personsSnapshot, {}),
    buildScopeMatcher(scope),
  ]);

  const inScope = snapshot.filter((p) => matches({ personId: p.personId, ministryId: p.ministryId, networkId: p.networkId }));

  const totalActive = inScope.length;
  const withCell = inScope.filter((p) => p.hasActiveCell).length;

  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();
  const prevFromMs = period.prevFrom.getTime();
  const prevToMs = period.prevTo.getTime();

  const newInPeriod = inScope.filter((p) => p.registeredAt >= fromMs && p.registeredAt <= toMs).length;
  const newPreviousPeriod = inScope.filter(
    (p) => p.registeredAt >= prevFromMs && p.registeredAt <= prevToMs,
  ).length;

  const bySource = { public_form: 0, internal_form: 0 };
  for (const p of inScope) {
    if (p.source === "public_form") bySource.public_form += 1;
    if (p.source === "internal_form") bySource.internal_form += 1;
  }

  const prayerPendingCount = inScope.filter((p) => p.hasPrayerRequest).length;

  const byNetworkMap = new Map<string | null, number>();
  const byMinistryMap = new Map<string | null, number>();
  for (const p of inScope) {
    const networkId = p.networkId ?? null;
    const ministryId = p.ministryId ?? null;
    byNetworkMap.set(networkId, (byNetworkMap.get(networkId) ?? 0) + 1);
    byMinistryMap.set(ministryId, (byMinistryMap.get(ministryId) ?? 0) + 1);
  }

  return {
    methodology: "current_state",
    totalActive,
    withCell,
    withoutCell: Math.max(0, totalActive - withCell),
    newInPeriod,
    newPreviousPeriod,
    newChangeLabel: formatPctChange(newInPeriod, newPreviousPeriod),
    bySource,
    prayerPendingCount,
    byNetwork: [...byNetworkMap.entries()].map(([networkId, count]) => ({ networkId, count })),
    byMinistry: [...byMinistryMap.entries()].map(([ministryId, count]) => ({ ministryId, count })),
  };
}

/** Weekly new-person series for charts (last N weeks) */
export async function getNewPersonsWeeklySeries(
  scope: DashboardScope,
  weeks = 8,
): Promise<Array<{ weekStart: string; count: number }>> {
  const client = await getAuthenticatedConvexClient();
  const [snapshot, matches] = await Promise.all([
    client.query(api.reporting.personsSnapshot, {}),
    buildScopeMatcher(scope),
  ]);

  const inScope = snapshot.filter((p) => matches({ personId: p.personId, ministryId: p.ministryId, networkId: p.networkId }));

  const sinceMs = Date.now() - weeks * 7 * 86_400_000;
  const counts = new Map<string, number>();
  for (const p of inScope) {
    if (p.registeredAt < sinceMs) continue;
    const weekStart = mondayOfWeekLima(p.registeredAt);
    counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, count]) => ({ weekStart, count }));
}

const LIMA_OFFSET_HOURS = -5;

function mondayOfWeekLima(epochMs: number): string {
  const limaMs = epochMs + LIMA_OFFSET_HOURS * 3_600_000;
  const d = new Date(limaMs);
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}
