import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  listUserRoleAssignments,
  listUsersForAdmin,
} from "@/modules/organization";
import { hasPermission } from "@/modules/authorization";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Usuarios" };

export default async function UsersAdminPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "users.read")) {
    redirect("/dashboard");
  }

  const [users, assignments] = await Promise.all([
    listUsersForAdmin(session.id),
    listUserRoleAssignments(session.id),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Usuarios y roles"
        description="Perfiles vinculados a auth.users. Asignaciones con scope global / ministry / network / tree."
      />

      <DataTable
        rows={users}
        getRowId={(row) => row.id}
        emptyMessage="No hay usuarios de aplicación todavía."
        columns={[
          {
            key: "name",
            header: "Nombre",
            cell: (row) => row.displayName || "—",
          },
          { key: "email", header: "Correo", cell: (row) => row.email },
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
            key: "person",
            header: "person_id",
            cell: (row) => (row.personId ? "vinculado" : "—"),
          },
        ]}
      />

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Asignaciones</h2>
        <DataTable
          rows={assignments}
          getRowId={(row) => row.id}
          emptyMessage="Sin asignaciones."
          columns={[
            { key: "email", header: "Usuario", cell: (row) => row.userEmail },
            { key: "role", header: "Rol", cell: (row) => row.roleCode },
            {
              key: "ministry",
              header: "Ministerio",
              cell: (row) => row.ministryId ?? "—",
            },
            {
              key: "network",
              header: "Red",
              cell: (row) => row.networkId ?? "—",
            },
            {
              key: "active",
              header: "Vigente",
              cell: (row) => (row.endsAt ? "No" : "Sí"),
            },
          ]}
        />
      </section>
    </div>
  );
}
