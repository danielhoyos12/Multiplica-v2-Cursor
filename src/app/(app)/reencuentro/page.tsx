import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard, KpiCard, SectionHeader, StatGroup } from "@/components/dashboard";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import {
  ensureReencuentroProgram,
  getReencuentroDashboardCounts,
  listReencuentroEligible,
  listReencuentroEvents,
} from "@/modules/formation";
import {
  activateReencuentroEventAction,
  createReencuentroEventAction,
} from "@/modules/formation/actions";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Re-Encuentro" };

export default async function ReencuentroPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "reencounter.read") && !hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  await ensureReencuentroProgram();
  const counts = await getReencuentroDashboardCounts(session.id);
  const events = await listReencuentroEvents(session.id);
  const aptos = await listReencuentroEligible(session.id);
  const canManageCycles = hasPermission(auth, "school.cycles.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Re-Encuentro"
        description="Después de CD2 y antes de CD3. Completar no activa liderazgo. Siguiente: Capacitación Destino 3."
        actions={
          <div className="flex gap-3">
            <Link href="/destino" className="text-sm underline">
              Capacitación Destino
            </Link>
            <Link href="/escuela-ministerial" className="text-sm underline">
              Escuela Ministerial
            </Link>
          </div>
        }
      />

      <StatGroup columns={4} aria-label="Resumen Re-Encuentro">
        <KpiCard
          label="Elegibles"
          value={counts.eligible}
          hint="Elegible ≠ activo como líder"
        />
        <KpiCard label="Inscritos / en curso" value={counts.enrolled} />
        <KpiCard label="Completados" value={counts.completed} />
        <KpiCard label="Pendientes" value={counts.pending} />
      </StatGroup>

      {canManageCycles ? (
        <DataCard className="space-y-3">
          <SectionHeader title="Crear evento" description="Nuevo evento de Re-Encuentro." />
          <form
            action={async (formData) => {
              "use server";
              await createReencuentroEventAction({
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
              placeholder="Ej. Re-Encuentro Agosto 2026"
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
              Crear evento
            </button>
          </form>
        </DataCard>
      ) : null}

      <DataCard className="space-y-3">
        <SectionHeader title="Eventos" />
        {events.length === 0 ? (
          <EmptyState title="Sin eventos" description="Aún no hay eventos de Re-Encuentro." />
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper-100)]/40 px-4 py-3"
              >
                <div>
                  <Link href={`/reencuentro/${ev.id}`} className="font-medium underline">
                    {ev.name}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {String(ev.startDate)} → {String(ev.endDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={ev.status} tone="brand" />
                  {canManageCycles && ev.status === "planned" ? (
                    <form
                      action={async () => {
                        "use server";
                        await activateReencuentroEventAction(ev.id);
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

      <DataCard className="space-y-3">
        <SectionHeader
          title="Aptos"
          description="Personas elegibles. Elegible ≠ inscrito ni líder activo."
        />
        <ul className="space-y-1 text-sm">
          {aptos.slice(0, 12).map((p) => (
            <li key={p.personId} className="flex justify-between gap-2">
              <Link href={`/ganar/${p.personId}`} className="underline">
                {p.fullName}
              </Link>
              <span className="text-[var(--muted)]">{p.status}</span>
            </li>
          ))}
          {aptos.length === 0 ? (
            <li className="text-[var(--muted)]">Nadie apto en tu alcance.</li>
          ) : null}
        </ul>
      </DataCard>
    </div>
  );
}
