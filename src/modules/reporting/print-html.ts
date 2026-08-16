/**
 * Printable HTML report — used for Imprimir / PDF via browser print.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function rowsToPrintHtml(opts: {
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
}): string {
  const headCells = opts.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = opts.rows
    .map((row) => {
      const cells = opts.headers
        .map((h) => `<td>${escapeHtml(row[h] ?? "—")}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>MULTIPLICA — ${escapeHtml(opts.reportTitle)}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; color: #111; background: #fff; margin: 24px; }
    h1 { font-family: Archivo, Inter, sans-serif; font-size: 28px; margin: 0 0 4px; }
    .brand { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #5f5f5a; }
    .meta { font-size: 13px; color: #5f5f5a; margin: 12px 0 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #d4d2ca; text-align: left; padding: 8px 6px; vertical-align: top; }
    th { font-weight: 600; color: #5f5f5a; }
    @media print { body { margin: 12mm; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <p class="brand">MULTIPLICA</p>
  <h1>${escapeHtml(opts.reportTitle)}</h1>
  <div class="meta">
    Generado: ${escapeHtml(opts.meta.generatedAt)} · Scope: ${escapeHtml(opts.meta.scopeMode)} · Vista: ${escapeHtml(opts.meta.roleView)}
    ${opts.meta.ministryId ? ` · Ministerio: ${escapeHtml(opts.meta.ministryId)}` : ""}
    ${opts.meta.networkId ? ` · Red: ${escapeHtml(opts.meta.networkId)}` : ""}
    ${opts.meta.rootPersonId ? ` · Raíz: ${escapeHtml(opts.meta.rootPersonId)}` : ""}
    · Filas: ${opts.rows.length}
  </div>
  <p class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></p>
  <table>
    <thead><tr>${headCells}</tr></thead>
    <tbody>${body || `<tr><td colspan="${opts.headers.length}">Sin datos en el alcance actual</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}
