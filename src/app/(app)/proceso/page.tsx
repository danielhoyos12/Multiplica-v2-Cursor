import Link from "next/link";
import { redirect } from "next/navigation";

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
        description="GANAR → Consolidar → UDV → Destino → Escuela Ministerial → Re-Encuentro."
        actions={
          <div className="flex gap-3">
            <Link href="/escuela-ministerial" className="text-sm font-medium underline">
              Escuela Min.
            </Link>
            <Link href="/reencuentro" className="text-sm font-medium underline">
              Re-Encuentro
            </Link>
            <Link href="/destino" className="text-sm font-medium underline">
              Destino
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Consolidar pendiente" value={counts.consolidarPending} />
        <Kpi label="Consolidar en curso" value={counts.consolidarInProgress} />
        <Kpi label="Consolidar completado" value={counts.consolidarCompleted} />
        <Kpi label="UDV aptos" value={counts.udvEligible} />
        <Kpi label="UDV en curso" value={counts.udvInProgress} />
        <Kpi label="UDV completada" value={counts.udvCompleted} />
      </div>

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
          className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-white"
        >
          Filtrar
        </button>
      </form>

      <ul className="space-y-2">
        {people.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin resultados en tu alcance.</p>
        ) : (
          people.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
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
          ))
        )}
      </ul>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-medium">{value}</p>
    </div>
  );
}
