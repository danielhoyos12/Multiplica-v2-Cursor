/**
 * Lightweight derived alert engine — does NOT mutate domain state.
 */
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  pastoralTransferRequests,
  personLeadership,
  personProcessProgress,
  persons,
} from "@/db/schema";
import { formatFullName } from "@/modules/ganar/normalize";
import { getTwelveProgress } from "@/modules/leadership/service";

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
  const db = getDb();
  const stalledBefore = new Date(
    Date.now() - ReportingThresholds.formationStalledDays * 86_400_000,
  );
  const eligibleBefore = new Date(
    Date.now() - ReportingThresholds.eligibleNotActivatedDays * 86_400_000,
  );

  // --- Integrity critical: active without cell ---
  const activeNoCell = await db.execute<{
    person_id: string;
    first_name: string;
    last_name: string;
  }>(sql`
    SELECT pl.person_id, p.first_name, p.last_name
    FROM person_leadership pl
    INNER JOIN persons p ON p.id = pl.person_id
    WHERE pl.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM cells c
        WHERE c.responsible_person_id = pl.person_id AND c.status <> 'closed'
      )
      ${
        scope.mode === "subtree" && scope.rootPersonId
          ? sql`AND pl.person_id IN (
              SELECT descendant_person_id FROM leadership_closure
              WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
            )`
          : scope.mode === "ministry" && scope.ministryIds.length
            ? sql`AND pl.ministry_id IN (${sql.join(
                scope.ministryIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})`
            : sql``
      }
    LIMIT 20
  `);
  const noCellList = Array.isArray(activeNoCell)
    ? activeNoCell
    : ((activeNoCell as { rows?: typeof activeNoCell }).rows ?? []);
  for (const r of noCellList as Array<{
    person_id: string;
    first_name: string;
    last_name: string;
  }>) {
    alerts.push({
      code: "active_leader_without_cell",
      severity: "critical",
      title: "Líder activo sin célula",
      detail: formatFullName(r.first_name, r.last_name),
      href: `/liderazgo/${r.person_id}`,
      entityType: "person_leadership",
      entityId: r.person_id,
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
  const activeLeaders = await db
    .select({
      personId: personLeadership.personId,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(personLeadership)
    .innerJoin(persons, eq(persons.id, personLeadership.personId))
    .where(
      and(
        eq(personLeadership.status, "active"),
        scope.mode === "subtree" && scope.rootPersonId
          ? sql`${personLeadership.personId} IN (
              SELECT descendant_person_id FROM leadership_closure
              WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
            )`
          : scope.mode === "ministry" && scope.ministryIds.length
            ? inArray(personLeadership.ministryId, scope.ministryIds)
            : undefined,
      ),
    )
    .limit(200);

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
  const eligibles = await db
    .select({
      personId: personLeadership.personId,
      firstName: persons.firstName,
      lastName: persons.lastName,
      eligibleAt: personLeadership.eligibleAt,
    })
    .from(personLeadership)
    .innerJoin(persons, eq(persons.id, personLeadership.personId))
    .where(
      and(
        eq(personLeadership.status, "eligible"),
        lt(personLeadership.eligibleAt, eligibleBefore),
        scope.mode === "subtree" && scope.rootPersonId
          ? sql`${personLeadership.personId} IN (
              SELECT descendant_person_id FROM leadership_closure
              WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
            )`
          : scope.mode === "ministry" && scope.ministryIds.length
            ? inArray(personLeadership.ministryId, scope.ministryIds)
            : undefined,
      ),
    )
    .limit(30);

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
  const stalled = await db
    .select({
      personId: personProcessProgress.personId,
      processType: personProcessProgress.processType,
      firstName: persons.firstName,
      lastName: persons.lastName,
      updatedAt: personProcessProgress.updatedAt,
    })
    .from(personProcessProgress)
    .innerJoin(persons, eq(persons.id, personProcessProgress.personId))
    .where(
      and(
        eq(personProcessProgress.status, "in_progress"),
        lt(personProcessProgress.updatedAt, stalledBefore),
        scope.mode === "subtree" && scope.rootPersonId
          ? sql`${personProcessProgress.personId} IN (
              SELECT descendant_person_id FROM leadership_closure
              WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
            )`
          : scope.mode === "ministry" && scope.ministryIds.length
            ? inArray(personProcessProgress.ministryId, scope.ministryIds)
            : undefined,
      ),
    )
    .limit(30);

  for (const s of stalled) {
    alerts.push({
      code: "formation_stalled",
      severity: "warning",
      title: "Formación sin actividad reciente",
      detail: `${formatFullName(s.firstName, s.lastName)} · ${s.processType}`,
      href: `/ganar/${s.personId}`,
      entityType: "person_process_progress",
      entityId: s.personId,
    });
  }

  // --- Pending transfers ---
  const transfers = await db
    .select()
    .from(pastoralTransferRequests)
    .where(
      and(
        inArray(pastoralTransferRequests.status, ["pending", "approved"]),
        scope.mode === "ministry" && scope.ministryIds.length
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
          : scope.mode === "subtree" && scope.rootPersonId
            ? sql`${pastoralTransferRequests.personId} IN (
                SELECT descendant_person_id FROM leadership_closure
                WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
              )`
            : undefined,
      ),
    )
    .limit(40);

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
      entityId: t.id,
    });
  }

  void isNull;
  return prioritizeAlerts(alerts);
}

function prioritizeAlerts(alerts: PastoralAlert[]): PastoralAlert[] {
  const rank = { critical: 0, warning: 1, info: 2 };
  return [...alerts]
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 40);
}
