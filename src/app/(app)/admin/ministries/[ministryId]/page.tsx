import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MinistryDetailForms } from "@/components/admin/ministry-detail-forms";
import { getMinistryForActor, listUsersForAdmin } from "@/modules/organization";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
import { requireAppActor } from "@/server/actor";
import { DomainError, DomainErrorCode } from "@/lib/errors";

type PageProps = { params: Promise<{ ministryId: string }> };

export default async function MinistryDetailPage({ params }: PageProps) {
  const { ministryId } = await params;
  const { session, auth } = await requireAppActor();

  if (!hasPermission(auth, "ministry.read") && !hasPermission(auth, "ministry.manage")) {
    redirect("/dashboard");
  }

  let ministry;
  try {
    ministry = await getMinistryForActor(session.id, ministryId);
  } catch (error) {
    if (error instanceof DomainError && error.code === DomainErrorCode.NOT_FOUND) {
      notFound();
    }
    if (error instanceof DomainError && error.code === DomainErrorCode.NOT_AUTHORIZED) {
      redirect("/admin/ministries");
    }
    throw error;
  }

  const canManage = hasPermission(auth, "ministry.manage");
  const canAssign = hasPermission(auth, "users.assign_roles");
  const users = canAssign || isSuperadmin(auth) ? await listUsersForAdmin(session.id) : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={ministry.name}
        description={`Código humano ${ministry.code} · UUID interno gestionado por el sistema.`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge
              label={ministry.isActive ? "Activo" : "Inactivo"}
              tone={ministry.isActive ? "success" : "warning"}
            />
            <Link href="/admin/ministries" className="text-sm text-[var(--brand-ink)] underline">
              Volver
            </Link>
          </div>
        }
      />
      <MinistryDetailForms
        ministry={ministry}
        users={users}
        canManage={canManage}
        canAssign={canAssign}
      />
    </div>
  );
}
