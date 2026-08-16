import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { DataCard, KpiCard, StatGroup } from "@/components/dashboard";
import { CellFilters } from "@/components/cells/filters";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
import {
  cellStatusLabel,
  cellTypeLabel,
  listCatalogsForCells,
  listCellsForActor,
} from "@/modules/cells";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Células" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildQuery(sp: Record<string, string | string[] | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const key of ["q", "ministryId", "networkId", "status", "type"]) {
    const value = one(sp[key]);
    if (value) next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

export default async function CelulasPage({ searchParams }: { searchParams: SearchParams }) {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "cells.read")) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const page = Number(one(sp.page) ?? "1") || 1;
  const result = await listCellsForActor(session.id, {
    q: one(sp.q),
    ministryId: one(sp.ministryId),
    networkId: one(sp.networkId),
    status: one(sp.status) as "active" | "inactive" | "closed" | undefined,
    type: one(sp.type) as "evangelistic" | "twelve" | undefined,
    page,
    pageSize: 20,
  });
  const catalogs = await listCatalogsForCells(session.id);
  const canCreate = hasPermission(auth, "cells.create");
  const global = isSuperadmin(auth);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Células"
        description="Núcleo operativo: horarios, miembros desde GANAR y asistencia semanal."
        actions={
          canCreate ? (
            <Link
              href="/celulas/nueva"
              className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm font-medium text-white"
            >
              Nueva célula
            </Link>
          ) : null
        }
      />

      <StatGroup columns={4} aria-label="Resumen células" className="lg:grid-cols-5">
        <KpiCard label="Visibles" value={result.stats.total} />
        <KpiCard label="Activas" value={result.stats.active} />
        <KpiCard label="Evangelísticas" value={result.stats.evangelistic} />
        <KpiCard label="De 12" value={result.stats.twelve} />
        <KpiCard
          label="Asist. reciente"
          value={
            result.stats.recentAttendanceAvg === null
              ? "Sin datos"
              : `${result.stats.recentAttendanceAvg}%`
          }
        />
      </StatGroup>

      <Suspense fallback={null}>
        <CellFilters
          ministries={catalogs.ministries}
          networks={catalogs.networks}
          showMinistryFilter={global || catalogs.ministries.length > 1}
        />
      </Suspense>

      {result.rows.length === 0 ? (
        <EmptyState
          title="Sin células"
          description="Crea la primera célula evangelística de tu Ministerio."
          action={
            canCreate ? (
              <Link
                href="/celulas/nueva"
                className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm font-medium text-white"
              >
                Nueva célula
              </Link>
            ) : null
          }
        />
      ) : (
        <DataCard className="space-y-3">
          <ul className="space-y-3">
            {result.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/celulas/${row.id}`}
                  className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper-100)]/40 p-4 transition-colors hover:bg-[var(--surface-soft)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--ink)]">{row.name}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {row.responsibleName ?? "Sin responsable"} · {row.networkName}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {row.scheduleLabel} · {row.activeMembers} miembros
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge label={cellTypeLabel(row.type)} tone="brand" />
                      <StatusBadge
                        label={cellStatusLabel(row.status)}
                        tone={row.status === "active" ? "success" : "warning"}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            sp={sp}
          />
        </DataCard>
      )}
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  sp,
}: {
  page: number;
  pageSize: number;
  total: number;
  queryBase?: string;
  sp: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex gap-2 text-sm">
      {page > 1 ? (
        <Link href={`/celulas${buildQuery(sp, page - 1)}`} className="underline">
          Anterior
        </Link>
      ) : null}
      <span className="text-[var(--muted)]">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Link href={`/celulas${buildQuery(sp, page + 1)}`} className="underline">
          Siguiente
        </Link>
      ) : null}
    </div>
  );
}
