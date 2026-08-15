import Link from "next/link";
import { redirect } from "next/navigation";

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
        description="Evento pastoral tras Escuela Ministerial. Completar no activa liderazgo. Siguiente etapa: elegibilidad Enviar (no implementada)."
        actions={
          <Link href="/escuela-ministerial" className="text-sm underline">
            Escuela Ministerial
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Elegibles" value={counts.eligible} />
        <Kpi label="Inscritos / en curso" value={counts.enrolled} />
        <Kpi label="Completados" value={counts.completed} />
        <Kpi label="Pendientes" value={counts.pending} />
      </div>

      {canManageCycles ? (
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
          className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <h2 className="font-medium">Crear evento</h2>
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
            className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-sm text-white"
          >
            Crear evento
          </button>
        </form>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium">Eventos</h2>
        <ul className="space-y-2">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
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
          {events.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sin eventos.</p>
          ) : null}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Aptos</h2>
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
