import Link from "next/link";

import { AlertCard } from "@/components/dashboard/alert-card";
import { DataCard } from "@/components/dashboard/data-card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { KpiCard, MiniBarChart } from "@/components/dashboard/kpi-card";
import { LadderVisualizer } from "@/components/dashboard/ladder-visualizer";
import { ProgressBar } from "@/components/dashboard/progress-bar";
import { SectionHeader } from "@/components/dashboard/section-header";
import { StatGroup } from "@/components/dashboard/stat-group";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ExecutiveDashboard } from "@/modules/reporting/dashboard";

type MinistryOpt = { id: string; code: string; name: string };
type NetworkOpt = { id: string; code: string; name: string };

type DashboardBoardProps = {
  dash: ExecutiveDashboard;
  period: string;
  ministryId?: string;
  networkId?: string;
  ministries: MinistryOpt[];
  networks: NetworkOpt[];
  showMinistryFilter: boolean;
  isSuperadmin: boolean;
};

function funnelCount(dash: ExecutiveDashboard, code: string): number {
  return dash.ladder.funnel.find((f) => f.code === code)?.count ?? 0;
}

export function DashboardBoard({
  dash,
  period,
  ministryId,
  networkId,
  ministries,
  networks,
  showMinistryFilter,
  isSuperadmin,
}: DashboardBoardProps) {
  const hasPersons = dash.persons.totalActive > 0;
  const hasAlerts = dash.attention.length > 0;
  const hasTree = dash.tree.length > 0;
  const hasTransfers =
    dash.transfers.pending + dash.transfers.approved + dash.transfers.crossMinistryPending >
    0;

  return (
    <div className="space-y-8 sm:space-y-10">
      <PageHeader
        title="Dashboard"
        description="Vista ejecutiva de la Escalera del Éxito. Métricas derivadas en tiempo real · Ungido ≠ activo · Scope por rol."
        actions={<StatusBadge label={dash.scope.roleView} tone="brand" />}
      />

      <FilterBar
        period={period}
        ministryId={ministryId}
        networkId={networkId}
        rootPersonId={dash.scope.rootPersonId}
        showMinistryFilter={showMinistryFilter}
        ministries={ministries.map((m) => ({
          id: m.id,
          label: `${m.code} — ${m.name}`,
        }))}
        networks={networks.map((n) => ({ id: n.id, label: n.name }))}
      />

      <div className="flex flex-col gap-2 text-sm text-[var(--muted)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        <p>
          Vista: <span className="text-[var(--ink)]">{dash.scope.roleView}</span>
        </p>
        <p>
          Scope: <span className="text-[var(--ink)]">{dash.scope.mode}</span>
        </p>
        <p>
          Período: <span className="text-[var(--ink)]">{dash.period.label}</span>
        </p>
      </div>

      {dash.breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb estructura" className="flex flex-wrap gap-1 text-sm">
          {dash.breadcrumbs.map((b, i) => (
            <span key={b.personId} className="flex items-center gap-1">
              {i > 0 ? <span className="text-[var(--muted)]">›</span> : null}
              <Link
                href={`/dashboard?raiz=${b.personId}&periodo=${period}`}
                className="text-[var(--cobalt)] underline-offset-4 hover:underline"
              >
                {b.fullName}
              </Link>
            </span>
          ))}
        </nav>
      ) : null}

      {!hasPersons ? (
        <EmptyState
          title="No hay personas en este alcance"
          description="Ajusta ministerio, red o raíz, o registra nuevas personas en Ganar."
          action={
            <Link
              href="/ganar"
              className="neo-touch inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-4 py-2 text-sm font-medium text-white"
            >
              Ir a Ganar
            </Link>
          }
        />
      ) : null}

      <section aria-labelledby="kpi-heading" className="space-y-4">
        <SectionHeader
          id="kpi-heading"
          eyebrow="Indicadores"
          title="KPI principales"
          description="Solo métricas ya calculadas por reporting. Sin contadores inventados."
        />
        <StatGroup aria-label="KPI principales" columns={4}>
          <KpiCard
            label="Personas"
            value={dash.persons.totalActive}
            hint={`Nuevas en período: ${dash.persons.newInPeriod}`}
            delta={dash.persons.newChangeLabel}
          />
          <KpiCard
            label="Ganar"
            value={funnelCount(dash, "ganar")}
            hint="Personas activas en etapa Ganar (conteo actual)"
          />
          <KpiCard
            label="Consolidar"
            value={funnelCount(dash, "consolidar")}
            hint={`Pre ${dash.ladder.consolidar.pre.completed} · Enc ${dash.ladder.consolidar.encuentro.completed} · Post ${dash.ladder.consolidar.post.completed}`}
          />
          <KpiCard
            label="Discipular"
            value={funnelCount(dash, "discipular")}
            hint="Destino + Re-Encuentro + EM (activos en etapa)"
          />
          <KpiCard
            label="Enviar"
            value={funnelCount(dash, "enviar")}
            hint={`Completados ${dash.ladder.enviar.completed} · aptos ${dash.ladder.enviar.eligible}`}
          />
          <KpiCard
            label="Líderes activos"
            value={dash.leadership.active}
            hint={`Eligible/ungidos: ${dash.leadership.eligible} · sin célula: ${dash.leadership.activeWithoutCell}`}
            tone={dash.leadership.activeWithoutCell > 0 ? "critical" : "default"}
          />
          <KpiCard
            label="Células"
            value={dash.cells.totalActive}
            hint={`Eva ${dash.cells.evangelistic} · 12 ${dash.cells.twelve} · miembros ${dash.cells.activeMembers}`}
          />
          <KpiCard
            label="Transferencias pendientes"
            value={dash.transfers.pending}
            hint={`Aprobadas por ejecutar: ${dash.transfers.approved}`}
            tone={dash.transfers.pending > 0 ? "warning" : "default"}
          />
        </StatGroup>

        <StatGroup aria-label="KPI secundarios" columns={2} className="lg:grid-cols-2">
          <KpiCard
            label="Asistencia promedio"
            value={
              dash.cells.avgAttendancePct == null
                ? "NO_DATA"
                : `${dash.cells.avgAttendancePct}%`
            }
            hint="Últimas 4 sesiones (células en scope)"
          />
          <KpiCard
            label="Cross-ministry pendientes"
            value={dash.transfers.crossMinistryPending}
            hint="Transferencias pending/approved entre ministerios"
          />
        </StatGroup>
      </section>

      {dash.leadership.focus ? (
        <DataCard className="space-y-4">
          <SectionHeader
            title={`Progreso G12 · ${dash.leadership.focus.fullName}`}
            description={`Banda ${dash.leadership.focus.progressBand}`}
          />
          <p className="font-[family-name:var(--font-display)] text-4xl tabular-nums tracking-tight">
            {dash.leadership.focus.progress.label}
          </p>
          <ProgressBar
            label="Avance hacia 12"
            value={dash.leadership.focus.progress.current}
            max={dash.leadership.focus.progress.max}
            tone="cobalt"
          />
          <p className="text-sm text-[var(--muted)]">
            {dash.leadership.generations.potentialLabel}
          </p>
        </DataCard>
      ) : null}

      <LadderVisualizer
        ladder={dash.ladder}
        cells={dash.cells}
        leadership={dash.leadership}
      />

      {(dash.leadership.generations.depth1 > 0 ||
        dash.leadership.generations.depth2 > 0 ||
        dash.leadership.generations.depth3 > 0 ||
        dash.scope.rootPersonId) && (
        <DataCard className="space-y-4">
          <SectionHeader
            eyebrow="Multiplicación"
            title="Profundidad 12 / 144 / 1728"
            description="Conteos reales de líderes activos por profundidad respecto a la raíz. Potenciales teóricos solo como referencia."
          />
          <StatGroup columns={3} aria-label="Profundidad de multiplicación">
            <KpiCard
              label="Depth 1 · potencial 12"
              value={dash.leadership.generations.depth1}
              hint="Líderes activos a profundidad 1"
            />
            <KpiCard
              label="Depth 2 · potencial 144"
              value={dash.leadership.generations.depth2}
              hint="Líderes activos a profundidad 2"
            />
            <KpiCard
              label="Depth 3 · potencial 1728"
              value={dash.leadership.generations.depth3}
              hint="Líderes activos a profundidad 3"
            />
          </StatGroup>
          {!dash.scope.rootPersonId ? (
            <p className="text-sm text-[var(--muted)]">
              Selecciona una raíz en el árbol para ver profundidades relativas.
            </p>
          ) : null}
        </DataCard>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <MiniBarChart
          title="Personas nuevas por semana"
          items={dash.trends.newPersonsWeekly.map((w) => ({
            label: w.weekStart.slice(5),
            value: w.count,
          }))}
        />
        <DataCard className="space-y-3">
          <SectionHeader
            title="Transferencias"
            description="Estados actuales en scope (sin mutar dominio)."
            actions={
              <Link
                href="/transferencias"
                className="text-sm text-[var(--cobalt)] underline-offset-4 hover:underline"
              >
                Ver bandeja
              </Link>
            }
          />
          {!hasTransfers ? (
            <EmptyState
              title="Sin transferencias activas"
              description="No hay solicitudes pendientes ni aprobadas por ejecutar en este alcance."
              className="border-0 bg-transparent px-0 py-4 shadow-none"
            />
          ) : (
            <StatGroup columns={3} aria-label="Transferencias">
              <KpiCard label="Pendientes" value={dash.transfers.pending} />
              <KpiCard label="Aprobadas" value={dash.transfers.approved} />
              <KpiCard label="Cross-ministry" value={dash.transfers.crossMinistryPending} />
            </StatGroup>
          )}
        </DataCard>
      </section>

      <section className="space-y-4" aria-labelledby="alerts-heading">
        <SectionHeader
          id="alerts-heading"
          eyebrow="Atención"
          title="Alertas pastorales"
          description="Códigos derivados existentes. La card no muta dominio."
          actions={
            <Link
              href="/reportes"
              className="text-sm text-[var(--cobalt)] underline-offset-4 hover:underline"
            >
              Reportes
            </Link>
          }
        />
        {!hasAlerts ? (
          <EmptyState
            title="Sin alertas prioritarias"
            description="No hay situaciones critical o warning en el alcance actual."
          />
        ) : (
          <ul className="space-y-2">
            {dash.attention.map((a, idx) => (
              <li key={`${a.code}-${a.entityId ?? idx}`}>
                <AlertCard
                  code={a.code}
                  severity={a.severity}
                  title={a.title}
                  detail={a.detail}
                  href={a.href}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {hasTree ? (
        <section className="space-y-4">
          <SectionHeader title="Subárbol directo" description="Nodos directos bajo la raíz actual." />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dash.tree.map((n) => (
              <li key={n.personId}>
                <Link
                  href={`/dashboard?raiz=${n.personId}&periodo=${period}`}
                  className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--cobalt)]"
                >
                  <p className="font-medium text-[var(--ink)]">{n.fullName}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {n.code ?? "—"} · {n.status} · {n.directCount}/12 · células {n.cellCount} ·
                    desc {n.descendantCount}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!dash.cells.totalActive && hasPersons ? (
        <EmptyState
          title="Sin células en este alcance"
          description="No hay células activas asociadas al scope actual."
          action={
            <Link
              href="/celulas"
              className="text-sm text-[var(--cobalt)] underline-offset-4 hover:underline"
            >
              Ver células
            </Link>
          }
        />
      ) : null}

      {isSuperadmin ? (
        <p className="text-sm">
          <Link
            href="/admin/system-health"
            className="text-[var(--cobalt)] underline-offset-4 hover:underline"
          >
            System health / invariantes
          </Link>
        </p>
      ) : null}

      <p className="text-xs text-[var(--muted)]">
        Query timings (ms):{" "}
        {Object.entries(dash.timings)
          .map(([k, v]) => `${k}=${v}`)
          .join(" · ")}
      </p>
    </div>
  );
}
