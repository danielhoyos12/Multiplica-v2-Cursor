import { redirect } from "next/navigation";

import { DataCard, SectionHeader } from "@/components/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { listNetworksForActor } from "@/modules/organization";
import { canManageNetwork, hasPermission, type NetworkCode } from "@/modules/authorization";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Redes" };

const ALL: NetworkCode[] = ["hombres", "mujeres", "jovenes", "ninos"];

export default async function NetworksAdminPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "network.read")) {
    redirect("/dashboard");
  }

  const networks = await listNetworksForActor(session.id);

  const compatibility = ALL.map((manager) => ({
    id: manager,
    manager,
    canManage: ALL.filter((target) => canManageNetwork(manager, target)).join(", ") || "—",
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Redes"
        description="Catálogo de Redes. Niños permanece desactivado hasta activación explícita. Compatibilidad según invariante 16."
      />

      <DataCard>
        <DataTable
          rows={networks}
          getRowId={(row) => row.id}
          columns={[
            { key: "code", header: "Código", cell: (row) => row.code },
            { key: "name", header: "Nombre", cell: (row) => row.name },
            {
              key: "status",
              header: "Estado",
              cell: (row) => (
                <StatusBadge
                  label={row.isActive ? "Activa" : "Desactivada"}
                  tone={row.isActive ? "success" : "warning"}
                />
              ),
            },
            {
              key: "configurable",
              header: "Configurable",
              cell: (row) => (row.isConfigurable ? "Sí" : "No"),
            },
          ]}
        />
      </DataCard>

      <DataCard className="space-y-3">
        <SectionHeader title="Compatibilidad de gestión" />
        <DataTable
          rows={compatibility}
          getRowId={(row) => row.id}
          columns={[
            { key: "manager", header: "Red gestora", cell: (row) => row.manager },
            {
              key: "canManage",
              header: "Puede gestionar",
              cell: (row) => row.canManage,
            },
          ]}
        />
      </DataCard>
    </div>
  );
}
