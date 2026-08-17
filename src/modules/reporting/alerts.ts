/**
 * Lightweight derived alert engine — does NOT mutate domain state.
 */
import { api, getAuthenticatedConvexClient } from "@/server/convex";

import { formatFullName } from "@/modules/ganar/normalize";
import { getTwelveProgress } from "@/modules/leadership/service";

import { buildScopeMatcher } from "./convex-scope";
import { listCellAttendanceDetails } from "./metrics-cells";
import { ReportingThresholds } from "./period";
import type { DashboardScope } from "./scope";

export type AlertSeverity = "info" | "warning" | "critical";

export type PastoralAlert = {
  code: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href?: string;
  entityType?: string;
  entityId?: string;
};

export async function computePastoralAlerts(
  scope: DashboardScope,
): Promise<PastoralAlert[]> {
  const alerts: PastoralAlert[] = [];
  const client = await getAuthenticatedConvexClient();
  const stalledBeforeMs = Date.now() - ReportingThresholds.formationStalledDays * 86_400_000;
  const eligibleBeforeMs = Date.now() - ReportingThresholds.eligibleNotActivatedDays * 86_400_000;

  const [leadershipSnapshot, cellsSnapshot, progressRows, transfersSnapshot, matches] =
    await Promise.all([
      client.query(api.reporting.leadershipSnapshot, {}),
      client.query(api.reporting.cellsSnapshot, {}),
      client.query(api.formation.listProgressRows, {}),
      client.query(api.reporting.transferRequestsSnapshot, {}),
      buildScopeMatcher(scope),
    ]);

  const scopedLeaders = leadershipSnapshot.filter((l) =>
    matches({ personId: l.personId, ministryId: l.ministryId, networkId: l.networkId }),
  );

  // --- Integrity critical: active without cell ---
  const responsibleWithOpenCell = new Set(
    cellsSnapshot.filter((c) => c.status !== "closed" && c.responsiblePersonId).map((c) => c.responsiblePersonId),
  );
  const activeNoCell = scopedLeaders
    .filter((l) => l.status === "active" && !responsibleWithOpenCell.has(l.personId))
    .slice(0, 20);
  for (const l of activeNoCell) {
    alerts.push({
      code: "active_leader_without_cell",
      severity: "critical",
      title: "Líder activo sin célula",
      detail: formatFullName(l.firstName, l.lastName),
      href: `/liderazgo/${l.personId}`,
      entityType: "person_leadership",
      entityId: l.personId,
    });
  }

  // --- Cell attendance alerts ---
  const cells = await listCellAttendanceDetails(scope);
  for (const c of cells) {
    if (!c.lastSessionDate) {
      alerts.push({
        code: "cell_no_recent_attendance",
        severity: "warning",
        title: "Célula sin asistencia registrada",
        detail: c.name,
        href: `/celulas/${c.cellId}`,
        entityType: "cell",
        entityId: c.cellId,
      });
    } else {
      const last = new Date(c.lastSessionDate + "T12:00:00-05:00");
      if ((Date.now() - last.getTime()) / 86_400_000 > 7) {
        alerts.push({
          code: "cell_no_recent_attendance",
          severity: "warning",
          title: "Célula sin reporte reciente",
          detail: `${c.name} · última ${c.lastSessionDate}`,
          href: `/celulas/${c.cellId}`,
          entityType: "cell",
          entityId: c.cellId,
        });
      }
    }
    if (c.trend === "down") {
      alerts.push({
        code: "cell_attendance_drop",
        severity: "warning",
        title: "Caída de asistencia",
        detail: `${c.name} · tendencia baja (< ${ReportingThresholds.attendanceDropRatio * 100}% del baseline)`,
        href: `/celulas/${c.cellId}`,
        entityType: "cell",
        entityId: c.cellId,
      });
    }
  }

  // --- Ready for twelve ---
  const activeLeaders = scopedLeaders.filter((l) => l.status === "active").slice(0, 200);
  for (const l of activeLeaders) {
    const p = await getTwelveProgress(l.personId);
    if (p.ready) {
      alerts.push({
        code: "leader_ready_for_twelve",
        severity: "info",
        title: "Listo para convertir a Célula de 12",
        detail: `${formatFullName(l.firstName, l.lastName)} · ${p.label}`,
        href: `/liderazgo/${l.personId}`,
        entityType: "person_leadership",
        entityId: l.personId,
      });
    }
  }

  // --- Eligible not activated ---
  const eligibles = scopedLeaders
    .filter((l) => l.status === "eligible" && l.eligibleAt !== undefined && l.eligibleAt < eligibleBeforeMs)
    .slice(0, 30);
  for (const e of eligibles) {
    alerts.push({
      code: "eligible_not_activated",
      severity: "info",
      title: "Ungido pendiente de activación",
      detail: formatFullName(e.firstName, e.lastName),
      href: `/liderazgo/activar/${e.personId}`,
      entityType: "person_leadership",
      entityId: e.personId,
    });
  }

  // --- Formation stalled ---
  const stalled = progressRows
    .filter(
      (r) =>
        r.progress.status === "in_progress" &&
        r.progress.updatedAt < stalledBeforeMs &&
        matches({ personId: r.progress.personId, ministryId: r.progress.ministryId, networkId: r.progress.networkId }),
    )
    .slice(0, 30);
  for (const s of stalled) {
    alerts.push({
      code: "formation_stalled",
      severity: "warning",
      title: "Formación sin actividad reciente",
      detail: `${formatFullName(s.firstName, s.lastName)} · ${s.progress.processType}`,
      href: `/ganar/${s.progress.personId}`,
      entityType: "person_process_progress",
      entityId: s.progress.personId,
    });
  }

  // --- Pending transfers ---
  const transfers = transfersSnapshot
    .filter((t) => t.status === "pending" || t.status === "approved")
    .filter((t) => {
      if (scope.mode === "ministry" && scope.ministryIds.length) {
        return (
          (t.sourceMinistryId && scope.ministryIds.includes(t.sourceMinistryId)) ||
          (t.destinationMinistryId && scope.ministryIds.includes(t.destinationMinistryId))
        );
      }
      if (scope.mode === "subtree" && scope.rootPersonId) {
        return matches({ personId: t.personId, ministryId: null, networkId: null });
      }
      return true;
    })
    .slice(0, 40);
  for (const t of transfers) {
    alerts.push({
      code: "pending_transfer",
      severity: t.status === "approved" ? "warning" : "info",
      title:
        t.status === "approved"
          ? "Transferencia aprobada pendiente de ejecutar"
          : "Transferencia pendiente",
      detail: `${t.transferType} · ${t.status}`,
      href: `/transferencias?estado=${t.status}`,
      entityType: "pastoral_transfer_requests",
      entityId: t._id,
    });
  }

  return prioritizeAlerts(alerts);
}

function prioritizeAlerts(alerts: PastoralAlert[]): PastoralAlert[] {
  const rank = { critical: 0, warning: 1, info: 2 };
  return [...alerts]
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 40);
}
