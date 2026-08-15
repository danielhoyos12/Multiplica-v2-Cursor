import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import {
  ensureDestinoPrograms,
  getDestinoDashboardCounts,
  listDestinoCycles,
  listDestinoEligible,
} from "@/modules/formation";
import {
  activateDestinoCycleAction,
  createDestinoCycleAction,
} from "@/modules/formation/actions";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Capacitación Destino" };

type Search = Promise<{ nivel?: string }>;

export default async function DestinoPage({ searchParams }: { searchParams: Search }) {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "destination.read") && !hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const levelFilter =
    params.nivel === "1" || params.nivel === "2" || params.nivel === "3"
      ? (Number(params.nivel) as 1 | 2 | 3)
      : undefined;

  await ensureDestinoPrograms();
  const counts = await getDestinoDashboardCounts(session.id);
  const cycles = await listDestinoCycles(session.id, levelFilter);
  const aptosN1 = await listDestinoEligible(session.id, 1);
  const canManageCycles = hasPermission(auth, "school.cycles.manage");
  const canEnroll = hasPermission(auth, "destination.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Capacitación Destino"
        description="CD1 → CD2 → Re-Encuentro → CD3. CD1 requiere Consolidar completado (no UDV). Completar no activa liderazgo."
        actions={
          <div className="flex gap-3">
            <Link href="/proceso" className="text-sm font-medium underline">
              Escalera
            </Link>
            <Link href="/reencuentro" className="text-sm font-medium underline">
              Re-Encuentro
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Nivel 1 (curso/apto)" value={counts.n1InProgress} />
        <Kpi label="Nivel 2 (curso/apto)" value={counts.n2InProgress} />
        <Kpi label="Nivel 3 (curso/apto)" value={counts.n3InProgress} />
        <Kpi label="Aptos Nivel 1" value={counts.aptosN1} />
        <Kpi label="Aptos Nivel 2" value={counts.aptosN2} />
        <Kpi label="Aptos Nivel 3" value={counts.aptosN3} />
        <Kpi label="Pendientes requisito pastoral" value={counts.pendingPastoral} />
        <Kpi label="Graduados N1" value={counts.n1Completed} />
        <Kpi label="Graduados N2/N3" value={counts.n2Completed + counts.n3Completed} />
      </div>

      <form className="flex flex-wrap gap-2 text-sm">
        <select
          name="nivel"
          defaultValue={levelFilter ? String(levelFilter) : ""}
          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
        >
          <option value="">Todos los niveles</option>
          <option value="1">Nivel 1</option>
          <option value="2">Nivel 2</option>
          <option value="3">Nivel 3</option>
        </select>
        <button
          type="submit"
          className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-white"
        >
          Filtrar
        </button>
      </form>

      {canManageCycles ? (
        <form
          action={async (formData) => {
            "use server";
            await createDestinoCycleAction({
              level: Number(formData.get("level")) as 1 | 2 | 3,
              name: String(formData.get("name") ?? ""),
              startDate: String(formData.get("startDate") ?? ""),
              endDate: String(formData.get("endDate") ?? ""),
              ministryId: String(formData.get("ministryId") ?? "") || null,
            });
          }}
          className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <h2 className="font-medium">Crear ciclo Destino</h2>
          <select
            name="level"
            required
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
            defaultValue="1"
          >
            <option value="1">Nivel 1</option>
            <option value="2">Nivel 2</option>
            <option value="3">Nivel 3</option>
          </select>
          <input
            name="name"
            required
            placeholder="Ej. Destino N1 Agosto–Octubre 2026"
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
          {cycles.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sin ciclos Destino.</p>
          ) : (
            cycles.map((cycle) => (
              <li
                key={cycle.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <div>
                  <Link href={`/destino/${cycle.id}`} className="font-medium underline">
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
                        await activateDestinoCycleAction(cycle.id);
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
            ))
          )}
        </ul>
      </section>

      {canEnroll ? (
        <section className="space-y-2">
          <h2 className="font-medium">Aptos Nivel 1 (muestra)</h2>
          <p className="text-sm text-[var(--muted)]">
            UDV completada y Nivel 1 no formalizado. Inscribe desde el ciclo activo.
          </p>
          <ul className="space-y-1 text-sm">
            {aptosN1.slice(0, 12).map((p) => (
              <li key={p.personId} className="flex justify-between gap-2">
                <Link href={`/ganar/${p.personId}`} className="underline">
                  {p.fullName}
                </Link>
                <span className="text-[var(--muted)]">{p.levelStatus}</span>
              </li>
            ))}
            {aptosN1.length === 0 ? (
              <li className="text-[var(--muted)]">Nadie apto en tu alcance.</li>
            ) : null}
          </ul>
        </section>
      ) : null}
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
