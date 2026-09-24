import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardBoard } from "@/components/dashboard/dashboard-board";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
import { api, getAuthenticatedConvexClient } from "@/server/convex";
import { DomainError } from "@/lib/errors";
import { userFacingErrorMessage } from "@/lib/user-facing-errors";
import { getExecutiveDashboard } from "@/modules/reporting";
import type { PeriodKey } from "@/modules/reporting";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Dashboard pastoral" };

type Search = Promise<{
  periodo?: string;
  ministerio?: string;
  red?: string;
  raiz?: string;
}>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { session, auth } = await requireAppActor();
  if (
    !hasPermission(auth, "dashboard.read") &&
    !hasPermission(auth, "persons.read") &&
    !hasPermission(auth, "process.read")
  ) {
    redirect("/ganar");
  }

  const params = await searchParams;
  const period = (params.periodo as PeriodKey | undefined) ?? "this_month";

  const client = await getAuthenticatedConvexClient();
  const [allMinistries, allNetworks] = await Promise.all([
    client.query(api.organization.listMinistries, {}),
    client.query(api.organization.listNetworks, {}),
  ]);
  const ministryRows = allMinistries
    .filter((m) => m.isActive)
    .map((m) => ({ id: m._id, code: m.code, name: m.name }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const networkRows = allNetworks
    .filter((n) => n.isActive)
    .map((n) => ({ id: n._id, code: n.code, name: n.name }));

  const visibleMinistries = isSuperadmin(auth)
    ? ministryRows
    : ministryRows.filter((m) => auth.ministryIds.includes(m.id));

  let dash;
  let loadError: string | null = null;
  try {
    dash = await getExecutiveDashboard(session.id, {
      period,
      ministryId: params.ministerio || null,
      networkId: params.red || null,
      rootPersonId: params.raiz || null,
    });
  } catch (e) {
    loadError = userFacingErrorMessage(e);
    if (!(e instanceof DomainError) && !(e instanceof Error)) {
      loadError = "Error al cargar dashboard";
    }
    dash = null;
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          No se pudo cargar el dashboard. {loadError}
        </div>
      ) : null}

      {dash ? (
        <DashboardBoard
          dash={dash}
          period={period}
          ministryId={params.ministerio}
          networkId={params.red}
          ministries={visibleMinistries}
          networks={networkRows}
          showMinistryFilter={isSuperadmin(auth) || visibleMinistries.length > 1}
          isSuperadmin={isSuperadmin(auth)}
        />
      ) : !loadError ? (
        <p className="text-sm text-[var(--muted)]">
          Sin datos.{" "}
          <Link href="/ganar" className="text-[var(--cobalt)] underline">
            Ir a Ganar
          </Link>
        </p>
      ) : null}
    </div>
  );
}
