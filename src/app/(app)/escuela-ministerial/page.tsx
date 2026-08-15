import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import {
  ensureEmProgram,
  getEmDashboardCounts,
  listEmCycles,
  listEmEligible,
} from "@/modules/formation";
import {
  activateEmCycleAction,
  createEmCycleAction,
} from "@/modules/formation/actions";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Escuela Ministerial" };

export default async function EscuelaMinisterialPage() {
  const { session, auth } = await requireAppActor();
  if (
    !hasPermission(auth, "ministerial_school.read") &&
    !hasPermission(auth, "process.read")
  ) {
    redirect("/dashboard");
  }

  await ensureEmProgram();
  const counts = await getEmDashboardCounts(session.id);
  const cycles = await listEmCycles(session.id);
  const aptos = await listEmEligible(session.id);
  const canManageCycles = hasPermission(auth, "school.cycles.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Escuela Ministerial"
        description="Posterior a Destino N3. Completar no activa liderazgo ni abre célula."
        actions={
          <div className="flex gap-3">
            <Link href="/destino" className="text-sm underline">
              Destino
            </Link>
            <Link href="/reencuentro" className="text-sm underline">
              Re-Encuentro
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Elegibles" value={counts.eligible} />
        <Kpi label="En curso / aptos" value={counts.inProgress} />
        <Kpi label="Académico completado" value={counts.academicCompleted} />
        <Kpi label="Completados" value={counts.completed} />
        <Kpi label="Pausados" value={counts.paused} />
        <Kpi label="Pendiente requisito" value={counts.pendingRequirement} />
      </div>

      {canManageCycles ? (
        <form
          action={async (formData) => {
            "use server";
            await createEmCycleAction({
              name: String(formData.get("name") ?? ""),
              startDate: String(formData.get("startDate") ?? ""),
              endDate: String(formData.get("endDate") ?? ""),
              ministryId: String(formData.get("ministryId") ?? "") || null,
            });
          }}
          className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <h2 className="font-medium">Crear ciclo EM</h2>
          <input
            name="name"
            required
            placeholder="Ej. EM Agosto–Noviembre 2026"
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
            className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-sm text-white"
          >
            Crear ciclo
          </button>
        </form>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium">Ciclos</h2>
        <ul className="space-y-2">
          {cycles.map((cycle) => (
            <li
              key={cycle.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            >
              <div>
                <Link
                  href={`/escuela-ministerial/${cycle.id}`}
                  className="font-medium underline"
                >
                  {cycle.name}
                </Link>
                <p className="text-sm text-[var(--muted)]">
                  {String(cycle.startDate)} → {String(cycle.endDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge label={cycle.status} tone="brand" />
                {canManageCycles && cycle.status === "planned" ? (
                  <form
                    action={async () => {
                      "use server";
                      await activateEmCycleAction(cycle.id);
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
          {cycles.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sin ciclos.</p>
          ) : null}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Aptos (muestra)</h2>
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
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-medium">{value}</p>
    </div>
  );
}
