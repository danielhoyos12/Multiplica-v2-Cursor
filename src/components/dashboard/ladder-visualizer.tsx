import type { ReactNode } from "react";

import { DataCard } from "@/components/dashboard/data-card";
import { ProgressBar } from "@/components/dashboard/progress-bar";
import { SectionHeader } from "@/components/dashboard/section-header";
import { cn } from "@/lib/cn";
import type { CellMetrics } from "@/modules/reporting/metrics-cells";
import type { LadderMetrics } from "@/modules/reporting/metrics-ladder";
import type { LeadershipMetrics } from "@/modules/reporting/metrics-leadership";

type LadderVisualizerProps = {
  ladder: LadderMetrics;
  cells: CellMetrics;
  leadership: LeadershipMetrics;
  className?: string;
};

type StageRow = {
  code: string;
  label: string;
  completed: number;
  inProgress?: number;
  eligible?: number;
  total?: number;
};

function StageMetrics({ rows }: { rows: StageRow[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        const total =
          row.total ??
          row.completed + (row.inProgress ?? 0) + (row.eligible ?? 0);
        const pct = total > 0 ? Math.round((row.completed / total) * 100) : null;
        return (
          <li
            key={row.code}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--rice)]/60 px-3 py-2"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {row.label}
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--ink)]">
              {row.completed}
              <span className="ml-1 text-sm font-normal text-[var(--muted)]">completados</span>
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {row.inProgress != null ? `En proceso ${row.inProgress}` : null}
              {row.eligible != null ? ` · Aptos ${row.eligible}` : null}
              {total > 0 ? ` · Total ${total}` : null}
            </p>
            {pct != null ? (
              <div className="mt-2">
                <ProgressBar
                  label={`Progreso ${row.label}`}
                  value={pct}
                  max={100}
                  showValue
                  tone="cobalt"
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function LadderStep({
  index,
  title,
  totalLabel,
  total,
  children,
  className,
}: {
  index: string;
  title: string;
  totalLabel: string;
  total: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("relative pl-4", className)}>
      <div
        aria-hidden
        className="absolute left-0 top-2 h-[calc(100%-0.5rem)] w-px bg-[var(--border)] last:hidden"
      />
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--cobalt)]">
          {index}
        </span>
        <h3 className="font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--ink)]">
          {title}
        </h3>
        <span className="text-sm text-[var(--muted)]">
          {totalLabel}:{" "}
          <span className="font-medium tabular-nums text-[var(--ink)]">{total}</span>
        </span>
      </div>
      {children}
    </li>
  );
}

/**
 * Visual Escalera del Éxito — display only.
 * Células / Liderazgo appear as operational context under Enviar, not as sequential stages.
 */
