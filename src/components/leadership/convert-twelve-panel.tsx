"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { convertTwelveAction } from "@/modules/leadership/actions";

type Member = {
  personId: string;
  fullName: string;
  isActiveLeader: boolean;
};

type Props = {
  cellId: string;
  members: Member[];
  readyForTwelve: boolean;
  progressLabel: string;
};

export function ConvertTwelvePanel({
  cellId,
  members,
  readyForTwelve,
  progressLabel,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ordinary = members.filter((m) => !m.isActiveLeader);

  return (
    <form
      className="space-y-3 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface-soft)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const form = new FormData(event.currentTarget);
        const evangelisticCellName =
          String(form.get("evangelisticCellName") ?? "") || undefined;
        startTransition(async () => {
          const result = await convertTwelveAction({
            cellId,
            ordinaryMemberPersonIds: ordinary.map((m) => m.personId),
            evangelisticCellName,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <p className="text-sm font-medium">Convertir en Célula de 12</p>
      <p className="text-sm text-[var(--muted)]">
        Progreso de líderes directos del responsable: {progressLabel}. La conversión no es
        silenciosa: confirma y resuelve miembros ordinarios.
      </p>
      {ordinary.length > 0 ? (
        <div className="space-y-2 text-sm">
          <p>
            {ordinary.length} miembro(s) ordinario(s) se moverán a una Célula Evangelística del
            mismo líder (máx. 2 células directas).
          </p>
          <ul className="list-inside list-disc text-[var(--muted)]">
            {ordinary.map((m) => (
              <li key={m.personId}>{m.fullName}</li>
            ))}
          </ul>
          <label className="block space-y-1">
            <span>Nombre de la evangelística residual (opcional)</span>
            <input
              name="evangelisticCellName"
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
              placeholder="Célula Evangelística"
            />
          </label>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">Sin miembros ordinarios pendientes.</p>
      )}
      {error ? <ErrorState title="No se pudo convertir" message={error} /> : null}
      <button
        type="submit"
        disabled={pending || !readyForTwelve}
        className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending
          ? "Convirtiendo…"
          : readyForTwelve
            ? "Convertir en Célula de 12"
            : `Aún no listo (${progressLabel})`}
      </button>
    </form>
  );
}
