"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Option = { id: string; name: string; code?: string };

type Props = {
  ministries: Option[];
  networks: Option[];
  districts: Option[];
  showMinistryFilter: boolean;
};

export function GanarFilters({
  ministries,
  networks,
  districts,
  showMinistryFilter,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const next = new URLSearchParams();
        for (const key of ["q", "ministryId", "networkId", "districtId", "from", "to"]) {
          const value = String(form.get(key) ?? "").trim();
          if (value) next.set(key, value);
        }
        startTransition(() => {
          router.push(`/ganar?${next.toString()}`);
        });
      }}
    >
      <input
        name="q"
        defaultValue={params.get("q") ?? ""}
        placeholder="Buscar nombre o teléfono"
        className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none ring-[var(--brand)] focus:ring-2 sm:col-span-2"
      />
      {showMinistryFilter ? (
        <select
          name="ministryId"
          defaultValue={params.get("ministryId") ?? ""}
          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
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
        className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
      >
        <option value="">Todas las redes</option>
        {networks.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
      <select
        name="districtId"
        defaultValue={params.get("districtId") ?? ""}
        className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
      >
        <option value="">Todos los distritos</option>
        {districts.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        name="from"
        defaultValue={params.get("from") ?? ""}
        className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        aria-label="Desde"
      />
      <input
        type="date"
        name="to"
        defaultValue={params.get("to") ?? ""}
        className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        aria-label="Hasta"
      />
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
