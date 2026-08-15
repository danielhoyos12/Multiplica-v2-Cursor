import Link from "next/link";
import { redirect } from "next/navigation";

import { FunnelList, KpiCard, SimpleBarChart } from "@/components/reporting/kpi";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
import { DomainError } from "@/lib/errors";
import { getExecutiveDashboard } from "@/modules/reporting";
import type { PeriodKey } from "@/modules/reporting";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Dashboard pastoral" };

type Search = Promise<{
  periodo?: string;
  ministerio?: string;
  red?: string;
  raiz?: string;
}>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { session, auth } = await requireAppActor();
  if (
    !hasPermission(auth, "dashboard.read") &&
    !hasPermission(auth, "persons.read") &&
    !hasPermission(auth, "process.read")
  ) {
    redirect("/ganar");
  }

  const params = await searchParams;
  const period = (params.periodo as PeriodKey | undefined) ?? "this_month";

  let dash;
  let loadError: string | null = null;
  try {
    dash = await getExecutiveDashboard(session.id, {
      period,
      ministryId: params.ministerio || null,
      networkId: params.red || null,
      rootPersonId: params.raiz || null,
    });
  } catch (e) {
    loadError =
      e instanceof DomainError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Error al cargar dashboard";
    dash = null;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard pastoral"
        description="KPIs derivados en tiempo real. Ungido ≠ activo. Scope por rol."
        actions={<StatusBadge label="Fase 9" tone="brand" />}
      />

      <form className="flex flex-wrap gap-2 text-sm" method="get">
        <select
          name="periodo"
          defaultValue={period}
          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
        >
          <option value="this_week">Esta semana</option>
          <option value="this_month">Este mes</option>
          <option value="last_30">Últimos 30 días</option>
          <option value="last_90">Últimos 90 días</option>
          <option value="this_year">Este año</option>
        </select>
        {isSuperadmin(auth) || auth.ministryIds.length > 1 ? (
          <input
            name="ministerio"
            placeholder="Ministry UUID (opcional)"
            defaultValue={params.ministerio ?? ""}
            className="min-w-[12rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          />
        ) : null}
        <input
          name="red"
          placeholder="Network UUID (opcional)"
          defaultValue={params.red ?? ""}
          className="min-w-[10rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
        />
        <input
          name="raiz"
          placeholder="Líder raíz UUID (drill-down)"
          defaultValue={params.raiz ?? ""}
          className="min-w-[12rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-white"
        >
          Aplicar
        </button>
      </form>

      {loadError ? (
        <div
          role="alert"
          className="rounded-[var(--radius)] border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm"
        >
          LOAD_ERROR: {loadError}
        </div>
      ) : null}

      {!dash ? null : (
        <>
          <p className="text-sm text-[var(--muted)]">
            Vista: <span className="text-[var(--ink)]">{dash.scope.roleView}</span>
            {" · "}
            Scope: <span className="text-[var(--ink)]">{dash.scope.mode}</span>
            {" · "}
            Período: <span className="text-[var(--ink)]">{dash.period.label}</span>
          </p>

          {dash.breadcrumbs.length > 0 ? (
            <nav aria-label="Breadcrumb estructura" className="flex flex-wrap gap-1 text-sm">
              {dash.breadcrumbs.map((b, i) => (
                <span key={b.personId} className="flex items-center gap-1">
                  {i > 0 ? <span className="text-[var(--muted)]">›</span> : null}
                  <Link
                    href={`/dashboard?raiz=${b.personId}&periodo=${period}`}
                    className="underline"
                  >
                    {b.fullName}
                  </Link>
                </span>
              ))}
            </nav>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Personas activas"
              value={dash.persons.totalActive}
              hint={`Nuevas ${dash.period.label.toLowerCase()}: ${dash.persons.newInPeriod} (${dash.persons.newChangeLabel} vs ant.)`}
            />
            <KpiCard
              label="Líderes active"
              value={dash.leadership.active}
              hint={`Eligible/ungidos: ${dash.leadership.eligible} · sin célula: ${dash.leadership.activeWithoutCell}`}
              tone={dash.leadership.activeWithoutCell > 0 ? "critical" : "default"}
            />
            <KpiCard
              label="Células activas"
              value={dash.cells.totalActive}
              hint={`Eva ${dash.cells.evangelistic} · 12 ${dash.cells.twelve} · miembros ${dash.cells.activeMembers}`}
            />
            <KpiCard
              label="Asistencia promedio"
              value={
                dash.cells.avgAttendancePct == null
                  ? "NO_DATA"
                  : `${dash.cells.avgAttendancePct}%`
              }
              hint="Últimas 4 sesiones (células en scope)"
            />
          </section>

          {dash.leadership.focus ? (
            <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="font-medium">Progreso G12 · {dash.leadership.focus.fullName}</h2>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {dash.leadership.focus.progress.label}
              </p>
              <p className="text-sm text-[var(--muted)]">
                Banda {dash.leadership.focus.progressBand} ·{" "}
                {dash.leadership.generations.potentialLabel}
              </p>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="mb-3 font-medium">Embudo Escalera (conteos actuales)</h2>
              <p className="mb-3 text-xs text-[var(--muted)]">{dash.ladder.note}</p>
              <FunnelList items={dash.ladder.funnel} />
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Mini label="Pre" v={dash.ladder.consolidar.pre.completed} />
                <Mini label="Encuentro" v={dash.ladder.consolidar.encuentro.completed} />
                <Mini label="Post" v={dash.ladder.consolidar.post.completed} />
                <Mini label="Enviar" v={dash.ladder.enviar.completed} />
                <Mini label="CD1" v={dash.ladder.discipular.cd1.completed} />
                <Mini label="CD2" v={dash.ladder.discipular.cd2.completed} />
                <Mini label="RE" v={dash.ladder.discipular.reencuentro.completed} />
                <Mini label="EM3" v={dash.ladder.discipular.em3.completed} />
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Enviar: aptos {dash.ladder.enviar.eligible} · proceso{" "}
                {dash.ladder.enviar.in_progress} · completados {dash.ladder.enviar.completed} ·
                ungidos {dash.ladder.enviar.ungidos} · activados {dash.ladder.enviar.activados}
              </p>
            </div>
            <SimpleBarChart
              title="Personas nuevas por semana"
              items={dash.trends.newPersonsWeekly.map((w) => ({
                label: w.weekStart.slice(5),
                value: w.count,
              }))}
            />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Requiere atención</h2>
              <Link href="/reportes" className="text-sm underline">
                Reportes
              </Link>
            </div>
            {dash.attention.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Sin alertas prioritarias.</p>
            ) : (
              <ul className="space-y-2">
                {dash.attention.map((a, idx) => (
                  <li
                    key={`${a.code}-${a.entityId ?? idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  >
                    <div>
                      <StatusBadge
                        label={a.severity}
                        tone={
                          a.severity === "critical"
                            ? "warning"
                            : a.severity === "warning"
                              ? "warning"
                              : "brand"
                        }
                      />
                      <p className="mt-1 font-medium">{a.title}</p>
                      <p className="text-[var(--muted)]">{a.detail}</p>
                    </div>
                    {a.href ? (
                      <Link href={a.href} className="underline">
                        Ver
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {dash.tree.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-medium">Subárbol directo</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {dash.tree.map((n) => (
                  <li key={n.personId}>
                    <Link
                      href={`/dashboard?raiz=${n.personId}&periodo=${period}`}
                      className="block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:border-[var(--brand)]"
                    >
                      <p className="font-medium">{n.fullName}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {n.code ?? "—"} · {n.status} · {n.directCount}/12 · células{" "}
                        {n.cellCount} · desc {n.descendantCount}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-3 text-sm">
            <KpiCard label="Transferencias pendientes" value={dash.transfers.pending} />
            <KpiCard label="Aprobadas por ejecutar" value={dash.transfers.approved} />
            <KpiCard
              label="Cross-ministry pendientes"
              value={dash.transfers.crossMinistryPending}
            />
          </section>

          {isSuperadmin(auth) ? (
            <p className="text-sm">
              <Link href="/admin/system-health" className="underline">
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
        </>
      )}
    </div>
  );
}

function Mini({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1">
      <p className="text-[var(--muted)]">{label}</p>
      <p className="font-medium tabular-nums">{v}</p>
    </div>
  );
}
