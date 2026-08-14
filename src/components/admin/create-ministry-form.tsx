"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createMinistryAction } from "@/server/actions/organization";
import { ErrorState } from "@/components/ui/error-state";

export function CreateMinistryForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-lg space-y-4"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createMinistryAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push("/admin/ministries");
          router.refresh();
        });
      }}
    >
      <Field label="Código humano" name="code" placeholder="LP1" required />
      <Field label="Nombre" name="name" placeholder="Ministerio…" required />
      <Field label="Orden" name="sortOrder" type="number" defaultValue="0" />
      <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
        <input type="checkbox" name="isActive" defaultChecked className="size-4" />
        Activo
      </label>
      {error ? <ErrorState message={error} title="No se pudo crear" /> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Crear ministerio"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-[var(--ink)]">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none ring-[var(--brand)] focus:ring-2"
      />
    </div>
  );
}
