import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard } from "@/components/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { listMinistriesForActor } from "@/modules/organization";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Ministerios" };

export default async function MinistriesAdminPage() {
  const { session, auth } = await requireAppActor();

  if (!hasPermission(auth, "ministry.read") && !hasPermission(auth, "ministry.manage")) {
    redirect("/dashboard");
  }

  const rows = await listMinistriesForActor(session.id);
  const canManage = isSuperadmin(auth) || hasPermission(auth, "ministry.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ministerios Generales"
        description="Raíces organizacionales configurables. No son hardcodeados; el Superadmin los administra."
        actions={
          canManage ? (
            <Link
              href="/admin/ministries/new"
              className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm font-medium text-white"
            >
              Nuevo ministerio
            </Link>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Sin ministerios todavía"
          description="Crea hasta 12 Ministerios Generales desde el panel de Superadmin. No se inventan nombres en seeds."
          action={
            canManage ? (
              <Link
                href="/admin/ministries/new"
                className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm font-medium text-white"
              >
                Crear el primero
              </Link>
            ) : null
          }
        />
      ) : (
        <DataCard>
          <DataTable
            rows={rows}
            getRowId={(row) => row.id}
            columns={[
              {
                key: "code",
                header: "Código",
                cell: (row) => (
                  <Link
                    href={`/admin/ministries/${row.id}`}
                    className="font-medium text-[var(--brand-ink)] underline-offset-2 hover:underline"
                  >
                    {row.code}
                  </Link>
                ),
              },
              { key: "name", header: "Nombre", cell: (row) => row.name },
              {
                key: "status",
                header: "Estado",
                cell: (row) => (
                  <StatusBadge
                    label={row.isActive ? "Activo" : "Inactivo"}
                    tone={row.isActive ? "success" : "warning"}
                  />
                ),
              },
              {
                key: "responsible",
                header: "Líder General",
                cell: (row) =>
                  row.responsibleDisplayName || row.responsibleEmail || "—",
              },
              {
                key: "sort",
                header: "Orden",
                cell: (row) => row.sortOrder,
              },
            ]}
          />
        </DataCard>
      )}
    </div>
  );
}
