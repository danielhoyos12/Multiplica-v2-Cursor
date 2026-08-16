"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PersonSearchField } from "@/components/persons/person-search-field";
import { ErrorState } from "@/components/ui/error-state";
import { createTransferAction } from "@/modules/transfers/actions";

type Option = { id: string; label: string };

type Props = {
  networks: Option[];
  ministries: Option[];
};

export function TransferRequestForm({ networks, ministries }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        start(async () => {
          const result = await createTransferAction({
            personId: String(form.get("personId") ?? ""),
            transferType: String(form.get("transferType") ?? "network_change"),
            destinationNetworkId: String(form.get("destinationNetworkId") ?? "") || null,
            destinationMinistryId: String(form.get("destinationMinistryId") ?? "") || null,
            proposedDirectLeaderPersonId:
              String(form.get("proposedDirectLeaderPersonId") ?? "") || null,
            reason: String(form.get("reason") ?? ""),
            structureMode: "not_applicable",
            submit: true,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          event.currentTarget.reset();
          router.refresh();
        });
      }}
    >
      <h2 className="font-medium">Nueva solicitud</h2>
      <p className="text-xs text-[var(--muted)]">
        Confirma destino y motivo. La ejecución requiere aprobación y preview.
      </p>
      <PersonSearchField name="personId" label="Persona a transferir" required />
      <label className="block space-y-1 text-sm">
        <span>Tipo</span>
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
      </label>
      <label className="block space-y-1 text-sm">
        <span>Red destino (opcional)</span>
        <select
          name="destinationNetworkId"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
          defaultValue=""
        >
          <option value="">—</option>
          {networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span>Ministerio destino (opcional)</span>
        <select
          name="destinationMinistryId"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
          defaultValue=""
        >
          <option value="">—</option>
          {ministries.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <PersonSearchField
        name="proposedDirectLeaderPersonId"
        label="Nuevo líder directo (opcional)"
      />
      <label className="block space-y-1 text-sm">
        <span>Motivo pastoral</span>
        <textarea
          name="reason"
          required
          minLength={5}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
        />
      </label>
      {error ? <ErrorState title="No se pudo crear" message={error} /> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Creando…" : "Crear solicitud"}
      </button>
    </form>
  );
}
