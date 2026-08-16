import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard } from "@/components/dashboard/data-card";
import { SectionHeader } from "@/components/dashboard/section-header";
import { ExportMenu } from "@/components/reporting/export-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import { runReport, type ReportType } from "@/modules/reporting";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Reportes" };

type Search = Promise<{
  tipo?: string;
  page?: string;
  ministerio?: string;
  red?: string;
  raiz?: string;
}>;

const TYPES: Array<{ id: ReportType; label: string }> = [
  { id: "persons", label: "Personas" },
  { id: "cells", label: "Células" },
  { id: "leadership", label: "Liderazgo" },
  { id: "formation", label: "Formación" },
  { id: "transfers", label: "Transferencias" },
];

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "reports.read") && !hasPermission(auth, "dashboard.read")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const type = (TYPES.find((t) => t.id === params.tipo)?.id ?? "persons") as ReportType;
  const page = Number(params.page ?? "1") || 1;

  const report = await runReport(session.id, type, {
    page,
    pageSize: 40,
    ministryId: params.ministerio || null,
    networkId: params.red || null,
    rootPersonId: params.raiz || null,
  });

  const headers = report.rows[0] ? Object.keys(report.rows[0]) : [];
  const canExport = hasPermission(auth, "reports.export");
  const totalPages = Math.max(1, Math.ceil(report.total / report.pageSize));

  function hrefFor(next: { tipo?: string; page?: string }) {
    const q = new URLSearchParams();
    q.set("tipo", next.tipo ?? type);
    q.set("page", next.page ?? String(page));
    if (params.ministerio) q.set("ministerio", params.ministerio);
    if (params.red) q.set("red", params.red);
    if (params.raiz) q.set("raiz", params.raiz);
    return `/reportes?${q.toString()}`;
  }

  return (
    <div className="space-y-8 print:space-y-4">
      <div className="print:hidden">
        <PageHeader
          title="Reportes"
          description="Herramienta de gestión (05). Mismos scopes y permisos que el dashboard. Sin datos de oración."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label="Gestión" tone="neutral" />
              <Link
                href="/dashboard"
                className="text-sm text-[var(--cobalt)] underline-offset-4 hover:underline"
              >
                Dashboard
              </Link>
            </div>
          }
        />
      </div>

      <div className="hidden print:block">
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">MULTIPLICA</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl">
          Reporte · {TYPES.find((t) => t.id === type)?.label}
        </h1>
      </div>

      <form
        method="get"
        className="print:hidden flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"
        aria-label="Filtros de reporte"
      >
        <input type="hidden" name="tipo" value={type} />
        {params.raiz ? <input type="hidden" name="raiz" value={params.raiz} /> : null}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de reporte">
          {TYPES.map((t) => (
            <Link
              key={t.id}
              href={hrefFor({ tipo: t.id, page: "1" })}
              role="tab"
              aria-selected={t.id === type}
              className={
                t.id === type
                  ? "rounded-[var(--radius-sm)] bg-[var(--cobalt)] px-3 py-2 text-sm text-white"
                  : "rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              }
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="ministerio" className="mb-1 block text-xs text-[var(--muted)]">
              Ministerio (id)
            </label>
            <input
              id="ministerio"
              name="ministerio"
              defaultValue={params.ministerio ?? ""}
              className="neo-touch rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
              placeholder="Opcional"
            />
          </div>
          <div>
            <label htmlFor="red" className="mb-1 block text-xs text-[var(--muted)]">
              Red (id)
            </label>
            <input
              id="red"
              name="red"
              defaultValue={params.red ?? ""}
              className="neo-touch rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
              placeholder="Opcional"
            />
          </div>
          <button
            type="submit"
            className="neo-touch rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-4 py-2 text-sm font-medium text-white"
          >
            Aplicar
          </button>
        </div>
      </form>

      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <SectionHeader
          title={TYPES.find((t) => t.id === type)?.label ?? "Reporte"}
          description={`${report.total} fila${report.total === 1 ? "" : "s"} en alcance`}
        />
        {canExport ? (
          <ExportMenu
            type={type}
            ministryId={params.ministerio ?? ""}
            networkId={params.red ?? ""}
            rootPersonId={params.raiz ?? ""}
          />
        ) : null}
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          title="Sin resultados en este alcance"
          description="Ajusta filtros o tipo de reporte. La exportación también reflejará este estado vacío."
        />
      ) : (
        <>
          <DataCard className="hidden overflow-x-auto md:block print:block" padding="sm">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  {headers.map((h) => (
                    <th key={h} className="px-2 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/60 hover:bg-[var(--rice)]/50">
                    {headers.map((h) => (
                      <td key={h} className="px-2 py-2">
                        {String(row[h] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>

          <ul className="space-y-2 md:hidden print:hidden">
            {report.rows.map((row, i) => (
              <li
                key={i}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm shadow-[var(--shadow-card)]"
              >
                {headers.map((h) => (
                  <p
                    key={h}
                    className="flex justify-between gap-2 border-b border-[var(--border)]/40 py-1 last:border-0"
                  >
                    <span className="text-[var(--muted)]">{h}</span>
                    <span className="text-right">{String(row[h] ?? "—")}</span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="print:hidden flex flex-wrap items-center gap-3 text-sm">
        {page > 1 ? (
          <Link href={hrefFor({ page: String(page - 1) })} className="text-[var(--cobalt)] underline">
            Anterior
          </Link>
        ) : null}
        <span>
          Página {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={hrefFor({ page: String(page + 1) })} className="text-[var(--cobalt)] underline">
            Siguiente
          </Link>
        ) : null}
      </div>
    </div>
  );
}
