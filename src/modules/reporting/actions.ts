"use server";

import { DomainError, isDomainError } from "@/lib/errors";
import {
  exportReportCsv,
  exportReportPrintHtml,
  exportReportXlsx,
  type ReportType,
} from "@/modules/reporting";
import { requireAppActor } from "@/server/actor";

export type ExportFormat = "csv" | "xlsx" | "pdf" | "print";

function filtersFromForm(formData: FormData) {
  return {
    type: String(formData.get("type") ?? "persons") as ReportType,
    ministryId: String(formData.get("ministryId") || "") || null,
    networkId: String(formData.get("networkId") || "") || null,
    rootPersonId: String(formData.get("rootPersonId") || "") || null,
  };
}

function fail(e: unknown) {
  if (isDomainError(e) || e instanceof DomainError) {
    return {
      ok: false as const,
      error: (e as DomainError).message,
      code: (e as DomainError).code,
    };
  }
  console.error(e);
  return { ok: false as const, error: "Error al exportar.", code: "UNKNOWN" };
}

export async function exportReportAction(formData: FormData) {
  try {
    const { session } = await requireAppActor();
    const f = filtersFromForm(formData);
    const { csv, rowCount } = await exportReportCsv(session.id, f.type, f);
    return { ok: true as const, csv, rowCount, type: f.type, format: "csv" as const };
  } catch (e) {
    return fail(e);
  }
}

export async function exportReportFormatAction(formData: FormData) {
  try {
    const { session } = await requireAppActor();
    const f = filtersFromForm(formData);
    const format = String(formData.get("format") ?? "csv") as ExportFormat;

    if (format === "csv") {
      const { csv, rowCount } = await exportReportCsv(session.id, f.type, f);
      return {
        ok: true as const,
        format: "csv" as const,
        csv,
        rowCount,
        type: f.type,
      };
    }

    if (format === "xlsx") {
      const { buffer, rowCount, filename } = await exportReportXlsx(
        session.id,
        f.type,
        f,
      );
      return {
        ok: true as const,
        format: "xlsx" as const,
        base64: buffer.toString("base64"),
        filename,
        rowCount,
        type: f.type,
      };
    }

    const { html, rowCount } = await exportReportPrintHtml(session.id, f.type, f);
    return {
      ok: true as const,
      format: format === "pdf" ? ("pdf" as const) : ("print" as const),
      html,
      rowCount,
      type: f.type,
    };
  } catch (e) {
    return fail(e);
  }
}
