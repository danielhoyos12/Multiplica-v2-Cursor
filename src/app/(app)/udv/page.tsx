import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard } from "@/components/dashboard/data-card";
import { SectionHeader } from "@/components/dashboard/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import {
  activateCycleAction,
  createCycleAction,
} from "@/modules/formation/actions";
import { ensureUdvProgram, listUdvCycles } from "@/modules/formation";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Universidad de la Vida" };

export default async function UdvPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "udv.read") && !hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  await ensureUdvProgram();
  const cycles = await listUdvCycles(session.id);
  const canManageCycles = hasPermission(auth, "school.cycles.manage");
  const active = cycles.find((c) => c.status === "active");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Universidad de la Vida"
        description="Módulo Legacy. Progreso pastoral/académico ligero. Requiere Consolidar completado. No activa liderazgo."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label="Legacy" tone="neutral" />
            <Link href="/proceso" className="text-sm font-medium text-[var(--cobalt)] underline">
              Escalera
            </Link>
          </div>
        }
      />

      {active ? (
        <InlineNotice tone="success" title="Ciclo activo">
          <Link href={`/udv/${active.id}`} className="font-medium underline">
            {active.name}
          </Link>
        </InlineNotice>
      ) : (
        <EmptyState
          title="No hay ciclo activo"
          description="Crea o activa un ciclo cuando corresponda."
          className="py-6"
        />
      )}

      {canManageCycles ? (
        <DataCard className="space-y-3">
          <SectionHeader title="Crear ciclo" />
          <form
            action={async (formData) => {
              "use server";
              await createCycleAction({
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
              placeholder="Ej. UDV Agosto–Octubre 2026"
              className="neo-touch w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="date"
                name="startDate"
                required
                className="neo-touch rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
              />
              <input
                type="date"
                name="endDate"
                required
                className="neo-touch rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="neo-touch rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm text-white"
            >
              Crear ciclo
            </button>
          </form>
        </DataCard>
      ) : null}

      <DataCard className="space-y-3">
        <SectionHeader title="Ciclos" description="Listado legacy UDV." />
        {cycles.length === 0 ? (
          <EmptyState title="Sin ciclos" description="Aún no hay ciclos UDV." />
        ) : (
          <ul className="space-y-2">
            {cycles.map((cycle) => (
              <li
                key={cycle.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--rice)]/40 px-4 py-3"
              >
                <div>
                  <Link
                    href={`/udv/${cycle.id}`}
                    className="font-medium text-[var(--cobalt)] underline-offset-4 hover:underline"
                  >
                    {cycle.name}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {String(cycle.startDate)} → {String(cycle.endDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    label={cycle.status}
                    tone={cycle.status === "active" ? "success" : "neutral"}
                  />
                  {canManageCycles && cycle.status === "planned" ? (
                    <form
                      action={async () => {
                        "use server";
                        await activateCycleAction(cycle.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="neo-touch rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs"
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
    </div>
  );
}
