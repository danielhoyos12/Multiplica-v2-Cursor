import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import {
  completeSendAction,
  startSendAction,
} from "@/modules/send/actions";
import { getSendDashboardCounts, listSendPeople } from "@/modules/send";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Enviar" };

export default async function EnviarPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "send.read") && !hasPermission(auth, "process.read")) {
    redirect("/dashboard");
  }

  const counts = await getSendDashboardCounts(session.id);
  const people = await listSendPeople(session.id, { pageSize: 60 });
  const canManage = hasPermission(auth, "send.manage");
  const canComplete = hasPermission(auth, "send.complete");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Enviar"
        description="Culminación de la Escalera. Completar Enviar no activa liderazgo ni abre célula. Ungido ≠ Activo."
        actions={
          <div className="flex gap-3">
            <Link href="/proceso" className="text-sm underline">
              Escalera
            </Link>
            <Link href="/transferencias" className="text-sm underline">
              Transferencias
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Aptos" value={counts.eligible} />
        <Kpi label="En proceso" value={counts.inProgress} />
        <Kpi label="Completados" value={counts.completed} />
        <Kpi label="Ungidos / eligible" value={counts.ungidos} />
        <Kpi label="Activados (Phase 4)" value={counts.activados} />
      </div>

      <p className="text-sm text-[var(--muted)]">
        Formación completa → Enviado → Ungido/apto → Activado como líder (Fase 4).
      </p>

      <ul className="space-y-2">
        {people.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
          >
            <div>
              <Link href={`/ganar/${p.personId}`} className="font-medium underline">
                {p.fullName}
              </Link>
              <p className="text-[var(--muted)]">
                Enviar: {p.statusLabel} · Liderazgo: {p.leadershipStatus}
                {p.leadershipActive ? " (activo)" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={p.statusLabel}
                tone={p.status === "completed" ? "success" : "warning"}
              />
              {canManage && p.status === "eligible" ? (
                <form
                  action={async () => {
                    "use server";
                    await startSendAction({ personId: p.personId });
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs"
                  >
                    Iniciar
                  </button>
                </form>
              ) : null}
              {canComplete && p.status !== "completed" ? (
                <form
                  action={async () => {
                    "use server";
                    await completeSendAction({
                      personId: p.personId,
                      markEligible: true,
                    });
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-2 py-1 text-xs text-white"
                  >
                    Completar + Ungir
                  </button>
                </form>
              ) : null}
              {canComplete && p.status !== "completed" ? (
                <form
                  action={async () => {
                    "use server";
                    await completeSendAction({
                      personId: p.personId,
                      markEligible: false,
                    });
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs"
                  >
                    Solo completar
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
        {people.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin personas en Enviar en tu alcance.</p>
        ) : null}
      </ul>
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
