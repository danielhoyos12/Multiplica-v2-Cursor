"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Option = { id: string; name: string; code?: string };

type Props = {
  ministries: Option[];
  networks: Option[];
  showMinistryFilter: boolean;
};

export function CellFilters({ ministries, networks, showMinistryFilter }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const next = new URLSearchParams();
        for (const key of ["q", "ministryId", "networkId", "status", "type"]) {
          const value = String(form.get(key) ?? "").trim();
          if (value) next.set(key, value);
        }
        startTransition(() => {
          router.push(`/celulas?${next.toString()}`);
        });
      }}
    >
      <input
        name="q"
        defaultValue={params.get("q") ?? ""}
        placeholder="Buscar célula"
        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm sm:col-span-2"
      />
      {showMinistryFilter ? (
        <select
          name="ministryId"
          defaultValue={params.get("ministryId") ?? ""}
          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
        >
          <option value="">Todos los ministerios</option>
          {ministries.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code ? `${m.code} — ${m.name}` : m.name}
            </option>
          ))}
        </select>
      ) : null}
      <select
        name="networkId"
        defaultValue={params.get("networkId") ?? ""}
        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
      >
        <option value="">Todas las redes</option>
        {networks.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
      <select
        name="status"
        defaultValue={params.get("status") ?? ""}
        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
      >
        <option value="">Todos los estados</option>
        <option value="active">Activa</option>
        <option value="inactive">Inactiva</option>
        <option value="closed">Cerrada</option>
      </select>
      <select
        name="type"
        defaultValue={params.get("type") ?? ""}
        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
      >
        <option value="">Todos los tipos</option>
        <option value="evangelistic">Evangelística</option>
        <option value="twelve">De 12</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius-sm)] bg-[var(--brand-ink)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Filtrando…" : "Aplicar"}
      </button>
    </form>
  );
}
