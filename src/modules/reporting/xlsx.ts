/**
 * XLSX export — same scoped rows as CSV. No query changes.
 */
import ExcelJS from "exceljs";

export async function rowsToXlsxBuffer(opts: {
  reportTitle: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  meta: {
    scopeMode: string;
    roleView: string;
    generatedAt: string;
    ministryId: string | null;
    networkId: string | null;
    rootPersonId: string | null;
  };
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MULTIPLICA";
  wb.created = new Date(opts.meta.generatedAt);

  const cover = wb.addWorksheet("Resumen");
  cover.getColumn(1).width = 28;
  cover.getColumn(2).width = 48;
  cover.addRow(["MULTIPLICA"]);
  cover.addRow(["Reporte", opts.reportTitle]);
  cover.addRow(["Generado", opts.meta.generatedAt]);
  cover.addRow(["Scope", opts.meta.scopeMode]);
  cover.addRow(["Vista", opts.meta.roleView]);
  if (opts.meta.ministryId) cover.addRow(["Ministerio", opts.meta.ministryId]);
  if (opts.meta.networkId) cover.addRow(["Red", opts.meta.networkId]);
  if (opts.meta.rootPersonId) cover.addRow(["Raíz", opts.meta.rootPersonId]);
  cover.addRow(["Filas", opts.rows.length]);

  const sheet = wb.addWorksheet("Datos");
  sheet.addRow(opts.headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of opts.rows) {
    sheet.addRow(
      opts.headers.map((h) => {
        const v = row[h];
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return v as string | number | boolean | Date;
      }),
    );
  }
  opts.headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = Math.min(
      40,
      Math.max(12, String(opts.headers[i]).length + 4),
    );
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
