"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PersonSearchField } from "@/components/persons/person-search-field";
import { ErrorState } from "@/components/ui/error-state";

type Props = {
  label: string;
  buttonLabel: string;
  onEnroll: (personId: string) => Promise<{ ok: boolean; error?: string }>;
};

export function EnrollmentPersonForm({ label, buttonLabel, onEnroll }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3 rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const personId = String(form.get("personId") ?? "");
        setError(null);
        start(async () => {
          const result = await onEnroll(personId);
          if (!result.ok) {
            setError(result.error ?? "No se pudo inscribir.");
            return;
          }
          router.refresh();
        });
      }}
    >
      <PersonSearchField name="personId" label={label} required />
      {error ? <ErrorState title="Inscripción" message={error} /> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-white disabled:opacity-60"
      >
        {pending ? "Inscribiendo…" : buttonLabel}
      </button>
    </form>
  );
}
