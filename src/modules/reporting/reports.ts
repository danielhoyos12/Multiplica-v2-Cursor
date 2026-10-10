/**
 * Operational reports — same scope as dashboards. Paginated. No prayer text.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

import { DomainError, DomainErrorCode } from "@/lib/errors";
import { writeAuditLog } from "@/modules/audit";
import { hasPermission } from "@/modules/authorization";
import { formatFullName } from "@/modules/ganar/normalize";

import { rowsToCsv, stripSensitiveFields } from "./csv";
import { buildScopeMatcher } from "./convex-scope";
import type { DashboardScope } from "./scope";
import { resolveDashboardScope, type ScopeFilters } from "./scope";

export type ReportType =
  | "persons"
  | "cells"
  | "leadership"
  | "formation"
  | "transfers"
  | "multiplication";

export type ReportPage = {
  type: ReportType;
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
};

async function assertReportsAccess(scope: DashboardScope, exportMode = false) {
  if (exportMode) {
    // Export is a privileged action — never substitute dashboard.read / persons.read.
    if (!hasPermission(scope.actor, "reports.export")) {
      throw new DomainError(
        DomainErrorCode.REPORT_EXPORT_DENIED,
        "Sin permiso de exportación de reportes.",
      );
    }
    return;
  }

  if (
    !hasPermission(scope.actor, "reports.read") &&
    !hasPermission(scope.actor, "dashboard.read") &&
    !hasPermission(scope.actor, "persons.read")
  ) {
    throw new DomainError(
      DomainErrorCode.REPORT_ACCESS_DENIED,
      "Sin permiso de reportes.",
    );
  }
}

function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const offset = (page - 1) * pageSize;
  return rows.slice(offset, offset + pageSize);
}

export async function runReport(
  actorUserId: string,
  type: ReportType,
  filters: ScopeFilters & { page?: number; pageSize?: number } = {},
): Promise<ReportPage> {
  const scope = await resolveDashboardScope(actorUserId, filters);
  await assertReportsAccess(scope);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const client = await getAuthenticatedConvexClient();
  const matches = await buildScopeMatcher(scope);

  if (type === "persons") {
    const snapshot = await client.query(api.reporting.personsSnapshot, {});
    const filtered = snapshot
      .filter((p) => matches({ personId: p.personId, ministryId: p.ministryId, networkId: p.networkId }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

    const leadershipSnapshot = await client.query(api.reporting.leadershipSnapshot, {});
    const leadershipByPerson = new Map(leadershipSnapshot.map((l) => [l.personId, l]));

    const pageRows = paginate(filtered, page, pageSize);
    return {
      type,
      total: filtered.length,
      page,
      pageSize,
      rows: pageRows.map((p) => {
        const lead = leadershipByPerson.get(p.personId);
        return stripSensitiveFields({
          persona: formatFullName(p.firstName, p.lastName),
          personId: p.personId,
          ministryId: p.ministryId ?? null,
          networkId: p.networkId ?? null,
          liderazgo: lead?.status ?? "none",
          codigoLider: lead?.humanLeaderCode ?? null,
        });
      }),
    };
  }

  if (type === "cells") {
    const snapshot = await client.query(api.reporting.cellsSnapshot, {});
    const filtered = snapshot
      .filter((c) =>
        matches({ personId: c.responsiblePersonId ?? null, ministryId: c.ministryId, networkId: c.networkId }),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    const pageRows = paginate(filtered, page, pageSize);
    const enriched = [];
    for (const c of pageRows) {
      const detail = await client.query(api.cells.getDetail, { cellId: c.cellId });
      const members = detail?.activeMemberCount ?? 0;
      enriched.push(
        stripSensitiveFields({
          codigo: detail?.cell.code ?? "",
          nombre: c.name,
          tipo: c.type,
          estado: c.status,
          ministryId: c.ministryId,
          networkId: c.networkId,
          responsableId: c.responsiblePersonId ?? null,
          miembrosActivos: members,
        }),
      );
    }
    return { type, total: filtered.length, page, pageSize, rows: enriched };
  }

  if (type === "leadership") {
    const snapshot = await client.query(api.reporting.leadershipSnapshot, {});
    const filtered = snapshot
      .filter((l) => matches({ personId: l.personId, ministryId: l.ministryId, networkId: l.networkId }))
      .sort((a, b) => (a.humanLeaderCode ?? "").localeCompare(b.humanLeaderCode ?? ""));

    const pageRows = paginate(filtered, page, pageSize);
    const enriched = [];
    for (const l of pageRows) {
      const [directs, descendants] = await Promise.all([
        client.query(api.leadership.countActiveDirectLeadersFor, { leaderPersonId: l.personId as Id<"persons"> }),
        client.query(api.leadership.listDescendants, { ancestorPersonId: l.personId as Id<"persons"> }),
      ]);
      enriched.push({
        lider: formatFullName(l.firstName, l.lastName),
        codigo: l.humanLeaderCode ?? null,
        estado: l.status,
        directos: directs,
        progreso12: `${directs} / 12`,
        descendientes: descendants.length,
      });
    }
    return { type, total: filtered.length, page, pageSize, rows: enriched };
  }

  if (type === "formation") {
    const rows = await client.query(api.formation.listProgressRows, {});
    const filtered = rows
      .filter((r) =>
        matches({ personId: r.progress.personId, ministryId: r.progress.ministryId, networkId: r.progress.networkId }),
      )
      .sort((a, b) => b.progress.updatedAt - a.progress.updatedAt);

    const pageRows = paginate(filtered, page, pageSize);
    return {
      type,
      total: filtered.length,
      page,
      pageSize,
      rows: pageRows.map((r) => ({
        persona: formatFullName(r.firstName, r.lastName),
        etapa: r.progress.processType,
        estado: r.progress.status,
        stage: r.progress.stage ?? null,
      })),
    };
  }

  if (type === "multiplication") {
    const { listOpenExpedientesSummary } = await import("@/modules/multiplication");
    const {
      aggregateMultiplication,
      splitByLine,
    } = await import("./metrics-multiplication");
    const summaries = await listOpenExpedientesSummary(actorUserId);
    const rows = [];
    const discipleSets = new Map<string, Set<string>>();
    const leaderSets = new Map<string, Set<string>>();

    for (const s of summaries) {
      if (
        !matches({
          personId: s.studentPersonId,
          ministryId: null,
          networkId: null,
        })
      ) {
        continue;
      }
      let depth: number | null = null;
      if (scope.rootPersonId && scope.rootPersonId !== s.studentPersonId) {
        const ok = await client.query(api.leadership.isDescendant, {
          ancestorPersonId: scope.rootPersonId as Id<"persons">,
          descendantPersonId: s.studentPersonId as Id<"persons">,
        });
        if (!ok && scope.mode === "subtree") continue;
        const desc = await client.query(api.leadership.listDescendants, {
          ancestorPersonId: scope.rootPersonId as Id<"persons">,
        });
        depth = desc.find((d) => d.personId === s.studentPersonId)?.depth ?? null;
      } else if (scope.rootPersonId === s.studentPersonId) {
        depth = 0;
      }
      rows.push({
        studentPersonId: s.studentPersonId,
        fullName: s.fullName,
        ministryId: "",
        networkId: null as string | null,
        generationDepth: depth,
        contactsListed: s.counters.contacts.listed,
        wonLinked: s.counters.contacts.wonLinked,
        teamSize: s.counters.team.teamSize,
        firstSix: s.counters.team.firstSix,
        activeLeadersWithCell: s.counters.team.activeLeadersWithCell,
        teamComplete: s.counters.team.teamSize >= 12,
      });
      discipleSets.set(
        s.studentPersonId,
        new Set(
          // placeholders — unique counts already in summary; keep empty set size via teamSize
          Array.from({ length: s.counters.team.teamSize }, (_, i) => `${s.studentPersonId}:${i}`),
        ),
      );
      leaderSets.set(
        s.studentPersonId,
        new Set(
          Array.from(
            { length: s.counters.team.activeLeadersWithCell },
            (_, i) => `${s.studentPersonId}:L${i}`,
          ),
        ),
      );
    }

    const { own, descendants, consolidated } = splitByLine(
      rows,
      scope.rootPersonId ?? scope.actor.personId,
    );
    const aggregates = aggregateMultiplication(consolidated, discipleSets, leaderSets);
    const pageRows = paginate(consolidated, page, pageSize);
    return {
      type,
      total: consolidated.length,
      page,
      pageSize,
      rows: [
        {
          vista: "totales_consolidados",
          estudiantes: aggregates.students,
          discipulosUnicos: aggregates.uniqueDisciples,
          lideresActivosUnicos: aggregates.uniqueActiveLeaders,
          conLista15: aggregates.withLista15,
          conGanados3: aggregates.withGanados3,
          conEquipo6: aggregates.withTeam6,
          conEquipo12: aggregates.withTeam12,
          con6LideresActivos: aggregates.withSixActiveLeaders,
          propios: own.length,
          descendientes: descendants.length,
        },
        ...pageRows.map((r) => ({
          estudiante: r.fullName,
          generacion: r.generationDepth,
          contactos: r.contactsListed,
          ganados: r.wonLinked,
          equipo: r.teamSize,
          lideresActivosCelula: r.activeLeadersWithCell,
        })),
      ],
    };
  }

  // transfers
  const transfersSnapshot = await client.query(api.reporting.transferRequestsSnapshot, {});
  const filtered = transfersSnapshot
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
    .sort((a, b) => b.createdAt - a.createdAt);

  const pageRows = paginate(filtered, page, pageSize);
  return {
    type,
    total: filtered.length,
    page,
    pageSize,
    rows: pageRows.map((t) => ({
      persona: formatFullName(t.firstName, t.lastName),
      tipo: t.transferType,
      estado: t.status,
      origenMinistryId: t.sourceMinistryId ?? null,
      destinoMinistryId: t.destinationMinistryId ?? null,
      fecha: new Date(t.createdAt).toISOString(),
    })),
  };
}

export async function exportReportCsv(
  actorUserId: string,
  type: ReportType,
  filters: ScopeFilters = {},
): Promise<{ csv: string; rowCount: number }> {
  const payload = await loadExportRows(actorUserId, type, filters);
  const csv = rowsToCsv(payload.headers, payload.rows);
  await auditExport(actorUserId, type, filters, payload.rows.length, "csv");
  return { csv, rowCount: payload.rows.length };
}

export async function exportReportXlsx(
  actorUserId: string,
  type: ReportType,
  filters: ScopeFilters = {},
): Promise<{ buffer: Buffer; rowCount: number; filename: string }> {
  const payload = await loadExportRows(actorUserId, type, filters);
  const { rowsToXlsxBuffer } = await import("./xlsx");
  const buffer = await rowsToXlsxBuffer({
    reportTitle: REPORT_LABELS[type],
    headers: payload.headers,
    rows: payload.rows,
    meta: payload.meta,
  });
  await auditExport(actorUserId, type, filters, payload.rows.length, "xlsx");
  return {
    buffer,
    rowCount: payload.rows.length,
    filename: `multiplica-${type}.xlsx`,
  };
}

export async function exportReportPrintHtml(
  actorUserId: string,
  type: ReportType,
  filters: ScopeFilters = {},
): Promise<{ html: string; rowCount: number }> {
  const payload = await loadExportRows(actorUserId, type, filters);
  const { rowsToPrintHtml } = await import("./print-html");
  const html = rowsToPrintHtml({
    reportTitle: REPORT_LABELS[type],
    headers: payload.headers,
    rows: payload.rows,
    meta: payload.meta,
  });
  await auditExport(actorUserId, type, filters, payload.rows.length, "print");
  return { html, rowCount: payload.rows.length };
}

const REPORT_LABELS: Record<ReportType, string> = {
  persons: "Personas",
  cells: "Células",
  leadership: "Liderazgo",
  formation: "Formación",
  transfers: "Transferencias",
  multiplication: "Multiplicación 3–12",
};

async function loadExportRows(
  actorUserId: string,
  type: ReportType,
  filters: ScopeFilters,
) {
  const scope = await resolveDashboardScope(actorUserId, filters);
  await assertReportsAccess(scope, true);

  const page = await runReport(actorUserId, type, {
    ...filters,
    page: 1,
    pageSize: 2000,
  });
  const headers =
    page.rows.length > 0 ? Object.keys(page.rows[0]!) : ["mensaje"];
  const rows =
    page.rows.length > 0
      ? page.rows
      : [{ mensaje: "Sin datos en el alcance actual" }];

  return {
    headers,
    rows,
    meta: {
      scopeMode: scope.mode,
      roleView: scope.roleView,
      ministryId: filters.ministryId ?? null,
      networkId: filters.networkId ?? null,
      rootPersonId: filters.rootPersonId ?? null,
      generatedAt: new Date().toISOString(),
    },
  };
}

async function auditExport(
  actorUserId: string,
  type: ReportType,
  filters: ScopeFilters,
  rowCount: number,
  format: string,
) {
  await writeAuditLog({
    actorUserId,
    action: "report.exported",
    entityType: "report",
    entityId: null,
    metadata: {
      report_type: type,
      format,
      filters: {
        ministryId: filters.ministryId ?? null,
        networkId: filters.networkId ?? null,
        rootPersonId: filters.rootPersonId ?? null,
      },
      row_count: rowCount,
    },
  });
}
