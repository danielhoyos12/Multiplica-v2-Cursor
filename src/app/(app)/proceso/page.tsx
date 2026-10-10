import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard, KpiCard, SectionHeader, StatGroup } from "@/components/dashboard";
import { ProcesoEtapaFocus } from "@/components/formation/proceso-etapa-focus";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import {
  getProcessDashboardCounts,
  listProcessPeople,
  statusLabel,
} from "@/modules/formation";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Consolidar · Universidad de la Vida" };

type Search = Promise<{ tipo?: string; estado?: string; etapa?: string }>;

const ETAPA_VALUES = new Set(["pre", "encuentro", "post"]);

export default async function ProcesoPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const processType =
    params.tipo === "udv" || params.tipo === "consolidar" ? params.tipo : undefined;
  const status = params.estado || undefined;
  const etapa =
    params.etapa && ETAPA_VALUES.has(params.etapa) ? params.etapa : null;

  const counts = await getProcessDashboardCounts(session.id);
  const people = await listProcessPeople(session.id, {
    processType,
    status,
    pageSize: 50,
  });

  return (
    <div className="space-y-8">
      <ProcesoEtapaFocus etapa={etapa} />
      <PageHeader
        title="Consolidar"
        description="Universidad de la Vida (UDLV): Pre-Encuentro → Encuentro → Post-Encuentro. Capacitación Destino y Escuela de Líderes viven en Discipular."
        actions={
          <Link href="/discipular" className="text-sm font-medium underline">
            Ir a Discipular
          </Link>
        }
      />

      <div className="print:hidden flex flex-wrap gap-2 text-sm">
        <span className="text-[var(--muted)]">Abrir submódulo UDLV:</span>
        {(
          [
            ["/proceso/pre", "Pre-Encuentro", "pre"],
            ["/proceso/encuentro", "Encuentro", "encuentro"],
            ["/proceso/post", "Post-Encuentro", "post"],
          ] as const
        ).map(([href, label, key]) => (
          <Link
            key={key}
            href={href}
            className={
              etapa === key
                ? "rounded-[var(--radius-sm)] bg-[var(--cobalt)] px-2 py-1 text-white"
                : "rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1"
            }
          >
            {label}
          </Link>
        ))}
      </div>

      <section className="space-y-3" aria-labelledby="udlv-resumen">
        <SectionHeader
          id="udlv-resumen"
          eyebrow="Universidad de la Vida"
          title="Resumen Consolidar"
          description="Indicadores propios de UDLV. No incluye Capacitación Destino ni Escuela Ministerial."
        />
        <StatGroup columns={3} aria-label="Resumen Universidad de la Vida">
          <KpiCard label="Consolidar en curso" value={counts.consolidarInProgress} />
          <KpiCard label="Consolidar completado" value={counts.consolidarCompleted} />
          <KpiCard label="Consolidar pendiente" value={counts.consolidarPending} />
        </StatGroup>
      </section>

      <section className="space-y-3" aria-labelledby="pre-encuentro">
        <SectionHeader
          id="pre-encuentro"
          eyebrow="UDLV · 1"
          title="Pre-Encuentro"
          description="Primera etapa de Universidad de la Vida."
        />
        <StatGroup columns={2} aria-label="Pre-Encuentro">
          <KpiCard
            label="Inscritos / en curso"
            value={counts.preEncuentro}
            hint="Solo matrícula vigente en ciclos de Pre-Encuentro"
          />
        </StatGroup>
      </section>

      <section className="space-y-3" aria-labelledby="encuentro">
        <SectionHeader
          id="encuentro"
          eyebrow="UDLV · 2"
          title="Encuentro"
          description="Segunda etapa de Universidad de la Vida."
        />
        <StatGroup columns={2} aria-label="Encuentro">
          <KpiCard
            label="Inscritos / en curso"
            value={counts.encuentro}
            hint="Solo matrícula vigente en ciclos de Encuentro"
          />
        </StatGroup>
      </section>

      <section className="space-y-3" aria-labelledby="post-encuentro">
        <SectionHeader
          id="post-encuentro"
          eyebrow="UDLV · 3"
          title="Post-Encuentro"
          description="Cierre de UDLV. Solo entonces se habilita Capacitación Destino en Discipular."
        />
        <StatGroup columns={2} aria-label="Post-Encuentro">
          <KpiCard
            label="Inscritos / en curso"
            value={counts.postEncuentro}
            hint="Solo matrícula vigente en ciclos de Post-Encuentro"
          />
        </StatGroup>
      </section>

      <DataCard className="space-y-4">
        <SectionHeader
          title="Personas en Consolidar / UDLV"
          description="Filtra por tipo y estado del proceso Consolidar."
        />
        <form className="flex flex-wrap gap-2 text-sm">
          <select
            name="tipo"
            defaultValue={processType ?? ""}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          >
            <option value="">Consolidar y legacy UDV</option>
            <option value="consolidar">Consolidar (agregado)</option>
            <option value="udv">UDV legacy (catálogo)</option>
          </select>
          <select
            name="estado"
            defaultValue={status ?? ""}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En curso</option>
            <option value="completed">Completado</option>
            <option value="paused">Pausado</option>
          </select>
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-white"
          >
            Filtrar
          </button>
        </form>

        {people.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            description="No hay personas en proceso en tu alcance con estos filtros."
          />
        ) : (
          <ul className="space-y-2">
            {people.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper-100)]/40 px-4 py-3"
              >
                <div>
                  <Link href={`/ganar/${p.personId}`} className="font-medium underline">
                    {p.fullName}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {p.processType === "udv" ? "Universidad de la Vida" : "Consolidar"} ·{" "}
                    {p.currentStep ?? "—"}
                  </p>
                </div>
                <StatusBadge label={statusLabel(p.status)} tone="brand" />
              </li>
            ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}
