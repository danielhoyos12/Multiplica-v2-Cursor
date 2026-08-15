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
        description="Fase 7: Escuela Ministerial + Re-Encuentro."
        actions={<StatusBadge label="Fase 7" tone="brand" />}
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
        description="Escalera → Destino → Escuela Ministerial → Re-Encuentro. Completar no activa liderazgo."
      />
      <p className="flex flex-wrap gap-3 text-sm">
        <Link href="/escuela-ministerial" className="font-medium underline">
          Escuela Ministerial
        </Link>
        <Link href="/reencuentro" className="font-medium underline">
          Re-Encuentro
        </Link>
      </p>
    </div>
  );
}
