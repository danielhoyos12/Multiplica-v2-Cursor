import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { DataCard, SectionHeader } from "@/components/dashboard";
import { TransferRequestForm } from "@/components/transfers/transfer-request-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDb } from "@/db/client";
import { ministries, networks } from "@/db/schema";
import { hasPermission } from "@/modules/authorization";
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

  const db = getDb();
  const ministryRows = await db
    .select({ id: ministries.id, code: ministries.code, name: ministries.name })
    .from(ministries)
    .where(eq(ministries.isActive, true))
    .orderBy(asc(ministries.code));
  const networkRows = await db
    .select({ id: networks.id, name: networks.name })
    .from(networks)
    .where(eq(networks.isActive, true))
    .orderBy(asc(networks.sortOrder));

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
                      <form
                        action={async () => {
                          "use server";
                          await approveTransferAction(r.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-2 py-1 text-xs text-white"
                        >
                          Aprobar
                        </button>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          await rejectTransferAction(r.id, "Rechazado desde UI");
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs"
                        >
                          Rechazar
                        </button>
                      </form>
                    </>
                  ) : null}
                  {canExecute && r.status === "approved" ? (
                    <form
                      action={async () => {
                        "use server";
                        await executeTransferAction(r.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="rounded-[var(--radius-sm)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-2 py-1 text-xs text-[var(--danger)]"
                      >
                        Ejecutar (confirmado)
                      </button>
                    </form>
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
