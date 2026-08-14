import Link from "next/link";
import { redirect } from "next/navigation";

import { InternalGanarForm } from "@/components/ganar/internal-form";
import { PageHeader } from "@/components/ui/page-header";
import { hasPermission } from "@/modules/authorization";
import { listCatalogsForGanar } from "@/modules/ganar";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Nueva persona · GANAR" };

export default async function NuevaPersonaPage() {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "persons.write")) {
    redirect("/ganar");
  }

  const catalogs = await listCatalogsForGanar(session.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Agregar persona"
        description="Alta en la Persona Maestra. No asigna célula en esta fase."
        actions={
          <Link href="/ganar" className="text-sm font-medium text-[var(--brand-ink)] underline">
            Volver al listado
          </Link>
        }
      />
      <InternalGanarForm
        districts={catalogs.districts}
        ministries={catalogs.ministries}
        networks={catalogs.networks}
        defaultMinistryId={
          catalogs.ministries.length === 1 ? catalogs.ministries[0]?.id : undefined
        }
      />
    </div>
  );
}
