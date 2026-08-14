import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { CreateMinistryForm } from "@/components/admin/create-ministry-form";
import { hasPermission } from "@/modules/authorization";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Nuevo ministerio" };

export default async function NewMinistryPage() {
  const { auth } = await requireAppActor();
  if (!hasPermission(auth, "ministry.manage")) {
    redirect("/admin/ministries");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nuevo Ministerio General"
        description="Código humano (ej. LP1) + nombre. El UUID interno se genera automáticamente."
      />
      <CreateMinistryForm />
    </div>
  );
}
