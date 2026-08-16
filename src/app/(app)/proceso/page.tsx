import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard, KpiCard, SectionHeader, StatGroup } from "@/components/dashboard";
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

export const metadata = { title: "Escalera del Éxito" };

type Search = Promise<{ tipo?: string; estado?: string }>;

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

  const counts = await getProcessDashboardCounts(session.id);
  const people = await listProcessPeople(session.id, {
    processType,
    status,
    pageSize: 50,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Escalera del Éxito"
        description="GANAR → Consolidar (Pre → Encuentro → Post) → Discipular (CD1 → CD2 → Re-Encuentro → CD3 → EM1–3) → Enviar apto."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link href="/destino" className="text-sm font-medium underline">
              Capacitación Destino
            </Link>
            <Link href="/reencuentro" className="text-sm font-medium underline">
              Re-Encuentro
            </Link>
            <Link href="/escuela-ministerial" className="text-sm font-medium underline">
              Escuela Ministerial
            </Link>
          </div>
        }
      />

      <section className="space-y-3" aria-labelledby="pre-encuentro">
        <SectionHeader
          id="pre-encuentro"
          eyebrow="01"
          title="Pre-Encuentro"
          description="Primera etapa de Consolidar."
        />
        <StatGroup columns={2} aria-label="Pre-Encuentro">
          <KpiCard label="En Pre-Encuentro" value={counts.preEncuentro} />
        </StatGroup>
      </section>

      <section className="space-y-3" aria-labelledby="encuentro">
        <SectionHeader
          id="encuentro"
          eyebrow="02"
          title="Encuentro"
          description="Segunda etapa de Consolidar."
        />
        <StatGroup columns={2} aria-label="Encuentro">
          <KpiCard label="En Encuentro" value={counts.encuentro} />
        </StatGroup>
      </section>

      <section className="space-y-3" aria-labelledby="post-encuentro">
        <SectionHeader
          id="post-encuentro"
          eyebrow="03"
          title="Post-Encuentro"
          description="Cierre de Consolidar antes de Discipular."
        />
        <StatGroup columns={2} aria-label="Post-Encuentro">
          <KpiCard label="En Post-Encuentro" value={counts.postEncuentro} />
          <KpiCard label="Consolidar completado" value={counts.consolidarCompleted} />
        </StatGroup>
      </section>

      <section className="space-y-3" aria-labelledby="discipular">
        <SectionHeader
          id="discipular"
          eyebrow="Discipular"
          title="Capacitación Destino · Re-Encuentro · EM"
          description="Avance en CD, Re-Encuentro y Escuela Ministerial."
        />
        <StatGroup columns={4} aria-label="Discipular">
          <KpiCard label="CD1" value={counts.cd1} />
          <KpiCard label="CD2" value={counts.cd2} />
          <KpiCard label="Re-Encuentro" value={counts.reencuentro} />
          <KpiCard label="CD3" value={counts.cd3} />
          <KpiCard label="EM1" value={counts.em1} />
          <KpiCard label="EM2" value={counts.em2} />
          <KpiCard label="EM3" value={counts.em3} />
          <KpiCard label="Aptos CD1" value={counts.aptosCd1} />
        </StatGroup>
      </section>

      <DataCard className="space-y-4">
        <SectionHeader title="Personas en proceso" description="Filtra por etapa y estado." />
        <form className="flex flex-wrap gap-2 text-sm">
          <select
            name="tipo"
            defaultValue={processType ?? ""}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          >
            <option value="">Todas las etapas</option>
            <option value="consolidar">Consolidar</option>
            <option value="udv">Universidad de la Vida</option>
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
