"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorState } from "@/components/ui/error-state";
import {
  addMemberAction,
  reassignMemberAction,
  removeMemberAction,
  searchPersonsForCellAction,
} from "@/modules/cells/actions";

type Member = {
  membershipId: string;
  personId: string;
  fullName: string;
  phone: string | null;
  status: string;
  joinedAt: Date | string;
  leftAt?: Date | string | null;
};

type CellOption = { id: string; name: string };

type Props = {
  cellId: string;
  members: Member[];
  siblingCells: CellOption[];
  canManage: boolean;
};

export function CellMembersPanel({ cellId, members, siblingCells, canManage }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; fullName: string; phone: string | null }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = members.filter((m) => m.status === "active");
  const history = members.filter((m) => m.status !== "active");

  return (
    <div className="space-y-6">
      {canManage ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Agregar miembro</h3>
            <Link href="/ganar/nueva" className="text-sm text-[var(--brand-ink)] underline">
              Registrar primero en GANAR
            </Link>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o teléfono"
              className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-3 text-base sm:py-2 sm:text-sm"
            />
            <button
              type="button"
              disabled={pending || q.trim().length < 2}
              className="rounded-[var(--radius-sm)] bg-[var(--brand-ink)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const rows = await searchPersonsForCellAction(cellId, q);
                  setResults(rows);
                });
              }}
            >
              Buscar
            </button>
          </div>
          {results.length > 0 ? (
            <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)]">
              {results.map((person) => (
                <li
                  key={person.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{person.fullName}</p>
                    <p className="text-[var(--muted)]">{person.phone ?? "Sin teléfono"}</p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-2 text-white disabled:opacity-60"
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const result = await addMemberAction(cellId, person.id);
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        setResults([]);
                        setQ("");
                        router.refresh();
                      });
                    }}
                  >
                    Agregar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <ErrorState title="No se pudo agregar" message={error} /> : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="font-medium">Miembros activos ({active.length})</h3>
        {active.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin miembros activos.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((m) => (
              <li
                key={m.membershipId}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/ganar/${m.personId}`}
                      className="font-medium text-[var(--brand-ink)] underline-offset-2 hover:underline"
                    >
                      {m.fullName}
                    </Link>
                    <p className="text-sm text-[var(--muted)]">{m.phone ?? "—"}</p>
                    <p className="text-xs text-[var(--muted)]">
                      Ingreso {new Date(m.joinedAt).toLocaleDateString("es-PE")}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex flex-col gap-2 sm:items-end">
                      <button
                        type="button"
                        className="rounded-[var(--radius-sm)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
                        onClick={() => {
                          startTransition(async () => {
                            const result = await removeMemberAction(cellId, m.membershipId);
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            router.refresh();
                          });
                        }}
                      >
                        Retirar
                      </button>
                      {siblingCells.length > 0 ? (
                        <select
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-2 text-sm"
                          defaultValue=""
                          onChange={(e) => {
                            const target = e.target.value;
                            if (!target) return;
                            startTransition(async () => {
                              const result = await reassignMemberAction(
                                cellId,
                                m.membershipId,
                                target,
                              );
                              if (!result.ok) {
                                setError(result.error);
                                e.target.value = "";
                                return;
                              }
                              router.refresh();
                            });
                          }}
                        >
                          <option value="">Mover a…</option>
                          {siblingCells.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {history.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-medium">Historial</h3>
          <ul className="space-y-2 text-sm text-[var(--muted)]">
            {history.map((m) => (
              <li key={m.membershipId}>
                {m.fullName} · {m.status}
                {m.leftAt
                  ? ` · salió ${new Date(m.leftAt).toLocaleDateString("es-PE")}`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
