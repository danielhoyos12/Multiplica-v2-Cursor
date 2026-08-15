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
        description="Fase 4: activación de líderes, credenciales, árbol G12 y navegación generacional."
        actions={<StatusBadge label="Fase 4" tone="brand" />}
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
        title="Mi estructura G12"
        description="Un líder activo requiere célula propia. Navega tu subárbol desde Mi estructura. Elegible ≠ activado."
      />
    </div>
  );
}
