import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DataCard } from "@/components/dashboard/data-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ProgressBar } from "@/components/dashboard/progress-bar";
import { SectionHeader } from "@/components/dashboard/section-header";
import { StatGroup } from "@/components/dashboard/stat-group";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission } from "@/modules/authorization";
import { getBreadcrumbs, getLeaderDashboard } from "@/modules/leadership";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Líder" };

type Params = Promise<{ personId: string }>;

export default async function LeaderFocusPage({ params }: { params: Params }) {
  const { personId } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "leaders.view_descendants") && !hasPermission(auth, "leaders.read")) {
    redirect("/dashboard");
  }

  let dashboard;
  try {
    dashboard = await getLeaderDashboard(session.id, personId);
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === DomainErrorCode.TREE_ACCESS_DENIED ||
        error.code === DomainErrorCode.NOT_FOUND ||
        error.code === DomainErrorCode.NOT_AUTHORIZED)
    ) {
      notFound();
    }
    throw error;
  }

  const crumbs = await getBreadcrumbs(session.id, personId);
  const trail = crumbs.filter((c) => c.personId !== auth.personId);
  const generationDepth = Math.max(0, trail.length);

  return (
    <div className="space-y-8">
      <nav
        aria-label="Breadcrumb de liderazgo"
        className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 text-sm text-[var(--muted)]"
      >
        <Link
          href="/liderazgo"
          className="neo-touch shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-[var(--cobalt)] hover:underline"
        >
          Mi Ministerio
        </Link>
        {trail.map((c) => (
          <span key={c.personId} className="flex shrink-0 items-center gap-1">
            <span aria-hidden>›</span>
            <Link
              href={`/liderazgo/${c.personId}`}
              className="neo-touch rounded-[var(--radius-sm)] px-2 py-1 text-[var(--cobalt)] hover:underline"
            >
              {c.fullName}
            </Link>
          </span>
        ))}
      </nav>

      {trail.length > 0 ? (
        <p className="text-sm">
          <Link
            href={
              trail.length > 1
                ? `/liderazgo/${trail[trail.length - 2]!.personId}`
                : "/liderazgo"
            }
            className="text-[var(--cobalt)] underline-offset-4 hover:underline"
          >
            ← Volver un nivel
          </Link>
        </p>
      ) : null}

      <PageHeader
        title={dashboard.person?.fullName ?? "Líder"}
        description={`${dashboard.leadership.humanLeaderCode ?? "Sin código"} · Generación relativa ${generationDepth} · Mis 12: ${dashboard.progress.label}`}
        actions={
          <StatusBadge
            label={
              dashboard.leadership.status === "active"
                ? "Activo"
                : dashboard.leadership.status === "eligible"
                  ? "Ungido ≠ activo"
                  : dashboard.leadership.status
            }
            tone={dashboard.leadership.status === "active" ? "success" : "warning"}
          />
        }
      />

      <StatGroup columns={3} aria-label="Indicadores del líder">
        <KpiCard label="Mis 12" value={dashboard.progress.label} hint="Directos activos con célula" />
        <KpiCard label="Descendientes" value={dashboard.descendantLeaders} />
        <KpiCard label="Células" value={dashboard.cells.length} />
      </StatGroup>

      <DataCard className="space-y-3">
        <SectionHeader title="Avance hacia 12" description="0/12 → 12/12 · elegible no cuenta" />
        <ProgressBar
          label="Directos"
          value={dashboard.progress.current}
          max={dashboard.progress.max}
          tone="cobalt"
        />
      </DataCard>

      <section className="space-y-3">
        <SectionHeader title="Célula propia" description="Células a cargo de este líder." />
        {dashboard.cells.length === 0 ? (
          <EmptyState
            title="Sin células abiertas"
            description="Un líder activo debería tener célula propia."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {dashboard.cells.map((cell) => (
              <li key={cell.id}>
                <Link
                  href={`/celulas/${cell.id}`}
                  className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--cobalt)]"
                >
                  <p className="font-medium">{cell.name}</p>
                  <p className="text-sm text-[var(--muted)]">{cell.type}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Bajar una generación"
          description="Líderes directos · drill-down vertical (sin árbol horizontal infinito)."
        />
        {dashboard.directLeaders.length === 0 ? (
          <EmptyState
            title="Sin líderes directos"
            description="Aún no hay generación siguiente bajo este nodo."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dashboard.directLeaders.map((leader) => (
              <li key={leader.personId}>
                <Link
                  href={`/liderazgo/${leader.personId}`}
                  className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--cobalt)]"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    Gen +1
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-lg tracking-tight">
                    {leader.fullName}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {leader.humanLeaderCode ?? "—"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm">
        <Link
          href="/transferencias"
          className="text-[var(--cobalt)] underline-offset-4 hover:underline"
        >
          Transferencias (bajo Liderazgo)
        </Link>
      </p>
    </div>
  );
}
