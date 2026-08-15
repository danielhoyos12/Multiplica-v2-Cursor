"use server";

import { DomainError, isDomainError } from "@/lib/errors";
import { exportReportCsv, type ReportType } from "@/modules/reporting";
import { requireAppActor } from "@/server/actor";

export async function exportReportAction(formData: FormData) {
  try {
    const { session } = await requireAppActor();
    const type = String(formData.get("type") ?? "persons") as ReportType;
    const ministryId = String(formData.get("ministryId") || "") || null;
    const networkId = String(formData.get("networkId") || "") || null;
    const rootPersonId = String(formData.get("rootPersonId") || "") || null;
    const { csv, rowCount } = await exportReportCsv(session.id, type, {
      ministryId,
      networkId,
      rootPersonId,
    });
    return { ok: true as const, csv, rowCount, type };
  } catch (e) {
    if (isDomainError(e) || e instanceof DomainError) {
      return { ok: false as const, error: (e as DomainError).message, code: (e as DomainError).code };
    }
    console.error(e);
    return { ok: false as const, error: "Error al exportar.", code: "UNKNOWN" };
  }
}
