import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard, KpiCard, SectionHeader, StatGroup } from "@/components/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import { getEmLevelsDashboardCounts, getProcessDashboardCounts, getReencuentroDashboardCounts } from "@/modules/formation";
import { getLeaderDashboard } from "@/modules/leadership";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Mi estructura" };

export default async function LiderazgoHomePage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "leaders.read") && !hasPermission(auth, "leaders.view_descendants")) {
    redirect("/dashboard");
  }

  if (!auth.personId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mi estructura"
          description="Tu usuario aún no está vinculado a una Persona Maestra. Activa un líder o vincula person_id."
        />
      </div>
    );
  }

  let dashboard;
  try {
    dashboard = await getLeaderDashboard(session.id, auth.personId);
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mi estructura"
          description="Todavía no tienes registro de liderazgo. Márcalo como apto y actívalo desde GANAR."
        />
      </div>
    );
  }

  let processCounts = null;
  if (hasPermission(auth, "process.read")) {
    try {
      processCounts = await getProcessDashboardCounts(session.id, auth.personId);
    } catch {
      processCounts = null;
    }
  }

  let emCounts = null;
  let reCounts = null;
  if (hasPermission(auth, "ministerial_school.read") || hasPermission(auth, "process.read")) {
    try {
      emCounts = await getEmLevelsDashboardCounts(session.id);
    } catch {
      emCounts = null;
    }
  }
  if (hasPermission(auth, "reencounter.read") || hasPermission(auth, "process.read")) {
    try {
      reCounts = await getReencuentroDashboardCounts(session.id);
    } catch {
      reCounts = null;
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={dashboard.person?.fullName ?? "Mi Ministerio"}
        description={`${dashboard.ministry?.code ?? ""} · ${dashboard.network?.name ?? ""} · ${dashboard.leadership.humanLeaderCode ?? ""}`}
        actions={
          <StatusBadge
            label={dashboard.leadership.status}
            tone={dashboard.leadership.status === "active" ? "success" : "warning"}
          />
        }
      />

      <StatGroup columns={4} aria-label="Resumen de liderazgo">
        <KpiCard label="Mis 12" value={dashboard.progress.label} />
        <KpiCard label="Líderes debajo" value={dashboard.descendantLeaders} />
        <KpiCard label="Células propias" value={dashboard.cells.length} />
        <KpiCard
          label="Listo para 12"
          value={dashboard.readyForTwelve ? "Sí" : "No"}
        />
      </StatGroup>

      {processCounts ? (
        <section className="space-y-3">
          <SectionHeader
            title="Escalera en mi árbol"
            description="Conteo de personas en proceso bajo tu alcance."
          />
          <StatGroup columns={4} aria-label="Proceso">
            <KpiCard label="Pre-Encuentro" value={processCounts.preEncuentro} />
            <KpiCard label="CD1" value={processCounts.cd1} />
            <KpiCard label="CD2" value={processCounts.cd2} />
            <KpiCard label="Re-Encuentro" value={processCounts.reencuentro} />
            <KpiCard label="CD3" value={processCounts.cd3} />
            <KpiCard label="EM1" value={processCounts.em1} />
            <KpiCard label="EM2" value={processCounts.em2} />
            <KpiCard label="EM3" value={processCounts.em3} />
            <KpiCard
              label="Pendientes seguimiento"
              value={processCounts.consolidarPending + processCounts.consolidarInProgress}
            />
          </StatGroup>
        </section>
      ) : null}

      {emCounts || reCounts ? (
        <section className="space-y-3">
          <SectionHeader
            title="Formación avanzada"
            description="Elegible / en curso ≠ líder activo."
          />
          <StatGroup columns={3} aria-label="EM y Re-Encuentro">
            {emCounts ? (
              <>
                <KpiCard label="EM1 en curso/apto" value={emCounts.em1} />
                <KpiCard label="EM2 en curso/apto" value={emCounts.em2} />
                <KpiCard label="EM3 en curso/apto" value={emCounts.em3} />
              </>
            ) : null}
            {reCounts ? (
              <>
                <KpiCard
                  label="Re-Encuentro elegibles"
                  value={reCounts.eligible}
                  hint="Elegible ≠ activo"
                />
                <KpiCard label="Re-Encuentro completados" value={reCounts.completed} />
                <KpiCard label="Re-Encuentro pendientes" value={reCounts.pending} />
              </>
            ) : null}
          </StatGroup>
        </section>
      ) : null}

      <DataCard className="space-y-3">
        <SectionHeader title="Mis células" />
        <ul className="space-y-2">
          {dashboard.cells.map((cell) => (
            <li key={cell.id}>
              <Link
                href={`/celulas/${cell.id}`}
                className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper-100)]/40 px-4 py-3 text-sm"
              >
                {cell.name} · {cell.type === "twelve" ? "Célula de 12" : "Evangelística"}
              </Link>
            </li>
          ))}
          {dashboard.cells.length === 0 ? (
            <li className="text-sm text-[var(--muted)]">Sin células propias.</li>
          ) : null}
        </ul>
      </DataCard>

      <DataCard className="space-y-3">
        <SectionHeader title="Líderes directos" />
        {dashboard.directLeaders.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Aún no hay líderes directos.</p>
        ) : (
          <ul className="space-y-2">
            {dashboard.directLeaders.map((leader) => (
              <li key={leader.personId}>
                <Link
                  href={`/liderazgo/${leader.personId}`}
                  className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper-100)]/40 px-4 py-3"
                >
                  <p className="font-medium">{leader.fullName}</p>
                  <p className="text-sm text-[var(--muted)]">{leader.humanLeaderCode}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      {dashboard.readyForTwelve ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4 text-sm">
          Tienes 12 líderes activos. Abre tu célula evangelística y usa “Convertir en Célula de
          12”.
        </p>
      ) : null}
    </div>
  );
}
