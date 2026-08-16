import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { DataCard, KpiCard, StatGroup } from "@/components/dashboard";
import { GanarFilters } from "@/components/ganar/filters";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
import {
  getMinistryNetworkMaps,
  listCatalogsForGanar,
  listPersonsForActor,
} from "@/modules/ganar";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "GANAR" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function GanarPage({ searchParams }: { searchParams: SearchParams }) {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "persons.read")) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const page = Number(one(sp.page) ?? "1") || 1;
  const result = await listPersonsForActor(session.id, {
    q: one(sp.q),
    ministryId: one(sp.ministryId),
    networkId: one(sp.networkId),
    districtId: one(sp.districtId),
    from: one(sp.from),
    to: one(sp.to),
    page,
    pageSize: 20,
  });

  const catalogs = await listCatalogsForGanar(session.id);
  const maps = await getMinistryNetworkMaps();
  const canWrite = hasPermission(auth, "persons.write");
  const global = isSuperadmin(auth);

  const byNetworkLabel = result.stats.byNetwork.map((row) => ({
    name: maps.networkById[row.networkId]?.name ?? row.networkId,
    count: row.count,
  }));

  const publicLinkBase = "/ganar/registro";

  return (
    <div className="space-y-8">
      <PageHeader
        title="GANAR"
        description="Fuente única de verdad de personas. Registro, búsqueda y pertenencia organizacional inicial."
        actions={
          <div className="flex flex-wrap gap-2">
            {canWrite ? (
              <Link
                href="/ganar/nueva"
                className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm font-medium text-white"
              >
                Agregar persona
              </Link>
            ) : null}
            <Link
              href={publicLinkBase}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--ink)]"
              target="_blank"
            >
              Formulario público
            </Link>
          </div>
        }
      />

      <StatGroup columns={4} aria-label="Resumen GANAR">
        <KpiCard label="Personas visibles" value={result.stats.total} />
        <KpiCard label="Esta semana" value={result.stats.week} />
        <KpiCard label="Este mes" value={result.stats.month} />
        <DataCard padding="sm" className="flex flex-col justify-center">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
            Por Red
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {byNetworkLabel.length === 0 ? (
              <li className="text-[var(--muted)]">Sin datos</li>
            ) : (
              byNetworkLabel.map((n) => (
                <li key={n.name} className="flex justify-between gap-2">
                  <span>{n.name}</span>
                  <span className="font-[family-name:var(--font-display)] tabular-nums font-medium">
                    {n.count}
                  </span>
                </li>
              ))
            )}
          </ul>
        </DataCard>
      </StatGroup>

      <Suspense fallback={null}>
        <GanarFilters
          ministries={catalogs.ministries}
          networks={catalogs.networks}
          districts={catalogs.districts}
          showMinistryFilter={global || catalogs.ministries.length > 1}
        />
      </Suspense>

      {result.rows.length === 0 ? (
        <EmptyState
          title="Sin personas todavía"
          description="Registra la primera persona desde el formulario interno o comparte el link público."
          action={
            canWrite ? (
              <Link
                href="/ganar/nueva"
                className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm font-medium text-white"
              >
                Agregar persona
              </Link>
            ) : null
          }
        />
      ) : (
        <DataCard className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            {result.total} resultado{result.total === 1 ? "" : "s"} · página {result.page}
          </p>
          <DataTable
            rows={result.rows}
            getRowId={(row) => row.id}
            columns={[
              {
                key: "name",
                header: "Nombre",
                cell: (row) => (
                  <Link
                    href={`/ganar/${row.id}`}
                    className="font-medium text-[var(--brand-ink)] underline-offset-2 hover:underline"
                  >
                    {row.fullName}
                  </Link>
                ),
              },
              { key: "phone", header: "Teléfono", cell: (row) => row.phone ?? "—" },
              {
                key: "ministry",
                header: "Ministerio",
                cell: (row) => row.ministryName ?? "—",
              },
              { key: "network", header: "Red", cell: (row) => row.networkName ?? "—" },
              {
                key: "district",
                header: "Distrito",
                cell: (row) => row.districtName ?? "—",
              },
              {
                key: "prayer",
                header: "Oración",
                cell: (row) =>
                  row.hasPrayerRequest ? (
                    <StatusBadge label="Sí" tone="brand" />
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  ),
              },
              {
                key: "date",
                header: "Ingreso",
                cell: (row) =>
                  new Date(row.registeredAt).toLocaleDateString("es-PE", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }),
              },
            ]}
          />
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

function buildGanarQuery(
  sp: Record<string, string | string[] | undefined>,
  page: number,
) {
  const next = new URLSearchParams();
  for (const key of ["q", "ministryId", "networkId", "districtId", "from", "to"]) {
    const value = Array.isArray(sp[key]) ? sp[key][0] : sp[key];
    if (value) next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const qs = next.toString();
  return qs ? `?${qs}` : "";
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
  sp: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex gap-2 text-sm">
      {page > 1 ? (
        <Link href={`/ganar${buildGanarQuery(sp, page - 1)}`} className="underline">
          Anterior
        </Link>
      ) : null}
      <span className="text-[var(--muted)]">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Link href={`/ganar${buildGanarQuery(sp, page + 1)}`} className="underline">
          Siguiente
        </Link>
      ) : null}
    </div>
  );
}
