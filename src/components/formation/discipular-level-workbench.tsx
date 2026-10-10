import Link from "next/link";

import { DataCard, KpiCard, SectionHeader, StatGroup } from "@/components/dashboard";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  activateDestinoCycleAction,
  activateEmLevelCycleAction,
  createDestinoCycleAction,
  createEmLevelCycleAction,
} from "@/modules/formation/actions";

export type DiscipularLevelKind = "cd" | "em";

export type DiscipularLevelConfig = {
  kind: DiscipularLevelKind;
  level: 1 | 2 | 3;
  code: string;
  title: string;
  sequenceHint: string;
  ministerialObjective: string;
  hubHref: string;
};

type EligibleRow = {
  personId: string;
  fullName: string;
  levelStatus: string;
};

type CycleRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
};

type Props = {
  config: DiscipularLevelConfig;
  kpis: Array<{ label: string; value: number }>;
  eligible: EligibleRow[];
  cycles: CycleRow[];
  canManageCycles: boolean;
  canEnroll: boolean;
};

export function DiscipularLevelWorkbench({
  config,
  kpis,
  eligible,
  cycles,
  canManageCycles,
  canEnroll,
}: Props) {
  const cycleBase = config.kind === "cd" ? "/destino" : "/escuela-ministerial";

  return (
    <div className="space-y-8">
      <PageHeader
        title={config.title}
        description={`${config.sequenceHint} Avance académico y objetivo ministerial se registran por separado.`}
        actions={
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/discipular" className="font-medium underline">
              Hub Discipular
            </Link>
            <Link href="/discipular/multiplicacion" className="underline">
              Plan 3–12
            </Link>
          </div>
        }
      />

      <StatGroup columns={3} aria-label={`KPI ${config.title}`}>
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} />
        ))}
      </StatGroup>

      <DataCard className="space-y-2">
        <SectionHeader
          title="Objetivo ministerial (no bloquea avance académico)"
          description={config.ministerialObjective}
        />
      </DataCard>

      {canManageCycles ? (
        <DataCard className="space-y-3">
          <SectionHeader
            title={`Crear ciclo · ${config.title}`}
            description="Fechas reales del ciclo académico."
          />
          <form
            action={async (formData) => {
              "use server";
              if (config.kind === "cd") {
                await createDestinoCycleAction({
                  level: config.level,
                  name: String(formData.get("name") ?? ""),
                  startDate: String(formData.get("startDate") ?? ""),
                  endDate: String(formData.get("endDate") ?? ""),
                  ministryId: String(formData.get("ministryId") ?? "") || null,
                });
              } else {
                await createEmLevelCycleAction({
                  level: config.level,
                  name: String(formData.get("name") ?? ""),
                  startDate: String(formData.get("startDate") ?? ""),
                  endDate: String(formData.get("endDate") ?? ""),
                  ministryId: String(formData.get("ministryId") ?? "") || null,
                });
              }
            }}
            className="space-y-3"
          >
            <input
              name="name"
              required
              placeholder={`Ej. ${config.code} ${new Date().getFullYear()}`}
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
        <SectionHeader title="Ciclos" description={`Ciclos de ${config.title} en tu alcance.`} />
        {cycles.length === 0 ? (
          <EmptyState title="Sin ciclos" description="Crea un ciclo para matricular alumnos." />
        ) : (
          <ul className="space-y-2">
            {cycles.map((cycle) => (
              <li
                key={cycle.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper-100)]/40 px-4 py-3"
              >
                <div>
                  <Link href={`${cycleBase}/${cycle.id}`} className="font-medium underline">
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
                        if (config.kind === "cd") {
                          await activateDestinoCycleAction(cycle.id);
                        } else {
                          await activateEmLevelCycleAction(cycle.id);
                        }
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

      {canEnroll ? (
        <DataCard className="space-y-3">
          <SectionHeader
            title={`Aptos · ${config.title}`}
            description="Apto ≠ matriculado. Inscribe desde el ciclo activo."
          />
          {eligible.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nadie apto en tu alcance.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {eligible.slice(0, 30).map((p) => (
                <li key={p.personId} className="flex justify-between gap-2">
                  <Link href={`/ganar/${p.personId}`} className="underline">
                    {p.fullName}
                  </Link>
                  <span className="text-[var(--muted)]">{p.levelStatus}</span>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      ) : null}
    </div>
  );
}

export const CD_LEVEL_CONFIG: Record<1 | 2 | 3, DiscipularLevelConfig> = {
  1: {
    kind: "cd",
    level: 1,
    code: "CD1",
    title: "Capacitación Destino 1",
    sequenceHint: "Requiere Universidad de la Vida (Pre + Encuentro + Post) completada.",
    ministerialObjective:
      "Lista de 15 contactos, seguimiento evangelístico y ganar al menos 3 personas registradas en Ganar (los 15 no cuentan como ganados).",
    hubHref: "/discipular/cd1",
  },
  2: {
    kind: "cd",
    level: 2,
    code: "CD2",
    title: "Capacitación Destino 2",
    sequenceHint: "Requiere CD1 completada.",
    ministerialObjective:
      "Abrir una célula con los primeros 3, vincularla al estudiante y consolidar a sus discípulos. La célula debe existir y estar activa en Enviar.",
    hubHref: "/discipular/cd2",
  },
  3: {
    kind: "cd",
    level: 3,
    code: "CD3",
    title: "Capacitación Destino 3",
    sequenceHint: "Requiere CD2 y Re-Encuentro completados.",
    ministerialObjective:
      "Ganar otros 3 (completar 6), procurar que completen UDLV e incorporarlos a CD1.",
    hubHref: "/discipular/cd3",
  },
};

export const EM_LEVEL_CONFIG: Record<1 | 2 | 3, DiscipularLevelConfig> = {
  1: {
    kind: "em",
    level: 1,
    code: "EM1",
    title: "Escuela Ministerial 1",
    sequenceHint: "Requiere CD3 completada.",
    ministerialObjective:
      "Lograr que los primeros 6 comiencen CD1; supervisar matrículas/asistencia e identificar rezagados.",
    hubHref: "/discipular/em1",
  },
  2: {
    kind: "em",
    level: 2,
    code: "EM2",
    title: "Escuela Ministerial 2",
    sequenceHint: "Requiere EM1 completada.",
    ministerialObjective:
      "Los primeros 6 en CD2 y Re-Encuentro; preparar aprobación pastoral y apertura de células; planificar los últimos 6.",
    hubHref: "/discipular/em2",
  },
  3: {
    kind: "em",
    level: 3,
    code: "EM3",
    title: "Escuela Ministerial 3",
    sequenceHint: "Requiere EM2 completada. Completar habilita Enviar.",
    ministerialObjective:
      "6 líderes activos con célula; ganar otros 6; llevarlos al Encuentro durante EM3; meta final 12 en el equipo.",
    hubHref: "/discipular/em3",
  },
};
