"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { createPersonInternalAction } from "@/modules/ganar/actions";
import type { DuplicateMatch } from "@/modules/ganar/service";

type Option = { id: string; name: string; code?: string };

type Props = {
  districts: Option[];
  ministries: Option[];
  networks: Option[];
  defaultMinistryId?: string;
  defaultNetworkId?: string;
};

export function InternalGanarForm({
  districts,
  ministries,
  networks,
  defaultMinistryId,
  defaultNetworkId,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [pending, startTransition] = useTransition();
  const [forceCreate, setForceCreate] = useState(false);

  const ministryOptions = useMemo(() => ministries, [ministries]);

  return (
    <form
      className="mx-auto max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await createPersonInternalAction({
            fullName: String(form.get("fullName") ?? ""),
            phone: String(form.get("phone") ?? ""),
            address: String(form.get("address") ?? ""),
            districtId: String(form.get("districtId") ?? ""),
            prayerRequest: String(form.get("prayerRequest") ?? ""),
            ministryId: String(form.get("ministryId") ?? ""),
            networkId: String(form.get("networkId") ?? ""),
            email: String(form.get("email") ?? ""),
            forceCreate,
          });
          if (!result.ok) {
            setError(result.error);
            if ("duplicates" in result && result.duplicates) {
              setDuplicates(result.duplicates);
            }
            return;
          }
          router.push(`/ganar/${result.personId}`);
          router.refresh();
        });
      }}
    >
      <Field label="Nombre completo" name="fullName" required autoComplete="name" />
      <Field label="Teléfono" name="phone" required inputMode="tel" autoComplete="tel" />
      <Field label="Dirección" name="address" required autoComplete="street-address" />
      <SelectField
        label="Distrito"
        name="districtId"
        required
        options={districts.map((d) => ({ value: d.id, label: d.name }))}
      />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[var(--ink)]">Petición de oración</span>
        <textarea
          name="prayerRequest"
          rows={3}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none ring-[var(--brand)] focus:ring-2"
          placeholder="Opcional"
        />
      </label>
      <SelectField
        label="Ministerio General"
        name="ministryId"
        required
        defaultValue={defaultMinistryId}
        options={ministryOptions.map((m) => ({
          value: m.id,
          label: m.code ? `${m.code} — ${m.name}` : m.name,
        }))}
      />
      <SelectField
        label="Red"
        name="networkId"
        required
        defaultValue={defaultNetworkId}
        options={networks.map((n) => ({ value: n.id, label: n.name }))}
      />
      <Field label="Correo (opcional)" name="email" type="email" autoComplete="email" />

      {duplicates.length > 0 ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4 text-sm">
          <p className="font-medium text-[var(--warning)]">Posible duplicado detectado</p>
          <ul className="space-y-2">
            {duplicates.map((dup) => (
              <li key={dup.personId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {dup.fullName} · {dup.phone ?? "sin teléfono"} · {dup.strength}
                </span>
                <Link
                  href={`/ganar/${dup.personId}`}
                  className="font-medium text-[var(--brand-ink)] underline"
                >
                  Ver registro
                </Link>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-[var(--ink)]">
            <input
              type="checkbox"
              checked={forceCreate}
              onChange={(e) => setForceCreate(e.target.checked)}
              className="size-4"
            />
            Entiendo el riesgo y quiero crear de todas formas
          </label>
        </div>
      ) : null}

      {error ? <ErrorState title="No se pudo registrar" message={error} /> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Guardando…" : "Registrar persona"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base outline-none ring-[var(--brand)] focus:ring-2 sm:py-2 sm:text-sm"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base outline-none ring-[var(--brand)] focus:ring-2 sm:py-2 sm:text-sm"
      >
        <option value="" disabled>
          Seleccionar…
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
