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
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  cellAttendance,
  cellAttendanceSessions,
  cellMemberships,
  cells,
} from "@/db/schema";

import { ReportingThresholds } from "./period";
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

function cellScopeSql(scope: DashboardScope) {
  if (scope.mode === "subtree" && scope.rootPersonId) {
    return sql`${cells.responsiblePersonId} IN (
      SELECT descendant_person_id FROM leadership_closure
      WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
    )`;
  }
  if (scope.mode === "ministry" && scope.ministryIds.length) {
    return inArray(cells.ministryId, scope.ministryIds);
  }
  return undefined;
}

export async function getCellMetrics(
  scope: DashboardScope,
  periodFrom?: Date,
  periodTo?: Date,
): Promise<CellMetrics> {
  const db = getDb();
  const scopeSql = cellScopeSql(scope);

  const typeRows = await db
    .select({ type: cells.type, status: cells.status, c: count() })
    .from(cells)
    .where(scopeSql)
    .groupBy(cells.type, cells.status);

  let totalActive = 0;
  let evangelistic = 0;
  let twelve = 0;
  let closed = 0;
  for (const r of typeRows) {
    const n = Number(r.c);
    if (r.status === "closed") closed += n;
    else {
      totalActive += n;
      if (r.type === "evangelistic") evangelistic += n;
      if (r.type === "twelve") twelve += n;
    }
  }

  let newInPeriod = 0;
  if (periodFrom && periodTo) {
    const [row] = await db
      .select({ c: count() })
      .from(cells)
      .where(
        and(
          scopeSql,
          gte(cells.createdAt, periodFrom),
          lte(cells.createdAt, periodTo),
        ),
      );
    newInPeriod = Number(row?.c ?? 0);
  }

  const [members] = await db.execute<{ c: string }>(sql`
    SELECT count(*)::text AS c
    FROM cell_memberships cm
    INNER JOIN cells c ON c.id = cm.cell_id
    WHERE cm.status = 'active'
      AND c.status <> 'closed'
      ${
        scope.mode === "subtree" && scope.rootPersonId
          ? sql`AND c.responsible_person_id IN (
              SELECT descendant_person_id FROM leadership_closure
              WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
            )`
          : scope.mode === "ministry" && scope.ministryIds.length
            ? sql`AND c.ministry_id IN (${sql.join(
                scope.ministryIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})`
            : sql``
      }
  `);
  const mList = Array.isArray(members)
    ? members
    : ((members as { rows?: typeof members }).rows ?? []);
  const activeMembers = Number((mList as Array<{ c: string }>)[0]?.c ?? 0);

  const details = await listCellAttendanceDetails(scope);
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
  const db = getDb();
  const scopeSql = cellScopeSql(scope);
  const activeCells = await db
    .select()
    .from(cells)
    .where(and(scopeSql, sql`${cells.status} <> 'closed'`))
    .limit(300);

  const out: CellAttendanceDetail[] = [];
  for (const cell of activeCells) {
    const [{ members }] = await db
      .select({ members: count() })
      .from(cellMemberships)
      .where(
        and(eq(cellMemberships.cellId, cell.id), eq(cellMemberships.status, "active")),
      );

    const sessions = await db
      .select()
      .from(cellAttendanceSessions)
      .where(
        and(
          eq(cellAttendanceSessions.cellId, cell.id),
          inArray(cellAttendanceSessions.status, ["completed", "open"]),
        ),
      )
      .orderBy(desc(cellAttendanceSessions.sessionDate))
      .limit(6);

    const sessionStats: number[] = [];
    let lastPresent: number | null = null;
    for (const s of sessions) {
      const [pres] = await db
        .select({ c: count() })
        .from(cellAttendance)
        .where(
          and(
            eq(cellAttendance.sessionId, s.id),
            eq(cellAttendance.status, "present"),
          ),
        );
      const present = Number(pres?.c ?? 0);
      if (lastPresent === null) lastPresent = present;
      const mem = Number(members) || 0;
      if (mem > 0) sessionStats.push((present / mem) * 100);
    }

    const recentN = ReportingThresholds.attendanceRecentSessions;
    const baseN = ReportingThresholds.attendanceBaselineSessions;
    const recent = sessionStats.slice(0, recentN);
    const baseline = sessionStats.slice(recentN, recentN + baseN);
    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const recentAvg = avg(recent);
    const baseAvg = avg(baseline.length ? baseline : sessionStats.slice(recentN));
    const avgLast4 = avg(sessionStats.slice(0, 4));

    let trend: CellAttendanceDetail["trend"] = "unknown";
    if (recentAvg != null && baseAvg != null && baseAvg > 0) {
      if (recentAvg < baseAvg * ReportingThresholds.attendanceDropRatio) trend = "down";
      else if (recentAvg > baseAvg * 1.1) trend = "up";
      else trend = "stable";
    }

    out.push({
      cellId: cell.id,
      name: cell.name,
      type: cell.type,
      lastSessionDate: sessions[0]?.sessionDate ?? null,
      lastPresent,
      activeMembers: Number(members),
      avgLast4Pct: avgLast4 != null ? Math.round(avgLast4 * 10) / 10 : null,
      trend,
    });
  }
  return out;
}
