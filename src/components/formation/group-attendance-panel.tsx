"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/ui/error-state";
import {
  authorizeRecoveryAction,
  recordAttendanceAction,
  recordGroupAttendanceAction,
} from "@/modules/formation/actions";

type Module = { id: string; code: string; name: string };
type AttendanceCell = { id: string; status: string; attendanceDate?: string };
type Participant = {
  enrollmentId: string;
  personId: string;
  fullName: string;
  status: string;
  attendance: Record<string, AttendanceCell>;
};

type Mark = "present" | "absent" | "excused";

type Props = {
  cycleId: string;
  modules: Module[];
  participants: Participant[];
  attendanceDate: string;
  canAttend: boolean;
};

/**
 * Operative flow: select class → mark all enrolled → save group attendance.
 * Upsert per enrollment+module (no duplicate rows). Recovery stays authorized.
 */
export function GroupAttendancePanel({
  modules,
  participants,
  attendanceDate,
  canAttend,
}: Props) {
  const router = useRouter();
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? "");
  const [draft, setDraft] = useState<Record<string, Mark>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = useMemo(
    () => modules.find((m) => m.id === moduleId) ?? null,
    [modules, moduleId],
  );

  function markAll(status: Mark) {
    const next: Record<string, Mark> = {};
    for (const p of participants) next[p.enrollmentId] = status;
    setDraft(next);
  }

  function saveGroup() {
    if (!selected) return;
    setError(null);
    const entries = participants
      .map((p) => {
        const status = draft[p.enrollmentId];
        if (!status) return null;
        return { enrollmentId: p.enrollmentId, status };
      })
      .filter(Boolean) as Array<{ enrollmentId: string; status: Mark }>;

    if (entries.length === 0) {
      setError("Marca al menos un inscrito antes de guardar.");
      return;
    }

    start(async () => {
      const result = await recordGroupAttendanceAction({
        moduleId: selected.id,
        attendanceDate,
        entries,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar la asistencia grupal.");
        return;
      }
      setDraft({});
      router.refresh();
    });
  }

  function quickSet(enrollmentId: string, module: string, status: Mark) {
    setError(null);
    start(async () => {
      const result = await recordAttendanceAction({
        enrollmentId,
        moduleId: module,
        attendanceDate,
        status,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function recover(attendanceId: string) {
    setError(null);
    start(async () => {
      const result = await authorizeRecoveryAction({ attendanceId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--muted)]">Clase / jornada</span>
          <select
            value={moduleId}
            onChange={(e) => {
              setModuleId(e.target.value);
              setDraft({});
            }}
            className="min-w-[220px] rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-[var(--muted)]">
          Fecha: {attendanceDate} · Inscritos: {participants.length}
        </p>
      </div>

      {error ? <ErrorState title="Asistencia grupal" message={error} /> : null}

      {canAttend ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1"
            onClick={() => markAll("present")}
          >
            Marcar todos presentes
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1"
            onClick={() => markAll("absent")}
          >
            Marcar todos ausentes
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-[var(--radius-sm)] bg-[var(--cobalt)] px-3 py-1 text-white disabled:opacity-60"
            onClick={saveGroup}
          >
            {pending ? "Guardando…" : "Guardar asistencia grupal"}
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="px-2 py-2">Persona</th>
              <th className="px-2 py-2">Estado insc.</th>
              <th className="px-2 py-2">Registrado</th>
              <th className="px-2 py-2">Marca</th>
              <th className="px-2 py-2">Historial / acción</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const cell = selected ? p.attendance[selected.id] : undefined;
              const draftMark = draft[p.enrollmentId];
              return (
                <tr key={p.enrollmentId} className="border-b border-[var(--border)]">
                  <td className="px-2 py-2 font-medium">{p.fullName}</td>
                  <td className="px-2 py-2 text-[var(--muted)]">{p.status}</td>
                  <td className="px-2 py-2">
                    {cell?.status ?? "—"}
                    {cell?.attendanceDate ? (
                      <span className="block text-xs text-[var(--muted)]">
                        {cell.attendanceDate}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    {canAttend ? (
                      <select
                        value={draftMark ?? ""}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [p.enrollmentId]: e.target.value as Mark,
                          }))
                        }
                        className="rounded border border-[var(--border)] px-2 py-1"
                      >
                        <option value="">—</option>
                        <option value="present">Presente</option>
                        <option value="absent">Ausente</option>
                        <option value="excused">Justificado</option>
                      </select>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {canAttend ? (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={pending || !selected}
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() => selected && quickSet(p.enrollmentId, selected.id, "present")}
                        >
                          P
                        </button>
                        <button
                          type="button"
                          disabled={pending || !selected}
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() => selected && quickSet(p.enrollmentId, selected.id, "absent")}
                        >
                          A
                        </button>
                        <button
                          type="button"
                          disabled={pending || !selected}
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() => selected && quickSet(p.enrollmentId, selected.id, "excused")}
                        >
                          J
                        </button>
                        {cell && (cell.status === "absent" || cell.status === "excused") ? (
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded border px-2 py-0.5 text-xs"
                            onClick={() => recover(cell.id)}
                          >
                            Recuperar
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">Solo lectura</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Guardar actualiza (upsert) la asistencia por inscrito×clase. No crea filas duplicadas.
        Sobrescribir un estado previo queda auditado en el registro de asistencia.
      </p>
    </div>
  );
}
