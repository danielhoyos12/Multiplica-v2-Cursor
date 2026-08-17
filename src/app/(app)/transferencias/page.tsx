import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard, SectionHeader } from "@/components/dashboard";
import { TransferConfirmButton } from "@/components/transfers/transfer-confirm-button";
import { TransferRequestForm } from "@/components/transfers/transfer-request-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import { api, getConvexHttpClient } from "@/server/convex";
import {
  approveTransferAction,
  executeTransferAction,
  rejectTransferAction,
} from "@/modules/transfers/actions";
import { listTransferRequests } from "@/modules/transfers";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Transferencias" };

type Search = Promise<{ estado?: string }>;

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "transfers.read")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const status = params.estado || undefined;
  const rows = await listTransferRequests(session.id, { status });
  const canRequest = hasPermission(auth, "transfers.request");
  const canApprove = hasPermission(auth, "transfers.approve");
  const canExecute = hasPermission(auth, "transfers.execute");

  const client = getConvexHttpClient();
  const [allMinistries, allNetworks] = await Promise.all([
    client.query(api.organization.listMinistries, {}),
    client.query(api.organization.listNetworks, {}),
  ]);
  const ministryRows = allMinistries
    .filter((m) => m.isActive)
    .map((m) => ({ id: m._id, code: m.code, name: m.name }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const networkRows = allNetworks.filter((n) => n.isActive).map((n) => ({ id: n._id, name: n.name }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Transferencias pastorales"
        description="Cambios de Red, Ministerio, líder directo, subárbol y desactivación con plan. Nunca perder personas. Bajo Liderazgo en la navegación."
        actions={
          <Link href="/enviar" className="text-sm underline">
            Enviar
          </Link>
        }
      />

      <DataCard className="space-y-3">
        <SectionHeader title="Filtrar solicitudes" />
        <form className="flex flex-wrap gap-2 text-sm">
          <select
            name="estado"
            defaultValue={status ?? ""}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          >
            <option value="">Todas</option>
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobadas</option>
            <option value="executed">Ejecutadas</option>
            <option value="rejected">Rechazadas</option>
            <option value="draft">Borradores</option>
          </select>
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-white"
          >
            Filtrar
          </button>
        </form>
      </DataCard>

      {canRequest ? (
        <DataCard>
          <TransferRequestForm
            networks={networkRows.map((n) => ({ id: n.id, label: n.name }))}
            ministries={ministryRows.map((m) => ({
              id: m.id,
              label: `${m.code} — ${m.name}`,
            }))}
          />
        </DataCard>
      ) : null}

      <DataCard className="space-y-3">
        <SectionHeader title="Solicitudes" />
        {rows.length === 0 ? (
          <EmptyState
            title="Sin solicitudes"
            description="Crea una arriba o espera aprobaciones."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper-100)]/40 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.fullName}</p>
                    <p className="text-[var(--muted)]">
                      {r.transferType} · {r.reason}
                    </p>
                  </div>
                  <StatusBadge
                    label={r.status}
                    tone={r.status === "executed" ? "success" : "warning"}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {canApprove && (r.status === "pending" || r.status === "draft") ? (
                    <>
                      <TransferConfirmButton
                        kind="approve"
                        personName={r.fullName}
                        transferType={r.transferType}
                        reason={r.reason}
                        action={async () => {
                          "use server";
                          await approveTransferAction(r.id);
                        }}
                      />
                      <TransferConfirmButton
                        kind="reject"
                        personName={r.fullName}
                        transferType={r.transferType}
                        reason={r.reason}
                        action={async () => {
                          "use server";
                          await rejectTransferAction(r.id, "Rechazado desde UI");
                        }}
                      />
                    </>
                  ) : null}
                  {canExecute && r.status === "approved" ? (
                    <TransferConfirmButton
                      kind="execute"
                      personName={r.fullName}
                      transferType={r.transferType}
                      reason={r.reason}
                      action={async () => {
                        "use server";
                        await executeTransferAction(r.id);
                      }}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}
