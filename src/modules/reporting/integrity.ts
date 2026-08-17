/**
 * System integrity checks — read-only. No auto-repair.
 */
import { api, getConvexHttpClient } from "@/server/convex";

export type IntegrityViolation = {
  code: string;
  severity: "critical" | "warning";
  title: string;
  count: number;
  sampleIds: string[];
};

export type IntegrityReport = {
  checkedAt: string;
  violations: IntegrityViolation[];
  criticalCount: number;
  warningCount: number;
  healthy: boolean;
};

export async function runIntegrityChecks(): Promise<IntegrityReport> {
  const client = getConvexHttpClient();
  const violations: IntegrityViolation[] = [];

  const [leadershipSnapshot, cellsSnapshot, twelveOrdinary, multipleOpenOrg, closureChecks] =
    await Promise.all([
      client.query(api.reporting.leadershipSnapshot, {}),
      client.query(api.reporting.cellsSnapshot, {}),
      client.query(api.reporting.integrityTwelveOrdinaryMembers, {}),
      client.query(api.reporting.integrityMultipleOpenOrgHistory, {}),
      client.query(api.reporting.integrityClosureChecks, {}),
    ]);

  const responsibleWithOpenCell = new Set(
    cellsSnapshot.filter((c) => c.status !== "closed" && c.responsiblePersonId).map((c) => c.responsiblePersonId),
  );
  const activeNoCell = leadershipSnapshot
    .filter((l) => l.status === "active" && !responsibleWithOpenCell.has(l.personId))
    .map((l) => l.personId)
    .slice(0, 50);
  if (activeNoCell.length > 0) {
    violations.push({
      code: "active_leader_without_cell",
      severity: "critical",
      title: "Líderes active sin célula abierta",
      count: activeNoCell.length,
      sampleIds: activeNoCell.slice(0, 10),
    });
  }

  const directCellCounts = new Map<string, number>();
  for (const c of cellsSnapshot) {
    if (c.status === "closed" || !c.responsiblePersonId) continue;
    directCellCounts.set(c.responsiblePersonId, (directCellCounts.get(c.responsiblePersonId) ?? 0) + 1);
  }
  const moreThanTwoDirectCells = [...directCellCounts.entries()]
    .filter(([, count]) => count > 2)
    .map(([personId]) => personId)
    .slice(0, 50);
  if (moreThanTwoDirectCells.length > 0) {
    violations.push({
      code: "more_than_two_direct_cells",
      severity: "critical",
      title: "Responsables con más de 2 células directas",
      count: moreThanTwoDirectCells.length,
      sampleIds: moreThanTwoDirectCells.slice(0, 10),
    });
  }

  if (twelveOrdinary.length > 0) {
    violations.push({
      code: "twelve_with_ordinary_member",
      severity: "critical",
      title: "Célula de 12 con miembro ordinario activo",
      count: twelveOrdinary.length,
      sampleIds: twelveOrdinary.slice(0, 10),
    });
  }

  const directLeaderCounts = new Map<string, number>();
  for (const l of leadershipSnapshot) {
    if (l.status !== "active" || !l.directLeaderPersonId) continue;
    directLeaderCounts.set(l.directLeaderPersonId, (directLeaderCounts.get(l.directLeaderPersonId) ?? 0) + 1);
  }
  const moreThanTwelveDirectLeaders = [...directLeaderCounts.entries()]
    .filter(([, count]) => count > 12)
    .map(([personId]) => personId)
    .slice(0, 50);
  if (moreThanTwelveDirectLeaders.length > 0) {
    violations.push({
      code: "more_than_twelve_direct_leaders",
      severity: "critical",
      title: "Más de 12 líderes directos activos",
      count: moreThanTwelveDirectLeaders.length,
      sampleIds: moreThanTwelveDirectLeaders.slice(0, 10),
    });
  }

  if (multipleOpenOrg.length > 0) {
    violations.push({
      code: "multiple_open_org_history",
      severity: "critical",
      title: "Múltiples filas abiertas de organization history",
      count: multipleOpenOrg.length,
      sampleIds: multipleOpenOrg.slice(0, 10),
    });
  }

  if (closureChecks.missingSelfClosure.length > 0) {
    violations.push({
      code: "missing_self_closure",
      severity: "warning",
      title: "Líderes active sin fila self en closure",
      count: closureChecks.missingSelfClosure.length,
      sampleIds: closureChecks.missingSelfClosure.slice(0, 10),
    });
  }

  if (closureChecks.closureParentMismatch.length > 0) {
    violations.push({
      code: "closure_parent_mismatch",
      severity: "warning",
      title: "Closure depth=1 no coincide con líder directo",
      count: closureChecks.closureParentMismatch.length,
      sampleIds: closureChecks.closureParentMismatch.slice(0, 10),
    });
  }

  const criticalCount = violations
    .filter((v) => v.severity === "critical")
    .reduce((a, v) => a + v.count, 0);
  const warningCount = violations
    .filter((v) => v.severity === "warning")
    .reduce((a, v) => a + v.count, 0);

  return {
    checkedAt: new Date().toISOString(),
    violations,
    criticalCount,
    warningCount,
    healthy: criticalCount === 0,
  };
}
