"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { updatePersonAction } from "@/modules/ganar/actions";

type Option = { id: string; name: string };

type Props = {
  personId: string;
  initial: {
    fullName: string;
    phone: string;
    address: string;
    districtId: string;
    prayerRequest: string;
    email: string;
  };
  districts: Option[];
};

export function EditPersonForm({ personId, initial, districts }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await updatePersonAction(personId, {
            fullName: String(form.get("fullName") ?? ""),
            phone: String(form.get("phone") ?? ""),
            address: String(form.get("address") ?? ""),
            districtId: String(form.get("districtId") ?? ""),
            prayerRequest: String(form.get("prayerRequest") ?? ""),
            email: String(form.get("email") ?? ""),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <Field label="Nombre completo" name="fullName" defaultValue={initial.fullName} required />
      <Field label="Teléfono" name="phone" defaultValue={initial.phone} required />
      <Field label="Dirección" name="address" defaultValue={initial.address} required />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Distrito</span>
        <select
          name="districtId"
          defaultValue={initial.districtId}
          required
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none ring-[var(--brand)] focus:ring-2"
        >
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Petición de oración</span>
        <textarea
          name="prayerRequest"
          rows={4}
          defaultValue={initial.prayerRequest}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none ring-[var(--brand)] focus:ring-2"
        />
      </label>
      <Field label="Correo" name="email" type="email" defaultValue={initial.email} />
      {error ? <ErrorState title="No se pudo guardar" message={error} /> : null}
      {saved ? (
        <p className="text-sm text-[var(--success)]">Cambios guardados.</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none ring-[var(--brand)] focus:ring-2"
      />
    </label>
  );
}
