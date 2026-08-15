import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAppActor } from "@/server/actor";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const { auth } = await requireAppActor();

  return (
    <div className="space-y-8">
      <PageHeader
        title="MULTIPLICA"
        description="Fase 6: Capacitación Destino — Niveles 1–3 sobre training_*."
        actions={<StatusBadge label="Fase 6" tone="brand" />}
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

      <EmptyState
        title="Proceso pastoral"
        description="Escalera → UDV → Destino. Completar un nivel no activa liderazgo ni abre célula."
      />
      <p className="text-sm">
        <Link href="/destino" className="font-medium underline">
          Ir a Capacitación Destino
        </Link>
      </p>
    </div>
  );
}
