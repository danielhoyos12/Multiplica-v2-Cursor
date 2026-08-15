import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { hasPermission } from "@/modules/authorization";
import {
  approveTransferAction,
  createTransferAction,
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
  const { auth } = await requireAppActor();
  if (!hasPermission(auth, "transfers.read")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const status = params.estado || undefined;
  const rows = await listTransferRequests(
    (
      await requireAppActor()
    ).session.id,
    { status },
  );
  const canRequest = hasPermission(auth, "transfers.request");
  const canApprove = hasPermission(auth, "transfers.approve");
  const canExecute = hasPermission(auth, "transfers.execute");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Transferencias pastorales"
        description="Cambios de Red, Ministerio, líder directo, subárbol y desactivación con plan. Nunca perder personas."
        actions={
          <Link href="/enviar" className="text-sm underline">
            Enviar
          </Link>
        }
      />

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
          className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-white"
        >
          Filtrar
        </button>
      </form>

      {canRequest ? (
        <form
          action={async (formData) => {
            "use server";
            await createTransferAction({
              personId: String(formData.get("personId") ?? ""),
              transferType: String(formData.get("transferType") ?? "network_change"),
              destinationNetworkId: String(formData.get("destinationNetworkId") ?? "") || null,
              destinationMinistryId:
                String(formData.get("destinationMinistryId") ?? "") || null,
              proposedDirectLeaderPersonId:
                String(formData.get("proposedDirectLeaderPersonId") ?? "") || null,
              reason: String(formData.get("reason") ?? ""),
              structureMode: "not_applicable",
              submit: true,
            });
          }}
          className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <h2 className="font-medium">Nueva solicitud</h2>
          <p className="text-xs text-[var(--muted)]">
            Wizard simplificado. Para desactivación con estructura use preview + plan completo vía API/verify.
          </p>
          <input
            name="personId"
            required
            placeholder="personId (UUID)"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
          />
          <select
            name="transferType"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="network_change">Cambio de Red</option>
            <option value="ministry_change">Cambio de Ministerio</option>
            <option value="direct_leader_change">Cambio de líder directo</option>
            <option value="subtree_move">Mover subárbol</option>
            <option value="cell_membership_transfer">Transferir membresía</option>
          </select>
          <input
            name="destinationNetworkId"
            placeholder="destinationNetworkId (opcional)"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="destinationMinistryId"
            placeholder="destinationMinistryId (opcional)"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            name="proposedDirectLeaderPersonId"
            placeholder="nuevo líder directo (opcional)"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
          />
          <textarea
            name="reason"
            required
            minLength={5}
            placeholder="Motivo pastoral"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-sm text-white"
          >
            Crear solicitud
          </button>
        </form>
      ) : null}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.id}
            className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{r.fullName}</p>
                <p className="text-[var(--muted)]">
                  {r.transferType} · {r.reason}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  ORIGEN ministry {r.sourceMinistryId?.slice(0, 8) ?? "—"} / network{" "}
                  {r.sourceNetworkId?.slice(0, 8) ?? "—"}
                  <br />
                  DESTINO ministry {r.destinationMinistryId?.slice(0, 8) ?? "—"} / network{" "}
                  {r.destinationNetworkId?.slice(0, 8) ?? "—"}
                </p>
              </div>
              <StatusBadge label={r.status} tone={r.status === "executed" ? "success" : "warning"} />
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
                      className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-2 py-1 text-xs text-white"
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
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin solicitudes.</p>
        ) : null}
      </ul>
    </div>
  );
}
