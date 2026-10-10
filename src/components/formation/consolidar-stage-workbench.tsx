import Link from "next/link";

import { DataCard, KpiCard, SectionHeader, StatGroup } from "@/components/dashboard";
import type { ConsolidarStageConfig } from "@/components/formation/consolidar-stage-config";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  activateConsolidarCycleAction,
  completeConsolidarStageAction,
  createConsolidarCycleAction,
} from "@/modules/formation/actions";

type Counts = {
  aptos: number;
  inProgress: number;
  completed: number;
};

type EligibleRow = {
  personId: string;
  fullName: string;
  status: string;
  statusLabel: string;
  bucket: "apto" | "inscrito" | "en_curso" | "pendiente";
};

type CycleRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
};

type Props = {
  config: ConsolidarStageConfig;
  counts: Counts;
  eligible: EligibleRow[];
  cycles: CycleRow[];
  canManageCycles: boolean;
  canApprove: boolean;
};

export function ConsolidarStageWorkbench({
  config,
  counts,
  eligible,
  cycles,
  canManageCycles,
  canApprove,
}: Props) {
  const aptos = eligible.filter((e) => e.bucket === "apto");
  const enCurso = eligible.filter((e) => e.bucket === "en_curso");
  const pendientes = eligible.filter((e) => e.bucket === "pendiente");

  return (
    <div className="space-y-8">
      <PageHeader
        title={config.title}
        description={`${config.description} ${config.classHint}`}
        actions={
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/proceso" className="font-medium underline">
              Hub Consolidar
            </Link>
            <Link href="/destino" className="underline">
              Discipular · Destino
            </Link>
          </div>
        }
      />

      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{config.eyebrow}</p>

      <nav className="print:hidden flex flex-wrap gap-2 text-sm" aria-label="Etapas UDLV">
        {(
          [
            ["/proceso/pre", "Pre-Encuentro"],
            ["/proceso/encuentro", "Encuentro"],
            ["/proceso/post", "Post-Encuentro"],
          ] as const
        ).map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={
              href === config.href
                ? "rounded-[var(--radius-sm)] bg-[var(--cobalt)] px-2 py-1 text-white"
                : "rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1"
            }
          >
            {label}
          </Link>
        ))}
      </nav>

      <StatGroup columns={3} aria-label={`Resumen ${config.title}`}>
        <KpiCard label="Aptos" value={counts.aptos} />
        <KpiCard label="En curso / inscritos" value={counts.inProgress} />
        <KpiCard label="Aprobados" value={counts.completed} />
      </StatGroup>

      <DataCard className="space-y-3">
        <SectionHeader
          title="Bandeja operativa"
          description="Apto ≠ inscrito. Habilitar etapa no matricula en un ciclo concreto."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <BucketList title="Aptos" rows={aptos} empty="Nadie apto en tu alcance." />
          <BucketList title="En curso" rows={enCurso} empty="Sin personas en curso." />
          <BucketList title="Pendientes" rows={pendientes} empty="Sin pendientes." />
        </div>
      </DataCard>

      {canManageCycles ? (
        <DataCard className="space-y-3">
          <SectionHeader
            title={`Crear ciclo · ${config.title}`}
            description="Fechas reales del ciclo; no se asume duración fija."
          />
          <form
            action={async (formData) => {
              "use server";
              await createConsolidarCycleAction({
                stage: config.stage,
                name: String(formData.get("name") ?? ""),
                startDate: String(formData.get("startDate") ?? ""),
                endDate: String(formData.get("endDate") ?? ""),
                ministryId: String(formData.get("ministryId") ?? "") || null,
              });
            }}
            className="space-y-3"
          >
            <input
              name="name"
              required
              placeholder={`Ej. ${config.title} · ${new Date().getFullYear()}`}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="date"
                name="startDate"
                required
                className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
              />
              <input
                type="date"
                name="endDate"
                required
                className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm text-white"
            >
              Crear ciclo
            </button>
          </form>
        </DataCard>
      ) : null}

      <DataCard className="space-y-3">
        <SectionHeader
          title="Ciclos / eventos"
          description="Inscripción y asistencia grupal se gestionan dentro de cada ciclo."
        />
        {cycles.length === 0 ? (
          <EmptyState title="Sin ciclos" description={`Aún no hay ciclos de ${config.title}.`} />
        ) : (
          <ul className="space-y-2">
            {cycles.map((cycle) => (
              <li
                key={cycle.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper-100)]/40 px-4 py-3"
              >
                <div>
                  <Link href={`/proceso/ciclo/${cycle.id}`} className="font-medium underline">
                    {cycle.name}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {cycle.startDate} → {cycle.endDate}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={cycle.status} tone="brand" />
                  {canManageCycles && cycle.status === "planned" ? (
                    <form
                      action={async () => {
                        "use server";
                        await activateConsolidarCycleAction(cycle.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs"
                      >
                        Activar
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      {canApprove ? (
        <DataCard className="space-y-3">
          <SectionHeader
            title="Aprobación autorizada"
            description={`${config.nextHint} Si faltan requisitos, el sistema rechazará la acción con el motivo.`}
          />
          <ul className="space-y-2">
            {enCurso.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">
                No hay personas en curso listas para aprobación en tu alcance.
              </li>
            ) : (
              enCurso.map((row) => (
                <li
                  key={row.personId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3 text-sm"
                >
                  <div>
                    <Link href={`/ganar/${row.personId}`} className="font-medium underline">
                      {row.fullName}
                    </Link>
                    <p className="text-[var(--muted)]">{row.statusLabel}</p>
                  </div>
                  <form
                    action={async () => {
                      "use server";
                      await completeConsolidarStageAction({
                        personId: row.personId,
                        stage: config.stage,
                      });
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-[var(--radius-sm)] bg-[var(--cobalt)] px-3 py-2 text-xs text-white"
                    >
                      {config.approveLabel}
                    </button>
                  </form>
                </li>
              ))
            )}
          </ul>
        </DataCard>
      ) : null}
    </div>
  );
}

function BucketList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: EligibleRow[];
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">
        {title}{" "}
        <span className="text-[var(--muted)]">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.slice(0, 20).map((row) => (
            <li key={row.personId} className="flex justify-between gap-2">
              <Link href={`/ganar/${row.personId}`} className="underline">
                {row.fullName}
              </Link>
              <span className="text-[var(--muted)]">{row.statusLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
