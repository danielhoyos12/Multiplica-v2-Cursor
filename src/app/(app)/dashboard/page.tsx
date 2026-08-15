import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import { getSendDashboardCounts } from "@/modules/send";
import { listTransferRequests } from "@/modules/transfers";
import { requireAppActor } from "@/server/actor";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const { session, auth } = await requireAppActor();

  let aptosEnviar = 0;
  let ungidos = 0;
  let pendingTransfers = 0;

  if (hasPermission(auth, "send.read") || hasPermission(auth, "process.read")) {
    try {
      const counts = await getSendDashboardCounts(session.id);
      aptosEnviar = counts.eligible;
      ungidos = counts.ungidos;
    } catch {
      /* scoped deny ok */
    }
  }
  if (hasPermission(auth, "transfers.read")) {
    try {
      const pending = await listTransferRequests(session.id, { status: "pending" });
      pendingTransfers = pending.length;
    } catch {
      /* scoped deny ok */
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="MULTIPLICA"
        description="Fase 8: Enviar + transferencias pastorales. Ungido ≠ activo."
        actions={<StatusBadge label="Fase 8" tone="brand" />}
      />

      <div className="grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-2">
        <p>
          Roles:{" "}
          <span className="text-[var(--ink)]">{auth.roleCodes.join(", ") || "sin rol"}</span>
        </p>
        <p>
          Ministerios en scope:{" "}
          <span className="text-[var(--ink)]">{auth.ministryIds.length}</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AlertKpi
          label="Aptos para Enviar"
          value={aptosEnviar}
          href="/enviar"
        />
        <AlertKpi
          label="Ungidos pendientes de activación"
          value={ungidos}
          href="/enviar"
        />
        <AlertKpi
          label="Transferencias pendientes"
          value={pendingTransfers}
          href="/transferencias?estado=pending"
        />
        <AlertKpi
          label="Reasignaciones"
          value={0}
          href="/transferencias"
          hint="Plan vía leader_deactivation"
        />
      </div>

      <EmptyState
        title="Proceso pastoral"
        description="GANAR → Consolidar → Discipular → Enviar. Transferencias sin perder personas."
      />
      <p className="flex flex-wrap gap-3 text-sm">
        <Link href="/proceso" className="font-medium underline">
          Escalera
        </Link>
        <Link href="/enviar" className="font-medium underline">
          Enviar
        </Link>
        <Link href="/transferencias" className="font-medium underline">
          Transferencias
        </Link>
      </p>
    </div>
  );
}

function AlertKpi({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: number;
  href: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--brand)]"
    >
      <p className="text-2xl font-semibold text-[var(--ink)]">{value}</p>
      <p className="text-sm text-[var(--muted)]">{label}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </Link>
  );
}
