"use client";

import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";

export function ConvexHealthPanel() {
  const ping = useQuery(api.health.ping);
  const recent = useQuery(api.health.listRecent);
  const recordCheck = useMutation(api.health.recordCheck);

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
          Ping
        </h2>
        {ping === undefined ? (
          <p className="text-sm text-[var(--muted)]">Conectando…</p>
        ) : (
          <pre className="overflow-x-auto rounded bg-[var(--paper-100)] p-3 text-xs">
            {JSON.stringify(ping, null, 2)}
          </pre>
        )}
      </section>

      <section className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
            Health checks
          </h2>
          <button
            type="button"
            className="neo-touch rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-3 py-2 text-sm text-white"
            onClick={() => void recordCheck({ label: `check-${Date.now()}` })}
          >
            Registrar
          </button>
        </div>
        {recent === undefined ? (
          <p className="text-sm text-[var(--muted)]">Cargando…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin registros aún.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {recent.map((row) => (
              <li key={row._id} className="flex justify-between gap-2 border-b border-[var(--border)] py-1">
                <span>{row.label}</span>
                <span className="text-[var(--muted)]">
                  {new Date(row.createdAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
