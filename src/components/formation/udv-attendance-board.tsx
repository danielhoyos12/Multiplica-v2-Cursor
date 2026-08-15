"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorState } from "@/components/ui/error-state";
import {
  authorizeRecoveryAction,
  recordAttendanceAction,
} from "@/modules/formation/actions";

type Module = { id: string; code: string; name: string };
type AttendanceCell = { id: string; status: string };
type Participant = {
  enrollmentId: string;
  personId: string;
  fullName: string;
  status: string;
  attendance: Record<string, AttendanceCell>;
};

type Props = {
  cycleId: string;
  modules: Module[];
  participants: Participant[];
  attendanceDate: string;
  canAttend: boolean;
  canComplete: boolean;
};

export function UdvAttendanceBoard({
  modules,
  participants,
  attendanceDate,
  canAttend,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setStatus(enrollmentId: string, moduleId: string, status: string) {
    setError(null);
    startTransition(async () => {
      const result = await recordAttendanceAction({
        enrollmentId,
        moduleId,
        attendanceDate,
        status: status as "present" | "absent" | "excused" | "recovered",
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
    startTransition(async () => {
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
      <h2 className="font-medium">Asistencia por módulo</h2>
      {error ? <ErrorState title="Asistencia" message={error} /> : null}

      {/* Mobile: vertical cards */}
      <div className="space-y-3 md:hidden">
        {participants.map((p) => (
          <div
            key={p.enrollmentId}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <p className="font-medium">{p.fullName}</p>
            <p className="text-xs text-[var(--muted)]">{p.status}</p>
            <ul className="mt-3 space-y-2">
              {modules.map((m) => {
                const cell = p.attendance[m.id];
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {m.code} · {cell?.status ?? "—"}
                    </span>
                    {canAttend ? (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={pending}
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() => setStatus(p.enrollmentId, m.id, "present")}
                        >
                          P
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() => setStatus(p.enrollmentId, m.id, "absent")}
                        >
                          A
                        </button>
                        {cell?.status === "absent" || cell?.status === "excused" ? (
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded border px-2 py-0.5 text-xs"
                            onClick={() => recover(cell.id)}
                          >
                            Rec
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="px-2 py-2">Persona</th>
              {modules.map((m) => (
                <th key={m.id} className="px-2 py-2">
                  {m.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.enrollmentId} className="border-b border-[var(--border)]">
                <td className="px-2 py-2 font-medium">{p.fullName}</td>
                {modules.map((m) => {
                  const cell = p.attendance[m.id];
                  return (
                    <td key={m.id} className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <span>{cell?.status ?? "—"}</span>
                        {canAttend ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={pending}
                              className="rounded border px-1 text-xs"
                              onClick={() => setStatus(p.enrollmentId, m.id, "present")}
                            >
                              P
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              className="rounded border px-1 text-xs"
                              onClick={() => setStatus(p.enrollmentId, m.id, "absent")}
                            >
                              A
                            </button>
                            {cell?.status === "absent" || cell?.status === "excused" ? (
                              <button
                                type="button"
                                disabled={pending}
                                className="rounded border px-1 text-xs"
                                onClick={() => recover(cell.id)}
                              >
                                Rec
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
