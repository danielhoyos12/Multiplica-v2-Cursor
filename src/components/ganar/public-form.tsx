"use client";

import { useState, useTransition } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { submitPublicPersonAction } from "@/modules/ganar/actions";

type Option = { id: string; name: string; code?: string };

type Props = {
  districts: Option[];
  ministries: Option[];
  networks: Option[];
  defaultMinistryId?: string | null;
  defaultNetworkId?: string | null;
  lockMinistry?: boolean;
  lockNetwork?: boolean;
};

export function PublicGanarForm({
  districts,
  ministries,
  networks,
  defaultMinistryId,
  defaultNetworkId,
  lockMinistry,
  lockNetwork,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="mx-auto max-w-md space-y-6 px-1 text-center">
        <div className="space-y-2">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Registro recibido correctamente.
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Gracias. La información fue enviada al equipo pastoral.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-3 text-base font-medium text-white"
        >
          Registrar otra persona
        </button>
      </div>
    );
  }

  return (
    <form
      className="mx-auto max-w-md space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await submitPublicPersonAction({
            fullName: String(form.get("fullName") ?? ""),
            phone: String(form.get("phone") ?? ""),
            address: String(form.get("address") ?? ""),
            districtId: String(form.get("districtId") ?? ""),
            prayerRequest: String(form.get("prayerRequest") ?? ""),
            ministryId: String(form.get("ministryId") ?? ""),
            networkId: String(form.get("networkId") ?? ""),
            website: String(form.get("website") ?? ""),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(true);
          event.currentTarget.reset();
        });
      }}
    >
      {/* Honeypot — hidden from users */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
        aria-hidden="true"
      />

      <PublicField label="Nombre completo" name="fullName" required autoComplete="name" />
      <PublicField
        label="Teléfono"
        name="phone"
        required
        inputMode="tel"
        autoComplete="tel"
      />
      <PublicField
        label="Dirección"
        name="address"
        required
        autoComplete="street-address"
      />
      <PublicSelect
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
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base outline-none ring-[var(--brand)] focus:ring-2"
          placeholder="Opcional"
        />
      </label>
      <PublicSelect
        label="Ministerio General"
        name="ministryId"
        required
        defaultValue={defaultMinistryId ?? undefined}
        disabled={Boolean(lockMinistry && defaultMinistryId)}
        options={ministries.map((m) => ({
          value: m.id,
          label: m.code ? `${m.code} — ${m.name}` : m.name,
        }))}
      />
      <PublicSelect
        label="Red"
        name="networkId"
        required
        defaultValue={defaultNetworkId ?? undefined}
        disabled={Boolean(lockNetwork && defaultNetworkId)}
        options={networks.map((n) => ({ value: n.id, label: n.name }))}
      />

      {error ? <ErrorState title="Revisa los datos" message={error} /> : null}

      <button
        type="submit"
        disabled={pending || ministries.length === 0 || networks.length === 0}
        className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-3.5 text-base font-medium text-white disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar registro"}
      </button>
    </form>
  );
}

function PublicField({
  label,
  name,
  required,
  autoComplete,
  inputMode,
}: {
  label: string;
  name: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      <input
        name={name}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3.5 text-base outline-none ring-[var(--brand)] focus:ring-2"
      />
    </label>
  );
}

function PublicSelect({
  label,
  name,
  options,
  required,
  defaultValue,
  disabled,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3.5 text-base outline-none ring-[var(--brand)] focus:ring-2 disabled:opacity-80"
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
      {disabled && defaultValue ? (
        <input type="hidden" name={name} value={defaultValue} />
      ) : null}
    </label>
  );
}
