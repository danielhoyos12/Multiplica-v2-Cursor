"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  assignResponsibleAction,
  toggleMinistryActiveAction,
  updateMinistryAction,
} from "@/server/actions/organization";
import { ErrorState } from "@/components/ui/error-state";

type UserOption = { id: string; email: string; displayName: string | null };

type Props = {
  ministry: {
    id: string;
    code: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
    responsibleUserId: string | null;
  };
  users: UserOption[];
  canManage: boolean;
  canAssign: boolean;
};

export function MinistryDetailForms({ ministry, users, canManage, canAssign }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {canManage ? (
        <form
          className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5"
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await updateMinistryAction(ministry.id, formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Editar
          </h2>
          <Field label="Código" name="code" defaultValue={ministry.code} required />
          <Field label="Nombre" name="name" defaultValue={ministry.name} required />
          <Field
            label="Orden"
            name="sortOrder"
            type="number"
            defaultValue={String(ministry.sortOrder)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={ministry.isActive}
              className="size-4"
            />
            Activo
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            Guardar cambios
          </button>
        </form>
      ) : null}

      <div className="space-y-6">
        {canManage ? (
          <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              Activación
            </h2>
            <button
              type="button"
              disabled={pending}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await toggleMinistryActiveAction(
                    ministry.id,
                    !ministry.isActive,
                  );
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              {ministry.isActive ? "Desactivar" : "Activar"}
            </button>
          </div>
        ) : null}

        {canAssign ? (
          <form
            className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5"
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                const result = await assignResponsibleAction(ministry.id, formData);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              Líder General
            </h2>
            <select
              name="responsibleUserId"
              defaultValue={ministry.responsibleUserId ?? ""}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="">Sin asignar</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName ? `${user.displayName} (${user.email})` : user.email}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              Guardar responsable
            </button>
          </form>
        ) : null}
      </div>

      {error ? <ErrorState className="lg:col-span-2" message={error} /> : null}
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm outline-none ring-[var(--brand)] focus:ring-2"
      />
    </div>
  );
}
