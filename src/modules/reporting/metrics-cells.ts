/**
 * Cell + attendance derived metrics and simple trend rules.
 *
 * Trend rule (documented):
 * - Compare avg present% of last 2 completed sessions vs prior up-to-4 sessions.
 * - drop if recent < 0.7 * baseline
 * - up if recent > 1.1 * baseline
 * - else stable
 *
 * no_recent_attendance: active cell with habitual dayOfWeek; after that weekday
 * + grace hours in America/Lima with no completed/open session in last 7 days.
 */
import { api, getConvexHttpClient } from "@/server/convex";

import { buildScopeMatcher } from "./convex-scope";
import type { DashboardScope } from "./scope";

export type CellMetrics = {
  totalActive: number;
  evangelistic: number;
  twelve: number;
  closed: number;
  newInPeriod: number;
  activeMembers: number;
  avgAttendancePct: number | null;
  noRecentAttendance: number;
  attendanceDrop: number;
};

export type CellAttendanceDetail = {
  cellId: string;
  name: string;
  type: string;
  lastSessionDate: string | null;
  lastPresent: number | null;
  activeMembers: number;
  avgLast4Pct: number | null;
  trend: "up" | "stable" | "down" | "unknown";
};

async function scopedCells(scope: DashboardScope) {
  const client = getConvexHttpClient();
  const [snapshot, matches] = await Promise.all([
    client.query(api.reporting.cellsSnapshot, {}),
    buildScopeMatcher(scope),
  ]);
  return snapshot.filter((c) =>
    matches({ personId: c.responsiblePersonId ?? null, ministryId: c.ministryId, networkId: c.networkId }),
  );
}

export async function getCellMetrics(
  scope: DashboardScope,
  periodFrom?: Date,
  periodTo?: Date,
): Promise<CellMetrics> {
  const cells = await scopedCells(scope);

  let totalActive = 0;
  let evangelistic = 0;
  let twelve = 0;
  let closed = 0;
  for (const c of cells) {
    if (c.status === "closed") {
      closed += 1;
    } else {
      totalActive += 1;
      if (c.type === "evangelistic") evangelistic += 1;
      if (c.type === "twelve") twelve += 1;
    }
  }

  let newInPeriod = 0;
  if (periodFrom && periodTo) {
    const fromMs = periodFrom.getTime();
    const toMs = periodTo.getTime();
    newInPeriod = cells.filter((c) => c.createdAt >= fromMs && c.createdAt <= toMs).length;
  }

  const details = await listCellAttendanceDetails(scope);
  const activeMembers = details.reduce((a, d) => a + d.activeMembers, 0);
  const pcts = details.map((d) => d.avgLast4Pct).filter((x): x is number => x != null);
  const avgAttendancePct =
    pcts.length === 0
      ? null
      : Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10;

  return {
    totalActive,
    evangelistic,
    twelve,
    closed,
    newInPeriod,
    activeMembers,
    avgAttendancePct,
    noRecentAttendance: details.filter((d) => shouldAlertNoRecent(d)).length,
    attendanceDrop: details.filter((d) => d.trend === "down").length,
  };
}

function shouldAlertNoRecent(d: CellAttendanceDetail) {
  if (!d.lastSessionDate) return true;
  const last = new Date(d.lastSessionDate + "T12:00:00-05:00");
  const ageDays = (Date.now() - last.getTime()) / 86_400_000;
  return ageDays > 7;
}

export async function listCellAttendanceDetails(
  scope: DashboardScope,
): Promise<CellAttendanceDetail[]> {
  const client = getConvexHttpClient();
  const cells = (await scopedCells(scope)).filter((c) => c.status !== "closed").slice(0, 300);

  const details = await client.query(api.reporting.cellAttendanceDetails, {
    cellIds: cells.map((c) => c.cellId),
  });

  return details.map((d) => ({
    cellId: d.cellId,
    name: d.name,
    type: d.type,
    lastSessionDate: d.lastSessionDate,
    lastPresent: d.lastPresent,
    activeMembers: d.activeMembers,
    avgLast4Pct: d.avgLast4Pct,
    trend: d.trend,
  }));
}
