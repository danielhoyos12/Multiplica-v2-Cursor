import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import { getProcessDashboardCounts } from "@/modules/formation";
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Mis 12" value={dashboard.progress.label} />
        <Kpi label="Líderes debajo" value={dashboard.descendantLeaders} />
        <Kpi label="Células propias" value={dashboard.cells.length} />
        <Kpi
          label="Listo para 12"
          value={dashboard.readyForTwelve ? "Sí" : "No"}
        />
      </div>

      {processCounts ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label="Consolidar en curso" value={processCounts.consolidarInProgress} />
          <Kpi label="Consolidar completado" value={processCounts.consolidarCompleted} />
          <Kpi label="UDV aptos" value={processCounts.udvEligible} />
          <Kpi label="UDV en curso" value={processCounts.udvInProgress} />
          <Kpi label="UDV completada" value={processCounts.udvCompleted} />
          <Kpi
            label="Pendientes seguimiento"
            value={processCounts.consolidarPending + processCounts.consolidarInProgress}
          />
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-medium">Mis células</h2>
        <ul className="space-y-2">
          {dashboard.cells.map((cell) => (
            <li key={cell.id}>
              <Link
                href={`/celulas/${cell.id}`}
                className="block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
              >
                {cell.name} · {cell.type === "twelve" ? "Célula de 12" : "Evangelística"}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Líderes directos</h2>
        {dashboard.directLeaders.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Aún no hay líderes directos.</p>
        ) : (
          <ul className="space-y-2">
            {dashboard.directLeaders.map((leader) => (
              <li key={leader.personId}>
                <Link
                  href={`/liderazgo/${leader.personId}`}
                  className="block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                >
                  <p className="font-medium">{leader.fullName}</p>
                  <p className="text-sm text-[var(--muted)]">{leader.humanLeaderCode}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dashboard.readyForTwelve ? (
        <p className="rounded-[var(--radius)] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4 text-sm">
          Tienes 12 líderes activos. Abre tu célula evangelística y usa “Convertir en Célula de
          12”.
        </p>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-medium">{value}</p>
    </div>
  );
}
