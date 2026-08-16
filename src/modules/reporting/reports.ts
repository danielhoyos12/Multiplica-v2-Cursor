/**
 * Operational reports — same scope as dashboards. Paginated. No prayer text.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  cellMemberships,
  cells,
  leadershipClosure,
  pastoralTransferRequests,
  personLeadership,
  personOrganizationHistory,
  personProcessProgress,
  persons,
} from "@/db/schema";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { writeAuditLog } from "@/modules/audit";
import { hasPermission } from "@/modules/authorization";
import { formatFullName } from "@/modules/ganar/normalize";

import { rowsToCsv, stripSensitiveFields } from "./csv";
import type { DashboardScope } from "./scope";
import { resolveDashboardScope, type ScopeFilters } from "./scope";

export type ReportType =
  | "persons"
  | "cells"
  | "leadership"
  | "formation"
  | "transfers";

export type ReportPage = {
  type: ReportType;
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
};

async function assertReportsAccess(scope: DashboardScope, exportMode = false) {
  const perm = exportMode ? "reports.export" : "reports.read";
  if (
    !hasPermission(scope.actor, perm) &&
    !hasPermission(scope.actor, "dashboard.read") &&
    !hasPermission(scope.actor, "persons.read")
  ) {
    throw new DomainError(
      exportMode
        ? DomainErrorCode.REPORT_EXPORT_DENIED
        : DomainErrorCode.REPORT_ACCESS_DENIED,
      "Sin permiso de reportes.",
    );
  }
}

function personScopeSql(scope: DashboardScope) {
  if (scope.mode === "subtree" && scope.rootPersonId) {
    return sql`${persons.id} IN (
      SELECT descendant_person_id FROM leadership_closure
      WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
    )`;
  }
  if (scope.mode === "ministry" && scope.ministryIds.length) {
    return sql`${persons.id} IN (
      SELECT person_id FROM person_organization_history
      WHERE effective_to IS NULL
        AND ministry_id IN (${sql.join(
          scope.ministryIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
    )`;
  }
  return undefined;
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
  const offset = (page - 1) * pageSize;
  const db = getDb();

  if (type === "persons") {
    const scopeSql = personScopeSql(scope);
    const where = and(
      eq(persons.isActive, true),
      sql`${persons.deletedAt} IS NULL`,
      scopeSql,
      scope.networkId
        ? sql`EXISTS (
            SELECT 1 FROM person_organization_history poh
            WHERE poh.person_id = ${persons.id}
              AND poh.effective_to IS NULL
              AND poh.network_id = ${scope.networkId}::uuid
          )`
        : undefined,
    );
    const [{ total }] = await db.select({ total: count() }).from(persons).where(where);
    const rows = await db
      .select({
        personId: persons.id,
        firstName: persons.firstName,
        lastName: persons.lastName,
        ministryId: personOrganizationHistory.ministryId,
        networkId: personOrganizationHistory.networkId,
        leadershipStatus: personLeadership.status,
        leaderCode: personLeadership.humanLeaderCode,
      })
      .from(persons)
      .leftJoin(
        personOrganizationHistory,
        and(
          eq(personOrganizationHistory.personId, persons.id),
          sql`${personOrganizationHistory.effectiveTo} IS NULL`,
        ),
      )
      .leftJoin(personLeadership, eq(personLeadership.personId, persons.id))
      .where(where)
      .orderBy(persons.lastName, persons.firstName)
      .limit(pageSize)
      .offset(offset);

    return {
      type,
      total: Number(total),
      page,
      pageSize,
      rows: rows.map((r) =>
        stripSensitiveFields({
          persona: formatFullName(r.firstName, r.lastName),
          personId: r.personId,
          ministryId: r.ministryId,
          networkId: r.networkId,
          liderazgo: r.leadershipStatus ?? "none",
          codigoLider: r.leaderCode,
        }),
      ),
    };
  }

  if (type === "cells") {
    const scopeSql =
      scope.mode === "subtree" && scope.rootPersonId
        ? sql`${cells.responsiblePersonId} IN (
            SELECT descendant_person_id FROM leadership_closure
            WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
          )`
        : scope.mode === "ministry" && scope.ministryIds.length
          ? sql`${cells.ministryId} IN (${sql.join(
              scope.ministryIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : undefined;
    const where = and(scopeSql, scope.networkId ? eq(cells.networkId, scope.networkId) : undefined);
    const [{ total }] = await db.select({ total: count() }).from(cells).where(where);
    const rows = await db
      .select({
        id: cells.id,
        code: cells.code,
        name: cells.name,
        type: cells.type,
        status: cells.status,
        ministryId: cells.ministryId,
        networkId: cells.networkId,
        responsiblePersonId: cells.responsiblePersonId,
      })
      .from(cells)
      .where(where)
      .orderBy(cells.name)
      .limit(pageSize)
      .offset(offset);

    const enriched = [];
    for (const r of rows) {
      const [{ members }] = await db
        .select({ members: count() })
        .from(cellMemberships)
        .where(
          and(eq(cellMemberships.cellId, r.id), eq(cellMemberships.status, "active")),
        );
      enriched.push(
        stripSensitiveFields({
          codigo: r.code,
          nombre: r.name,
          tipo: r.type,
          estado: r.status,
          ministryId: r.ministryId,
          networkId: r.networkId,
          responsableId: r.responsiblePersonId,
          miembrosActivos: Number(members),
        }),
      );
    }
    return { type, total: Number(total), page, pageSize, rows: enriched };
  }

  if (type === "leadership") {
    const scopeSql =
      scope.mode === "subtree" && scope.rootPersonId
        ? sql`${personLeadership.personId} IN (
            SELECT descendant_person_id FROM leadership_closure
            WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
          )`
        : scope.mode === "ministry" && scope.ministryIds.length
          ? sql`${personLeadership.ministryId} IN (${sql.join(
              scope.ministryIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : undefined;
    const where = scopeSql;
    const [{ total }] = await db
      .select({ total: count() })
      .from(personLeadership)
      .where(where);
    const rows = await db
      .select({
        personId: personLeadership.personId,
        status: personLeadership.status,
        code: personLeadership.humanLeaderCode,
        firstName: persons.firstName,
        lastName: persons.lastName,
      })
      .from(personLeadership)
      .innerJoin(persons, eq(persons.id, personLeadership.personId))
      .where(where)
      .orderBy(personLeadership.humanLeaderCode)
      .limit(pageSize)
      .offset(offset);

    const enriched = [];
    for (const r of rows) {
      const [{ directs }] = await db
        .select({ directs: count() })
        .from(personLeadership)
        .where(
          and(
            eq(personLeadership.directLeaderPersonId, r.personId),
            eq(personLeadership.status, "active"),
          ),
        );
      const [{ descendants }] = await db
        .select({ descendants: count() })
        .from(leadershipClosure)
        .where(
          and(
            eq(leadershipClosure.ancestorPersonId, r.personId),
            sql`${leadershipClosure.depth} > 0`,
          ),
        );
      enriched.push({
        lider: formatFullName(r.firstName, r.lastName),
        codigo: r.code,
        estado: r.status,
        directos: Number(directs),
        progreso12: `${Number(directs)} / 12`,
        descendientes: Number(descendants),
      });
    }
    return { type, total: Number(total), page, pageSize, rows: enriched };
  }

  if (type === "formation") {
    const scopeSql =
      scope.mode === "subtree" && scope.rootPersonId
        ? sql`${personProcessProgress.personId} IN (
            SELECT descendant_person_id FROM leadership_closure
            WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
          )`
        : scope.mode === "ministry" && scope.ministryIds.length
          ? sql`${personProcessProgress.ministryId} IN (${sql.join(
              scope.ministryIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : undefined;
    const where = scopeSql;
    const [{ total }] = await db
      .select({ total: count() })
      .from(personProcessProgress)
      .where(where);
    const rows = await db
      .select({
        personId: personProcessProgress.personId,
        processType: personProcessProgress.processType,
        status: personProcessProgress.status,
        stage: personProcessProgress.stage,
        firstName: persons.firstName,
        lastName: persons.lastName,
      })
      .from(personProcessProgress)
      .innerJoin(persons, eq(persons.id, personProcessProgress.personId))
      .where(where)
      .orderBy(desc(personProcessProgress.updatedAt))
      .limit(pageSize)
      .offset(offset);

    return {
      type,
      total: Number(total),
      page,
      pageSize,
      rows: rows.map((r) => ({
        persona: formatFullName(r.firstName, r.lastName),
        etapa: r.processType,
        estado: r.status,
        stage: r.stage,
      })),
    };
  }

  // transfers
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
  const where = scopeSql;
  const [{ total }] = await db
    .select({ total: count() })
    .from(pastoralTransferRequests)
    .where(where);
  const rows = await db
    .select({
      id: pastoralTransferRequests.id,
      personId: pastoralTransferRequests.personId,
      transferType: pastoralTransferRequests.transferType,
      status: pastoralTransferRequests.status,
      sourceMinistryId: pastoralTransferRequests.sourceMinistryId,
      destinationMinistryId: pastoralTransferRequests.destinationMinistryId,
      createdAt: pastoralTransferRequests.createdAt,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(pastoralTransferRequests)
    .innerJoin(persons, eq(persons.id, pastoralTransferRequests.personId))
    .where(where)
    .orderBy(desc(pastoralTransferRequests.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    type,
    total: Number(total),
    page,
    pageSize,
    rows: rows.map((r) => ({
      persona: formatFullName(r.firstName, r.lastName),
      tipo: r.transferType,
      estado: r.status,
      origenMinistryId: r.sourceMinistryId,
      destinoMinistryId: r.destinationMinistryId,
      fecha: r.createdAt?.toISOString?.() ?? String(r.createdAt),
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
