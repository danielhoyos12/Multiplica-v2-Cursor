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
        title="Foundation organizacional"
        description="Fase 1: Ministerios Generales, Redes, usuarios y autorización. Los workflows pastorales siguen fuera de alcance."
        actions={<StatusBadge label="Fase 1" tone="brand" />}
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
        title="Administración disponible"
        description="Usa Ministerios, Redes y Usuarios en el menú. Mi estructura y Ganar se habilitarán en fases posteriores."
      />
    </div>
  );
}
