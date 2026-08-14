import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { NETWORK_SEEDS } from "@/db/seeds/data";

export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  const networkRows = NETWORK_SEEDS.map((network) => ({
    id: network.code,
    name: network.name,
    status: network.isActive ? "Activa" : "Desactivada",
    configurable: network.isConfigurable ? "Sí" : "No",
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Foundation"
        description="Base técnica de MULTIPLICA lista para Organización, identidad y seguridad. Los workflows pastorales aún no están habilitados."
        actions={<StatusBadge label="Fase 0" tone="brand" />}
      />

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
          Catálogo de Redes (seed)
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Vista de referencia del seed. No inventa los 12 Ministerios Generales.
        </p>
        <DataTable
          rows={networkRows}
          getRowId={(row) => row.id}
          columns={[
            { key: "name", header: "Red", cell: (row) => row.name },
            {
              key: "status",
              header: "Estado",
              cell: (row) => (
                <StatusBadge
                  label={row.status}
                  tone={row.status === "Activa" ? "success" : "warning"}
                />
              ),
            },
            {
              key: "configurable",
              header: "Configurable",
              cell: (row) => row.configurable,
            },
          ]}
        />
      </section>

      <EmptyState
        title="Mi estructura llegará en una fase posterior"
        description="La pantalla primaria del líder se construirá cuando exista el árbol de liderazgo, activaciones y células."
      />
    </div>
  );
}
