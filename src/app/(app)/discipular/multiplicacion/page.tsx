import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard, KpiCard, SectionHeader, StatGroup } from "@/components/dashboard";
import { EnrollmentPersonForm } from "@/components/formation/enrollment-person-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { hasPermission } from "@/modules/authorization";
import { openExpedienteAction } from "@/modules/multiplication/actions";
import {
  buildProjectionsForStudent,
  listOpenExpedientesSummary,
} from "@/modules/multiplication";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Multiplicación 3–12" };

export default async function MultiplicacionHubPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "process.read") && !hasPermission(auth, "destination.read")) {
    redirect("/dashboard");
  }

  const canManage = hasPermission(auth, "destination.manage");
  const rows = await listOpenExpedientesSummary(session.id);
  const asOf = new Date().toISOString().slice(0, 10);
  const sampleProjections =
    rows[0] != null
      ? await buildProjectionsForStudent(session.id, rows[0].studentPersonId, asOf)
      : [];

  const withTeam12 = rows.filter((r) => r.counters.team.teamSize >= 12).length;
  const with3Won = rows.filter((r) => r.counters.contacts.wonLinked >= 3).length;
  const withActiveLeaders = rows.filter(
    (r) => r.counters.team.activeLeadersWithCell >= 6,
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Desafío de Multiplicación 3 → 12"
        description="Expediente acumulativo por Persona Maestra. Contactos ≠ ganados. Líder activo requiere célula real. Objetivos ministeriales no bloquean avance académico."
        actions={
          <Link href="/discipular" className="text-sm underline">
            Hub Discipular
          </Link>
        }
      />

      <StatGroup columns={3} aria-label="Resumen multiplicación">
        <KpiCard label="Expedientes abiertos" value={rows.length} />
        <KpiCard label="Con ≥3 ganados vinculados" value={with3Won} />
        <KpiCard label="Equipos de 12" value={withTeam12} />
        <KpiCard label="Con 6 líderes activos+célula" value={withActiveLeaders} />
      </StatGroup>

      {canManage ? (
        <DataCard className="space-y-3">
          <SectionHeader
            title="Abrir expediente"
            description="Una sola Persona Maestra. No crea persona nueva."
          />
          <EnrollmentPersonForm
            label="Estudiante (buscar Persona Maestra)"
            buttonLabel="Abrir / recuperar expediente 3–12"
            onEnroll={async (personId) => {
              "use server";
              return openExpedienteAction({
                studentPersonId: personId,
                openedAtAcademicLevel: "cd1",
              });
            }}
          />
        </DataCard>
      ) : null}

      <DataCard className="space-y-3">
        <SectionHeader title="Expedientes en alcance" />
        {rows.length === 0 ? (
          <EmptyState
            title="Sin expedientes"
            description="Abre un expediente para un estudiante en Capacitación Destino."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.expedienteId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3 text-sm"
              >
                <div>
                  <Link
                    href={`/discipular/multiplicacion/${r.studentPersonId}`}
                    className="font-medium underline"
                  >
                    {r.fullName}
                  </Link>
                  <p className="text-[var(--muted)]">
                    Contactos {r.counters.contacts.listed}/15 · Ganados vinculados{" "}
                    {r.counters.contacts.wonLinked} · Equipo {r.counters.team.teamSize}/12 ·
                    Líderes activos {r.counters.team.activeLeadersWithCell}/6
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      <DataCard className="space-y-3">
        <SectionHeader
          title="Proyecciones de calendario (datos reales)"
          description="Si no hay ciclos configurados, el estado es SIN CALENDARIO SUFICIENTE. No se inventan fechas."
        />
        {sampleProjections.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Abre un expediente para evaluar proyecciones A/B/C contra ciclos existentes.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {sampleProjections.map((p) => (
              <li
                key={p.key}
                className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3"
              >
                <p className="font-medium">
                  {p.key}. {p.title} — {p.status}
                </p>
                <p className="text-[var(--muted)]">{p.detail}</p>
                {p.deadlineDate ? (
                  <p className="text-[var(--muted)]">
                    Fecha límite: {p.deadlineDate}
                    {p.weeksDelta != null ? ` · Δ semanas: ${p.weeksDelta}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}
