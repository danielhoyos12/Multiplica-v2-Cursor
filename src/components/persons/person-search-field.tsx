"use client";

import { useState, useTransition } from "react";

import { listPersonsAction } from "@/modules/ganar/actions";

type Hit = { id: string; label: string; phone: string | null };

type Props = {
  name: string;
  label: string;
  required?: boolean;
  defaultPersonId?: string | null;
  defaultLabel?: string | null;
  helpText?: string;
};

/**
 * Friendly person picker — search by name/phone; never ask users to paste UUIDs.
 */
export function PersonSearchField({
  name,
  label,
  required,
  defaultPersonId,
  defaultLabel,
  helpText,
}: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(
    defaultPersonId
      ? { id: defaultPersonId, label: defaultLabel ?? "Persona seleccionada" }
      : null,
  );
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
      <input type="hidden" name={name} value={selected?.id ?? ""} required={required} />
      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm">
          <span>{selected.label}</span>
          <button
            type="button"
            className="text-[var(--brand-ink)] underline"
            onClick={() => {
              setSelected(null);
              setHits([]);
            }}
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base sm:py-2 sm:text-sm"
            aria-label={`Buscar ${label}`}
          />
          <button
            type="button"
            disabled={pending || q.trim().length < 2}
            className="rounded-[var(--radius-sm)] bg-[var(--brand-ink)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60 sm:py-2"
            onClick={() => {
              start(async () => {
                const res = await listPersonsAction({ q: q.trim(), pageSize: 10 });
                setHits(
                  res.rows.map((r) => ({
                    id: r.id,
                    label: `${r.firstName} ${r.lastName}`.trim(),
                    phone: r.phone,
                  })),
                );
              });
            }}
          >
            {pending ? "Buscando…" : "Buscar"}
          </button>
        </div>
      )}
      {!selected && hits.length > 0 ? (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)]">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-soft)]"
                onClick={() => {
                  setSelected({ id: h.id, label: h.label });
                  setHits([]);
                  setQ("");
                }}
              >
                <span className="font-medium">{h.label}</span>
                <span className="text-[var(--muted)]">{h.phone ?? "Sin teléfono"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {helpText ? <p className="text-xs text-[var(--muted)]">{helpText}</p> : null}
    </div>
  );
}
