"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PersonSearchField } from "@/components/persons/person-search-field";
import { ErrorState } from "@/components/ui/error-state";
import { createCellAction } from "@/modules/cells/actions";

type Option = { id: string; name: string; code?: string };

type Props = {
  ministries: Option[];
  networks: Option[];
  districts: Option[];
  canCreateTwelve: boolean;
};

export function CreateCellForm({
  ministries,
  networks,
  districts,
  canCreateTwelve,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mx-auto max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await createCellAction({
            name: String(form.get("name") ?? ""),
            code: String(form.get("code") ?? ""),
            type: String(form.get("type") ?? "evangelistic"),
            ministryId: String(form.get("ministryId") ?? ""),
            networkId: String(form.get("networkId") ?? ""),
            responsiblePersonId: String(form.get("responsiblePersonId") ?? "") || null,
            dayOfWeek: String(form.get("dayOfWeek") ?? ""),
            startTime: String(form.get("startTime") ?? ""),
            timezone: "America/Lima",
            address: String(form.get("address") ?? ""),
            districtId: String(form.get("districtId") ?? "") || null,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/celulas/${result.cellId}`);
          router.refresh();
        });
      }}
    >
      <Field label="Nombre" name="name" required />
      <Field label="Código (opcional)" name="code" />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Tipo</span>
        <select
          name="type"
          defaultValue="evangelistic"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base sm:py-2 sm:text-sm"
        >
          <option value="evangelistic">Célula Evangelística</option>
          {canCreateTwelve ? <option value="twelve">Célula de 12</option> : null}
        </select>
      </label>
      <Select
        label="Ministerio General"
        name="ministryId"
        required
        options={ministries.map((m) => ({
          value: m.id,
          label: m.code ? `${m.code} — ${m.name}` : m.name,
        }))}
      />
      <Select
        label="Red"
        name="networkId"
        required
        options={networks.map((n) => ({ value: n.id, label: n.name }))}
      />
      <Select
        label="Día"
        name="dayOfWeek"
        required
        options={[
          ["monday", "Lunes"],
          ["tuesday", "Martes"],
          ["wednesday", "Miércoles"],
          ["thursday", "Jueves"],
          ["friday", "Viernes"],
          ["saturday", "Sábado"],
          ["sunday", "Domingo"],
        ].map(([value, label]) => ({ value, label }))}
      />
      <Field label="Hora" name="startTime" type="time" required defaultValue="19:30" />
      <Field label="Dirección / lugar" name="address" />
      <Select
        label="Distrito (opcional)"
        name="districtId"
        options={[
          { value: "", label: "— Sin distrito —" },
          ...districts.map((d) => ({ value: d.id, label: d.name })),
        ]}
      />
      <PersonSearchField
        name="responsiblePersonId"
        label="Responsable (opcional)"
        helpText="Busca por nombre o teléfono. Debe ser Persona Maestra del mismo Ministerio."
      />
      {error ? <ErrorState title="No se pudo crear" message={error} /> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Creando…" : "Crear célula"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base outline-none ring-[var(--brand)] focus:ring-2 sm:py-2 sm:text-sm"
      />
    </label>
  );
}

function Select({
  label,
  name,
  options,
  required,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base outline-none ring-[var(--brand)] focus:ring-2 sm:py-2 sm:text-sm"
      >
        {required ? (
          <option value="" disabled>
            Seleccionar…
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={`${opt.value}-${opt.label}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
