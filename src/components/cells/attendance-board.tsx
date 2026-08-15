"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { saveAttendanceAction } from "@/modules/cells/actions";

type Member = {
  membershipId: string;
  personId: string;
  fullName: string;
};

type Props = {
  cellId: string;
  cellName: string;
  sessionDate: string;
  members: Member[];
  initialStatuses: Record<string, "present" | "absent" | "excused">;
};

export function AttendanceBoard({
  cellId,
  cellName,
  sessionDate,
  members,
  initialStatuses,
}: Props) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, "present" | "absent" | "excused">>(
    () => {
      const next: Record<string, "present" | "absent" | "excused"> = {};
      for (const m of members) {
        next[m.personId] = initialStatuses[m.personId] ?? "absent";
      }
      return next;
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const values = Object.values(statuses);
    return {
      present: values.filter((v) => v === "present").length,
      absent: values.filter((v) => v === "absent").length,
      excused: values.filter((v) => v === "excused").length,
    };
  }, [statuses]);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="space-y-1">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">{cellName}</h2>
        <p className="text-sm text-[var(--muted)]">Asistencia · {sessionDate}</p>
        <p className="text-sm">
          Presentes {counts.present} · Ausentes {counts.absent} · Justificados{" "}
          {counts.excused}
        </p>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No hay miembros activos.</p>
      ) : (
        <ul className="space-y-3">
          {members.map((m) => (
            <li
              key={m.membershipId}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <p className="mb-3 font-medium">{m.fullName}</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["present", "Presente"],
                    ["absent", "Ausente"],
                    ["excused", "Justificado"],
                  ] as const
                ).map(([value, label]) => {
                  const active = statuses[m.personId] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setStatuses((prev) => ({ ...prev, [m.personId]: value }))
                      }
                      className={`rounded-[var(--radius-sm)] px-2 py-3 text-sm font-medium ${
                        active
                          ? value === "present"
                            ? "bg-[var(--success)] text-white"
                            : value === "excused"
                              ? "bg-[var(--warning)] text-white"
                              : "bg-[var(--danger)] text-white"
                          : "bg-[var(--surface-soft)] text-[var(--ink)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? <ErrorState title="No se pudo guardar" message={error} /> : null}
      {saved ? <p className="text-sm text-[var(--success)]">Asistencia guardada.</p> : null}

      <button
        type="button"
        disabled={pending || members.length === 0}
        className="sticky bottom-4 w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-3.5 text-base font-medium text-white shadow-[var(--shadow)] disabled:opacity-60"
        onClick={() => {
          setError(null);
          setSaved(false);
          startTransition(async () => {
            const result = await saveAttendanceAction(cellId, {
              sessionDate,
              records: members.map((m) => ({
                personId: m.personId,
                membershipId: m.membershipId,
                status: statuses[m.personId] ?? "absent",
              })),
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setSaved(true);
            router.refresh();
          });
        }}
      >
        {pending ? "Guardando…" : "Guardar asistencia"}
      </button>
    </div>
  );
}
