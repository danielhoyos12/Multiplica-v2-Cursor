import Link from "next/link";
import { redirect } from "next/navigation";

import { ExportCsvButton } from "@/components/reporting/export-csv-button";
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
  const canExport = hasPermission(auth, "reports.export") || hasPermission(auth, "dashboard.read");
  const totalPages = Math.max(1, Math.ceil(report.total / report.pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes operativos"
        description="Mismos scopes que el dashboard. Sin prayer_request. CSV sanitizado."
        actions={
          <Link href="/dashboard" className="text-sm underline">
            Dashboard
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Link
            key={t.id}
            href={`/reportes?tipo=${t.id}`}
            className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
              t.id === type
                ? "bg-[var(--brand)] text-white"
                : "border border-[var(--border)] bg-[var(--surface)]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <StatusBadge label={`${report.total} filas`} tone="brand" />
        {canExport ? (
          <ExportCsvButton
            type={type}
            ministryId={params.ministerio ?? ""}
            networkId={params.red ?? ""}
            rootPersonId={params.raiz ?? ""}
          />
        ) : null}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
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
              <tr key={i} className="border-b border-[var(--border)]/60">
                {headers.map((h) => (
                  <td key={h} className="px-2 py-2">
                    {String(row[h] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {report.rows.map((row, i) => (
          <li
            key={i}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
          >
            {headers.map((h) => (
              <p key={h}>
                <span className="text-[var(--muted)]">{h}: </span>
                {String(row[h] ?? "—")}
              </p>
            ))}
          </li>
        ))}
      </ul>

      {report.rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">NO_DATA — sin filas en este scope.</p>
      ) : null}

      <div className="flex gap-3 text-sm">
        {page > 1 ? (
          <Link href={`/reportes?tipo=${type}&page=${page - 1}`} className="underline">
            Anterior
          </Link>
        ) : null}
        <span>
          Página {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={`/reportes?tipo=${type}&page=${page + 1}`} className="underline">
            Siguiente
          </Link>
        ) : null}
      </div>
    </div>
  );
}
