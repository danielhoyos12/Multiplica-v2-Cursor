"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PersonSearchField } from "@/components/persons/person-search-field";
import { ErrorState } from "@/components/ui/error-state";
import { activateLeaderAction } from "@/modules/leadership/actions";

type Props = {
  personId: string;
  defaultDirectLeaderPersonId?: string | null;
  allowRoot?: boolean;
};

export function ActivateLeaderForm({
  personId,
  defaultDirectLeaderPersonId,
  allowRoot,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<{
    username: string;
    email: string;
    temporaryPassword: string | null;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  if (creds) {
    return (
      <div className="space-y-3 rounded-[var(--radius)] border border-[var(--success-border)] bg-[var(--success-soft)] p-4 text-sm">
        <p className="font-medium text-[var(--success)]">Líder activado</p>
        <p>
          Usuario: <strong>{creds.username}</strong>
        </p>
        <p>
          Correo: <strong>{creds.email}</strong>
        </p>
        {creds.temporaryPassword ? (
          <p>
            Contraseña temporal (muéstrala una sola vez):{" "}
            <strong className="break-all">{creds.temporaryPassword}</strong>
          </p>
        ) : (
          <p>Se reutilizó un usuario existente (sin nueva contraseña).</p>
        )}
        <button
          type="button"
          className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-white"
          onClick={() => router.push(`/liderazgo/${personId}`)}
        >
          Ir al panel del líder
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await activateLeaderAction({
            personId,
            directLeaderPersonId: String(form.get("directLeaderPersonId") ?? "") || null,
            isMinistryRoot: form.get("isMinistryRoot") === "on",
            email: String(form.get("email") ?? ""),
            cell: {
              name: String(form.get("cellName") ?? ""),
              dayOfWeek: String(form.get("dayOfWeek") ?? "wednesday"),
              startTime: String(form.get("startTime") ?? "19:30"),
              address: String(form.get("address") ?? ""),
              districtId: null,
            },
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setCreds({
            username: result.username!,
            email: result.email!,
            temporaryPassword: result.temporaryPassword ?? null,
          });
        });
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>Nombre de la célula evangelística</span>
        <input
          name="cellName"
          required
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span>Día</span>
          <select
            name="dayOfWeek"
            defaultValue="wednesday"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          >
            {[
              ["monday", "Lunes"],
              ["tuesday", "Martes"],
              ["wednesday", "Miércoles"],
              ["thursday", "Jueves"],
              ["friday", "Viernes"],
              ["saturday", "Sábado"],
              ["sunday", "Domingo"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>Hora</span>
          <input
            type="time"
            name="startTime"
            defaultValue="19:30"
            required
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span>Dirección</span>
        <input
          name="address"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Correo (opcional)</span>
        <input
          type="email"
          name="email"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
        />
      </label>
      <PersonSearchField
        name="directLeaderPersonId"
        label="Líder directo"
        defaultPersonId={defaultDirectLeaderPersonId}
        helpText="Busca por nombre o teléfono. Déjalo vacío solo si activas raíz ministerial."
      />
      {allowRoot ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isMinistryRoot" className="size-4" />
          Activar como raíz ministerial (Líder General)
        </label>
      ) : null}
      {error ? <ErrorState title="No se pudo activar" message={error} /> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Activando…" : "Activar como líder"}
      </button>
    </form>
  );
}