export function LadderVisualizer({
  ladder,
  cells,
  leadership,
  className,
}: LadderVisualizerProps) {
  const ganar = ladder.funnel.find((f) => f.code === "ganar")?.count ?? ladder.ganarCompleted;
  const consolidar =
    ladder.funnel.find((f) => f.code === "consolidar")?.count ??
    ladder.consolidar.consolidarCompleted;
  const discipular = ladder.funnel.find((f) => f.code === "discipular")?.count ?? 0;
  const enviar = ladder.funnel.find((f) => f.code === "enviar")?.count ?? ladder.enviar.total;

  return (
    <DataCard className={cn("space-y-6", className)} padding="lg">
      <SectionHeader
        eyebrow="Escalera del Éxito"
        title="Ruta pastoral"
        description={ladder.note}
      />

      <ol className="space-y-8" aria-label="Escalera del Éxito">
        <LadderStep index="01" title="Ganar" totalLabel="Personas en etapa" total={ganar}>
          <p className="text-sm text-[var(--muted)]">
            Personas activas en scope (conteo actual). Completados de referencia:{" "}
            <span className="tabular-nums text-[var(--ink)]">{ladder.ganarCompleted}</span>
          </p>
        </LadderStep>

        <LadderStep
          index="02"
          title="Consolidar"
          totalLabel="En etapa"
          total={consolidar}
        >
          <StageMetrics
            rows={[
              {
                code: "pre",
                label: "Pre-Encuentro",
                completed: ladder.consolidar.pre.completed,
                inProgress: ladder.consolidar.pre.in_progress,
                eligible: ladder.consolidar.pre.eligible,
                total: ladder.consolidar.pre.total,
              },
              {
                code: "encuentro",
                label: "Encuentro",
                completed: ladder.consolidar.encuentro.completed,
                inProgress: ladder.consolidar.encuentro.in_progress,
                eligible: ladder.consolidar.encuentro.eligible,
                total: ladder.consolidar.encuentro.total,
              },
              {
                code: "post",
                label: "Post-Encuentro",
                completed: ladder.consolidar.post.completed,
                inProgress: ladder.consolidar.post.in_progress,
                eligible: ladder.consolidar.post.eligible,
                total: ladder.consolidar.post.total,
              },
            ]}
          />
        </LadderStep>

        <LadderStep
          index="03"
          title="Discipular"
          totalLabel="En etapa"
          total={discipular}
        >
          <StageMetrics
            rows={[
              {
                code: "cd",
                label: "Capacitación Destino",
                completed:
                  ladder.discipular.cd1.completed +
                  ladder.discipular.cd2.completed +
                  ladder.discipular.cd3.completed,
                inProgress:
                  ladder.discipular.cd1.in_progress +
                  ladder.discipular.cd2.in_progress +
                  ladder.discipular.cd3.in_progress,
                eligible:
                  ladder.discipular.cd1.eligible +
                  ladder.discipular.cd2.eligible +
                  ladder.discipular.cd3.eligible,
              },
              {
                code: "re",
                label: "Re-Encuentro",
                completed: ladder.discipular.reencuentro.completed,
                inProgress: ladder.discipular.reencuentro.in_progress,
                eligible: ladder.discipular.reencuentro.eligible,
                total: ladder.discipular.reencuentro.total,
              },
              {
                code: "em",
                label: "Escuela Ministerial",
                completed:
                  ladder.discipular.em1.completed +
                  ladder.discipular.em2.completed +
                  ladder.discipular.em3.completed,
                inProgress:
                  ladder.discipular.em1.in_progress +
                  ladder.discipular.em2.in_progress +
                  ladder.discipular.em3.in_progress,
                eligible:
                  ladder.discipular.em1.eligible +
                  ladder.discipular.em2.eligible +
                  ladder.discipular.em3.eligible,
              },
            ]}
          />
        </LadderStep>

        <LadderStep index="04" title="Enviar" totalLabel="En etapa" total={enviar}>
          <StageMetrics
            rows={[
              {
                code: "enviar",
                label: "Resumen / Enviar",
                completed: ladder.enviar.completed,
                inProgress: ladder.enviar.in_progress,
                eligible: ladder.enviar.eligible,
                total: ladder.enviar.total,
              },
            ]}
          />
          <p className="mt-2 text-sm text-[var(--muted)]">
            Ungidos{" "}
            <span className="tabular-nums text-[var(--ink)]">{ladder.enviar.ungidos}</span>
            {" · "}
            Activados{" "}
            <span className="tabular-nums text-[var(--ink)]">{ladder.enviar.activados}</span>
          </p>

          <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--paper-100)]/50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Contexto operativo (no son pasos de la Escalera)
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--muted)]">Células activas</dt>
                <dd className="font-[family-name:var(--font-display)] text-xl tabular-nums">
                  {cells.totalActive}
                </dd>
                <p className="text-xs text-[var(--muted)]">
                  Eva {cells.evangelistic} · 12 {cells.twelve} · miembros{" "}
                  {cells.activeMembers}
                </p>
              </div>
              <div>
                <dt className="text-sm text-[var(--muted)]">Liderazgo activo</dt>
                <dd className="font-[family-name:var(--font-display)] text-xl tabular-nums">
                  {leadership.active}
                </dd>
                <p className="text-xs text-[var(--muted)]">
                  Eligible/ungidos {leadership.eligible} · sin célula{" "}
                  {leadership.activeWithoutCell}
                </p>
              </div>
            </dl>
          </div>
        </LadderStep>
      </ol>
    </DataCard>
  );
}
