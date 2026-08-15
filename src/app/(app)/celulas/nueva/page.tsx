import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateCellForm } from "@/components/cells/create-cell-form";
import { PageHeader } from "@/components/ui/page-header";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
import { listCatalogsForCells } from "@/modules/cells";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Nueva célula" };

export default async function NuevaCelulaPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "cells.create")) {
    redirect("/celulas");
  }
  const catalogs = await listCatalogsForCells(session.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nueva célula"
        description="Asigna Ministerio, Red y horario. Los miembros se agregan después desde GANAR."
        actions={
          <Link href="/celulas" className="text-sm font-medium underline">
            Volver
          </Link>
        }
      />
      <CreateCellForm
        ministries={catalogs.ministries}
        networks={catalogs.networks}
        districts={catalogs.districts}
        canCreateTwelve={isSuperadmin(auth)}
      />
    </div>
  );
}
