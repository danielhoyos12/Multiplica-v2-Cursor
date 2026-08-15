import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import {
  ensureOfficialCatalog,
  getEmLevelsDashboardCounts,
  listEmLevelCycles,
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

  await ensureOfficialCatalog();
  const counts = await getEmLevelsDashboardCounts(session.id);
  const cycles = await listEmLevelCycles(session.id);
  const canManageCycles = hasPermission(auth, "school.cycles.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Escuela Ministerial"
        description="EM1 → EM2 → EM3 tras CD3. Doctrina + Seminario por nivel. Completar no activa liderazgo ni abre célula."
        actions={
          <div className="flex gap-3">
            <Link href="/destino" className="text-sm underline">
              Destino
            </Link>
            <Link href="/proceso" className="text-sm underline">
              Escalera
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="EM1 en curso/apto" value={counts.em1} />
        <Kpi label="EM1 completados" value={counts.em1Completed} />
        <Kpi label="EM2 en curso/apto" value={counts.em2} />
        <Kpi label="EM2 completados" value={counts.em2Completed} />
        <Kpi label="EM3 en curso/apto" value={counts.em3} />
        <Kpi label="EM3 completados" value={counts.em3Completed} />
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
          <h2 className="font-medium">Crear ciclo EM (legacy single program)</h2>
          <p className="text-xs text-[var(--muted)]">
            Preferir ciclos por nivel EM1/EM2/EM3 vía catálogo oficial. Este formulario
            conserva compatibilidad con el programa legacy.
          </p>
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
        <h2 className="font-medium">Ciclos EM1–EM3</h2>
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
            <p className="text-sm text-[var(--muted)]">Sin ciclos EM1–EM3.</p>
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
